import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { isFieldRole } from "@yvy/shared";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { exitSupport, getSession, isNetworkDown, onNetworkChange, onSession, post, setSession } from "../lib/api";
import { Toaster } from "./ui";
import { FEATURES } from "../lib/features";
import { buildNav, MOBILE_TABS, type NavGroup, type NavItem } from "../lib/nav";
import { fmtDate } from "../lib/format";
import { t } from "../lib/i18n";
import { useAlerts, useFarms, useMe } from "../lib/queries";
import { loadPrefs } from "../lib/prefs";
import { trackView } from "../lib/track";
import { GlobalSearch } from "./GlobalSearch";
import { AccountMenu, useOrganizations } from "./AccountMenu";
import { TotpSection } from "./Totp";

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
  const farms = useFarms();
  const offline = useSyncExternalStore(onNetworkChange, isNetworkDown);
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
  // P-08: el dueño exige segundo factor y este administrador todavía no lo activó: no ve otra cosa hasta activarlo
  const mfaGate = useSyncExternalStore(onSession, () => getSession()?.mfaSetupRequired === true);
  const logout = async () => {
    const s = getSession();
    if (s) await post("/auth/logout", { refreshToken: s.refreshToken }).catch(() => {});
    setSession(null);
  };
  const trial = me.data?.organization.plan === "trial" && me.data.organization.trialEndsAt;
  // K-02: el agrónomo con más de un cliente tiene una pantalla con todos juntos
  const orgs = useOrganizations();
  const hasClients = orgs.filter((o) => !isFieldRole(o.role)).length > 1;
  const nav = buildNav({
    role: me.data?.role,
    farms: farms.data?.length ?? null,
    plots: farms.data ? farms.data.reduce((n, f) => n + f.plots, 0) : null,
    hasClients,
    isStaff: !!me.data?.isStaff,
    labs: FEATURES.labs,
  });
  const nAlerts = alerts.data?.length ?? 0;
  const path = useRouterState({ select: (s) => s.location.pathname });
  // Con varias estancias, "Mapa" vuelve a la última que se miró
  const lastFarm = (farms.data?.length ?? 0) > 1 ? farms.data!.find((f) => f.id === loadPrefs().farmId)?.id : undefined;
  const onMap = path === "/" || path.startsWith("/estancias");
  useEffect(() => trackView(path), [path]);
  const desktop = useIsDesktop();
  const [sheet, setSheet] = useState(false);
  const [sideHidden, setSideHidden] = useStoredFlag("yvy.navHidden");
  useEffect(() => setSheet(false), [path, desktop]);

  const account = (
    <AccountMenu
      name={me.data?.organization.name}
      sub={trial ? t("ui.trialEnds", { date: fmtDate(trial) }) : me.data?.user.fullName}
      onLogout={logout}
    />
  );
  const link = (n: NavItem, cls: (active: boolean) => string) => {
    const active = n.to === "/" ? onMap : n.to === path || path.startsWith(`${n.to}/`);
    const body = (
      <>
        {t(n.label)}
        {n.to === "/avisos" && nAlerts > 0 && <span className="num ml-auto font-semibold text-peligro">{nAlerts}</span>}
      </>
    );
    return n.to === "/" && lastFarm ? (
      <Link key={n.to} to="/estancias/$farmId" params={{ farmId: lastFarm }} aria-current={active ? "page" : undefined} className={cls(active)}>
        {body}
      </Link>
    ) : (
      <Link key={n.to} to={n.to} aria-current={active ? "page" : undefined} className={cls(active)}>
        {body}
      </Link>
    );
  };
  const sideCls = (active: boolean) =>
    `flex h-10 items-center rounded-md px-3 text-sm transition-colors ${active ? "bg-surco/[0.07] font-medium text-surco" : "text-tinta-2 hover:bg-surco/[0.04] hover:text-surco"}`;
  const sheetCls = (active: boolean) =>
    `flex h-12 items-center rounded-md px-3 text-[15px] ${active ? "bg-surco/[0.07] font-medium text-surco" : "text-surco"}`;
  const tabCls = (active: boolean) =>
    `flex h-14 flex-1 items-center justify-center gap-1.5 border-t-2 px-1 text-xs ${active ? "border-surco font-medium text-surco" : "border-transparent text-tinta-2"}`;

  return (
    <div className="flex h-full flex-col lg:flex-row print:block print:h-auto">
      <a
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
        className="sr-only print:hidden focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[70] focus:rounded-md focus:bg-surco focus:px-3 focus:py-2 focus:text-sm focus:text-lino"
      >
        {t("ui.skipToContent")}
      </a>
      {desktop &&
        (sideHidden ? (
          <div className="flex w-12 shrink-0 flex-col items-center gap-3 border-r border-linea bg-lino py-3 print:hidden">
            <button
              type="button"
              aria-label={t("ui.navShow")}
              title={t("ui.navShow")}
              onClick={() => setSideHidden(false)}
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-md text-tinta-2 hover:bg-surco/5 hover:text-surco"
            >
              <PanelLeftOpen size={18} aria-hidden />
            </button>
          </div>
        ) : (
          <aside className="relative z-20 flex w-60 shrink-0 flex-col border-r border-linea bg-lino print:hidden">
            <div className="flex h-14 shrink-0 items-center justify-between pr-2 pl-4">
              <Link to="/" className="font-serif text-[22px] leading-none font-semibold tracking-tight">
                {t("ui.appName")}
              </Link>
              <button
                type="button"
                aria-label={t("ui.navHide")}
                title={t("ui.navHide")}
                onClick={() => setSideHidden(true)}
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-md text-tinta-2 hover:bg-surco/5 hover:text-surco"
              >
                <PanelLeftClose size={18} aria-hidden />
              </button>
            </div>
            <div className="px-3 pb-3">
              <GlobalSearch inputRef={searchRef} />
            </div>
            <nav aria-label={t("ui.navMain")} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3">
              {nav.main.map((g) => (
                <SideGroup key={g.id} group={g} render={(n) => link(n, sideCls)} />
              ))}
              {nav.bottom.length > 0 && (
                <div className="mt-auto flex flex-col gap-0.5 border-t border-linea pt-3">{nav.bottom.map((n) => link(n, sideCls))}</div>
              )}
            </nav>
            <div className="shrink-0 border-t border-linea p-3">{account}</div>
          </aside>
        ))}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {me.data?.support && (
        <p role="status" className="shrink-0 border-b border-trigo/40 bg-trigo/15 px-4 py-1.5 print:hidden text-center text-sm text-surco">
          {t("ui.supportBanner", { name: me.data.organization.name })}{" "}
          <button className="cursor-pointer font-medium underline underline-offset-4" onClick={exitSupport}>
            {t("ui.supportExit")}
          </button>
        </p>
      )}
      {offline && (
        <p
          role="status"
          className="shrink-0 border-b border-trigo/40 bg-trigo/15 px-4 py-1 text-center text-xs text-surco"
        >
          {t("ui.offlineBanner")}
        </p>
      )}
      <main id="main" tabIndex={-1} className="min-h-0 min-w-0 flex-1 overflow-auto outline-none print:overflow-visible">
        {mfaGate ? (
          <div className="mx-auto w-full max-w-2xl p-4 sm:p-6">
            <h1 className="text-[28px] leading-tight">{t("ui.totpSetupGateTitle")}</h1>
            <TotpSection forced />
          </div>
        ) : (
          <Outlet />
        )}
      </main>
      </div>
      {!desktop && (
        <>
          <nav aria-label={t("ui.navMain")} className="flex shrink-0 border-t border-linea bg-lino pb-[env(safe-area-inset-bottom)] print:hidden">
            {MOBILE_TABS.map((to) => {
              const n = nav.main.flatMap((g) => g.items).find((i) => i.to === to);
              return n ? link(n, tabCls) : null;
            })}
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={sheet}
              onClick={() => setSheet(true)}
              className={`${tabCls(false)} cursor-pointer`}
            >
              {t("ui.navMore")}
            </button>
          </nav>
          {sheet && (
            <MoreSheet onClose={() => setSheet(false)}>
              <GlobalSearch inputRef={searchRef} listClassName="min-w-0" />
              {nav.main.map((g) => (
                <SideGroup key={g.id} group={g} render={(n) => link(n, sheetCls)} />
              ))}
              {nav.bottom.length > 0 && (
                <div className="flex flex-col gap-0.5 border-t border-linea pt-3">{nav.bottom.map((n) => link(n, sheetCls))}</div>
              )}
              <div className="border-t border-linea pt-3">{account}</div>
            </MoreSheet>
          )}
        </>
      )}
      <Toaster />
    </div>
  );
}

