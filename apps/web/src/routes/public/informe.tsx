/** Informe de riesgo climático del pedido gratis (V-04): se abre con el enlace del email, sin sesión. */
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import type { FarmRisk } from "@yvy/shared";
import { Empty, ErrorBox, Spinner } from "../../components/ui";
import { fmtDate } from "../../lib/format";
import { t } from "../../lib/i18n";
import { RiskReportBody } from "../risk";
import { PublicShell } from "./PublicShell";

interface Res {
  computedAt: number;
  report: FarmRisk;
}

async function fetchReport(id: string, sig: string): Promise<Res | null> {
  const res = await fetch(`/public/leads/${encodeURIComponent(id)}/${encodeURIComponent(sig)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as Res;
}

export function LeadReportPage() {
  const { id, sig } = useParams({ from: "/informe/$id/$sig" });
  const q = useQuery({ queryKey: ["lead-report", id], queryFn: () => fetchReport(id, sig), retry: false });
  return (
    <PublicShell>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
        {q.isLoading ? (
          <Spinner />
        ) : q.error ? (
          <ErrorBox error={q.error} />
        ) : !q.data ? (
          <Empty>{t("ui.leadReportMissing")}</Empty>
        ) : (
          <>
            <div>
              <h1 className="font-serif text-[32px] leading-tight font-semibold">{t("ui.leadReportTitle")}</h1>
              <p className="mt-2 text-tinta-2">{t("ui.leadReportIntro")}</p>
              <p className="mt-1 text-sm text-tinta-2">{t("ui.riskComputed", { date: fmtDate(q.data.computedAt) })}</p>
            </div>
            <RiskReportBody r={q.data.report} />
            <div className="border-t border-linea pt-6">
              <Link
                to="/ingresar"
                search={{ modo: "registro" }}
                className="inline-flex h-11 items-center justify-center rounded-md border border-accion bg-accion px-5 text-sm font-medium text-sobre hover:bg-accion-2"
              >
                {t("ui.leadReportCta")}
              </Link>
            </div>
          </>
        )}
      </div>
    </PublicShell>
  );
}
