import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { t, tk } from "../lib/i18n";

export function Button({
  variant = "primary",
  className = "",
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const v = {
    primary: "bg-soja text-white hover:bg-soja-dark disabled:opacity-50",
    ghost: "bg-white/60 text-surco ring-1 ring-surco/15 hover:bg-white disabled:opacity-50",
    danger: "bg-alerta text-white hover:opacity-90 disabled:opacity-50",
  }[variant];
  return (
    <button
      type="button"
      {...p}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition ${v} ${className}`}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-surco/80">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "rounded-lg border border-surco/20 bg-white px-3 py-2 text-sm outline-none focus:border-soja focus:ring-2 focus:ring-soja/30";

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...p} className={`${inputCls} ${p.className ?? ""}`} />
);

export const Select = ({
  options,
  ...p
}: SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) => (
  <select {...p} className={`${inputCls} ${p.className ?? ""}`}>
    {options.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </select>
);

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl bg-white p-4 shadow-sm ring-1 ring-surco/5 ${className}`}>{children}</div>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surco/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl bg-lino p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button aria-label={t("ui.close")} className="rounded p-1 text-surco/60 hover:bg-surco/10" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const Spinner = () => <div className="p-6 text-sm text-surco/60">{t("ui.loading")}</div>;
export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="rounded-xl border border-dashed border-surco/20 p-6 text-center text-sm text-surco/60">
    {children}
  </div>
);
export const ErrorBox = ({ error }: { error: unknown }) => (
  <div role="alert" className="rounded-lg bg-alerta/10 p-3 text-sm text-alerta">
    {t("ui.error", { message: error instanceof Error ? error.message : String(error) })}
  </div>
);

const SEV = {
  info: "bg-cielo/30 text-surco",
  watch: "bg-trigo/30 text-surco",
  warning: "bg-alerta text-white",
} as const;
export function SeverityBadge({ severity }: { severity: keyof typeof SEV }) {
  const icon = severity === "warning" ? "▲" : severity === "watch" ? "●" : "i";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${SEV[severity]}`}>
      <span aria-hidden>{icon}</span>
      {tk(`ui.severity_${severity}`)}
    </span>
  );
}

export const Tabs = <T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) => (
  <div role="tablist" className="flex shrink-0 gap-1 overflow-x-auto border-b border-surco/10">
    {tabs.map((tb) => (
      <button
        key={tb.id}
        role="tab"
        aria-selected={value === tb.id}
        onClick={() => onChange(tb.id)}
        className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${value === tb.id ? "border-soja text-surco" : "border-transparent text-surco/60 hover:text-surco"}`}
      >
        {tb.label}
      </button>
    ))}
  </div>
);
