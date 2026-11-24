/** Pestañas horizontales con contador y desplazamiento lateral cuando no entran. */
import { useEffect, useRef, useState } from "react";

/**
 * Pestañas controladas.
 * @param tabs pestañas con su id, texto y contador opcional.
 * @param value id de la pestaña activa.
 * @param onChange recibe el id elegido.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  // Si no entran, se desplazan de costado y el borde que tiene más pestañas se desvanece
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () =>
      setEdge({ left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 });
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro?.disconnect();
    };
  }, [tabs.length]);
  // La pestaña activa siempre queda a la vista
  useEffect(() => {
    document.getElementById(`tab-${value}`)?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  }, [value]);
  const fade = (on: boolean) => (on ? "transparent 0, #000 28px" : "#000 0, #000 0");
  const fadeEnd = (on: boolean) => (on ? "#000 calc(100% - 28px), transparent 100%" : "#000 100%, #000 100%");
  const mask = `linear-gradient(to right, ${fade(edge.left)}, ${fadeEnd(edge.right)})`;
  return (
    <div
      ref={scroller}
      role="tablist"
      style={edge.left || edge.right ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
      className="flex shrink-0 gap-5 overflow-x-auto border-b border-linea [scrollbar-width:none] print:hidden [&::-webkit-scrollbar]:hidden"
      onKeyDown={(e) => {
        // Flechas, Inicio y Fin pasan de una pestaña a otra
        const i = tabs.findIndex((x) => x.id === value);
        const to =
          e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
        if (to === null) return;
        e.preventDefault();
        const next = tabs[(to + tabs.length) % tabs.length]!;
        onChange(next.id);
        setTimeout(() => document.getElementById(`tab-${next.id}`)?.focus(), 0);
      }}
    >
      {tabs.map((tb) => (
        <button
          key={tb.id}
          id={`tab-${tb.id}`}
          role="tab"
          tabIndex={value === tb.id ? 0 : -1}
          aria-selected={value === tb.id}
          onClick={() => onChange(tb.id)}
          className={`-mb-px inline-flex h-10 shrink-0 cursor-pointer items-center border-b-2 text-sm font-medium whitespace-nowrap transition-colors ${value === tb.id ? "border-surco text-surco" : "border-transparent text-tinta-2 hover:text-surco"}`}
        >
          {tb.label}
          {tb.count !== undefined && <span className="num ml-1.5 text-xs text-tinta-2">{tb.count}</span>}
        </button>
      ))}
    </div>
  );
}
