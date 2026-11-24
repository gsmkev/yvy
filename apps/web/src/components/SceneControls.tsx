/** Elegir la fecha de la imagen y comparar dos fechas con una cortina. */
import { useEffect, useState, type ReactNode } from "react";
import { layerThumb, type Bounds } from "../lib/sceneThumbs";
import { fmtDate } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { layerDates, nextFrame, TIMELAPSE_SPEEDS, timelapseFrames } from "../lib/scenes";
import type { Layer } from "../lib/types";
import { SelectBox } from "./ui";

const sel =
  "h-8 w-full cursor-pointer appearance-none rounded border border-white/20 bg-surco pl-2 pr-7 text-xs text-lino outline-none focus:border-lino";

/** Miniatura de una fecha: una tesela del archivo de esa capa, pedida solo cuando se ve. */
function Thumb({ layer, tilesBaseUrl, bounds }: { layer: Layer; tilesBaseUrl: string; bounds: Bounds }) {
  const [src, setSrc] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let live = true;
    layerThumb(tilesBaseUrl, layer, bounds).then((u) => {
      if (!live) return;
      setSrc(u);
      setDone(true);
    });
    return () => {
      live = false;
    };
  }, [tilesBaseUrl, layer.pmtilesPath]);
  return src ? (
    <img src={src} alt="" className="aspect-square w-full rounded-sm object-cover" />
  ) : (
    <span className={`block aspect-square w-full rounded-sm bg-white/10 ${done ? "" : "animate-pulse"}`} aria-hidden />
  );
}

