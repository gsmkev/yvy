/** Elegir la fecha de la imagen y comparar dos fechas con una cortina (S-04). */
import { fmtDate } from "../lib/format";
import { t } from "../lib/i18n";
import { layerDates, type Camera } from "../lib/scenes";
import type { Layer } from "../lib/types";
import { FarmMap, type FarmMapProps } from "./FarmMap";

const sel =
  "h-8 w-full cursor-pointer rounded border border-white/20 bg-surco px-2 text-xs text-lino outline-none focus:border-lino";

function DatePick({
  label,
  layers,
  value,
  onChange,
}: {
  label: string;
  layers: Layer[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-lino/70">{label}</span>
      <select className={sel} value={value} onChange={(e) => onChange(e.target.value)}>
        {layers.map((l) => (
          <option key={l.id} value={l.id}>
            {fmtDate(l.acquiredAt)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SceneControls(props: {
  layers: Layer[];
  kind: Layer["layer"];
  /** Fecha elegida (id de capa) cuando no se compara. */
  picked: string;
  onPick: (id: string) => void;
  compare: { left: string; right: string } | null;
  canCompare: boolean;
  onToggleCompare: () => void;
  onCompare: (c: { left: string; right: string }) => void;
}) {
  const dates = layerDates(props.layers, props.kind);
  if (dates.length === 0) return null;
  return (
    <div className="flex w-56 flex-col gap-2 rounded-md border border-white/15 bg-surco/85 p-2.5 text-xs text-lino backdrop-blur">
      {props.compare ? (
        <>
          <DatePick
            label={t("ui.compareLeft")}
            layers={dates}
            value={props.compare.left}
            onChange={(left) => props.onCompare({ ...props.compare!, left })}
          />
          <DatePick
            label={t("ui.compareRight")}
            layers={dates}
            value={props.compare.right}
            onChange={(right) => props.onCompare({ ...props.compare!, right })}
          />
        </>
      ) : (
        <DatePick label={t("ui.sceneDate")} layers={dates} value={props.picked} onChange={props.onPick} />
      )}
      {props.canCompare ? (
        <button
          className="cursor-pointer self-start font-medium underline-offset-4 hover:underline"
          onClick={props.onToggleCompare}
        >
          {props.compare ? t("ui.compareEnd") : t("ui.compare")}
        </button>
      ) : (
        <p className="text-lino/60">{t("ui.compareNeedTwo")}</p>
      )}
    </div>
  );
}

/** Segundo mapa recortado a la derecha de la cortina, con la misma cámara que el de abajo. */
export function CompareOverlay(props: {
  mapProps: FarmMapProps;
  pct: number;
  onPct: (n: number) => void;
  camera: Camera | null;
  onCamera: (c: Camera) => void;
}) {
  return (
    <>
      <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${props.pct}%)` }}>
        <FarmMap {...props.mapProps} camera={props.camera} onCamera={props.onCamera} />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 w-0.5 bg-lino"
        style={{ left: `${props.pct}%` }}
      />
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={props.pct}
        aria-label={t("ui.compareSwipe")}
        onChange={(e) => props.onPct(Number(e.target.value))}
        className="absolute right-4 bottom-4 left-4 z-10 cursor-ew-resize accent-[#F1EEE4]"
      />
    </>
  );
}
