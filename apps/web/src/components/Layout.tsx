import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Ellipsis } from "lucide-react";
import { Outlet } from "@tanstack/react-router";
import { exitSupport, getSession, isNetworkDown, onNetworkChange, onSession, post, setSession } from "../lib/api";
import { Page, Toaster } from "./ui";
import { MOBILE_TABS, type NavItem } from "../lib/nav";
import { fmtDate } from "../lib/format";
import { t } from "../lib/i18n";
import { useMe } from "../lib/queries";
import { trackView } from "../lib/track";
import { GlobalSearch } from "./GlobalSearch";
import { AccountMenu } from "./AccountMenu";
import { TotpSection } from "./Totp";
import { useIsDesktop, useSearchShortcut, useSignedOutRedirect, useStoredFlag } from "./layout/hooks";
import { MoreSheet, NavSection } from "./layout/MoreSheet";
import { NavLink } from "./layout/NavLink";
import { useNavModel } from "./layout/useNavModel";
import { Sidebar } from "./layout/Sidebar";

const sideCls = (active: boolean) =>
  `flex h-9 items-center gap-2.5 rounded-md px-3 text-sm transition-colors ${active ? "bg-surco/[0.07] font-medium text-surco" : "text-tinta-2 hover:bg-surco/[0.04] hover:text-surco"}`;
const sheetCls = (active: boolean) =>
  `flex h-12 items-center gap-3 rounded-md px-3 text-body ${active ? "bg-surco/[0.07] font-medium text-surco" : "text-surco"}`;
const tabCls = (active: boolean) =>
  `flex h-14 min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-0.5 border-t-2 px-1 text-micro ${active ? "border-accion bg-accion/[0.07] font-semibold text-accion" : "border-transparent text-tinta-2"}`;

const logout = async () => {
  const s = getSession();
  if (s) await post("/auth/logout", { refreshToken: s.refreshToken }).catch(() => {});
  setSession(null);
};

/** Avisos fijos sobre el contenido: soporte (sesión de un técnico) y sin conexión. */
function Banners({ support, orgName, offline }: { support: boolean; orgName: string | undefined; offline: boolean }) {
  return (
    <>
      {support && (
        <p role="status" className="shrink-0 border-b border-trigo/40 bg-trigo/15 px-4 py-1.5 print:hidden text-center text-sm text-surco">
          {t("ui.supportBanner", { name: orgName ?? "" })}{" "}
          <button className="cursor-pointer font-medium underline underline-offset-4" onClick={exitSupport}>
            {t("ui.supportExit")}
          </button>
        </p>
      )}
      {offline && (
        <p role="status" className="shrink-0 border-b border-trigo/40 bg-trigo/15 px-4 py-1 text-center text-xs text-surco">
          {t("ui.offlineBanner")}
        </p>
      )}
    </>
  );
}

/** Barra superior fina: la pantalla es del mapa y los datos, no de la navegación. */
export function Layout() {
  const me = useMe();
  const searchRef = useRef<HTMLInputElement>(null);
  const offline = useSyncExternalStore(onNetworkChange, isNetworkDown);
  useSignedOutRedirect();
  useSearchShortcut(searchRef);
  // P-08: el dueño exige segundo factor y este administrador todavía no lo activó: no ve otra cosa hasta activarlo
  const mfaGate = useSyncExternalStore(onSession, () => getSession()?.mfaSetupRequired === true);
  const { nav, ctx } = useNavModel();
  const path = ctx.path;
  const onReports = ctx.onReports;
  const trial = me.data?.organization.plan === "trial" && me.data.organization.trialEndsAt;
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
  const linkWith = (cls: (active: boolean) => string, tab = false) => (n: NavItem) => (
    <NavLink key={n.to} n={n} ctx={ctx} cls={cls} tab={tab} />
  );

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
      {desktop && (
        <Sidebar hidden={sideHidden} onHidden={setSideHidden} nav={nav} searchRef={searchRef} renderLink={linkWith(sideCls)} account={account} />
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Banners support={!!me.data?.support} orgName={me.data?.organization.name} offline={offline} />
        <main id="main" tabIndex={-1} className="min-h-0 min-w-0 flex-1 overflow-auto outline-none print:overflow-visible">
          {mfaGate ? (
            <Page width="read">
              <h1 className="text-title leading-tight">{t("ui.totpSetupGateTitle")}</h1>
              <TotpSection forced />
            </Page>
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
              return n ? linkWith(tabCls, true)(n) : null;
            })}
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={sheet}
              onClick={() => setSheet(true)}
              className={`${tabCls(sheet || onReports)} cursor-pointer`}
            >
              <Ellipsis size={22} strokeWidth={1.75} aria-hidden />
              {t("ui.navMore")}
            </button>
          </nav>
          {sheet && (
            <MoreSheet onClose={() => setSheet(false)}>
              <GlobalSearch inputRef={searchRef} listClassName="min-w-0" />
              {nav.main.map((g) => (
                <NavSection key={g.id} group={g} render={linkWith(sheetCls)} />
              ))}
              {nav.bottom.length > 0 && (
                <div className="flex flex-col gap-0.5 border-t border-linea pt-3">{nav.bottom.map(linkWith(sheetCls))}</div>
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
