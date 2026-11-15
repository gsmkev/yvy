import { fmtDateTime } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { DataTable, type Column } from "./ui";

export interface AuditEntryRow {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  detail: string;
  createdAt: number;
  actor: string | null;
}

/** K-06: resumen corto del detalle de un cambio ("name: Lote 3 · crop: maiz · cambió: geometry"). */
export function auditSummary(detail: string): string {
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(detail) as Record<string, unknown>;
  } catch {
    return "";
  }
  const parts: string[] = [];
  const scalars = (o: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(o))
      if (v === null || ["string", "number", "boolean"].includes(typeof v)) parts.push(`${k}: ${String(v)}`);
  };
  if (d.values && typeof d.values === "object") scalars(d.values as Record<string, unknown>);
  scalars(Object.fromEntries(Object.entries(d).filter(([k]) => k !== "values")));
  if (Array.isArray(d.fields) && d.fields.length) parts.push(`${t("ui.auditChanged")}: ${d.fields.join(", ")}`);
  return parts.join(" · ").slice(0, 160);
}

/** Lista de cambios para el dueño (K-06) y para el panel interno. */
export function AuditList({ rows }: { rows: AuditEntryRow[] }) {
  const columns: Column<AuditEntryRow>[] = [
    { id: "when", header: t("ui.auditColWhen"), cell: (r) => <span className="num whitespace-nowrap text-tinta-2">{fmtDateTime(r.createdAt)}</span> },
    { id: "actor", header: t("ui.auditColActor"), cell: (r) => r.actor ?? "—" },
    { id: "action", header: t("ui.auditColAction"), cell: (r) => <span className="font-normal">{tk(`ui.internalAudit_${r.action}`)}</span> },
    {
      id: "detail",
      header: t("ui.auditColDetail"),
      hideBelow: "md",
      cell: (r) => <span className="line-clamp-2 text-xs text-tinta-2">{auditSummary(r.detail)}</span>,
    },
  ];
  return <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} caption={t("ui.auditTitle")} />;
}
