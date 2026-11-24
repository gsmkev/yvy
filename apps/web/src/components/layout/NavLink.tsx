/** Enlace de la navegación que resuelve a dónde lleva cada entrada según la estancia actual. */
import { Link } from "@tanstack/react-router";
import { t } from "../../lib/i18n";
import type { NavItem } from "../../lib/nav";

/** Dónde está la persona y a qué estancia llevan "Mapa" e "Informes". */
export interface NavContext {
  path: string;
  onMap: boolean;
  onReports: boolean;
  lastFarm: string | undefined;
  reportsFarm: string | undefined;
  nAlerts: number;
}

/** Un ítem de la navegación (lateral, hoja o pestaña inferior); `cls` da el estilo según el lugar. */
export function NavLink({ n, ctx, cls, tab = false }: { n: NavItem; ctx: NavContext; cls: (active: boolean) => string; tab?: boolean }) {
  const reports = n.to === "/informes";
  const active = n.to === "/" ? ctx.onMap : reports ? ctx.onReports : n.to === ctx.path || ctx.path.startsWith(`${n.to}/`);
  const Icon = n.icon;
  const count = n.to === "/avisos" && ctx.nAlerts > 0 ? ctx.nAlerts : 0;
  const body = (
    <>
      <span className="relative flex shrink-0">
        <Icon size={tab ? 22 : 18} strokeWidth={active && tab ? 2.25 : 1.75} aria-hidden />
        {tab && count > 0 && (
          <span className="num absolute -top-1 left-3 min-w-4 rounded-full bg-peligro px-1 text-center text-micro font-semibold text-sobre">{count}</span>
        )}
      </span>
      <span className="truncate">{t(n.label)}</span>
      {!tab && count > 0 && <span className="num ml-auto text-meta font-semibold text-peligro">{count}</span>}
    </>
  );
  const current = active ? "page" : undefined;
  if (reports)
    return ctx.reportsFarm ? (
      <Link to="/estancias/$farmId/informes" params={{ farmId: ctx.reportsFarm }} aria-current={current} className={cls(active)}>
        {body}
      </Link>
    ) : null;
  return n.to === "/" && ctx.lastFarm ? (
    <Link to="/estancias/$farmId" params={{ farmId: ctx.lastFarm }} aria-current={current} className={cls(active)}>
      {body}
    </Link>
  ) : (
    <Link to={n.to} aria-current={current} className={cls(active)}>
      {body}
    </Link>
  );
}