/** Bajo lg la navegación es una barra inferior; desde lg, la barra lateral. */
function useIsDesktop() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia?.("(min-width: 1024px)");
      m?.addEventListener("change", cb);
      return () => m?.removeEventListener("change", cb);
    },
    () => window.matchMedia?.("(min-width: 1024px)").matches ?? true,
    () => true,
  );
}

/** Bandera booleana recordada en este navegador (si el almacenamiento falla, vale hasta recargar). */
function useStoredFlag(key: string): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(() => {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  });
  return [
    v,
    (n) => {
      setV(n);
      try {
        localStorage.setItem(key, n ? "1" : "0");
      } catch {
        /* sin almacenamiento */
      }
    },
  ];
}

/** Grupo de la navegación: el título pliega y despliega sus ítems (se recuerda por navegador). */
function SideGroup({ group, render }: { group: NavGroup; render: (n: NavItem) => React.ReactNode }) {
  const [closed, setClosed] = useStoredFlag(`yvy.navClosed.${group.id}`);
  if (!group.label) return <div className="flex flex-col gap-0.5">{group.items.map(render)}</div>;
  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        aria-expanded={!closed}
        onClick={() => setClosed(!closed)}
        className="flex h-8 cursor-pointer items-center justify-between rounded-md px-3 text-xs font-semibold text-tinta-2 hover:text-surco"
      >
        {t(group.label)}
        <ChevronDown size={14} aria-hidden className={`transition-transform ${closed ? "-rotate-90" : ""}`} />
      </button>
      {!closed && group.items.map(render)}
    </div>
  );
}

/** Hoja inferior del celular con el resto de la navegación. Escape cierra, Tab queda adentro, el foco vuelve a "Más". */
function MoreSheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const el = box.current;
    el?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      else if (e.key === "Tab" && el) {
        const items = Array.from(el.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),input:not([disabled])"));
        const first = items[0];
        const last = items[items.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (before && document.contains(before)) before.focus();
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-surco/55 print:hidden" onClick={onClose}>
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={t("ui.navMore")}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full flex-col gap-3 overflow-y-auto rounded-t-xl bg-lino p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] outline-none"
      >
        <button
          type="button"
          aria-label={t("ui.close")}
          onClick={onClose}
          className="flex h-12 w-12 cursor-pointer items-center justify-center self-end rounded-md text-tinta-2 hover:bg-surco/5"
        >
          <X size={20} aria-hidden />
        </button>
        {children}
      </div>
    </div>
  );
}

