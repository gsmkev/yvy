import { doseText } from "@yvy/shared";
import { fmtHa, fmtNum, fmtTemp } from "../lib/format";
import { t, tk } from "../lib/i18n";

type Data = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

/** Detalle estructurado de los registros agrícolas (la descripción corta ya sale de describeRecord). */
export function RecordDetails({ kind, data }: { kind: string; data: Data }) {
  if (kind !== "application" && kind !== "fertilization") return null;
  const products = Array.isArray(data.products) ? (data.products as Data[]) : [];
  const rows: [string, string][] = [];
  if (num(data.volumeLHa) !== null) rows.push([t("ui.appVolume"), `${fmtNum(data.volumeLHa as number)} L/ha`]);
  if (num(data.areaHa) !== null) rows.push([t("ui.appArea"), fmtHa(data.areaHa as number)]);
  if (typeof data.method === "string") rows.push([t("fields.method"), tk(`fields.method_${data.method}`)]);
  if (typeof data.machine === "string") rows.push([t("fields.machine"), data.machine]);
  const cond: [string, string][] = [];
  if (num(data.windKmh) !== null) cond.push([t("ui.appWind"), `${fmtNum(data.windKmh as number)} km/h`]);
  if (num(data.tempC) !== null) cond.push([t("ui.appTemp"), fmtTemp(data.tempC as number)]);
  if (num(data.humidityPct) !== null) cond.push([t("ui.appHumidity"), `${fmtNum(data.humidityPct as number)} %`]);
  if (num(data.deltaT) !== null) cond.push([t("ui.appDeltaT"), `${fmtNum(data.deltaT as number)} °C`]);
  return (
    <div className="mt-4 flex flex-col gap-4 text-sm">
      {products.length > 0 && (
        <div>
          <h3 className="eyebrow mb-1">{t("ui.appProducts")}</h3>
          <ul className="divide-y divide-linea border-y border-linea">
            {products.map((p, i) => (
              <li key={i} className="num py-2">
                {doseText(p)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {[
        { title: null, list: rows },
        { title: t("ui.appConditions"), list: cond },
      ]
        .filter((g) => g.list.length > 0)
        .map((g, i) => (
          <div key={i}>
            {g.title && <h3 className="eyebrow mb-1">{g.title}</h3>}
            <dl className="num grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              {g.list.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-tinta-2">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      {typeof data.prescriptionTaskId === "string" && <p className="text-tinta-2">{t("ui.appPrescription")}</p>}
    </div>
  );
}
