import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { post } from "../lib/api";
import { fmtHa } from "../lib/format";
import { t } from "../lib/i18n";
import { parseFile, type ImportedPolygon } from "../lib/importGeo";
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

  const selected = items?.filter((i) => i.selected && !i.error) ?? [];
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
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-surco/20 p-8 text-sm text-surco/70 hover:border-soja">
          ⇪ {t("ui.importFile")}
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
          {items.some((i) => i.error) && (
            <p className="text-sm text-alerta">
              {t("ui.importErrors", { count: items.filter((i) => i.error).length })}
            </p>
          )}
          <ul className="flex max-h-80 flex-col gap-1.5 overflow-auto">
            {items.map((p, i) => (
              <li
                key={p.index}
                className={`flex items-center gap-2 rounded-lg bg-white p-2 text-sm ${p.error ? "opacity-50" : ""}`}
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
                <span className="w-20 text-right text-surco/70">{p.error ? p.error : fmtHa(p.areaHa)}</span>
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