function DatePick({
  label,
  layers,
  value,
  onChange,
  thumbs,
}: {
  label: string;
  layers: Layer[];
  value: string;
  onChange: (id: string) => void;
  /** Con esto el selector ofrece ver una miniatura por fecha. */
  thumbs?: { tilesBaseUrl: string; bounds: Bounds };
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1">
        <span className="text-lino/70">{label}</span>
        <SelectBox><select className={sel} value={value} onChange={(e) => onChange(e.target.value)}>
          {layers.map((l) => (
            <option key={l.id} value={l.id}>
              {fmtDate(l.acquiredAt)}
            </option>
          ))}
        </select></SelectBox>
      </label>
      {thumbs && (
        <>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="cursor-pointer self-start text-lino/70 underline-offset-4 hover:underline"
          >
            {open ? t("ui.scene.thumbsHide") : t("ui.scene.thumbsShow")}
          </button>
          {open && (
            <ul className="grid max-h-44 grid-cols-3 gap-1.5 overflow-y-auto" aria-label={label}>
              {layers.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    aria-pressed={l.id === value}
                    onClick={() => onChange(l.id)}
                    className={`flex w-full cursor-pointer flex-col gap-0.5 rounded-sm border p-0.5 text-center text-[10px] leading-tight ${l.id === value ? "border-lino" : "border-transparent hover:border-white/30"}`}
                  >
                    <Thumb layer={l} tilesBaseUrl={thumbs.tilesBaseUrl} bounds={thumbs.bounds} />
                    <span className="num">{fmtDate(l.acquiredAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** Reproduce las fechas con imagen en orden, con play/pausa y velocidad. Cada cuadro elige la fecha del mapa. */
function Timelapse({ frames, onPick, onClose }: { frames: Layer[]; onPick: (id: string) => void; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof TIMELAPSE_SPEEDS)[number]["key"]>("normal");
  const ms = TIMELAPSE_SPEEDS.find((s) => s.key === speed)!.ms;
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setI((c) => nextFrame(c, frames.length)), ms);
    return () => clearInterval(timer);
  }, [playing, ms, frames.length]);
  const frame = frames[Math.min(i, frames.length - 1)]!;
  useEffect(() => onPick(frame.id), [frame.id]);
  return (
    <div className="flex flex-col gap-2">
      <p className="num text-sm font-medium" aria-live="off">
        {fmtDate(frame.acquiredAt)}
      </p>
      <input
        type="range"
        min={0}
        max={frames.length - 1}
        value={i}
        aria-label={t("ui.timelapse.frame", { n: i + 1, total: frames.length })}
        onChange={(e) => {
          setPlaying(false);
          setI(Number(e.target.value));
        }}
        className="accent-[#7A9A3F]"
      />
      <div className="flex items-center gap-3">
        <button className="cursor-pointer font-medium underline-offset-4 hover:underline" onClick={() => setPlaying(!playing)}>
          {playing ? t("ui.timelapse.pause") : t("ui.timelapse.play")}
        </button>
        <SelectBox><select
          aria-label={t("ui.timelapse.speed")}
          className={`${sel} !w-auto`}
          value={speed}
          onChange={(e) => setSpeed(e.target.value as typeof speed)}
        >
          {TIMELAPSE_SPEEDS.map((s) => (
            <option key={s.key} value={s.key}>
              {tk(`ui.timelapse.speed_${s.key}`)}
            </option>
          ))}
        </select></SelectBox>
        <button className="ml-auto cursor-pointer text-lino/70 underline-offset-4 hover:underline" onClick={onClose}>
          {t("ui.timelapse.stop")}
        </button>
      </div>
    </div>
  );
}

/**
 * Selector de la fecha de la imagen, con miniaturas, comparación con cortina y reproducción.
 */
export function SceneControls(props: {
  layers: Layer[];
  kind: Layer["layer"];
  /** Fecha elegida (id de capa) cuando no se compara. */
  picked: string;
  onPick: (id: string) => void;
  /** Fechas izquierda y derecha, o null si no se compara. */
  compare: { left: string; right: string } | null;
  /** Si hay al menos dos fechas. */
  canCompare: boolean;
  onToggleCompare: () => void;
  onCompare: (c: { left: string; right: string }) => void;
  /** Base de las teselas y límites de la estancia; sin esto no hay miniaturas. */
  tilesBaseUrl?: string;
  farmBounds?: Bounds | null;
}) {
  const dates = layerDates(props.layers, props.kind);
  const thumbs =
    props.tilesBaseUrl && props.farmBounds ? { tilesBaseUrl: props.tilesBaseUrl, bounds: props.farmBounds } : undefined;
  const [animating, setAnimating] = useState(false);
  // Cambiar de índice o entrar a comparar corta la animación
  useEffect(() => setAnimating(false), [props.kind, props.compare === null]);
  if (dates.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 text-xs text-lino">
      {animating && !props.compare ? (
        <Timelapse frames={timelapseFrames(props.layers, props.kind)} onPick={props.onPick} onClose={() => setAnimating(false)} />
      ) : props.compare ? (
        <>
          <DatePick
            label={t("ui.compare.left")}
            layers={dates}
            value={props.compare.left}
            onChange={(left) => props.onCompare({ ...props.compare!, left })}
            thumbs={thumbs}
          />
          <DatePick
            label={t("ui.compare.right")}
            layers={dates}
            value={props.compare.right}
            onChange={(right) => props.onCompare({ ...props.compare!, right })}
            thumbs={thumbs}
          />
        </>
      ) : (
        <DatePick label={t("ui.scene.date")} layers={dates} value={props.picked} onChange={props.onPick} thumbs={thumbs} />
      )}
      {props.canCompare ? (
        <div className="flex gap-4">
          <button
            className="cursor-pointer font-medium underline-offset-4 hover:underline"
            onClick={props.onToggleCompare}
          >
            {props.compare ? t("ui.compare.end") : t("ui.common.compare")}
          </button>
          {!props.compare && !animating && props.kind !== "true_color" && (
            <button
              className="cursor-pointer font-medium underline-offset-4 hover:underline"
              onClick={() => setAnimating(true)}
            >
              {t("ui.common.timelapse")}
            </button>
          )}
        </div>
      ) : (
        <p className="text-lino/60">{t("ui.compare.needTwo")}</p>
      )}
    </div>
  );
}

/** Segundo mapa recortado a la derecha de la cortina, con la misma cámara que el de abajo. */
export function CompareOverlay(props: { map: ReactNode; pct: number; onPct: (n: number) => void }) {
  return (
    <>
      <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${props.pct}%)` }}>
        {props.map}
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
        aria-label={t("ui.compare.swipe")}
        onChange={(e) => props.onPct(Number(e.target.value))}
        className="absolute right-4 bottom-4 left-4 z-10 cursor-ew-resize accent-[#F1EEE4]"
      />
    </>
  );
}
