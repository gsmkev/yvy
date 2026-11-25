/** Controles de formulario con el estilo de la aplicación: campo, entrada, fecha, selector y pie con errores. */
import { Button } from "./Button";
import { ErrorBox } from "./feedback";
import { createPortal } from "react-dom";
import { CancelButton, useInModal, useModalFooter } from "./Modal";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { ChevronDown } from "lucide-react";
import { displayToIso, isoToDisplay, maskDate } from "@yvy/shared";
import { t } from "../../lib/i18n";

/** Hace que los `Field` de una barra de filtros salgan compactos (etiqueta chica, control de 36 px). */
export const FilterContext = createContext(false);

/** Etiqueta que envuelve un control y muestra una ayuda opcional. */
export function Field({
  label,
  hint,
  children,
  wide = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  /** Ocupa las dos columnas de la grilla del formulario. */ wide?: boolean;
}) {
  const compact = useContext(FilterContext);
  return (
    <label
      className={`flex min-w-0 flex-col text-sm ${compact ? "gap-1 [&_input]:h-9 [&_select]:h-9" : "gap-1.5"} ${wide ? "sm:col-span-2" : ""}`}
    >
      <span className={compact ? "text-meta font-medium text-tinta-2" : "font-medium"}>{label}</span>
      {children}
      {hint && <span className="text-xs text-tinta-2">{hint}</span>}
    </label>
  );
}

const inputCls =
  "h-10 rounded-md border border-linea bg-papel px-3 text-body outline-none transition-colors placeholder:text-tinta-2/60 focus:border-accion focus:ring-2 focus:ring-accion/20";

/** Entrada de texto; para `type="date"` usa DateInput. */
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) =>
  p.type === "date" ? (
    // nosemgrep: react-props-spreading -- envoltorio que reenvía al elemento nativo todas sus props
    <DateInput {...p} value={String(p.value ?? "")} />
  ) : (
    // nosemgrep: react-props-spreading -- envoltorio que reenvía al elemento nativo todas sus props
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
    ref.current?.setCustomValidity(text && !iso ? t("ui.date.invalid") : range ? t("ui.date.outOfRange") : "");
  }, [text, iso, range]);
  return (
    <input
      // nosemgrep: react-props-spreading -- envoltorio que reenvía al elemento nativo todas sus props
      {...p}
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={t("ui.date.placeholder")}
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
      <ChevronDown
        size={16}
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 opacity-60"
      />
    </span>
  );
}

/**
 * Selector nativo con estilo.
 * @param options valor y texto de cada opción.
 */
export const Select = ({
  options,
  className = "",
  ...p
}: SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) => (
  <SelectBox className={className}>
    <select
      // nosemgrep: react-props-spreading -- envoltorio que reenvía al elemento nativo todas sus props
      {...p}
      className={`${selectCls} w-full`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </SelectBox>
);

/** Id del `<form>` actual, para que su botón de envío pueda vivir fuera de él (en el pie fijo del diálogo). */
const FormIdContext = createContext<string | undefined>(undefined);

/**
 * Pie de un formulario de diálogo: el error de guardado (si hay) y, fijo abajo aunque el cuerpo se desplace,
 * Cancelar a la izquierda de la acción principal. Va dentro del `Form`; en un `Modal` los botones se dibujan en el
 * pie fijo del diálogo y envían este formulario.
 * @param label texto de la acción principal (por defecto "Guardar").
 */
export function FormFooter({
  error,
  disabled,
  label,
}: {
  error: unknown;
  disabled: boolean;
  /** Texto de la acción principal. */ label?: string;
}) {
  const footerEl = useModalFooter();
  const inModal = useInModal();
  const formId = useContext(FormIdContext);
  const buttons = (
    <>
      {inModal && <CancelButton />}
      <Button type="submit" form={formId} variant="primary" disabled={disabled}>
        {label ?? t("ui.common.save")}
      </Button>
    </>
  );
  return (
    <>
      {error ? (
        <div className="sm:col-span-2">
          <ErrorBox error={error} />
        </div>
      ) : null}
      {inModal ? (
        footerEl && createPortal(buttons, footerEl)
      ) : (
        <div className="flex items-center justify-end gap-2 sm:col-span-2">{buttons}</div>
      )}
    </>
  );
}

/** Grilla de un formulario de diálogo: una columna en el celular y dos desde 640 px, con las etiquetas arriba y alineadas. */
const FORM_GRID = "grid grid-cols-1 items-start gap-x-4 gap-y-4 sm:grid-cols-2";

/** `<form>` que corta el envío nativo y llama a `onSubmit`. Sin `className` es la grilla de formulario (`FORM_GRID`). */
export function Form({
  onSubmit,
  className = FORM_GRID,
  children,
}: {
  onSubmit: () => void;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <FormIdContext.Provider value={id}>
      <form
        id={id}
        className={className}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        {children}
      </form>
    </FormIdContext.Provider>
  );
}
