/** Piezas de composición: superficies, encabezados de sección y cifras destacadas (`Stat`, en filas de hasta 4 con `StatRow`). */
import { Children, type ReactNode } from "react";

/** Superficie con borde fino. Sin sombras: la jerarquía la dan el espacio y la tipografía. */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-linea bg-papel p-4 ${className}`}>{children}</div>;
}

/** Encabezado de sección con contador y acción opcionales. */
export function SectionHead({ title, count, action }: { title: string; count?: number | string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 border-b border-linea pb-2">
      <h2 className="eyebrow">
        {title}
        {count !== undefined && <span className="ml-1.5 text-surco">{count}</span>}
      </h2>
      {action}
    </div>
  );
}

/**
 * Cifra con su etiqueta, unidad y nota.
 * @param tone "danger" la pinta como alerta.
 */
export function Stat({
  label,
  value,
  unit,
  note,
  tone,
  size = "md",
}: {
  /** Tamaño de la cifra. */
size?: "md" | "lg";
  label: string;
  value: ReactNode;
  unit?: string;
  note?: ReactNode;
  tone?: "danger";
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="eyebrow">{label}</span>
      <span
        className={`num font-serif font-semibold tabular-nums ${size === "lg" ? "text-title" : "text-2xl leading-8"} ${tone === "danger" ? "text-peligro" : ""}`}
      >
        {value}
        {unit && <span className="ml-1 text-sm text-tinta-2">{unit}</span>}
      </span>
      {note && <span className="text-xs text-tinta-2">{note}</span>}
    </div>
  );
}

const COLS = ["", "sm:grid-cols-1", "sm:grid-cols-2", "sm:grid-cols-3", "sm:grid-cols-4"] as const;

/**
 * Fila de cifras (`Stat`): máximo 4 por fila, dos por línea en el celular, una línea de contexto como mucho en cada una.
 * Con más de 4 hijos pasa a la fila siguiente.
 */
export function StatRow({
  children,
  className = "",
  max = 4,
}: {
  children: ReactNode;
  className?: string;
  /** Cifras por fila en pantallas anchas (de 1 a 4); 2 para paneles angostos. */
  max?: 1 | 2 | 3 | 4;
}) {
  const n = Math.min(max, Math.max(1, Children.toArray(children).filter(Boolean).length));
  return <div className={`grid grid-cols-2 gap-x-6 gap-y-4 ${COLS[n]} ${className}`}>{children}</div>;
}
