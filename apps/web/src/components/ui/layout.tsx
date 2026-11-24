/** Piezas de composición: superficies, encabezados de sección y cifras destacadas. */
import type { ReactNode } from "react";

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
 * @param size tamaño de la cifra.
 */
export function Stat({
  label,
  value,
  unit,
  note,
  tone,
  size = "md",
}: {
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
