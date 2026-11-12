import { useState } from "react";
import { buildIsoxml, LIMITS, meanRate, RX_RATE_UNITS, totalProduct, validRate, type RateUnit } from "@yvy/shared";
import { download, polygonsToShapefileZip } from "../lib/exports";
import { fmtHa, fmtNum } from "../lib/format";
import { t } from "../lib/i18n";
import type { Plot } from "../lib/types";
import { Button, ErrorBox, Field, Input, Modal, Select } from "./ui";
import type { ManagementZone } from "./ZonesSection";

/** Prescripción de dosis variable (A-33): una dosis por zona de manejo, exportada en el navegador. */
export function RatePrescription({ plot, zones, onClose }: { plot: Plot; zones: ManagementZone[]; onClose: () => void }) {
  const [product, setProduct] = useState("");
  const [unit, setUnit] = useState<RateUnit>("kg_ha");
  const [rates, setRates] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const num = (z: ManagementZone) => Number((rates[z.zone] ?? "").replace(",", "."));
  const filled = zones.every((z) => (rates[z.zone] ?? "").trim() !== "" && validRate(num(z)));
  const built = () => ({
    plotName: plot.name,
    product: product.trim(),
    unit,
    zones: zones.map((z) => ({ zone: z.zone, areaHa: z.areaHa, rate: num(z), geometry: JSON.parse(z.geometry) as { type: "MultiPolygon"; coordinates: number[][][][] } })),
  });
  const ready = filled && product.trim() !== "";
  const slug = `${plot.name}-${product.trim()}`.normalize("NFD").replace(/[^\w-]+/g, "_").replace(/_+/g, "_").slice(0, 60);
  const guard = (fn: () => Promise<void> | void) => async () => {
    if (!ready) return setError(t("ui.rxInvalid", { max: fmtNum(LIMITS.prescription.maxRate) }));
    setError(null);
    await fn();
  };
  const shp = guard(async () => {
    const p = built();
    const blob = await polygonsToShapefileZip(
      "prescripcion",
      p.zones.map((z) => ({
        geometry: z.geometry,
        row: { RATE: z.rate, ZONE: z.zone, LOTE: p.plotName, PRODUCTO: p.product, UNIDAD: t(`ui.rxUnit_${p.unit}`), AREA_HA: z.areaHa },
      })),
      [
        { name: "RATE", type: "N", length: 12, decimals: 2 },
        { name: "ZONE", type: "N", length: 3 },
        { name: "LOTE", type: "C", length: 80 },
        { name: "PRODUCTO", type: "C", length: 60 },
        { name: "UNIDAD", type: "C", length: 8 },
        { name: "AREA_HA", type: "N", length: 12, decimals: 2 },
      ],
    );
    download(blob, `prescripcion-${slug}.zip`);
  });
  const iso = guard(async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("TASKDATA/TASKDATA.XML", buildIsoxml(built()));
    download(await zip.generateAsync({ type: "blob" }), `isoxml-${slug}.zip`);
  });
  const shown = zones.map((z) => ({ areaHa: z.areaHa, rate: num(z) || 0 }));
  return (
    <Modal title={t("ui.rxTitle")} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-tinta-2">{t("ui.rxIntro", { plot: plot.name })}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("ui.rxProduct")}>
            <Input value={product} maxLength={60} onChange={(e) => setProduct(e.target.value)} />
          </Field>
          <Field label={t("ui.rxUnit")}>
            <Select value={unit} onChange={(e) => setUnit(e.target.value as RateUnit)} options={RX_RATE_UNITS.map((u) => ({ value: u, label: t(`ui.rxUnit_${u}`) }))} />
          </Field>
          {zones.map((z) => (
            <Field key={z.zone} label={t("ui.rxRate", { zone: z.zone, unit: t(`ui.rxUnit_${unit}`) })} hint={`${t(`ui.zonesLevel_${z.zone}` as "ui.zonesLevel_1")} · ${fmtHa(z.areaHa)}`}>
              <Input inputMode="decimal" className="num" value={rates[z.zone] ?? ""} onChange={(e) => setRates({ ...rates, [z.zone]: e.target.value })} />
            </Field>
          ))}
        </div>
        {filled && (
          <p className="num text-sm">
            {t("ui.rxTotal", {
              qty: fmtNum(totalProduct(shown)),
              u: unit === "kg_ha" ? "kg" : "l",
              area: fmtHa(zones.reduce((a, z) => a + z.areaHa, 0)),
              mean: fmtNum(meanRate(shown) ?? 0),
              unit: t(`ui.rxUnit_${unit}`),
            })}
          </p>
        )}
        {error && <ErrorBox error={new Error(error)} />}
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={shp}>
            {t("ui.rxShp")}
          </Button>
          <Button onClick={iso}>{t("ui.rxIso")}</Button>
        </div>
        <p className="text-xs text-tinta-2">{t("ui.rxShpNote")}</p>
        <p className="text-xs text-tinta-2">{t("ui.rxIsoNote")}</p>
      </div>
    </Modal>
  );
}
