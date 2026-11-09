import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ApiError, post, setSession, type Session } from "../lib/api";
import { t } from "../lib/i18n";
import { Button, ErrorBox, Field, Input } from "../components/ui";

export function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [orgName, setOrgName] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

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
          await post("/auth/signup", { organizationName: orgName, fullName, email });
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
    <div className="flex min-h-full items-center justify-center bg-surco p-4">
      <div className="w-full max-w-sm rounded-2xl bg-lino p-6 shadow-xl">
        <div className="mb-5 flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="h-10 w-10" />
          <div>
            <h1 className="text-xl font-semibold">{t(mode === "login" ? "ui.loginTitle" : "ui.signupTitle")}</h1>
            <p className="text-sm text-surco/60">{t("ui.tagline")}</p>
          </div>
        </div>
        <form
          className="flex flex-col gap-3"
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
                    <Input required minLength={2} value={fullName} onChange={(e) => setFullName(e.target.value)} />
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
              <Button type="submit" disabled={busy}>
                {t("auth.sendCode")}
              </Button>
              <button
                type="button"
                className="text-sm text-soja-dark underline"
                onClick={() => setMode(mode === "login" ? "signup" : "login")}
              >
                {t(mode === "login" ? "ui.signupLink" : "ui.loginLink")}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-surco/70">{t("auth.codeSent", { email })}</p>
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
                  className="text-center text-2xl tracking-[0.4em]"
                />
              </Field>
              <Button type="submit" disabled={busy || code.length !== 6}>
                {t("ui.verify")}
              </Button>
              <button type="button" className="text-sm text-soja-dark underline" onClick={() => setStep("email")}>
                {t("ui.resend")}
              </button>
            </>
          )}
          {error ? <ErrorBox error={error} /> : null}
        </form>
      </div>
    </div>
  );
}
