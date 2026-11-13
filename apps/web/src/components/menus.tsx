import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { t } from "../lib/i18n";
import { placeMenu, visibleArea, type Placement } from "../lib/menuPlacement";
import { toast } from "./ui";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** Acción destructiva: texto de alerta. */
  danger?: boolean;
}

/**
 * Menú de acciones accesible: botón (tres puntos, o con texto) que abre una lista de ítems.
 * Teclado: Enter/Espacio/↓ abren, ↑↓ Inicio Fin recorren, letras saltan al ítem, Escape cierra y devuelve el foco.
 */
export function ActionMenu({
  label,
  text,
  items,
  up = false,
  align = "right",
  className = "",
  quiet = false,
  icon = "dots",
}: {
  /** Nombre accesible y tooltip del botón. */
  label: string;
  /** Texto visible del botón; sin él, el botón es un ícono de tres puntos. */
  text?: string;
  items: (MenuItem | false | null | undefined)[];
  /** Prefiere abrir hacia arriba; si no entra, se acomoda solo. */
  up?: boolean;
  align?: "left" | "right";
  className?: string;
  /** Botón sin borde (barras de tabla). */
  quiet?: boolean;
  /** Ícono del botón cuando no tiene texto: tres puntos (más acciones) o flecha (elegir de una lista). */
  icon?: "dots" | "chevron";
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [place, setPlace] = useState<Placement>({ align, up });
  // El menú se acomoda dentro de la pantalla: del otro lado del botón o hacia arriba si no entra
  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return;
    const r = trigger.current.getBoundingClientRect();
    const m = menu.current;
    setPlace(placeMenu(r, { w: m.offsetWidth, h: Math.min(m.scrollHeight, 320) }, visibleArea(trigger.current), align, 8, 4, up));
  }, [open, align, up]);
  const list = items.filter((i): i is MenuItem => !!i);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };
  const entries = () => Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);

  useEffect(() => {
    if (!open) return;
    entries()[0]?.focus();
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (list.length === 0) return null;

  const onMenuKey = (e: React.KeyboardEvent) => {
    const els = entries();
    const i = els.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      els[(n + els.length) % els.length]?.focus();
    };
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(els.length - 1);
    else if (e.key === "Tab") setOpen(false);
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      const k = e.key.toLowerCase();
      const next = [...els.slice(i + 1), ...els.slice(0, i + 1)].find((el) => el.textContent?.trim().toLowerCase().startsWith(k));
      if (next) {
        e.preventDefault();
        next.focus();
      }
    }
  };

  const triggerCls = text
    ? `h-10 gap-1.5 px-3.5 ${quiet ? "border-transparent text-tinta-2 hover:bg-surco/5 hover:text-surco" : "border-linea bg-papel text-surco hover:border-tinta-2/40 hover:bg-lino"}`
    : "h-10 w-10 border-transparent text-tinta-2 hover:bg-surco/5 hover:text-surco";

  return (
    <div ref={box} className={`relative inline-block print:hidden ${className}`}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={text ? undefined : label}
        title={label}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`inline-flex cursor-pointer items-center justify-center rounded-md border text-sm font-medium transition-colors ${triggerCls}`}
      >
        {text ? (
          <>
            {text}
            <ChevronDown size={14} aria-hidden />
          </>
        ) : icon === "chevron" ? (
          <ChevronDown size={18} aria-hidden />
        ) : (
          <MoreHorizontal size={18} aria-hidden />
        )}
      </button>
      {open && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          className={`absolute z-40 max-h-80 min-w-48 overflow-y-auto rounded-md border border-linea bg-papel py-1 shadow-lg ${place.up ? "bottom-full mb-1" : "top-full mt-1"} ${place.align === "right" ? "right-0" : "left-0"}`}
        >
          {list.map((it, i) => (
            <button
              key={`${i}-${it.label}`}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={it.disabled}
              onClick={() => {
                close(false);
                it.onSelect();
              }}
              className={`block h-12 w-full cursor-pointer px-3.5 text-left text-sm whitespace-nowrap hover:bg-surco/[0.05] focus-visible:bg-surco/[0.05] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 sm:h-10 ${it.danger ? "text-peligro" : "text-surco"}`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export interface ExportFormat {
  label: string;
  run: () => unknown | Promise<unknown>;
}

/** Un solo botón "Exportar" con los formatos disponibles (Excel, CSV, KML…). Los errores salen como aviso. */
export function ExportMenu({
  formats,
  quiet = false,
  up = false,
  className,
}: {
  formats: ExportFormat[];
  quiet?: boolean;
  up?: boolean;
  className?: string;
}) {
  return (
    <ActionMenu
      label={t("ui.exportMenu")}
      text={t("ui.exportMenu")}
      quiet={quiet}
      up={up}
      className={className}
      items={formats.map((f) => ({
        label: f.label,
        onSelect: () => {
          void (async () => {
            try {
              await f.run();
            } catch (e) {
              toast(t("ui.error", { message: e instanceof Error ? e.message : String(e) }));
            }
          })();
        },
      }))}
    />
  );
}
