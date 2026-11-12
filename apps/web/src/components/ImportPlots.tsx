import { Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { bboxOf, checkPlots, overlapRatio, OVERLAP_WARN_RATIO, type Area } from "@yvy/geo";
import { post } from "../lib/api";
import { useFarm } from "../lib/queries";
import { fmtHa } from "../lib/format";
import { t } from "../lib/i18n";
import { parseFile, type ImportedPolygon } from "../lib/importGeo";
import type { Plot } from "../lib/types";
import { FarmMap } from "./FarmMap";
import { Button, ErrorBox, Input, Modal, Select } from "./ui";

/** RF-11: previsualizar, elegir polígonos, poner nombre y tipo. */
export function ImportPlots({ farmId, onClose }: { farmId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [items, setItems] = useState<(ImportedPolygon & { selected: boolean; kind: "crop" | "pasture" })[] | null>(
    null,
  );
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const load = async (f: File) => {
    setError(null);
    try {
      const polys = await parseFile(f);
      setItems(polys.map((p) => ({ ...p, selected: !p.error, kind: "crop" })));
    } catch (e) {
      setError(e);
    }
  };

  // Vista previa: verde = se importa, gris = descartado, rojo = con problemas.
  const previewPlots = useMemo<Plot[]>(
    () =>
      (items ?? []).map((p) => ({
        id: String(p.index),
        farmId: "",
        name: p.name,
        kind: p.kind,
        geometry: JSON.stringify(p.geometry),
        areaHa: p.areaHa,
        crop: null,
        season: null,
        sowingDate: null,
        pastureType: null,
        ndviMean: null,
        ndviAt: null,
        ndviPrevMean: null,
        ndviPrevAt: null,
        lastRecordAt: null,
        color: p.error ? "#D2462B" : p.selected ? "#7A9A3F" : "#9A9A8E",
      })),
    [items],
  );
  const previewBounds = useMemo<[number, number, number, number] | null>(() => {
    if (!items?.length) return null;
    const boxes = items.filter((p) => !p.error).map((p) => bboxOf(p.geometry));
    if (!boxes.length) return null;
    return [
      Math.min(...boxes.map((b) => b.minLon)),
      Math.min(...boxes.map((b) => b.minLat)),
      Math.max(...boxes.map((b) => b.maxLon)),
      Math.max(...boxes.map((b) => b.maxLat)),
    ];
  }, [items?.length]);

  const selected = items?.filter((i) => i.selected && !i.error) ?? [];
  const farm = useFarm(farmId);

  // Avisos no bloqueantes (M-10): superposición entre lotes y lotes fuera de la estancia.
  const warnings = useMemo(() => {
    if (!selected.length) return [] as string[];
    const out: string[] = [];
    const farmGeom = farm.data ? (JSON.parse(farm.data.farm.geometry) as Area) : null;
    for (const w of checkPlots(
      selected.map((p) => p.geometry),
      farmGeom,
    )) {
      const a = selected[w.a]!.name;
      out.push(
        w.kind === "overlap"
          ? t("ui.warnOverlap", { a, b: selected[w.b!]!.name, pct: Math.round(w.ratio * 100) })
          : t("ui.warnOutside", { a }),
      );
    }
    for (const p of selected) {
      for (const ex of farm.data?.plots ?? []) {
        const r = overlapRatio(p.geometry, JSON.parse(ex.geometry) as Area);
        if (r > OVERLAP_WARN_RATIO) out.push(t("ui.warnOverlap", { a: p.name, b: ex.name, pct: Math.round(r * 100) }));
      }
    }
    return out;
  }, [selected.map((p) => p.index).join(","), farm.data]);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      for (let i = 0; i < selected.length; i += 40) {
        await post(`/org/farms/${farmId}/plots`, {
          plots: selected.slice(i, i + 40).map((p) => ({ name: p.name, kind: p.kind, geometry: p.geometry })),
        });
      }
      await qc.invalidateQueries({ queryKey: ["farm", farmId] });
      onClose();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };
  const update = (i: number, patch: Partial<NonNullable<typeof items>[number]>) =>
    setItems(items!.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  return (
    <Modal title={t("ui.importFile")} onClose={onClose}>
      {!items ? (
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-linea p-8 text-sm text-surco/70 hover:border-soja">
          <Upload size={22} aria-hidden />
          {t("ui.importFile")}
          <input
            type="file"
            accept=".kml,.kmz,.geojson,.json,.zip"
            className="hidden"
            data-testid="import-input"
            onChange={(e) => e.target.files?.[0] && load(e.target.files[0])}
          />
        </label>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm">{t("ui.importPreview", { count: items.length })}</p>
          {items.some((i) => i.fixed > 0) && (
            <p className="text-sm text-tinta-2">
              {t("ui.importFixed", { count: items.reduce((n, i) => n + i.fixed, 0) })}
            </p>
          )}
          {items.some((i) => i.error) && (
            <p className="text-sm text-alerta">
              {t("ui.importErrors", { count: items.filter((i) => i.error).length })}
            </p>
          )}
          <div className="overflow-hidden rounded-md border border-linea" data-testid="import-preview-map">
            <FarmMap
              className="h-56 w-full"
              plots={previewPlots}
              bounds={previewBounds}
              onPlotClick={(id) => {
                const i = items.findIndex((x) => String(x.index) === id);
                if (i >= 0 && !items[i]!.error) update(i, { selected: !items[i]!.selected });
              }}
            />
          </div>
          <p className="text-xs text-tinta-2">{t("ui.importMapHint")}</p>
          {warnings.length > 0 && (
            <div className="text-sm text-surco" data-testid="import-warnings">
              <p className="font-medium">{t("ui.warnTitle")}</p>
              <ul>
                {warnings.slice(0, 8).map((w, i) => (
                  <li key={i} className="border-b border-linea py-1">
                    {w}
                  </li>
                ))}
              </ul>
              {warnings.length > 8 && (
                <p className="py-1 text-tinta-2">{t("ui.warnMore", { count: warnings.length - 8 })}</p>
              )}
            </div>
          )}
          <ul className="flex max-h-80 flex-col gap-1.5 overflow-auto">
            {items.map((p, i) => (
              <li
                key={p.index}
                className={`flex items-center gap-2 rounded-md border border-linea bg-papel p-2 text-sm ${p.error ? "opacity-50" : ""}`}
              >
                <input
                  type="checkbox"
                  disabled={!!p.error}
                  checked={p.selected}
                  onChange={(e) => update(i, { selected: e.target.checked })}
                />
                <Input className="flex-1 !py-1" value={p.name} onChange={(e) => update(i, { name: e.target.value })} />
                <Select
                  className="!py-1"
                  value={p.kind}
                  onChange={(e) => update(i, { kind: e.target.value as "crop" })}
                  options={[
                    { value: "crop", label: t("ui.crop") },
                    { value: "pasture", label: t("ui.pasture") },
                  ]}
                />
                <span className="num w-20 text-right text-tinta-2">{p.error ? p.error : fmtHa(p.areaHa)}</span>
              </li>
            ))}
          </ul>
          <Button onClick={save} disabled={!selected.length || busy}>
            {t("ui.importSelected", { count: selected.length })}
          </Button>
        </div>
      )}
      {error ? <ErrorBox error={error} /> : null}
    </Modal>
  );
}
