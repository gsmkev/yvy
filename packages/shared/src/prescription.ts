/**
 * Prescripción de dosis variable: una dosis por zona de manejo, exportable a la maquinaria.
 * Todo es puro: la web arma el shapefile y el ISOXML en el navegador (nunca en el Worker).
 */
import { LIMITS } from "./limits";
import { safeXml } from "./markup";

/** Unidades de dosis de una prescripción. */
export const RX_RATE_UNITS = ["kg_ha", "l_ha"] as const;
/** Unidad de dosis de una prescripción. */
export type RateUnit = (typeof RX_RATE_UNITS)[number];

/** Zona de manejo con su superficie, dosis y geometría. */
export interface PrescriptionZone {
  zone: number;
  areaHa: number;
  /** Dosis en la unidad elegida por hectárea. */
  rate: number;
  geometry: { type: "MultiPolygon"; coordinates: number[][][][] };
}

/** Prescripción de dosis variable de un lote: producto, unidad y zonas. */
export interface RatePrescriptionPlan {
  plotName: string;
  product: string;
  unit: RateUnit;
  zones: PrescriptionZone[];
}

/** Cantidad total de producto (kg o l): superficie de cada zona por su dosis. */
export const totalProduct = (zones: Pick<PrescriptionZone, "areaHa" | "rate">[]): number =>
  Math.round(zones.reduce((a, z) => a + z.areaHa * z.rate, 0) * 100) / 100;

/** Dosis media ponderada por superficie; null sin superficie. */
export const meanRate = (zones: Pick<PrescriptionZone, "areaHa" | "rate">[]): number | null => {
  const ha = zones.reduce((a, z) => a + z.areaHa, 0);
  return ha > 0 ? Math.round((zones.reduce((a, z) => a + z.areaHa * z.rate, 0) / ha) * 100) / 100 : null;
};

/** Dosis válida: número finito, no negativo y por debajo del tope. */
export const validRate = (v: number): boolean => Number.isFinite(v) && v >= 0 && v <= LIMITS.prescription.maxRate;

/**
 * Dosis en las unidades de proceso de ISO 11783-11: DDI 0006 (masa por superficie, mg/m²) y DDI 0001 (volumen por
 * superficie, mm³/m²). 1 kg/ha = 100 mg/m² y 1 l/ha = 100 mm³/m².
 */
export const isoRate = (unit: RateUnit, rate: number): { ddi: string; value: number } => ({
  ddi: unit === "kg_ha" ? "0006" : "0001",
  value: Math.round(rate * 100),
});

const deg = (n: number) => n.toFixed(8);

/**
 * TASKDATA.XML básico (ISO 11783-10): un lote (PFD) con su contorno, y una tarea (TSK) con una zona de tratamiento (TZN)
 * por zona de manejo y su dosis como valor de proceso. Sin implementos ni máquinas: la terminal las asigna al cargarlo.
 * Cada terminal lee ISOXML a su manera; se debe revisar en la pantalla de la máquina antes de aplicar.
 */
export function buildIsoxml(p: RatePrescriptionPlan, now = new Date()): string {
  const polys = (z: PrescriptionZone) =>
    z.geometry.coordinates.map(
      (poly) =>
        safeXml`<PLN A="2">${poly.map(
          (ring, i) =>
            safeXml`<LSG A="${i === 0 ? 1 : 2}">${ring.map((pt) => safeXml`<PNT A="2" C="${deg(pt[1]!)}" D="${deg(pt[0]!)}"/>`)}</LSG>`,
        )}</PLN>`,
    );
  const areaM2 = Math.round(p.zones.reduce((a, z) => a + z.areaHa, 0) * 10_000);
  const title = `${p.plotName} · ${p.product}`;
  const tzn = p.zones.map((z) => {
    const r = isoRate(p.unit, z.rate);
    return safeXml`<TZN A="${z.zone}" B="Zona ${z.zone}"><PDV A="${r.ddi}" B="${r.value}"/>${polys(z)}</TZN>`;
  });
  const stamp = now.toISOString().slice(0, 10);
  return safeXml`<?xml version="1.0" encoding="UTF-8"?>
<ISO11783_TaskData VersionMajor="4" VersionMinor="0" ManagementSoftwareManufacturer="Yvy" ManagementSoftwareVersion="1.0" DataTransferOrigin="1"><PFD A="PFD1" C="${p.plotName}" D="${areaM2}"/><TSK A="TSK1" B="${title}" E="PFD1" G="1">${tzn}</TSK><!-- Generado por Yvy el ${stamp} --></ISO11783_TaskData>
`.text;
}
