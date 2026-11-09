import { useEffect } from "react";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { getSession, onSession, post, setSession } from "../lib/api";
import { fmtDate } from "../lib/format";
import { t } from "../lib/i18n";
import { useMe } from "../lib/queries";

const NAV = [
  { to: "/", label: "ui.navHome" },
  { to: "/registros", label: "ui.navRecords" },
  { to: "/tareas", label: "ui.navTasks" },
  { to: "/avisos", label: "ui.navAlerts" },
  { to: "/equipo", label: "ui.navTeam" },
] as const;

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
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 bg-surco px-4 py-2.5 text-lino">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <img src="/favicon.svg" alt="" className="h-7 w-7" />
          {t("ui.appName")}
        </Link>
        <nav className="flex gap-1 overflow-x-auto text-sm">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="rounded-md px-2.5 py-1.5 text-lino/80 hover:bg-white/10"
              activeProps={{ className: "bg-white/15 text-lino" }}
              activeOptions={{ exact: n.to === "/" }}
            >
              {t(n.label)}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="hidden text-lino/70 sm:inline">{me.data?.organization.name}</span>
          <button onClick={logout} className="rounded-md px-2 py-1 text-lino/80 hover:bg-white/10">
            {t("ui.logout")}
          </button>
        </div>
      </header>
      {trial && trial - Date.now() < 15 * 86_400_000 && (
        <div className="bg-trigo/30 px-4 py-1.5 text-center text-sm">{t("ui.trialEnds", { date: fmtDate(trial) })}</div>
      )}
      <main className="min-h-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
