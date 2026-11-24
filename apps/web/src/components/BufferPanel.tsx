import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LIMITS } from "@yvy/shared";
import { BUFFER_KINDS, bufferAnalysis, cleanDistances, type BufferDistances, type BufferKind } from "@yvy/geo";
import { fmtDate, fmtNum } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { fetchAllRecords, useFarmLines } from "../lib/queries";
import type { Plot, Poi } from "../lib/types";
import { Empty, ErrorBox, Field, Input, Spinner } from "./ui";

const KEY = "yvy.buffer-distances";
const DAY = 86_400_000;

function loadDistances(): BufferDistances {
  try {
    return cleanDistances(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return cleanDistances(null);
  }
}

/** Zonas de amortiguación: aplicaciones cerca de casas, escuelas y cursos de agua. */
export function BufferPanel({ farmId, plots, pois }: { farmId: string; plots: Plot[]; pois: Poi[] }) {
  const [raw, setRaw] = useState<Record<BufferKind, string>>(() => {
    const d = loadDistances();
    return { house: String(d.house), school: String(d.school), water: String(d.water), stream: String(d.stream) };
  });
  const limits = useMemo(() => cleanDistances(raw), [raw]);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(limits));
    } catch {
      /* sin almacenamiento: los valores valen mientras la pestaña esté abierta */
    }
  }, [limits]);
  const lines = useFarmLines(farmId);
  const apps = useQuery({
    queryKey: ["buffer-apps", farmId],
    queryFn: () => fetchAllRecords({ farmId, kind: "application", from: Date.now() - 180 * DAY }, 1000),
  });
  const result = useMemo(
    () =>
      bufferAnalysis(
        plots.filter((p) => p.kind === "crop"),
        {
          points: pois.map((p) => ({ kind: p.kind, name: p.name, lon: p.lon, lat: p.lat })),
          streams: (lines.data ?? [])
            .filter((l) => l.kind === "stream")
            .map((l) => ({ name: l.name, geometry: JSON.parse(l.geometry) })),
        },
        (apps.data ?? []).map((r) => ({
          id: r.id,
          plotId: r.plotId,
          plotName: r.plotName,
          capturedAt: r.capturedAt,
          lon: r.lon,
          lat: r.lat,
          gpsAccuracyM: r.gpsAccuracyM,
        })),
        limits,
      ),
    [plots, pois, lines.data, apps.data, limits],
  );
  const plotName = (id: string) => plots.find((p) => p.id === id)?.name ?? "";
  const hasFeatures =
    pois.some((p) => p.kind === "house" || p.kind === "school" || p.kind === "water") ||
    (lines.data ?? []).some((l) => l.kind === "stream");
  const label = (h: { kind: BufferKind; name: string; distanceM: number }) =>
    t("ui.buffer.hit", { kind: tk(h.kind === "stream" ? "ui.line.kind_stream" : `ui.poi.kinds_${h.kind}`), name: h.name, m: fmtNum(h.distanceM) });

  return (
    <section aria-labelledby="buffer-h" className="flex flex-col gap-3">
      <h3 id="buffer-h" className="font-serif text-lg font-semibold">
        {t("ui.buffer.title")}
      </h3>
      <p className="text-sm text-tinta-2">{t("ui.buffer.intro")}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {BUFFER_KINDS.map((k) => (
          <Field key={k} label={t("ui.buffer.distance", { kind: tk(k === "stream" ? "ui.line.kind_stream" : `ui.poi.kinds_${k}`) })}>
            <Input
              inputMode="numeric"
              className="num"
              value={raw[k]}
              onChange={(e) => setRaw({ ...raw, [k]: e.target.value })}
              aria-describedby="buffer-note"
            />
          </Field>
        ))}
      </div>
      <p id="buffer-note" className="text-xs text-tinta-2">
        {t("ui.buffer.note", { max: fmtNum(LIMITS.buffer.maxM) })}
      </p>
      {(lines.isLoading || apps.isLoading) && <Spinner rows={2} h={32} />}
      {apps.error && <ErrorBox error={apps.error} />}
      {!hasFeatures && <Empty title={t("ui.buffer.title")}>{t("ui.buffer.noFeatures")}</Empty>}
      {hasFeatures && result.alerts.length > 0 && (
        <div>
          <h4 className="eyebrow mb-1">{t("ui.buffer.alerts")}</h4>
          <ul className="divide-y divide-linea border-y border-linea text-sm">
            {result.alerts.map((a) => (
              <li key={a.recordId} className="py-2.5">
                <p>
                  <span className="font-medium text-peligro">{a.plotName ?? t("ui.buffer.noPlot")}</span>
                  <span className="num text-tinta-2"> · {fmtDate(a.capturedAt)}</span>
                </p>
                <p className="text-tinta-2">{a.hits.map(label).join("; ")}</p>
                <p className="text-xs text-tinta-2">{t(a.basis === "gps" ? "ui.buffer.basisGps" : "ui.buffer.basisPlot")}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {hasFeatures && !apps.isLoading && result.alerts.length === 0 && (
        <p className="text-sm">{t("ui.buffer.noAlerts")}</p>
      )}
      {result.plots.length > 0 && (
        <div>
          <h4 className="eyebrow mb-1">{t("ui.buffer.plots")}</h4>
          <ul className="divide-y divide-linea border-y border-linea text-sm">
            {result.plots.map((p) => (
              <li key={p.plotId} className="py-2.5">
                <span className="font-medium">{plotName(p.plotId)}</span>
                <span className="block text-tinta-2">{p.hits.map(label).join("; ")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
