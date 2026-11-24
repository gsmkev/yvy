/** Cabecera y pie de las páginas públicas (landing, términos, privacidad). */
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { t } from "../../lib/i18n";
import { PUBLIC_FOOTER } from "@yvy/shared";

/** Cabecera y pie de las páginas públicas (landing, términos, privacidad). */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-lino">
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="font-serif text-section leading-none font-semibold">
          {t("ui.app.name")}
        </Link>
        <Link to="/ingresar" className="text-sm font-medium text-accion underline-offset-4 hover:underline">
          {t("ui.public.login")}
        </Link>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-linea">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-6 text-meta text-tinta-2 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>{t("ui.public.footerRights")}</p>
          <LegalLinks />
        </div>
      </footer>
    </div>
  );
}

/** Enlaces a términos y privacidad. */
export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={`flex gap-x-5 gap-y-1 whitespace-nowrap ${className}`}>
      <Link to="/terminos" className="underline-offset-4 hover:text-surco hover:underline">
        {t(PUBLIC_FOOTER.terms)}
      </Link>
      <Link to="/privacidad" className="underline-offset-4 hover:text-surco hover:underline">
        {t(PUBLIC_FOOTER.privacy)}
      </Link>
      <Link to="/estado" className="underline-offset-4 hover:text-surco hover:underline">
        {t(PUBLIC_FOOTER.status)}
      </Link>
    </nav>
  );
}
