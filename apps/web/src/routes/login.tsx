/** Ingreso y registro con código por email, segundo factor y Google. */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ApiError, get, post, setSession, type Session } from "../lib/api";
import { t, tk } from "../lib/i18n";
import { Button, ErrorBox, Field, Input } from "../components/ui";
import { LegalLinks } from "./public/PublicShell";
import { ATTRIBUTION } from "@yvy/shared";

/** Pantalla de ingreso y registro. Pasa por los pasos de email, código y segundo factor. */
export function LoginPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/ingresar" });
  const [mode, setMode] = useState<"login" | "signup">(search.modo === "registro" ? "signup" : "login");
  const [step, setStep] = useState<"email" | "code" | "totp">("email");
  const [ticket, setTicket] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [orgName, setOrgName] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // Botón de Google solo si el servidor lo tiene configurado; al volver trae `?google=` (código de un solo uso)
  const google = useQuery({ queryKey: ["google-enabled"], queryFn: () => get<{ enabled: boolean }>("/auth/google"), staleTime: Infinity, retry: false });
  useEffect(() => {
    if (!search.google) return;
    setBusy(true);
    post<Session | { mfaRequired: true; ticket: string }>("/auth/google/exchange", { code: search.google, deviceId: "web" })
      .then((s) => {
        if ("mfaRequired" in s) {
          setTicket(s.ticket);
          setStep("totp");
          return;
        }
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
      const s = await post<Session | { mfaRequired: true; ticket: string }>("/auth/email/verify", { email, code, deviceId: "web" });
      if ("mfaRequired" in s) {
        setTicket(s.ticket);
        setStep("totp");
        return;
      }
      setSession(s);
      navigate({ to: "/" });
    });

  // Segundo paso con el código de la app (o uno de recuperación)
  const verifyTotp = () =>
    run(async () => {
      setSession(await post<Session>("/auth/totp/login", { ticket, code: totpCode }));
      navigate({ to: "/" });
    });

  return (
    <div className="grid min-h-full bg-lino lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-surco lg:block">
        <img src="/campo-itapua.webp" alt="" className="absolute inset-0 h-full w-full object-cover opacity-90" />
        <div className="absolute inset-x-0 bottom-0 bg-surco/85 p-10 text-lino">
          <p className="max-w-md font-serif text-title leading-tight font-semibold">{t("ui.common.tagline")}.</p>
          <p className="mt-3 text-xs text-lino/60">{t("ui.login.creditWeb", { source: t(ATTRIBUTION.copernicus) })}</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <p className="mb-8 font-serif text-title leading-none font-semibold">{t("ui.app.name")}</p>
          <h1 className="text-title leading-tight">{t(mode === "login" ? "ui.login.title" : "ui.signup.title")}</h1>
          <p className="mt-2 mb-6 text-sm text-tinta-2">
            {step === "email" ? t("ui.login.help") : step === "totp" ? t("ui.totp.loginHelp") : t("auth.code.sent", { email })}
          </p>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (step === "email") sendCode();
              else if (step === "totp") verifyTotp();
              else verify();
            }}
          >
            {step === "email" ? (
              <>
                {mode === "signup" && (
                  <>
                    <Field label={t("ui.org.name")}>
                      <Input required minLength={2} value={orgName} onChange={(e) => setOrgName(e.target.value)} />
                    </Field>
                    <Field label={t("ui.common.fullName")}>
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
                <Field label={t("auth.email.label")}>
                  <Input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                {search.google_error && (
                  <p role="alert" className="text-sm text-peligro">
                        {tk(`ui.google.error_${search.google_error}`)}
                  </p>
                )}
                    {error ? <ErrorBox error={error} /> : null}
                <Button type="submit" variant="primary" disabled={busy} className="h-11">
                  {t("auth.common.sendCode")}
                </Button>
                <button
                  type="button"
                  className="cursor-pointer text-left text-sm text-accion underline-offset-4 hover:underline"
                  onClick={() => setMode(mode === "login" ? "signup" : "login")}
                >
                  {t(mode === "login" ? "ui.signup.link" : "ui.login.link")}
                </button>
              </>
            ) : step === "totp" ? (
              <>
                <Field label={t("ui.totp.loginLabel")}>
                  <Input
                    required
                    autoFocus
                    autoComplete="one-time-code"
                    maxLength={20}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    className="num h-14 text-center text-2xl tracking-[0.3em]"
                  />
                </Field>
                {search.google_error && (
                  <p role="alert" className="text-sm text-peligro">
                        {tk(`ui.google.error_${search.google_error}`)}
                  </p>
                )}
                    {error ? <ErrorBox error={error} /> : null}
                <Button type="submit" variant="primary" disabled={busy || totpCode.trim().length < 6} className="h-11">
                  {t("ui.common.verify")}
                </Button>
              </>
            ) : (
              <>
                <Field label={t("auth.code.label")}>
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
                {search.google_error && (
                  <p role="alert" className="text-sm text-peligro">
                        {tk(`ui.google.error_${search.google_error}`)}
                  </p>
                )}
                    {error ? <ErrorBox error={error} /> : null}
                <Button type="submit" variant="primary" disabled={busy || code.length !== 6} className="h-11">
                  {t("ui.common.verify")}
                </Button>
                <button
                  type="button"
                  className="cursor-pointer text-left text-sm text-accion underline-offset-4 hover:underline"
                  onClick={() => setStep("email")}
                >
                  {t("ui.common.resend")}
                </button>
              </>
            )}
          </form>
          {google.data?.enabled && mode === "login" && step === "email" && (
            <a
              href="/auth/google/start"
              className="mt-4 flex h-11 items-center justify-center rounded-md border border-linea bg-papel text-sm font-medium hover:border-tinta-2/40"
            >
              {t("ui.google.signIn")}
            </a>
          )}
          <LegalLinks className="mt-10 flex-wrap text-meta text-tinta-2" />
        </div>
      </div>
    </div>
  );
}
