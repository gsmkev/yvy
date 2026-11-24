/** Páginas de términos y de privacidad. */
import { Link } from "@tanstack/react-router";
import { t, tk } from "../../lib/i18n";
import { PublicShell } from "./PublicShell";

const SECTIONS = 9;

function LegalPage({ prefix }: { prefix: "terms" | "privacy" }) {
  return (
    <PublicShell>
      <article className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <Link to="/" className="text-sm text-accion underline-offset-4 hover:underline">
          {t("ui.legal.back")}
        </Link>
        <h1 className="mt-6 text-title leading-tight">{tk(`ui.${prefix}.title`)}</h1>
        <p className="mt-3 border-l-2 border-trigo pl-3 text-sm font-medium text-trigo-texto">{t("ui.legal.draft")}</p>
        <p className="mt-6 text-tinta-2">{tk(`ui.${prefix}.intro`)}</p>
        {Array.from({ length: SECTIONS }, (_, i) => i + 1).map((n) => (
          <section key={n} className="mt-8">
            <h2 className="text-section font-semibold">{tk(`ui.${prefix}.s${n}Title`)}</h2>
            <p className="mt-2">{tk(`ui.${prefix}.s${n}Text`)}</p>
          </section>
        ))}
      </article>
    </PublicShell>
  );
}

/** Términos y condiciones. */
export const TermsPage = () => <LegalPage prefix="terms" />;
/** Política de privacidad. */
export const PrivacyPage = () => <LegalPage prefix="privacy" />;
