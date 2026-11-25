/** Barra de filtros y selector de período: la fila de filtros de cada listado. */
import { useCallback, useContext, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ListFilter } from "lucide-react";
import { t } from "../../lib/i18n";
import { Button } from "./Button";
import { DateInput, FilterContext } from "./form";
import { CancelButton, Modal } from "./Modal";
import { useIsPhone } from "./useMediaQuery";

/** Elemento donde la barra de filtros de la pantalla recibe su "Exportar" (lo registra `FilterBar`). */
let exportEl: HTMLElement | null = null;
const exportListeners = new Set<() => void>();
const setExportEl = (el: HTMLElement | null) => {
  exportEl = el;
  exportListeners.forEach((l) => l());
};

/** Lugar del "Exportar" de la pantalla: el final de su `FilterBar`, o `null` si no hay barra y el botón va en el lugar. */
export function useExportSlot() {
  return useSyncExternalStore(
    (cb) => {
      exportListeners.add(cb);
      return () => void exportListeners.delete(cb);
    },
    () => exportEl,
    () => null,
  );
}

/**
 * Barra de filtros en una sola fila compacta: cada filtro es un `Field` (selector o `DateRange`) con la etiqueta
 * chica arriba y todo queda al final con `actions` y el "Exportar" de la tabla (`ExportableTable` se acomoda acá).
 * Bajo 640 px la fila se reduce a un botón "Filtros" (con la cantidad de filtros activos) que abre una hoja con los campos.
 */
export function FilterBar({
  children,
  actions,
  active = 0,
  onClear,
  sheet = true,
  exportSlot = true,
}: {
  /** Los filtros: `Field` con `Select`, `Input` o `DateRange`. */
  children: ReactNode;
  /** Botones al final de la fila (el "Exportar" de una tabla llega solo). */
  actions?: ReactNode;
  /** Filtros con valor; se muestra como contador en el botón "Filtros" del celular. */
  active?: number;
  /** Si se pasa, la hoja del celular ofrece "Limpiar filtros". */
  onClear?: () => void;
  /** `false` para barras que son un formulario (con su propio botón de acción): en el celular se apilan en lugar de abrir una hoja. */
  sheet?: boolean;
  /** `false` para que esta barra no reciba el "Exportar" de la tabla. */
  exportSlot?: boolean;
}) {
  const phone = useIsPhone();
  const [open, setOpen] = useState(false);
  const mine = useRef<HTMLElement | null>(null);
  // Estable: se llama al montar y desmontar, no en cada render
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      if (!exportSlot) return;
      if (el) {
        mine.current = el;
        setExportEl(el);
      } else if (mine.current && exportEl === mine.current) setExportEl(null);
    },
    [exportSlot],
  );
  const tail = (
    <div className="ml-auto flex items-center gap-2">
      {actions}
      <div ref={ref} className="contents" />
    </div>
  );
  if (phone && sheet) {
    return (
      <div className="flex items-center gap-2 print:hidden">
        <Button onClick={() => setOpen(true)} aria-haspopup="dialog">
          <ListFilter size={16} aria-hidden />
          {t("ui.common.filters")}
          {active > 0 && <span className="num rounded-full bg-accion px-1.5 text-xs text-sobre">{active}</span>}
        </Button>
        {tail}
        {open && (
          <Modal
            title={t("ui.common.filters")}
            onClose={() => setOpen(false)}
            footer={
              <>
                {onClear && active > 0 && (
                  <Button variant="quiet" onClick={onClear}>
                    {t("ui.common.filtersClear")}
                  </Button>
                )}
                <CancelButton label={t("ui.common.filtersDone")} />
              </>
            }
          >
            <div className="flex flex-col gap-4">{children}</div>
          </Modal>
        )}
      </div>
    );
  }
  return (
    <FilterContext.Provider value={!phone}>
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2 print:hidden">
        {children}
        {tail}
      </div>
    </FilterContext.Provider>
  );
}

/**
 * Período como un solo control: dos fechas (desde y hasta) en el mismo recuadro, con la etiqueta arriba.
 * En una `FilterBar` sale compacto. Las fechas son ISO ("" si falta o no es válida).
 */
export function DateRange({
  from,
  to,
  onChange,
  label,
}: {
  from: string;
  to: string;
  /** Recibe el período completo cada vez que cambia una de las dos fechas. */
  onChange: (range: { from: string; to: string }) => void;
  /** Etiqueta del control (por defecto "Período"). */
  label?: string;
}) {
  const compact = useContext(FilterContext);
  const name = label ?? t("ui.common.period");
  const part = "!h-full w-[6.75rem] !border-0 !bg-transparent !px-2 !ring-0 focus:!ring-0";
  return (
    <div role="group" aria-label={name} className={`flex min-w-0 flex-col text-sm ${compact ? "gap-1" : "gap-1.5"}`}>
      <span className={compact ? "text-meta font-medium text-tinta-2" : "font-medium"}>{name}</span>
      <div
        className={`flex w-fit max-w-full items-center rounded-md border border-linea bg-papel px-1 transition-colors focus-within:border-accion focus-within:ring-2 focus-within:ring-accion/20 ${compact ? "h-9" : "h-10"}`}
      >
        <DateInput aria-label={t("ui.common.periodFrom")} value={from} max={to || undefined} className={part} onValueChange={(v) => onChange({ from: v, to })} />
        <span aria-hidden className="text-tinta-2">
          –
        </span>
        <DateInput aria-label={t("ui.common.periodTo")} value={to} min={from || undefined} className={part} onValueChange={(v) => onChange({ from, to: v })} />
      </div>
    </div>
  );
}
