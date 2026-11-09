import { useQuery } from "@tanstack/react-query";
import { Card, ErrorBox, Spinner } from "../components/ui";
import { get } from "../lib/api";
import { fmtDate, fmtHa, fmtNum } from "../lib/format";
import { t } from "../lib/i18n";

interface OrgMetrics {
  id: string;
  name: string;
  plan: string;
  trialEndsAt: number | null;
  farms: number;
  ha: number;
  workers: number;
  records7d: number;
  activeWorkers7d: number;
  recordsPerActiveWorker: number | null;
  owners: number;
  ownersActivePct: number | null;
  usefulPct: number | null;
  lastActive: string | null;
}

/** Métricas del PRD §4 por organización (solo equipo Yvy). */
export function InternalPage() {
  const q = useQuery({
    queryKey: ["admin-metrics"],
    queryFn: () =>
      get<{ organizations: OrgMetrics[]; usage: { metric: string; value: number; limit: number | null }[] }>(
        "/admin/metrics",
      ),
  });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v)} %`);
  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">{t("ui.internalTitle")}</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {d.usage.map((u) => (
          <Card key={u.metric}>
            <div className="text-xs text-surco/60">{u.metric}</div>
            <div className="text-xl font-semibold">{u.limit ? pct((100 * u.value) / u.limit) : fmtNum(u.value)}</div>
          </Card>
        ))}
      </div>
      <div className="overflow-auto rounded-xl bg-white">
        <table className="w-full text-sm">
          <thead className="bg-lino text-left text-xs text-surco/70">
            <tr>
              {[
                "Organización",
                "Plan",
                "Estancias",
                "Superficie",
                "Empleados",
                "Registros 7 d",
                "Reg./empleado activo/sem (meta ≥ 10)",
                "Dueños 2+ días/sem (meta ≥ 70 %)",
                "Avisos útiles (meta ≥ 50 %)",
                "Última actividad",
              ].map((h) => (
                <th key={h} className="px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.organizations.map((o) => (
              <tr key={o.id} className="border-t border-surco/10">
                <td className="px-3 py-2 font-medium">{o.name}</td>
                <td className="px-3 py-2">
                  {o.plan}
                  {o.plan === "trial" && o.trialEndsAt ? ` · ${fmtDate(o.trialEndsAt)}` : ""}
                </td>
                <td className="px-3 py-2">{o.farms}</td>
                <td className="px-3 py-2">{fmtHa(o.ha)}</td>
                <td className="px-3 py-2">{o.workers}</td>
                <td className="px-3 py-2">{o.records7d}</td>
                <td
                  className={`px-3 py-2 ${o.recordsPerActiveWorker !== null && o.recordsPerActiveWorker < 10 ? "text-alerta" : ""}`}
                >
                  {o.recordsPerActiveWorker === null ? "—" : fmtNum(o.recordsPerActiveWorker)}
                </td>
                <td
                  className={`px-3 py-2 ${o.ownersActivePct !== null && o.ownersActivePct < 70 ? "text-alerta" : ""}`}
                >
                  {pct(o.ownersActivePct)}
                </td>
                <td className="px-3 py-2">{pct(o.usefulPct)}</td>
                <td className="px-3 py-2">{o.lastActive ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
