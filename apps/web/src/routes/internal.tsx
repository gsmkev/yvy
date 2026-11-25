/** Panel interno del equipo Yvy: uso de la plataforma, organizaciones, pruebas, pedidos de plan y auditoría. */
import { useState } from "react";
import { DataTable, EmptyState, ErrorBox, Field, FilterBar, Input, Page, Spinner, Stat } from "../components/ui";
import { fmtNum } from "../lib/format";
import { t } from "../lib/i18n";
import type { OrgMetrics } from "./internal/types";
import { TrialRequests } from "./internal/TrialRequests";
import { PlanRequests } from "./internal/PlanRequests";
import { Funnel } from "./internal/Funnel";
import { AuditLog } from "./internal/AuditLog";
import { OrgChanges, PlanModal } from "./internal/PlanModal";
import { orgColumns, pct } from "./internal/orgColumns";
import { useInternal, type UsageRow } from "./internal/useInternal";

/** Uso de cada recurso de la plataforma: porcentaje del tope o cantidad. */
function UsageStats({ usage }: { usage: UsageRow[] }) {
  const label = (m: string) => (m === "d1_bytes" || m === "r2_photo_bytes" ? t(`ui.usage.metric_${m}`) : m);
  return (
    <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
      {usage.map((u) => (
        <Stat key={u.metric} label={label(u.metric)} value={u.limit ? pct((100 * u.value) / u.limit) : fmtNum(u.value)} />
      ))}
    </div>
  );
}

/** Métricas de uso por organización (solo equipo Yvy). */
export function InternalPage() {
  const [editing, setEditing] = useState<OrgMetrics | null>(null);
  const [changes, setChanges] = useState<OrgMetrics | null>(null);
  const [search, setSearch] = useState("");
  const { q, extend, credit, support } = useInternal(search);
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  const columns = orgColumns({
    onEditPlan: setEditing,
    onExtend: extend.mutate,
    onChanges: setChanges,
    onSupport: support.mutate,
    onCredit: (id, credited) => credit.mutate({ id, credited }),
  });
  return (
    <Page width="data" title={t("ui.internal.title")}>
      <UsageStats usage={d.usage} />
      <FilterBar sheet={false} exportSlot={false}>
        <Field label={t("ui.internal.search")}>
          <Input type="search" className="w-full min-w-64 sm:w-96" placeholder={t("ui.internal.searchHint")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </Field>
      </FilterBar>
      {extend.error && <ErrorBox error={extend.error} />}
      {support.error && <ErrorBox error={support.error} />}
      <DataTable caption={t("ui.internal.title")} rows={d.organizations} rowKey={(o) => o.id} empty={<EmptyState compact title={t("ui.internal.noResults")} />} columns={columns} />
      {editing && <PlanModal org={editing} onClose={() => setEditing(null)} />}
      {changes && <OrgChanges org={changes} onClose={() => setChanges(null)} />}
      <TrialRequests />
      <PlanRequests />
      <Funnel />
      <AuditLog />
    </Page>
  );
}
