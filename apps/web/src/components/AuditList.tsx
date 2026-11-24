/** Una entrada del registro de cambios con su actor, entidad y detalle. */
import { auditSummary } from "../lib/auditDetail";
import { fmtDateTime } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { DataTable, type Column } from "./ui";

/** Una entrada del registro de cambios con su actor, entidad y detalle. */
export interface AuditEntryRow {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  detail: string;
  createdAt: number;
  actor: string | null;
}

/** Lista de cambios para el dueño y para el panel interno. */
export function AuditList({ rows }: { rows: AuditEntryRow[] }) {
  const columns: Column<AuditEntryRow>[] = [
    { id: "when", header: t("ui.audit.colWhen"), cell: (r) => <span className="num whitespace-nowrap text-tinta-2">{fmtDateTime(r.createdAt)}</span> },
    { id: "actor", header: t("ui.audit.colActor"), cell: (r) => r.actor ?? "—" },
    { id: "action", header: t("ui.audit.colAction"), cell: (r) => <span className="font-normal">{tk(`ui.internal.audit_${r.action}`)}</span> },
    {
      id: "detail",
      header: t("ui.audit.colDetail"),
      hideBelow: "md",
      cell: (r) => {
        const summary = auditSummary(r.detail);
        return (
          <span title={summary} className="block max-w-[28rem] truncate text-xs text-tinta-2">
            {summary}
          </span>
        );
      },
    },
  ];
  return <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} caption={t("ui.audit.title")} />;
}
