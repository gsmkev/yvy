/** Resumen público de solo lectura de una estancia (K-04): /compartido/:token, sin sesión ni menú. */
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { fmtDate, fmtHa, fmtMm, fmtNdvi } from "../lib/format";
import { t, tk } from "../lib/i18n";

interface SharedSummary {
  farm: { name: string; department: string | null; areaHa: number; plotCount: number };
  plots: { name: string; kind: string; crop: string | null; areaHa: number; ndvi: number | null; ndviAt: number | null }[];
  rain30: { mm: number | null; normalMm: number | null };
  alerts: { kind: string; severity: string; summary: string; validFrom: number; validTo: number | null }[];
  generatedAt: number;
  expiresAt: number;
}

class SharedError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string | null,
  ) {
    super(reason ?? String(status));
  }
}

async function fetchShared(token: string): Promise<SharedSummary> {
  const res = await fetch(`/public/shared/${encodeURIComponent(token)}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { reason?: string };
    throw new SharedError(res.status, body.reason ?? null);
  }
  return (await res.json()) as SharedSummary;
}

export function SharedPage() {
  const { token } = useParams({ from: "/compartido/$token" });
  const q = useQuery({ queryKey: ["shared", token], queryFn: () => fetchShared(token), retry: false });
  const d = q.data;
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <p className="font-serif text-2xl font-semibold">Yvy</p>
      {q.isLoading && <p className="mt-6 text-tinta-2">{t("ui.loading")}</p>}
      {q.error && (
        <p className="mt-6 text-lg">
          {q.error instanceof SharedError && q.error.reason === "expired"
            ? t("ui.sharedExpiredMsg")
            : q.error instanceof SharedError && q.error.reason === "revoked"
              ? t("ui.sharedRevokedMsg")
              : t("ui.sharedNotFoundMsg")}
        </p>
      )}
      {d && (
        <>
          <h1 className="mt-6 text-3xl leading-tight">{d.farm.name}</h1>
          <p className="mt-1 text-sm text-tinta-2">
            {t("ui.sharedTitle")}
            {d.farm.department ? ` · ${d.farm.department}` : ""} · {t("ui.sharedReadOnly")}
          </p>
          <dl className="num mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-linea py-4 sm:grid-cols-4">
            <Fact label={t("ui.area")} value={fmtHa(d.farm.areaHa)} />
            <Fact label={t("ui.plots")} value={String(d.farm.plotCount)} />
            <Fact
              label={t("ui.sharedRain30")}
              value={d.rain30.mm === null ? t("ui.sharedNoData") : fmtMm(d.rain30.mm)}
              note={
                d.rain30.normalMm
                  ? `${t("ui.sharedRainNormal")}: ${fmtMm(d.rain30.normalMm)}`
                  : undefined
              }
            />
            <Fact label={t("ui.alertsTitle")} value={String(d.alerts.length)} />
          </dl>

          <h2 className="mt-8 font-serif text-xl font-semibold">{t("ui.plots")}</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="num w-full text-left text-sm">
              <thead className="border-b border-linea text-tinta-2">
                <tr>
                  <th className="py-2 pr-3 font-medium">{t("ui.plot")}</th>
                  <th className="py-2 pr-3 font-medium">{t("ui.crop")}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("ui.area")}</th>
                  <th className="py-2 text-right font-medium">{t("ui.sharedVigor")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-linea">
                {d.plots.map((p, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-3">{p.name}</td>
                    <td className="py-2 pr-3 capitalize">{p.kind === "pasture" ? t("ui.pasture") : (p.crop ?? "—")}</td>
                    <td className="py-2 pr-3 text-right">{fmtHa(p.areaHa)}</td>
                    <td className="py-2 text-right">
                      {p.ndvi === null ? "—" : fmtNdvi(p.ndvi)}
                      {p.ndviAt ? <span className="ml-2 text-xs text-tinta-2">{fmtDate(p.ndviAt)}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="mt-8 font-serif text-xl font-semibold">{t("ui.alertsTitle")}</h2>
          {d.alerts.length === 0 ? (
            <p className="mt-2 text-sm text-tinta-2">{t("ui.sharedNoAlerts")}</p>
          ) : (
            <ul className="mt-2 divide-y divide-linea border-y border-linea text-sm">
              {d.alerts.map((a, i) => (
                <li key={i} className="py-2">
                  <span className="font-medium">{tk(`ui.alertKind_${a.kind}`)}</span> · {a.summary}
                </li>
              ))}
            </ul>
          )}

          <p className="mt-10 text-xs text-tinta-2">
            {t("ui.sharedGenerated", { date: fmtDate(d.generatedAt) })} · {t("ui.sharedExpires", { date: fmtDate(d.expiresAt) })}
          </p>
          <p className="mt-1 text-xs text-tinta-2">
            {t("attribution.copernicus")} · {t("attribution.chirps")}
          </p>
        </>
      )}
    </main>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-sm text-tinta-2">{label}</dt>
      <dd className="text-xl font-semibold">{value}</dd>
      {note && <dd className="text-xs text-tinta-2">{note}</dd>}
    </div>
  );
}
