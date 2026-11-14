/** Piezas de formulario con el lenguaje de la landing: rótulo mono numerado y campo subrayado sobre surco. */
import type { ReactNode } from "react";

export function Field({ n, label, children }: { n: string; label: string; children: ReactNode }) {
  return (
    <label className="grid grid-cols-[28px_1fr] gap-x-3 py-3">
      <span className="mono-yvy pt-1 text-lino/60" aria-hidden>
        {n}
      </span>
      <span>
        <span className="mono-yvy block text-lino/80">{label}</span>
        {children}
      </span>
    </label>
  );
}

export const inputCls =
  "mt-1 w-full border-0 border-b border-lino/60 bg-transparent py-2 text-lg text-lino outline-none placeholder:text-lino/40 focus:border-trigo focus-visible:border-trigo focus-visible:border-b-2";

/** Casilla de consentimiento: cuadrada, trigo al marcarla. */
export function Consent({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="grid grid-cols-[28px_1fr] items-start gap-x-3 py-3">
      <input
        type="checkbox"
        required
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 appearance-none border border-lino/70 bg-transparent checked:border-trigo checked:bg-trigo focus-visible:outline-2 focus-visible:outline-offset-2"
      />
      <span className="text-[15px] leading-snug text-lino/80">{children}</span>
    </label>
  );
}

/** Campo trampa: las personas no lo ven ni lo tabulan; un robot lo llena. */
export function Honeypot({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
      <input tabIndex={-1} autoComplete="off" name="website" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
