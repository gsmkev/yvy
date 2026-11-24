import { EmptyState } from "./page";
import type { ReactNode } from "react";
import { CircleAlert, type LucideIcon } from "lucide-react";
import { t } from "../../lib/i18n";

/**
 * Marcador de carga con alturas fijas (U-19): reserva el alto que va a ocupar el contenido real
 * para que al llegar los datos la página no salte. `rows` y `h` (px) se ajustan a cada lista.
 */
export const Spinner = ({ rows = 3, h = 48 }: { rows?: number; h?: number }) => (
  <div className="flex flex-col gap-2 p-1" aria-busy="true" aria-label={t("ui.loading")}>
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="animate-pulse rounded-md bg-surco/[0.06]" style={{ height: h }} />
    ))}
  </div>
);

/** Un bloque de carga de alto fijo (px). */
export const Skeleton = ({ h, className = "" }: { h: number; className?: string }) => (
  <div aria-hidden className={`animate-pulse rounded-md bg-surco/[0.06] ${className}`} style={{ height: h }} />
);

/** Alias fino de `EmptyState compact`: vacío dentro de una sección. */
export function Empty({
  title,
  children,
}: {
  /** Se acepta por compatibilidad; los vacíos no llevan ícono decorativo. */
  icon?: LucideIcon;
  title?: string;
  children?: ReactNode;
}) {
  return (
    <EmptyState compact title={title}>
      {children}
    </EmptyState>
  );
}

export const ErrorBox = ({ error }: { error: unknown }) => (
  <div role="alert" className="flex gap-2 rounded-md border border-peligro/30 bg-peligro/5 p-3 text-sm text-peligro">
    <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
    {t("ui.error", { message: error instanceof Error ? error.message : String(error) })}
  </div>
);

// ---------- Avisos breves (toast) ----------
