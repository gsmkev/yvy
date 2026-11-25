/** Estado y pasos del ingreso: email, código, segundo factor y vuelta de Google. */
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ApiError, get, post, setSession, type Session } from "../../lib/api";

/** Paso del ingreso. */
export type Step = "email" | "code" | "totp";

/** Parámetros de la URL que usa el ingreso. */
export interface LoginSearch {
  modo?: string;
  ref?: string;
  google?: string;
  google_error?: string;
}

type Signed = Session | { mfaRequired: true; ticket: string };

/** Manejo de los pasos del ingreso; `search` son los parámetros de la URL. */
export function useLogin(search: LoginSearch) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">(search.modo === "registro" ? "signup" : "login");
  const [step, setStep] = useState<Step>("email");
  const [ticket, setTicket] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [orgName, setOrgName] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // Botón de Google solo si el servidor lo tiene configurado
  const google = useQuery({ queryKey: ["google-enabled"], queryFn: () => get<{ enabled: boolean }>("/auth/google"), staleTime: Infinity, retry: false });

  /** Entra, o pasa al segundo factor si la cuenta lo pide. */
  const enter = useCallback(
    (s: Signed) => {
      if ("mfaRequired" in s) {
        setTicket(s.ticket);
        setStep("totp");
        return;
      }
      setSession(s);
      navigate({ to: "/" });
    },
    [navigate],
  );

  // Al volver de Google trae `?google=` (código de un solo uso)
  useEffect(() => {
    if (!search.google) return;
    setBusy(true);
    post<Signed>("/auth/google/exchange", { code: search.google, deviceId: "web" })
      .then(enter)
      .catch((e) => setError(e))
      .finally(() => setBusy(false));
  }, [search.google, enter]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      if (mode === "signup") {
        try {
          await post("/auth/signup", { organizationName: orgName, fullName, email, ...(search.ref ? { ref: search.ref } : {}) });
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 409)) throw e;
        }
      }
      await post("/auth/email/start", { email });
      setStep("code");
    });

  const verify = () => run(async () => enter(await post<Signed>("/auth/email/verify", { email, code, deviceId: "web" })));

  // Segundo paso con el código de la app (o uno de recuperación)
  const verifyTotp = () =>
    run(async () => {
      setSession(await post<Session>("/auth/totp/login", { ticket, code: totpCode }));
      navigate({ to: "/" });
    });

  const submit = { email: sendCode, totp: verifyTotp, code: verify }[step];
  return {
    mode, setMode, step, setStep, busy, error, googleEnabled: !!google.data?.enabled, submit,
    fields: { email, setEmail, code, setCode, orgName, setOrgName, fullName, setFullName, totpCode, setTotpCode },
  };
}

/** Todo lo que devuelve useLogin. */
export type LoginState = ReturnType<typeof useLogin>;
