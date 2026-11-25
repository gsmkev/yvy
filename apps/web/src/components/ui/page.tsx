/** Estructura de página: encabezado, cuerpo, barra de filtros y estado vacío. */
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";

/** Encabezado de página: título en una línea (truncado, completo en el tooltip), un primario y un menú. */
export function PageHeader({
  title,
  titleAction,
  primary,
  menu,
  stacked = false,
  className = "",
}: {
  title: string;
  /** Junto al título: por ejemplo el menú para cambiar de estancia. */
  titleAction?: ReactNode;
  /** La acción principal de la pantalla: un solo botón relleno. */
  primary?: ReactNode;
  /** Lo demás: `ActionMenu` y `ExportMenu`. */
  menu?: ReactNode;
  /** Las acciones van debajo del título (paneles angostos, donde no entran al lado). */
  stacked?: boolean;
  className?: string;
}) {
  const actions = (primary || menu) && (
    <div className="flex shrink-0 items-center gap-2 print:hidden">
      {primary}
      {menu}
    </div>
  );
  return (
    <header className={`flex min-w-0 gap-3 ${stacked ? "flex-col items-stretch" : "items-center"} ${className}`}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <h1 title={title} className="min-w-0 truncate text-title leading-8">
          {title}
        </h1>
        {titleAction && <div className="shrink-0 print:hidden">{titleAction}</div>}
      </div>
      {actions}
    </header>
  );
}

/**
 * El único vacío: qué es esta sección y la acción para empezar. Sin borde punteado (el punteado trigo
 * significa "pendiente" en la marca). `compact` para vacíos dentro de una sección.
 */
export function EmptyState({
  title,
  children,
  action,
  compact = false,
  className = "",
}: {
  title?: string;
  /** Una o dos líneas que explican para qué sirve. */
  children?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-start gap-3 ${compact ? "py-4" : "py-8"} ${className}`}>
      <div className="flex flex-col gap-1">
        {title && <p className={`font-medium text-surco ${compact ? "text-body" : "text-section"}`}>{title}</p>}
        {children && <div className="text-meta text-tinta-2 sm:text-sm">{children}</div>}
      </div>
      {action}
    </div>
  );
}

// ---------- Marco de página ----------

const WIDTH = { read: "max-w-3xl", data: "max-w-6xl", full: "" } as const;

/**
 * Envoltorio de toda pantalla del producto: alineado a la izquierda y con el mismo padding, para que el
 * título quede en la misma posición en toda la app. `read` para formularios y ajustes, `data` para listas y tablas.
 */
export function Page({
  width = "read",
  back,
  title,
  titleAction,
  primary,
  menu,
  className = "gap-5",
  children,
}: {
  width?: "read" | "data" | "full";
  back?: { to: string; label: string };
  title?: string;
  titleAction?: ReactNode;
  primary?: ReactNode;
  menu?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`flex w-full min-w-0 flex-col px-4 py-4 lg:px-10 lg:py-8 ${WIDTH[width]} ${className}`}>
      {back && (
        <Link to={back.to} className="inline-flex w-fit items-center gap-1.5 text-meta text-tinta-2 hover:text-surco print:hidden">
          <ArrowLeft size={14} aria-hidden />
          {back.label}
        </Link>
      )}
      {title && <PageHeader title={title} titleAction={titleAction} primary={primary} menu={menu} />}
      {children}
    </div>
  );
}

// ---------- Tabla de datos ----------
