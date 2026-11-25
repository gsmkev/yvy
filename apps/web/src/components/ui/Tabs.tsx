/** Pestañas horizontales que nunca se parten: si no entran se desplazan de costado con el borde desvanecido. */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Estado de una fila de pestañas con desplazamiento: posición del indicador de la activa
 * (`[role="tab"][aria-selected="true"]` dentro de `scroller`), bordes con más pestañas y si ya se midió.
 * Mantiene la activa a la vista. `deps` re-mide cuando cambian las pestañas.
 */
export function useTabIndicator(value: string, deps: string) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  const [bar, setBar] = useState<{ x: number; w: number } | null>(null);
  const [ready, setReady] = useState(false);
  const active = () => scroller.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ?? null;
  // Posición del indicador y bordes con más pestañas (se desvanecen)
  const measure = () => {
    const el = scroller.current;
    if (!el) return;
    setEdge({ left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 });
    const a = active();
    if (a) setBar((b) => (b && b.x === a.offsetLeft && b.w === a.offsetWidth ? b : { x: a.offsetLeft, w: a.offsetWidth }));
  };
  useLayoutEffect(measure, [value, deps]);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.addEventListener("scroll", measure, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    // Sin animar la primera posición: el indicador aparece ya en su lugar
    const raf = requestAnimationFrame(() => setReady(true));
    return () => {
      el.removeEventListener("scroll", measure);
      ro?.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);
  // La pestaña activa siempre queda a la vista
  useEffect(() => {
    active()?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  }, [value]);
  const fade = (on: boolean) => (on ? "transparent 0, #000 28px" : "#000 0, #000 0");
  const fadeEnd = (on: boolean) => (on ? "#000 calc(100% - 28px), transparent 100%" : "#000 100%, #000 100%");
  const mask = `linear-gradient(to right, ${fade(edge.left)}, ${fadeEnd(edge.right)})`;
  const maskStyle = edge.left || edge.right ? { maskImage: mask, WebkitMaskImage: mask } : undefined;
  return { scroller, bar, ready, maskStyle };
}

/** Indicador deslizante de la pestaña activa: mide 1 px (línea) o 100 px (pastilla) y se estira con `scaleX`. */
export function TabIndicator({ bar, ready, pill = false }: { bar: { x: number; w: number } | null; ready: boolean; pill?: boolean }) {
  if (!bar) return null;
  const base = pill ? 100 : 1;
  return (
    <span
      aria-hidden
      data-testid="tab-indicator"
      style={{ transform: `translateX(${bar.x}px) scaleX(${bar.w / base})`, width: base }}
      className={`pointer-events-none absolute left-0 origin-left ${ready ? "transition-transform duration-[var(--dur-modal)]" : ""} ${pill ? "inset-y-0 rounded-md bg-surco/[0.07]" : "bottom-0 h-0.5 bg-surco"}`}
    />
  );
}

/**
 * Pestañas controladas, siempre en una sola línea. El indicador de la activa se desliza de una a otra
 * (solo `transform`) y la activa queda a la vista cuando hay desplazamiento.
 * @param tabs pestañas con su id, texto y contador opcional.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  variant = "line",
  actions,
  label,
}: {
  tabs: { id: T; label: string; count?: number }[];
  /** Id de la pestaña activa. */
  value: T;
  /** Recibe el id elegido. */
  onChange: (v: T) => void;
  /** "line": subrayado bajo la fila (nivel principal). "pill": fondo suave en la activa (subnivel). */
  variant?: "line" | "pill";
  /** Acción de la pantalla, alineada a la derecha de la fila (botones `size="sm"` en "line"). En el celular baja a su propia línea. */
  actions?: ReactNode;
  /** Nombre accesible del grupo de pestañas. */
  label?: string;
}) {
  const pill = variant === "pill";
  const { scroller, bar, ready, maskStyle } = useTabIndicator(value, tabs.map((x) => `${x.label}${x.count ?? ""}`).join("|"));
  return (
    <div className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 print:hidden ${pill ? "" : "border-b border-linea"}`}>
      <div
        ref={scroller}
        role="tablist"
        aria-label={label}
        style={maskStyle}
        className={`relative flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${pill ? "gap-1" : "gap-5"}`}
        onKeyDown={(e) => {
          // Flechas, Inicio y Fin pasan de una pestaña a otra
          const i = tabs.findIndex((x) => x.id === value);
          const to =
            e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
          if (to === null) return;
          e.preventDefault();
          const next = tabs[(to + tabs.length) % tabs.length]!;
          onChange(next.id);
          setTimeout(() => scroller.current?.querySelector<HTMLElement>(`[data-tab="${next.id}"]`)?.focus(), 0);
        }}
      >
        <TabIndicator bar={bar} ready={ready} pill={pill} />
        {tabs.map((tb) => (
          <button
            key={tb.id}
            id={`tab-${tb.id}`}
            data-tab={tb.id}
            data-no-press
            role="tab"
            type="button"
            tabIndex={value === tb.id ? 0 : -1}
            aria-selected={value === tb.id}
            onClick={() => onChange(tb.id)}
            className={`relative inline-flex shrink-0 cursor-pointer items-center font-medium whitespace-nowrap transition-colors ${
              pill ? "h-9 rounded-md px-3 text-sm" : "h-10 text-sm"
            } ${value === tb.id ? "text-surco" : "text-tinta-2 hover:text-surco"}`}
          >
            {tb.label}
            {tb.count !== undefined && <span className="num ml-1.5 text-xs text-tinta-2">{tb.count}</span>}
          </button>
        ))}
      </div>
      {actions && <div className={`flex shrink-0 items-center gap-2 ${pill ? "" : "pb-px"}`}>{actions}</div>}
    </div>
  );
}
