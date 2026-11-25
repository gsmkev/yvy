/** Ingreso y registro con código por email, segundo factor y Google. */
import { ATTRIBUTION } from "@yvy/shared";
import { t } from "../lib/i18n";
import { LegalLinks } from "./public/PublicShell";
import { CodeStep, EmailStep, TotpStep } from "./login/Steps";
import { useLogin, type Step } from "./login/useLogin";

const STEPS = { email: EmailStep, code: CodeStep, totp: TotpStep } as const;

/** Qué se le pide a la persona en cada paso. */
const helpText = (step: Step, email: string) => ({ email: t("ui.login.help"), totp: t("ui.totp.loginHelp"), code: t("auth.code.sent", { email }) })[step];

/** Foto de la estancia con el lema, solo en pantallas anchas. */
function SidePhoto() {
  return (
    <div className="relative hidden overflow-hidden bg-surco lg:block">
      <img src="/campo-itapua.webp" alt="" className="absolute inset-0 h-full w-full object-cover opacity-90" />
      <div className="absolute inset-x-0 bottom-0 bg-surco/85 p-10 text-lino">
        <p className="max-w-md font-serif text-title leading-tight font-semibold">{t("ui.common.tagline")}.</p>
        <p className="mt-3 text-xs text-lino/60">{t("ui.login.creditWeb", { source: t(ATTRIBUTION.copernicus) })}</p>
      </div>
    </div>
  );
}

/** Pantalla de ingreso y registro. Pasa por los pasos de email, código y segundo factor. */
export function LoginPage() {
  const login = useLogin();
  const { mode, step, fields } = login;
  const StepForm = STEPS[step];
  return (
    <div className="grid min-h-full bg-lino lg:grid-cols-[1.1fr_1fr]">
      <SidePhoto />
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <p className="mb-8 font-serif text-title leading-none font-semibold">{t("ui.app.name")}</p>
          <h1 className="text-title leading-tight">{t(mode === "login" ? "ui.login.title" : "ui.signup.title")}</h1>
          <p className="mt-2 mb-6 text-sm text-tinta-2">{helpText(step, fields.email)}</p>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              login.submit();
            }}
          >
            <StepForm login={login} googleError={login.googleError} />
          </form>
          {login.googleEnabled && mode === "login" && step === "email" && (
            <a href="/auth/google/start" className="mt-4 flex h-11 items-center justify-center rounded-md border border-linea bg-papel text-sm font-medium hover:border-tinta-2/40">
              {t("ui.google.signIn")}
            </a>
          )}
          <LegalLinks className="mt-10 flex-wrap text-meta text-tinta-2" />
        </div>
      </div>
    </div>
  );
}
