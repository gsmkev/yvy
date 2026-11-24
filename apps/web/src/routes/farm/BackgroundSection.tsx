/** Sección del panel de capas para elegir el fondo del mapa: satélite o índice de vegetación, y su fecha. */
import { FERT_LAYER_PARAM, FERT_STYLE, NDMI_RAMP, NDVI_RAMP, SOIL_RANGES } from "@yvy/shared";
import { boundsOf } from "../../components/FarmMap";
import { PanelSection } from "../../components/MapTools";
import { SceneControls } from "../../components/SceneControls";
import { SelectBox } from "../../components/ui";
import { fmtDate, fmtNum } from "../../lib/format";
import { t } from "../../lib/i18n";
import { layerDates } from "../../lib/scenes";
import type { FarmDetail } from "../../lib/types";
import { isFert, OVERLAYS, type Overlay } from "./overlays";
import type { FarmScene } from "./useFarmScene";

/** Leyenda de la rampa del índice mostrado, con la fecha de la imagen. */
function IndexLegend({ scene }: { scene: FarmScene }) {
  const { shownIndex, ndviLayer } = scene;
  const ramp = isFert(shownIndex) ? FERT_STYLE[shownIndex].ramp : shownIndex === "ndmi" ? NDMI_RAMP : NDVI_RAMP;
  return (
    <div className="text-micro">
      <div className="h-2 rounded-sm" style={{ background: `linear-gradient(90deg, ${ramp.join(",")})` }} />
      {isFert(shownIndex) ? (
        <>
          <div className="num mt-1 flex justify-between text-lino/70">
            <span>
              {shownIndex === "fert_ph" ? t("ui.fert.legendPh") : t("ui.fert.legendLow")} {fmtNum(FERT_STYLE[shownIndex].lo)}
            </span>
            <span>
              {fmtNum(FERT_STYLE[shownIndex].hi)} {FERT_STYLE[shownIndex].unit}
            </span>
          </div>
          <p className="num mt-1 text-lino/70">
            {t("ui.soil.level_low")} &lt; {fmtNum(SOIL_RANGES[FERT_LAYER_PARAM[shownIndex]][0])} · {t("ui.soil.level_high")} &gt;{" "}
            {fmtNum(SOIL_RANGES[FERT_LAYER_PARAM[shownIndex]][1])}
          </p>
          <p className="mt-1 text-lino/60">{t("ui.fert.legendNote")}</p>
        </>
      ) : (
        <div className="num mt-1 flex justify-between text-lino/70">
          <span>{shownIndex === "ndmi" ? t("ui.ndmi.legendLow") : t("ui.ndvi.legendLow")}</span>
          <span>{shownIndex === "ndmi" ? t("ui.ndmi.legendHigh") : t("ui.ndvi.legendHigh")}</span>
        </div>
      )}
      <p className="num mt-1.5 text-lino/70">
        {t("ui.common.imageDate", { date: fmtDate((scene.pickedFor(shownIndex) ?? ndviLayer!).acquiredAt) })} · {isFert(shownIndex) ? t("ui.soil.title") : "Sentinel-2"}
      </p>
    </div>
  );
}

const imageryNote = (s: FarmDetail["imageryStatus"]) =>
  s === "pending" || s === "processing" ? t("ui.imagery.processing") : s === "failed" ? t("ui.imagery.failed") : t("ui.no.basemap");

/**
 * Selector de fondo e índice.
 * @param scene estado del fondo (de `useFarmScene`).
 * @param tilesBaseUrl base de las teselas; sin ella no hay miniaturas.
 */
export function BackgroundSection({
  d,
  scene,
  tilesBaseUrl,
}: {
  d: FarmDetail;
  scene: FarmScene;
  tilesBaseUrl: string | undefined;
}) {
  const { layer, kind, shownIndex, ndviLayer, hasIndex, compare } = scene;
  const available = OVERLAYS.filter(hasIndex);
  return (
    <PanelSection title={t("ui.common.layersBackground")}>
      <div role="radiogroup" aria-label={t("ui.common.layersBackground")} className="flex gap-1.5 font-medium">
        {(["satellite", "ndvi"] as const).map((l) => (
          <button
            key={l}
            role="radio"
            aria-checked={layer === l}
            disabled={l === "ndvi" && !ndviLayer}
            onClick={() => scene.pickBackground(l)}
            className={`h-10 flex-1 cursor-pointer rounded px-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${layer === l ? "bg-lino text-surco" : "border border-white/20 hover:bg-white/10"}`}
          >
            {l === "satellite" ? t("ui.layer.satellite") : t("ui.layer.ndvi")}
          </button>
        ))}
      </div>
      {layer === "ndvi" && available.length > 1 && (
        <label className="flex flex-col gap-1">
          <span className="text-lino/70">{t("ui.index.pick")}</span>
          <SelectBox><select
            className="appearance-none pr-8 h-10 w-full cursor-pointer rounded border border-white/20 bg-surco px-2 text-xs text-lino outline-none focus:border-lino"
            value={shownIndex}
            onChange={(e) => scene.pickIndex(e.target.value as Overlay)}
          >
            {available.map((k) => (
              <option key={k} value={k}>
                {isFert(k) ? t(`ui.fert.layer_${k}` as "ui.fert.layer_fert_ph") : t(`ui.index.${k}`)}
              </option>
            ))}
          </select></SelectBox>
          {!isFert(shownIndex) && <span className="text-lino/60">{t(`ui.index.hint_${shownIndex}`)}</span>}
        </label>
      )}
      <SceneControls
        layers={d.layers}
        kind={kind}
        picked={scene.pickedFor(kind)?.id ?? ""}
        onPick={scene.pickScene}
        compare={compare}
        canCompare={layerDates(d.layers, kind).length > 1}
        onToggleCompare={scene.toggleCompare}
        onCompare={scene.setCompare}
        tilesBaseUrl={tilesBaseUrl}
        farmBounds={boundsOf(d.farm)}
      />
      {layer === "ndvi" && ndviLayer && <IndexLegend scene={scene} />}
      {!scene.hasBasemap && <p className="text-lino/70">{imageryNote(d.imageryStatus)}</p>}
    </PanelSection>
  );
}
