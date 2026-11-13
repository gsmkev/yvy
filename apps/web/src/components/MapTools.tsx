import { useId, useState, type ReactNode } from "react";
import { ChevronDown, Layers, Minus, Plus, Ruler } from "lucide-react";
import { t } from "../lib/i18n";

/** Botón de ícono de la barra del mapa: 48 px en el celular, 40 en escritorio. */
export const toolBtn =
  "flex h-12 w-12 cursor-pointer items-center justify-center text-lino transition-colors hover:bg-white/10 aria-pressed:bg-lino aria-pressed:text-surco aria-expanded:bg-lino aria-expanded:text-surco lg:h-10 lg:w-10";

/**
 * Barra de herramientas compacta del mapa: acercar, alejar, medir, pantalla completa y capas.
 * Solo íconos (con nombre accesible y tooltip): el mapa queda libre y el detalle vive en el panel "Capas".
 */
export function MapToolbar({
  measuring,
  onMeasure,
  layersOpen,
  onLayers,
  onZoom,
  fullscreen,
}: {
  measuring: boolean;
  onMeasure: () => void;
  layersOpen: boolean;
  onLayers: () => void;
  onZoom: (dir: 1 | -1) => void;
  /** El botón de pantalla completa (necesita el contenedor del mapa). */
  fullscreen: ReactNode;
}) {
  return (
    <div
      role="toolbar"
      aria-label={t("ui.mapTools")}
      aria-orientation="vertical"
      className="absolute top-3 right-3 z-10 flex flex-col divide-y divide-white/15 overflow-hidden rounded-md border border-white/15 bg-surco/85 backdrop-blur print:hidden"
    >
      <button type="button" className={toolBtn} aria-label={t("ui.mapZoomIn")} title={t("ui.mapZoomIn")} onClick={() => onZoom(1)}>
        <Plus size={18} aria-hidden />
      </button>
      <button type="button" className={toolBtn} aria-label={t("ui.mapZoomOut")} title={t("ui.mapZoomOut")} onClick={() => onZoom(-1)}>
        <Minus size={18} aria-hidden />
      </button>
      <button
        type="button"
        className={toolBtn}
        aria-pressed={measuring}
        aria-label={t("ui.measure")}
        title={t("ui.measure")}
        onClick={onMeasure}
      >
        <Ruler size={18} aria-hidden />
      </button>
      {fullscreen}
      <button
        type="button"
        className={toolBtn}
        aria-expanded={layersOpen}
        aria-label={t("ui.layers")}
        title={t("ui.layers")}
        onClick={onLayers}
      >
        <Layers size={18} aria-hidden />
      </button>
    </div>
  );
}

/** Panel "Capas": se abre al lado de la barra y se cierra con el mismo botón. */
export function LayersPanel({ children }: { children: ReactNode }) {
  return (
    <div
      role="region"
      aria-label={t("ui.layers")}
      className="absolute top-3 right-[4.5rem] left-3 z-10 flex max-h-[calc(100%-1.5rem)] flex-col overflow-y-auto rounded-md border border-white/15 bg-surco/90 px-3 text-xs text-lino backdrop-blur sm:left-auto sm:w-72 lg:right-16 print:hidden"
    >
      {children}
    </div>
  );
}

/** Sección plegable del panel: el título abre y cierra su contenido. */
export function PanelSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="border-b border-white/15 last:border-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="flex h-12 w-full cursor-pointer items-center justify-between text-sm font-medium lg:h-10"
      >
        {title}
        <ChevronDown size={14} aria-hidden className={`transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && (
        <div id={id} className="flex flex-col gap-2 pb-3">
          {children}
        </div>
      )}
    </section>
  );
}

/** Interruptor de una capa (Plagas, Recorridas): botón con aria-pressed. */
export function LayerSwitch({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={`flex h-10 w-full cursor-pointer items-center rounded px-3 text-left text-xs font-medium transition-colors ${on ? "bg-lino text-surco" : "border border-white/20 hover:bg-white/10"}`}
    >
      {label}
    </button>
  );
}
