import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

type Variant = "primary" | "secondary" | "quiet" | "danger";

const VARIANT: Record<Variant, string> = {
  primary: "bg-accion text-sobre hover:bg-accion-2 border border-accion",
  secondary: "bg-papel text-surco border border-linea hover:border-tinta-2/40 hover:bg-lino",
  quiet: "text-tinta-2 hover:text-surco hover:bg-surco/5 border border-transparent",
  danger: "bg-papel text-peligro border border-peligro/40 hover:bg-peligro hover:text-sobre",
};

export function Button({
  variant = "secondary",
  icon: Icon,
  size = "md",
  className = "",
  children,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: LucideIcon; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      {...p}
      className={`inline-flex cursor-pointer print:hidden items-center justify-center gap-2 rounded-md font-medium transition-[color,background-color,border-color,transform] duration-[120ms] ease-[var(--ease-out)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100 ${size === "sm" ? "h-8 px-2.5 text-meta" : "h-10 px-3.5 text-sm"} ${VARIANT[variant]} ${className}`}
    >
      {/* Ícono solo en botones sin texto: con texto, el texto alcanza */}
      {Icon && !children && <Icon size={16} strokeWidth={2} aria-hidden />}
      {children}
    </button>
  );
}
