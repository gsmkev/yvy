import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ApiError, get, post, setSession, type Session } from "../lib/api";
import { t, tk } from "../lib/i18n";
import { Button, ErrorBox, Field, Input } from "../components/ui";
import { LegalLinks } from "./public/PublicShell";

export function LoginPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/ingresar" });
  const [mode, setMode] = useState<"login" | "signup">(search.modo === "registro" ? "signup" : "login");
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [orgName, setOrgName] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // P-07: botón de Google solo si el servidor lo tiene configurado; al volver trae `?google=` (código de un solo uso)
  const google = useQuery({ queryKey: ["google-enabled"], queryFn: () => get<{ enabled: boolean }>("/auth/google"), staleTime: Infinity, retry: false });
  useEffect(() => {
    if (!search.google) return;
    setBusy(true);
    post<Session>("/auth/google/exchange", { code: search.google, deviceId: "web" })
      .then((s) => {
        setSession(s);
        navigate({ to: "/" });
      })
      .catch((e) => setError(e))
      .finally(() => setBusy(false));
  }, [search.google, navigate]);

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

  const verify = () =>
    run(async () => {
      const s = await post<Session>("/auth/email/verify", { email, code, deviceId: "web" });
      setSession(s);
      navigate({ to: "/" });
    });

  return (
    <div className="grid min-h-full bg-lino lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-surco lg:block">
        <img src="/campo-itapua.webp" alt="" className="absolute inset-0 h-full w-full object-cover opacity-90" />
        <div className="absolute inset-0 bg-gradient-to-t from-surco via-surco/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-10 text-lino">
          <p className="max-w-md font-serif text-[34px] leading-tight font-semibold">{t("ui.tagline")}.</p>
          <p className="mt-3 text-xs text-lino/60">
            Itapúa · Sentinel-2 L2A, compuesto de 90 días · {t("attribution.copernicus")}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <p className="mb-10 font-serif text-[28px] leading-none font-semibold">Yvy</p>
          <h1 className="text-[26px] leading-tight">{t(mode === "login" ? "ui.loginTitle" : "ui.signupTitle")}</h1>
          <p className="mt-1 mb-6 text-sm text-tinta-2">
            {step === "email" ? t("ui.loginHelp") : t("auth.codeSent", { email })}
          </p>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (step === "email") sendCode();
              else verify();
            }}
          >
            {step === "email" ? (
              <>
                {mode === "signup" && (
                  <>
                    <Field label={t("ui.orgName")}>
                      <Input required minLength={2} value={orgName} onChange={(e) => setOrgName(e.target.value)} />
                    </Field>
                    <Field label={t("ui.fullName")}>
                      <Input
                        required
                        minLength={2}
                        autoComplete="name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                      />
                    </Field>
                  </>
                )}
                <Field label={t("auth.emailLabel")}>
                  <Input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <Button type="submit" variant="primary" disabled={busy} className="h-11">
                  {t("auth.sendCode")}
                </Button>
                <button
                  type="button"
                  className="cursor-pointer text-left text-sm text-accion underline-offset-4 hover:underline"
                  onClick={() => setMode(mode === "login" ? "signup" : "login")}
                >
                  {t(mode === "login" ? "ui.signupLink" : "ui.loginLink")}
                </button>
              </>
            ) : (
              <>
                <Field label={t("auth.codeLabel")}>
                  <Input
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    required
                    autoFocus
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    className="num h-14 text-center text-2xl tracking-[0.5em]"
                  />
                </Field>
                <Button type="submit" variant="primary" disabled={busy || code.length !== 6} className="h-11">
                  {t("ui.verify")}
                </Button>
                <button
                  type="button"
                  className="cursor-pointer text-left text-sm text-accion underline-offset-4 hover:underline"
                  onClick={() => setStep("email")}
                >
                  {t("ui.resend")}
                </button>
              </>
            )}
            {search.google_error && (
              <p role="alert" className="text-sm text-peligro">
                {tk(`ui.googleError_${search.google_error}`)}
              </p>
            )}
            {error ? <ErrorBox error={error} /> : null}
          </form>
          {google.data?.enabled && mode === "login" && step === "email" && (
            <a
              href="/auth/google/start"
              className="mt-4 flex h-11 items-center justify-center rounded-md border border-linea bg-papel text-sm font-medium hover:border-tinta-2/40"
            >
              {t("ui.googleSignIn")}
            </a>
          )}
          <LegalLinks className="mt-10 text-sm text-tinta-2" />
        </div>
      </div>
    </div>
  );
}
