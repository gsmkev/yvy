import { useEffect } from "react";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, ClipboardList, Gauge, LayoutGrid, ListChecks, LogOut, Users, type LucideIcon } from "lucide-react";
import { getSession, onSession, post, setSession } from "../lib/api";
import { fmtDate } from "../lib/format";
import { t, type MessageKey } from "../lib/i18n";
import { useMe } from "../lib/queries";

const NAV: { to: string; label: MessageKey; icon: LucideIcon }[] = [
  { to: "/", label: "ui.navHome", icon: LayoutGrid },
  { to: "/registros", label: "ui.navRecords", icon: ClipboardList },
  { to: "/tareas", label: "ui.navTasks", icon: ListChecks },
  { to: "/avisos", label: "ui.navAlerts", icon: Bell },
  { to: "/equipo", label: "ui.navTeam", icon: Users },
];

export function Logo({ className = "h-7 w-7" }: { className?: string }) {
  return <img src="/favicon.svg" alt="" className={className} />;
}

export function Layout() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useMe();
  useEffect(() => {
    const off = onSession((s) => {
      if (!s) {
        qc.clear();
        navigate({ to: "/ingresar" });
      }
    });
    return () => {
      off();
    };
  }, []);
  const logout = async () => {
    const s = getSession();
    if (s) await post("/auth/logout", { refreshToken: s.refreshToken }).catch(() => {});
    setSession(null);
  };
  const trial = me.data?.organization.plan === "trial" && me.data.organization.trialEndsAt;
  const items = me.data?.isStaff
    ? [...NAV, { to: "/interno", label: "ui.navInternal" as MessageKey, icon: Gauge }]
    : NAV;
  const link =
    "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-lino/70 transition-colors hover:bg-white/[0.06] hover:text-lino";

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <aside className="flex shrink-0 items-center gap-2 bg-surco px-3 py-2 text-lino lg:w-56 lg:flex-col lg:items-stretch lg:px-3 lg:py-4">
        <Link to="/" className="flex items-center gap-2.5 px-2 lg:mb-6">
          <Logo />
          <span className="text-lg font-semibold tracking-tight">{t("ui.appName")}</span>
        </Link>
        <nav aria-label="Principal" className="flex flex-1 gap-1 overflow-x-auto lg:flex-col">
          {items.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={link}
              activeProps={{ className: "!bg-white/10 !text-lino font-medium" }}
              activeOptions={{ exact: n.to === "/" }}
            >
              <n.icon size={18} aria-hidden />
              <span className="hidden sm:inline">{t(n.label)}</span>
            </Link>
          ))}
        </nav>
        <div className="hidden border-t border-white/10 pt-3 lg:block">
          <p className="truncate px-3 text-sm font-medium">{me.data?.organization.name}</p>
          <p className="truncate px-3 text-xs text-lino/55">{me.data?.user.fullName}</p>
          {trial && (
            <p className="num mt-2 px-3 text-[11px] text-trigo">{t("ui.trialEnds", { date: fmtDate(trial) })}</p>
          )}
        </div>
        <button onClick={logout} className={`${link} cursor-pointer lg:mt-2`} aria-label={t("ui.logout")}>
          <LogOut size={18} aria-hidden />
          <span className="hidden lg:inline">{t("ui.logout")}</span>
        </button>
      </aside>
      <main id="main" className="min-h-0 min-w-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
