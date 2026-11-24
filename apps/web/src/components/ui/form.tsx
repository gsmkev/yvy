import { Button } from "./Button";
import { ErrorBox } from "./feedback";
import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { displayToIso, isoToDisplay, maskDate } from "@yvy/shared";
import { t } from "../../lib/i18n";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-tinta-2">{hint}</span>}
    </label>
  );
}

const inputCls =
  "h-10 rounded-md border border-linea bg-papel px-3 text-body outline-none transition-colors placeholder:text-tinta-2/60 focus:border-accion focus:ring-2 focus:ring-accion/20";

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) =>
  p.type === "date" ? (
    <DateInput {...p} value={String(p.value ?? "")} />
  ) : (
    <input {...p} className={`${inputCls} ${p.className ?? ""}`} />
  );

/**
 * Fecha en dd/mm/aaaa (el campo nativo muestra mm/dd/yyyy según el navegador). El valor es siempre ISO (aaaa-mm-dd),
 * como el de `<input type="date">`: `Input type="date"` usa este componente, así que los formularios no cambian.
 * Mientras la fecha esté incompleta o no exista, el valor es "" y el campo queda inválido (avisa al enviar).
 */
export function DateInput({
  value,
  onChange,
  onValueChange,
  min,
  max,
  className = "",
  type: _type,
  ...p
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value"> & {
  value?: string;
  /** Recibe la fecha ISO ("" si no es válida). */
  onValueChange?: (iso: string) => void;
}) {
  const [text, setText] = useState(isoToDisplay(value ?? ""));
  const ref = useRef<HTMLInputElement>(null);
  // Un valor que cambia desde afuera (limpiar el formulario, cargar un registro) reemplaza lo escrito
  useEffect(() => {
    if ((value ?? "") !== (displayToIso(text) ?? "")) setText(isoToDisplay(value ?? ""));
  }, [value]);
  const iso = displayToIso(text);
  const range = iso && ((min && iso < String(min)) || (max && iso > String(max)));
  useEffect(() => {
    ref.current?.setCustomValidity(text && !iso ? t("ui.dateInvalid") : range ? t("ui.dateOutOfRange") : "");
  }, [text, iso, range]);
  return (
    <input
      {...p}
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={t("ui.datePlaceholder")}
      maxLength={10}
      size={10}
      value={text}
      onChange={(e) => {
        const next = maskDate(e.target.value);
        setText(next);
        const v = displayToIso(next) ?? "";
        if (v === (value ?? "")) return;
        onValueChange?.(v);
        // Los formularios leen e.target.value: se entrega el mismo evento con la fecha ISO
        const target = { value: v, name: e.target.name, id: e.target.id } as HTMLInputElement;
        onChange?.({ ...e, target, currentTarget: target });
      }}
      className={`${inputCls} min-w-0 !px-2.5 !text-sm ${className}`}
    />
  );
}

/** Clase de un `<select>` nativo sin el control del sistema: se envuelve en `SelectBox` (o se usa `Select`). */
const selectCls = `${inputCls} cursor-pointer appearance-none pr-8`;

/** Envuelve un `<select class={selectCls}>` suelto y le pone el chevron propio. */
export function SelectBox({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`relative inline-flex min-w-0 ${className}`}>
      {children}
      <ChevronDown size={16} aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 opacity-60" />
    </span>
  );
}

export const Select = ({
  options,
  className = "",
  ...p
}: SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) => (
  <SelectBox className={className}>
    <select {...p} className={`${selectCls} w-full`}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </SelectBox>
);

/** Pie de un formulario en grilla de dos columnas: el error de guardado (si hay) y el botón Guardar. */
export function FormFooter({ error, disabled }: { error: unknown; disabled: boolean }) {
  return (
    <>
      {error ? (
        <div className="col-span-2">
          <ErrorBox error={error} />
        </div>
      ) : null}
      <div className="col-span-2">
        <Button type="submit" variant="primary" disabled={disabled}>
          {t("ui.save")}
        </Button>
      </div>
    </>
  );
}
