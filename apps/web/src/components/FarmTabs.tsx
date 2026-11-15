import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { t } from "../lib/i18n";

export interface FarmTab<T extends string> {
  id: T;
  label: string;
  count?: number;
  /** Va directo a la barra; el resto se junta en "Más". */
  main?: boolean;
}

const tabCls = (on: boolean) =>
  `-mb-px inline-flex h-10 shrink-0 cursor-pointer items-center border-b-2 text-sm font-medium whitespace-nowrap transition-colors ${on ? "border-surco text-surco" : "border-transparent text-tinta-2 hover:text-surco"}`;

/**
 * Pestañas de la ficha de la estancia: las principales a la vista y el resto en "Más". La pestaña
 * activa que está en "Más" se muestra en la barra, así siempre se ve dónde estás.
 */
export function FarmTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: FarmTab<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const shown = tabs.filter((x) => x.main || x.id === value);
  const rest = tabs.filter((x) => !shown.includes(x));
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  const focusTab = (id: string) => setTimeout(() => document.getElementById(`tab-${id}`)?.focus(), 0);
  return (
    <div className="flex items-center gap-5 border-b border-linea print:hidden">
      <div
        role="tablist"
        className="flex gap-5"
        onKeyDown={(e) => {
          // Flechas, Inicio y Fin pasan de una pestaña visible a otra
          const i = shown.findIndex((x) => x.id === value);
          const to =
            e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? shown.length - 1 : null;
          if (to === null) return;
          e.preventDefault();
          const next = shown[(to + shown.length) % shown.length]!;
          onChange(next.id);
          focusTab(next.id);
        }}
      >
        {shown.map((tb) => (
          <button
            key={tb.id}
            id={`tab-${tb.id}`}
            role="tab"
            tabIndex={value === tb.id ? 0 : -1}
            aria-selected={value === tb.id}
            onClick={() => onChange(tb.id)}
            className={tabCls(value === tb.id)}
          >
            {tb.label}
            {tb.count !== undefined && <span className="num ml-1.5 text-xs text-tinta-2">{tb.count}</span>}
          </button>
        ))}
      </div>
      {rest.length > 0 && (
        <div ref={box} className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
            className={`${tabCls(false)} gap-1`}
          >
            {t("ui.tabMore")}
            <ChevronDown size={14} aria-hidden />
          </button>
          {open && (
            <div
              role="menu"
              aria-label={t("ui.tabMore")}
              className="anim-pop absolute top-full right-0 z-40 mt-1 min-w-44 rounded-md border border-linea bg-papel py-1 shadow-lg"
              onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
            >
              {rest.map((tb) => (
                <button
                  key={tb.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onChange(tb.id);
                    focusTab(tb.id);
                  }}
                  className="flex h-10 w-full cursor-pointer items-center justify-between gap-3 px-3.5 text-left text-sm whitespace-nowrap text-surco hover:bg-surco/[0.05]"
                >
                  {tb.label}
                  {tb.count !== undefined && <span className="num text-xs text-tinta-2">{tb.count}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
