import { Link } from "@tanstack/react-router";
import { t } from "../../../lib/i18n";
import { AppLink, LoginLink, SignupLink, WhatsappLink } from "./actions";
import { attribution, L, NAV } from "./content";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="overflow-hidden bg-surco px-5 pt-20 text-lino md:px-10">
      <div className="grid gap-10 border-t border-linea-oscuro pt-8 md:grid-cols-[1fr_1fr_1.4fr]">
        <div className="mono-yvy flex flex-col items-start gap-2">
          <p>{L("footer.coords")}</p>
          <WhatsappLink />
          <LoginLink />
          <SignupLink />
          <AppLink />
        </div>
        <nav aria-label={L("footer.navLabel")} className="mono-yvy flex flex-col gap-1">
          {NAV.map((n) => (
            <a key={n.id} href={`#${n.id}`} className="link-yvy w-fit">
              {n.label()}
            </a>
          ))}
        </nav>
        <div>
          <p className="text-[13px] text-lino/70">{attribution(year)}</p>
          <nav aria-label="Legal" className="mono-yvy mt-4 flex flex-wrap gap-x-5 gap-y-1">
            <Link to="/terminos" className="link-yvy">
              {t("ui.publicFooterTerms")}
            </Link>
            <Link to="/privacidad" className="link-yvy">
              {t("ui.publicFooterPrivacy")}
            </Link>
            <Link to="/estado" className="link-yvy">
              {t("ui.publicFooterStatus")}
            </Link>
          </nav>
          <p className="mono-yvy mt-4 text-lino/60">{L("footer.copy", { year })}</p>
        </div>
      </div>
      <svg className="mt-10 block w-full select-none pb-4 font-display text-lino" viewBox="0 0 1000 540" aria-hidden>
        <text x="10" y="385" fontSize="460" fill="currentColor" textLength="980" lengthAdjust="spacingAndGlyphs">
          Yvy
        </text>
      </svg>
    </footer>
  );
}
