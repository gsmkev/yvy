import { useQuery } from "@tanstack/react-query";
import { SectionHead } from "../../components/ui";
import { get } from "../../lib/api";
import { fmtDateTime } from "../../lib/format";
import { t, tk } from "../../lib/i18n";

interface AuditRow {
  id: string;
  action: string;
  organizationId: string | null;
  detail: string;
  createdAt: number;
  actor: string | null;
}

/** Últimas acciones del equipo sobre organizaciones de clientes. */
export function AuditLog() {
  const q = useQuery({ queryKey: ["admin-audit"], queryFn: () => get<AuditRow[]>("/admin/audit") });
  if (!q.data?.length) return null;
  return (
    <section>
      <SectionHead title={t("ui.internal.audit")} />
      <ul className="mt-2 flex flex-col gap-1 text-sm">
        {q.data.slice(0, 20).map((r) => (
          <li key={r.id} className="num">
            {[fmtDateTime(r.createdAt), r.actor ?? "—", tk(`ui.internal.audit_${r.action}`), r.organizationId].filter(Boolean).join(", ")}
          </li>
        ))}
      </ul>
    </section>
  );
}
