import { useQuery } from "@tanstack/react-query";
import { get } from "../../lib/api";
import { fmtDateTime } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { PublicShell } from "./PublicShell";

interface Status {
  checkedAt: number;
  overall: "ok" | "degraded" | "down";
  services: { id: "worker" | "d1" | "r2"; ok: boolean }[];
  jobs: { id: string; state: "ok" | "late" | "failing" | "none"; lastOkAt: number | null; lastFailAt: number | null }[];
}

const tone = (ok: boolean) => (ok ? "text-soja" : "text-peligro");

/** P-04: estado del servicio. Pública y sin datos de clientes. */
export function StatusPage() {
  const q = useQuery({
    queryKey: ["public-status"],
    queryFn: () => get<Status>("/public/status"),
    refetchInterval: 60_000,
    retry: false,
  });
  const s = q.data;
  return (
    <PublicShell>
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <h1 className="text-[32px] leading-tight">{t("ui.statusTitle")}</h1>
        {q.isError && (
          <p role="alert" className="mt-4 border-l-2 border-alerta pl-3">
            {t("ui.statusLoadError")}
          </p>
        )}
        {s && (
          <>
            <p role="status" className={`mt-3 text-lg ${tone(s.overall === "ok")}`}>
              {tk(`ui.statusOverall_${s.overall}`)}
            </p>
            <p className="mt-1 text-sm text-tinta-2">{t("ui.statusChecked", { date: fmtDateTime(s.checkedAt) })}</p>

            <h2 className="mt-10 font-serif text-xl font-semibold">{t("ui.statusServicesTitle")}</h2>
            <ul className="mt-2 divide-y divide-linea border-y border-linea">
              {s.services.map((x) => (
                <li key={x.id} className="flex justify-between gap-4 py-3">
                  <span>{tk(`ui.statusService_${x.id}`)}</span>
                  <span className={tone(x.ok)}>{t(x.ok ? "ui.statusUp" : "ui.statusDown")}</span>
                </li>
              ))}
            </ul>

            <h2 className="mt-10 font-serif text-xl font-semibold">{t("ui.statusJobsTitle")}</h2>
            <p className="mt-2 text-tinta-2">{t("ui.statusJobsIntro")}</p>
            <ul className="mt-2 divide-y divide-linea border-y border-linea">
              {s.jobs.map((j) => (
                <li key={j.id} className="py-3">
                  <div className="flex justify-between gap-4">
                    <span>{tk(`ui.statusJob_${j.id}`)}</span>
                    <span className={j.state === "ok" ? "text-soja" : j.state === "none" ? "text-tinta-2" : "text-peligro"}>
                      {tk(`ui.statusJobState_${j.state}`)}
                    </span>
                  </div>
                  {j.lastOkAt && <p className="mt-0.5 text-sm text-tinta-2">{t("ui.statusLastOk", { date: fmtDateTime(j.lastOkAt) })}</p>}
                  {j.state === "failing" && j.lastFailAt && (
                    <p className="mt-0.5 text-sm text-tinta-2">{t("ui.statusLastFail", { date: fmtDateTime(j.lastFailAt) })}</p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </PublicShell>
  );
}
