/** Barra lateral de escritorio, completa o plegada. */
import type { ReactNode, RefObject } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { t } from "../../lib/i18n";
import type { buildNav } from "../../lib/nav";
import { GlobalSearch } from "../GlobalSearch";
import { NavSection } from "./MoreSheet";

const RAIL_BTN = "flex h-10 w-10 cursor-pointer items-center justify-center rounded-md text-tinta-2 hover:bg-surco/5 hover:text-surco";

/** Barra lateral de escritorio: completa o plegada a un riel con el botón de mostrarla. */
export function Sidebar({
  hidden,
  onHidden,
  nav,
  searchRef,
  renderLink,
  account,
}: {
  hidden: boolean;
  onHidden: (v: boolean) => void;
  nav: ReturnType<typeof buildNav>;
  searchRef: RefObject<HTMLInputElement | null>;
  renderLink: (n: ReturnType<typeof buildNav>["bottom"][number]) => ReactNode;
  account: ReactNode;
}) {
  if (hidden)
    return (
      <div className="flex w-12 shrink-0 flex-col items-center gap-3 border-r border-linea bg-lino py-3 print:hidden">
        <button type="button" aria-label={t("ui.nav.show")} title={t("ui.nav.show")} onClick={() => onHidden(false)} className={RAIL_BTN}>
          <PanelLeftOpen size={18} aria-hidden />
        </button>
      </div>
    );
  return (
    <aside className="relative z-20 flex w-60 shrink-0 flex-col border-r border-linea bg-lino print:hidden">
      <div className="flex h-14 shrink-0 items-center justify-between pr-2 pl-4">
        <Link to="/" className="font-serif text-[22px] leading-none font-semibold tracking-tight">
          {t("ui.app.name")}
        </Link>
        <button type="button" aria-label={t("ui.nav.hide")} title={t("ui.nav.hide")} onClick={() => onHidden(true)} className={RAIL_BTN}>
          <PanelLeftClose size={18} aria-hidden />
        </button>
      </div>
      <div className="px-3 pb-3">
        <GlobalSearch inputRef={searchRef} />
      </div>
      <nav aria-label={t("ui.nav.main")} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3">
        {nav.main.map((g) => (
          <NavSection key={g.id} group={g} render={renderLink} />
        ))}
        {nav.bottom.length > 0 && (
          <div className="mt-auto flex flex-col gap-0.5 border-t border-linea pt-3">{nav.bottom.map(renderLink)}</div>
        )}
      </nav>
      <div className="shrink-0 border-t border-linea p-3">{account}</div>
    </aside>
  );
}
