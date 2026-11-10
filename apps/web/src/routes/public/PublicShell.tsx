import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { t } from "../../lib/i18n";

/** Cabecera y pie de las páginas públicas (landing, términos, privacidad). */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-lino">
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="font-serif text-[24px] leading-none font-semibold">
          {t("ui.appName")}
        </Link>
        <Link to="/ingresar" className="text-sm font-medium text-accion underline-offset-4 hover:underline">
          {t("ui.publicLogin")}
        </Link>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-linea">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-6 text-sm text-tinta-2 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>{t("ui.publicFooterRights")}</p>
          <LegalLinks />
        </div>
      </footer>
    </div>
  );
}

export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={`flex gap-5 ${className}`}>
      <Link to="/terminos" className="underline-offset-4 hover:text-surco hover:underline">
        {t("ui.publicFooterTerms")}
      </Link>
      <Link to="/privacidad" className="underline-offset-4 hover:text-surco hover:underline">
        {t("ui.publicFooterPrivacy")}
      </Link>
    </nav>
  );
}
