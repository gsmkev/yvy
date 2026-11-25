/** Pasos del formulario de ingreso: email (con alta), código por email y segundo factor. */
import { t, tk } from "../../lib/i18n";
import { Button, ErrorBox, Field, Input } from "../../components/ui";
import type { LoginState } from "./useLogin";

/** Qué muestra cada paso: el estado del ingreso y el error de Google de la URL. */
interface StepProps {
  login: LoginState;
  googleError?: string;
}

/** Error de Google (de la URL) y el del último intento. */
function Problems({ login, googleError }: StepProps) {
  return (
    <>
      {googleError && (
        <p role="alert" className="text-sm text-peligro">
          {tk(`ui.google.error_${googleError}`)}
        </p>
      )}
      {login.error ? <ErrorBox error={login.error} /> : null}
    </>
  );
}

const linkButton = "cursor-pointer text-left text-sm text-accion underline-offset-4 hover:underline";

/** Email, con nombre de la organización y de la persona si se está creando la cuenta. */
export function EmailStep({ login, googleError }: StepProps) {
  const { mode, setMode, busy, fields } = login;
  return (
    <>
      {mode === "signup" && (
        <>
          <Field label={t("ui.org.name")}>
            <Input required minLength={2} value={fields.orgName} onChange={(e) => fields.setOrgName(e.target.value)} />
          </Field>
          <Field label={t("ui.common.fullName")}>
            <Input required minLength={2} autoComplete="name" value={fields.fullName} onChange={(e) => fields.setFullName(e.target.value)} />
          </Field>
        </>
      )}
      <Field label={t("auth.email.label")}>
        <Input type="email" required autoComplete="email" value={fields.email} onChange={(e) => fields.setEmail(e.target.value)} />
      </Field>
      <Problems login={login} googleError={googleError} />
      <Button type="submit" variant="primary" disabled={busy} className="h-11">
        {t("auth.common.sendCode")}
      </Button>
      <button type="button" className={linkButton} onClick={() => setMode(mode === "login" ? "signup" : "login")}>
        {t(mode === "login" ? "ui.signup.link" : "ui.login.link")}
      </button>
    </>
  );
}

/** Código de seis dígitos que llegó por email. */
export function CodeStep({ login, googleError }: StepProps) {
  const { fields, busy } = login;
  return (
    <>
      <Field label={t("auth.code.label")}>
        <Input
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          required
          autoFocus
          autoComplete="one-time-code"
          value={fields.code}
          onChange={(e) => fields.setCode(e.target.value.replace(/\D/g, ""))}
          className="num h-14 text-center text-2xl tracking-[0.5em]"
        />
      </Field>
      <Problems login={login} googleError={googleError} />
      <Button type="submit" variant="primary" disabled={busy || fields.code.length !== 6} className="h-11">
        {t("ui.common.verify")}
      </Button>
      <button type="button" className={linkButton} onClick={() => login.setStep("email")}>
        {t("ui.common.resend")}
      </button>
    </>
  );
}

/** Código de la app de autenticación o de recuperación. */
export function TotpStep({ login, googleError }: StepProps) {
  const { fields, busy } = login;
  return (
    <>
      <Field label={t("ui.totp.loginLabel")}>
        <Input
          required
          autoFocus
          autoComplete="one-time-code"
          maxLength={20}
          value={fields.totpCode}
          onChange={(e) => fields.setTotpCode(e.target.value)}
          className="num h-14 text-center text-2xl tracking-[0.3em]"
        />
      </Field>
      <Problems login={login} googleError={googleError} />
      <Button type="submit" variant="primary" disabled={busy || fields.totpCode.trim().length < 6} className="h-11">
        {t("ui.common.verify")}
      </Button>
    </>
  );
}
