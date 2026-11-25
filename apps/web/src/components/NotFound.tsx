/** Página de "no existe" con la marca: sirve de 404 de toda la web y de enlace compartido inválido. */
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { t } from "../lib/i18n";

/**
 * Pantalla completa centrada con el nombre de la marca, un mensaje corto y el botón para volver al inicio.
 */
export function NotFound({
  title,
  message,
}: {
  /** Título; por defecto, el del 404 general. */
  title?: string;
  /** Texto bajo el título; por defecto, el del 404 general. */
  message?: ReactNode;
}) {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-6 bg-lino px-6 py-16 text-center">
      <Link to="/" className="font-serif text-2xl font-semibold text-surco" aria-label={t("ui.app.name")}>
        {t("ui.app.name")}
      </Link>
      <div className="flex max-w-sm flex-col gap-2">
        <h1 className="text-title text-surco">{title ?? t("ui.notfound.title")}</h1>
        <p className="text-body text-tinta-2">{message ?? t("ui.notfound.body")}</p>
      </div>
      <Link
        to="/"
        className="inline-flex h-10 items-center justify-center rounded-md border border-accion bg-accion px-4 text-sm font-medium text-sobre transition-colors hover:bg-accion-2"
      >
        {t("ui.notfound.home")}
      </Link>
    </main>
  );
}
