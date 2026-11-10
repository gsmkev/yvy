import { useEffect, useRef } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { getSession, onSession, post, setSession } from "../lib/api";
import { FEATURES } from "../lib/features";
import { fmtDate } from "../lib/format";
import { t, type MessageKey } from "../lib/i18n";
import { useAlerts, useMe } from "../lib/queries";
import { GlobalSearch } from "./GlobalSearch";

const NAV: { to: string; label: MessageKey }[] = [
  { to: "/", label: "ui.navMap" },
  { to: "/registros", label: "ui.navRecords" },
  { to: "/tareas", label: "ui.navTasks" },
  { to: "/avisos", label: "ui.navAlerts" },
  { to: "/equipo", label: "ui.navTeam" },
  ...(FEATURES.labs ? [{ to: "/laboratorio", label: "ui.navLabs" as MessageKey }] : []),
];

export function Logo({ className = "h-7 w-7" }: { className?: string }) {
  return <img src="/favicon.svg" alt="" className={className} />;
}

/** Barra superior fina: la pantalla es del mapa y los datos, no de la navegación. */
export function Layout() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useMe();
  const alerts = useAlerts({ active: true });
  const searchRef = useRef<HTMLInputElement>(null);
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
  // "/" o Ctrl/Cmd+K enfocan el buscador (salvo que ya se esté escribiendo en otro campo)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
      const k = e.key.toLowerCase();
      if ((k === "k" && (e.ctrlKey || e.metaKey)) || (k === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey)) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const logout = async () => {
    const s = getSession();
    if (s) await post("/auth/logout", { refreshToken: s.refreshToken }).catch(() => {});
    setSession(null);
  };
  const trial = me.data?.organization.plan === "trial" && me.data.organization.trialEndsAt;
  const items = me.data?.isStaff ? [...NAV, { to: "/interno", label: "ui.navInternal" as MessageKey }] : NAV;
  const nAlerts = alerts.data?.length ?? 0;
  const path = useRouterState({ select: (s) => s.location.pathname });
  const onMap = path === "/" || path.startsWith("/estancias");

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-6 border-b border-linea bg-lino px-4 lg:px-6">
        <Link to="/" className="font-serif text-[22px] leading-none font-semibold tracking-tight">
          {t("ui.appName")}
        </Link>
        <nav aria-label="Principal" className="flex h-full flex-1 gap-5 overflow-x-auto">
          {items.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={`-mb-px flex items-center border-b-2 text-[15px] whitespace-nowrap transition-colors hover:text-surco ${
                n.to === "/" && onMap ? "border-surco font-medium text-surco" : "border-transparent text-tinta-2"
              }`}
              activeProps={n.to === "/" ? {} : { className: "!border-surco !text-surco font-medium" }}
            >
              {t(n.label)}
              {n.to === "/avisos" && nAlerts > 0 && (
                <span className="num ml-1.5 rounded-full bg-peligro px-1.5 text-xs leading-5 font-semibold text-white">
                  {nAlerts}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <GlobalSearch inputRef={searchRef} />
        <div className="hidden text-right text-sm leading-tight md:block">
          <p className="font-medium">{me.data?.organization.name}</p>
          <p className="text-xs text-tinta-2">
            {trial ? t("ui.trialEnds", { date: fmtDate(trial) }) : me.data?.user.fullName}
          </p>
        </div>
        <button
          onClick={logout}
          className="cursor-pointer text-sm whitespace-nowrap text-tinta-2 underline-offset-4 hover:text-surco hover:underline"
        >
          {t("ui.logout")}
        </button>
      </header>
      <main id="main" className="min-h-0 min-w-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
