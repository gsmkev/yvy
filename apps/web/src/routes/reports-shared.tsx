/** Resumen público de solo lectura de una estancia (K-04): /compartido/:token, sin sesión ni menú. */
import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { fmtDate, fmtHa, fmtMm, fmtNdvi } from "../lib/format";
import { DataTable, SectionHead, Spinner, Stat, type Column } from "../components/ui";
import { t, tk } from "../lib/i18n";
import { PageExport } from "../components/PageExport";

interface SharedSummary {
  farm: { name: string; department: string | null; areaHa: number; plotCount: number };
  plots: { name: string; kind: string; crop: string | null; areaHa: number; ndvi: number | null; ndviAt: number | null }[];
  rain30: { mm: number | null; normalMm: number | null };
  alerts: { kind: string; severity: string; summary: string; validFrom: number; validTo: number | null }[];
  generatedAt: number;
  expiresAt: number;
}

type SharedPlot = SharedSummary["plots"][number];

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
  const body = useRef<HTMLDivElement>(null);
  const d = q.data;
  const cols: Column<SharedPlot>[] = [
    { id: "plot", header: t("ui.plot"), cell: (p) => p.name },
    { id: "crop", header: t("ui.crop"), cell: (p) => <span className="capitalize">{p.kind === "pasture" ? t("ui.pasture") : (p.crop ?? "—")}</span>, hideBelow: "sm" },
    { id: "area", header: t("ui.area"), align: "right", cell: (p) => fmtHa(p.areaHa) },
    {
      id: "ndvi",
      header: t("ui.sharedVigor"),
      align: "right",
      cell: (p) =>
        p.ndvi === null ? (
          "—"
        ) : (
          <>
            {fmtNdvi(p.ndvi)}
            {p.ndviAt ? <span className="ml-2 text-xs text-tinta-2">{fmtDate(p.ndviAt)}</span> : null}
          </>
        ),
    },
  ];
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 lg:px-10">
      <p className="font-serif text-2xl font-semibold">Yvy</p>
      {q.isLoading && <Spinner rows={4} h={72} />}
      {q.error && (
        <p className="text-lg">
          {q.error instanceof SharedError && q.error.reason === "expired"
            ? t("ui.sharedExpiredMsg")
            : q.error instanceof SharedError && q.error.reason === "revoked"
              ? t("ui.sharedRevokedMsg")
              : t("ui.sharedNotFoundMsg")}
        </p>
      )}
      {d && (
        <>
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-title leading-8">{d.farm.name}</h1>
              <p className="mt-1 text-sm text-tinta-2">
                {t("ui.sharedTitle")}
                {d.farm.department ? ` · ${d.farm.department}` : ""} · {t("ui.sharedReadOnly")}
              </p>
            </div>
            {d.plots.length > 0 && <PageExport root={body} name={d.farm.name} />}
          </header>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-linea py-5 sm:grid-cols-4">
            <Stat label={t("ui.area")} value={fmtHa(d.farm.areaHa)} />
            <Stat label={t("ui.plots")} value={d.farm.plotCount} />
            <Stat
              label={t("ui.sharedRain30")}
              value={d.rain30.mm === null ? t("ui.sharedNoData") : fmtMm(d.rain30.mm)}
              note={d.rain30.normalMm ? `${t("ui.sharedRainNormal")}: ${fmtMm(d.rain30.normalMm)}` : undefined}
            />
            {d.alerts.length > 0 && <Stat label={t("ui.alertsTitle")} value={d.alerts.length} />}
          </div>

          <div className="grid items-start gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <section ref={body} className="flex min-w-0 flex-col gap-2">
              <SectionHead title={t("ui.plots")} />
              <DataTable columns={cols} rows={d.plots} rowKey={(p) => `${p.name}|${p.areaHa}|${p.crop ?? ""}`} caption={t("ui.plots")} />
            </section>
            <section className="flex min-w-0 flex-col gap-2">
              <SectionHead title={t("ui.alertsTitle")} />
              {d.alerts.length === 0 ? (
                <p className="text-sm text-tinta-2">{t("ui.sharedNoAlerts")}</p>
              ) : (
                <ul className="flex flex-col text-sm">
                  {d.alerts.map((a, i) => (
                    <li key={i} className="border-b border-linea py-2.5">
                      <span className="font-medium">{tk(`ui.alertKind_${a.kind}`)}</span> · {a.summary}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <footer className="flex flex-col gap-1 text-xs text-tinta-2">
            <p>
              {t("ui.sharedGenerated", { date: fmtDate(d.generatedAt) })} · {t("ui.sharedExpires", { date: fmtDate(d.expiresAt) })}
            </p>
            <p>
              {t("attribution.copernicus")} · {t("attribution.chirps")}
            </p>
          </footer>
        </>
      )}
    </main>
  );
}
