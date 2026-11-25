/** Columnas de la tabla del equipo y los textos que la acompañan. */
import { isFieldRole } from "@yvy/shared";
import { ActionMenu } from "../../components/menus";
import type { Column } from "../../components/ui";
import { fmtDate, fmtDateTime } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import type { Member } from "../../lib/types";

/** Hace cuánto fue algo, en palabras hasta un mes y como fecha después. */
function since(ms: number) {
  const h = Math.floor((Date.now() - ms) / 3_600_000);
  if (h < 1) return t("ui.team.justNow");
  if (h < 24) return t("ui.team.hoursAgo", { n: h });
  const d = Math.floor(h / 24);
  if (d === 1) return t("app.common.yesterday");
  return d < 30 ? t("ui.team.daysAgo", { n: d }) : fmtDate(ms);
}

/** Quién mira y qué puede hacer con cada miembro. */
interface TeamContext {
  /** El dueño administra los accesos por estancia. */
  owner: boolean;
  /** Dueño o administrador: alta, PIN, vincular dispositivo y baja. */
  canManage: boolean;
  meId: string | undefined;
  /** Estancias que ve cada persona con acceso por estancia. */
  farmsOf: (m: Member) => string;
  onAssign: (m: Member) => void;
  onScope: (m: Member) => void;
  onLink: (m: Member) => void;
  onPin: (m: Member) => void;
  onRemove: (m: Member) => void;
}

/** Roles con acceso limitado a algunas estancias. */
export const isScoped = (m: Member) => m.role === "supervisor" || m.role === "admin" || m.role === "agronomist";

function PersonCell({ m, canManage }: { m: Member; canManage: boolean }) {
  const noPin = m.role === "worker" && canManage && !m.hasPin;
  return (
    <div className="min-w-0 max-w-[8rem] py-1 sm:max-w-none">
      <div className="truncate font-medium">{m.fullName}</div>
      <div className="truncate text-xs font-normal text-tinta-2">{[m.email, m.phone].filter(Boolean).join(", ")}</div>
      <div className="truncate text-xs sm:hidden">
        {tk(`ui.role.${m.role}`)}
        {noPin && <span className="block text-trigo-texto">{t("app.team.pinNone")}</span>}
      </div>
      {m.overdueTasks > 0 && (
        <div className="num text-xs font-medium text-peligro sm:hidden">{t(m.overdueTasks === 1 ? "ui.overdue.countOne" : "ui.overdue.countMany", { n: m.overdueTasks })}</div>
      )}
    </div>
  );
}

function RowActions({ m, c }: { m: Member; c: TeamContext }) {
  const { canManage, owner } = c;
  return (
    <div className="flex justify-end">
      <ActionMenu
        label={t("ui.row.actions", { name: m.fullName })}
        items={[
          { label: t("ui.common.assignPlots"), onSelect: () => c.onAssign(m) },
          owner && isScoped(m) && { label: t("ui.farm.access"), onSelect: () => c.onScope(m) },
          canManage && isFieldRole(m.role) && { label: t("ui.link.device"), onSelect: () => c.onLink(m) },
          canManage && m.role === "worker" && { label: m.hasPin ? t("app.team.pinChange") : t("app.team.pinSet"), onSelect: () => c.onPin(m) },
          canManage && m.userId !== c.meId && { label: t("ui.common.removeMember"), onSelect: () => c.onRemove(m), danger: true },
        ]}
      />
    </div>
  );
}

/** Columnas del equipo; la de acceso por estancia es solo para el dueño. */
export function teamColumns(c: TeamContext): Column<Member>[] {
  const cols: Column<Member>[] = [
    { id: "person", header: t("ui.common.name"), mobile: "title", cell: (m) => <PersonCell m={m} canManage={c.canManage} /> },
    {
      id: "role",
      header: t("ui.common.role"),
      hideBelow: "sm",
      cell: (m) => (
        <div className="whitespace-nowrap">
          {tk(`ui.role.${m.role}`)}
          {m.role === "worker" && c.canManage && !m.hasPin && <div className="text-xs text-trigo-texto">{t("app.team.pinNone")}</div>}
        </div>
      ),
    },
  ];
  if (c.owner) cols.push({ id: "farms", header: t("ui.farm.access"), hideBelow: "lg", cell: (m) => <span className="line-clamp-2 text-tinta-2">{c.farmsOf(m) || "—"}</span> });
  cols.push(
    { id: "records", header: t("ui.team.colRecords"), align: "right", mobile: "hide", cell: (m) => m.records7d, sort: (a, b) => a.records7d - b.records7d },
    { id: "plots", header: t("ui.team.colPlots"), align: "right", hideBelow: "md", cell: (m) => m.plotsVisited7d },
  );
  cols.push({
    id: "last",
    header: t("ui.team.colLastSync"),
    cell: (m) => (
      <span className="whitespace-nowrap text-tinta-2" title={m.lastSyncAt ? fmtDateTime(m.lastSyncAt) : t("ui.team.neverSyncedHint")}>
        <span className="sm:hidden">{t("ui.team.colLastSync")}: </span>
        {m.lastSyncAt ? since(m.lastSyncAt) : t("ui.never.visited")}
      </span>
    ),
    sort: (a, b) => (a.lastSyncAt ?? 0) - (b.lastSyncAt ?? 0),
  });
  cols.push(
    { id: "overdue", header: t("ui.team.colOverdue"), align: "right", hideBelow: "sm", cell: (m) => (m.overdueTasks > 0 ? <span className="font-medium text-peligro">{m.overdueTasks}</span> : <span className="text-tinta-2">0</span>) },
    { id: "actions", header: <span className="sr-only">{t("ui.row.actionsHeader")}</span>, width: "3rem", cell: (m) => <RowActions m={m} c={c} /> },
  );
  return cols;
}
