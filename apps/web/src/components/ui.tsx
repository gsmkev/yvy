import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { AlertTriangle, CircleAlert, X, type LucideIcon } from "lucide-react";
import { t, tk } from "../lib/i18n";

type Variant = "primary" | "secondary" | "quiet" | "danger";

const VARIANT: Record<Variant, string> = {
  primary: "bg-accion text-white hover:bg-accion-2 border border-accion",
  secondary: "bg-papel text-surco border border-linea hover:border-tinta-2/40 hover:bg-white",
  quiet: "text-tinta-2 hover:text-surco hover:bg-surco/5 border border-transparent",
  danger: "bg-papel text-peligro border border-peligro/40 hover:bg-peligro hover:text-white",
};

export function Button({
  variant = "secondary",
  icon: Icon,
  className = "",
  children,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: LucideIcon }) {
  return (
    <button
      type="button"
      {...p}
      className={`inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md px-3.5 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45 ${VARIANT[variant]} ${className}`}
    >
      {/* Ícono solo en botones sin texto: con texto, el texto alcanza */}
      {Icon && !children && <Icon size={16} strokeWidth={2} aria-hidden />}
      {children}
    </button>
  );
}

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
  "h-10 rounded-md border border-linea bg-papel px-3 text-[15px] outline-none transition-colors placeholder:text-tinta-2/60 focus:border-accion focus:ring-2 focus:ring-accion/20";

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...p} className={`${inputCls} ${p.className ?? ""}`} />
);

export const Select = ({
  options,
  ...p
}: SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) => (
  <select {...p} className={`${inputCls} cursor-pointer pr-8 ${p.className ?? ""}`}>
    {options.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </select>
);

/** Superficie con borde fino. Sin sombras: la jerarquía la dan el espacio y la tipografía. */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-linea bg-papel p-4 ${className}`}>{children}</div>;
}

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

export function Stat({
  label,
  value,
  unit,
  note,
  tone,
}: {
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
        className={`num font-serif text-[28px] leading-tight font-semibold ${tone === "danger" ? "text-peligro" : ""}`}
      >
        {value}
        {unit && <span className="ml-1 text-sm text-tinta-2">{unit}</span>}
      </span>
      {note && <span className="text-xs text-tinta-2">{note}</span>}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-surco/55 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl bg-lino shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-linea bg-lino px-5 py-3.5">
          <h2 className="font-serif text-xl font-semibold">{title}</h2>
          <button
            aria-label={t("ui.close")}
            className="cursor-pointer rounded p-1.5 text-tinta-2 hover:bg-surco/5 hover:text-surco"
            onClick={onClose}
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/** Confirmación de una acción destructiva (reemplaza a window.confirm). */
export function ConfirmModal({
  title,
  message,
  confirmLabel,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  pending?: boolean;
  error?: unknown;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-[15px]">{message}</p>
      {error ? (
        <div className="mt-3">
          <ErrorBox error={error} />
        </div>
      ) : null}
      <div className="mt-5 flex gap-2">
        <Button variant="danger" onClick={onConfirm} disabled={pending}>
          {confirmLabel}
        </Button>
        <Button variant="quiet" onClick={onClose}>
          {t("ui.cancel")}
        </Button>
      </div>
    </Modal>
  );
}

export const Spinner = () => (
  <div className="flex flex-col gap-2 p-1" aria-busy="true" aria-label={t("ui.loading")}>
    {[0, 1, 2].map((i) => (
      <div key={i} className="h-12 animate-pulse rounded-md bg-surco/[0.06]" />
    ))}
  </div>
);

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
    <div className="flex flex-col items-start gap-1.5 py-6 text-sm text-tinta-2">
      {title && <p className="font-medium text-surco">{title}</p>}
      {children}
    </div>
  );
}

export const ErrorBox = ({ error }: { error: unknown }) => (
  <div role="alert" className="flex gap-2 rounded-md border border-peligro/30 bg-peligro/5 p-3 text-sm text-peligro">
    <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
    {t("ui.error", { message: error instanceof Error ? error.message : String(error) })}
  </div>
);

const SEV = {
  info: "border-cielo text-surco bg-cielo/15",
  watch: "border-trigo text-trigo-texto bg-trigo/15",
  warning: "border-peligro bg-peligro text-white",
} as const;

/** Severidad siempre con ícono + texto, nunca solo color. */
export function SeverityBadge({ severity }: { severity: keyof typeof SEV }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-xs font-semibold ${SEV[severity]}`}
    >
      <AlertTriangle size={12} aria-hidden />
      {tk(`ui.severity_${severity}`)}
    </span>
  );
}

export const Tabs = <T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) => (
  <div role="tablist" className="flex shrink-0 gap-5 overflow-x-auto border-b border-linea">
    {tabs.map((tb) => (
      <button
        key={tb.id}
        role="tab"
        aria-selected={value === tb.id}
        onClick={() => onChange(tb.id)}
        className={`-mb-px cursor-pointer border-b-2 pt-1 pb-2.5 text-sm font-medium whitespace-nowrap transition-colors ${value === tb.id ? "border-surco text-surco" : "border-transparent text-tinta-2 hover:text-surco"}`}
      >
        {tb.label}
        {tb.count !== undefined && <span className="num ml-1.5 text-xs text-tinta-2">{tb.count}</span>}
      </button>
    ))}
  </div>
);
