/** Menú de cuenta de la barra: acceso a Cuenta, Preferencias, Ayuda y Salir, y cambio de organización. */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { getSession, onSession, post, setSession, type Session } from "../lib/api";
import { t, tk } from "../lib/i18n";

/** Organizaciones del usuario según la sesión guardada. */
export const useOrganizations = () =>
  useSyncExternalStore(
    (cb) => onSession(cb),
    () => getSession(),
  )?.organizations ?? [];

/** Pasos de teclado del menú: tecla a índice destino dentro de la lista de ítems. */
const MENU_KEY_TARGET: Record<string, (i: number, n: number) => number> = {
  ArrowDown: (i, n) => (i + 1) % n,
  ArrowUp: (i, n) => (i - 1 + n) % n,
  Home: () => 0,
  End: (_i, n) => n - 1,
};

/** Estado y comportamiento del menú: apertura, foco, teclado y cambio de organización. */
function useAccountMenu() {
  const current = useSyncExternalStore(
    (cb) => onSession(cb),
    () => getSession(),
  )?.organization.id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };
  const items = () => Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);

  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key === "Tab") return setOpen(false);
    if (e.key === "Escape") {
      e.preventDefault();
      return close();
    }
    const target = MENU_KEY_TARGET[e.key];
    if (!target) return;
    e.preventDefault();
    const list = items();
    list[target(list.indexOf(document.activeElement as HTMLElement), list.length)]?.focus();
  };

  const choose = async (id: string) => {
    if (id === current) return close();
    setBusy(id);
    setError(false);
    try {
      const s = await post<Session>("/auth/switch", { organizationId: id, deviceId: "web" });
      setSession(s);
      // Todo lo cacheado era de la otra organización
      qc.clear();
      close(false);
      navigate({ to: "/" });
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  };
  return { current, open, setOpen, busy, error, box, trigger, menu, close, onMenuKey, choose };
}

const itemCls =
  "block min-h-12 w-full cursor-pointer border-b border-linea px-3 py-3 text-left lg:min-h-10 lg:py-2 text-sm hover:bg-surco/[0.05] focus-visible:bg-surco/[0.05] last:border-0";

/** Bloque de cambio de organización, solo si el usuario pertenece a más de una. */
function OrgSwitcher({ m }: { m: ReturnType<typeof useAccountMenu> }) {
  const orgs = useOrganizations();
  const { current, busy, error, choose } = m;
  if (orgs.length <= 1) return null;
  return (
    <>
      <p className="px-3 pt-3 pb-1 text-xs text-tinta-2">{t("ui.org.switch")}</p>
      {orgs.map((o) => (
        <button
          key={o.id}
          role="menuitem"
          type="button"
          disabled={!!busy}
          onClick={() => choose(o.id)}
          className={`${itemCls} disabled:cursor-wait`}
        >
          <span className={`block ${o.id === current ? "font-semibold" : "font-medium"}`}>{o.name}</span>
          <span className="block text-xs text-tinta-2">
            {busy === o.id ? t("ui.org.switching") : o.id === current ? t("ui.org.current") : tk(`ui.role.${o.role}`)}
          </span>
        </button>
      ))}
      {error && (
        <p role="alert" className="px-3 py-2 text-sm text-peligro">
          {t("ui.org.switchFailed")}
        </p>
      )}
      <div className="border-t border-linea" role="separator" />
    </>
  );
}

/**
 * Menú de cuenta: el bloque organización + usuario abre Cuenta, Preferencias, Ayuda y Salir.
 * Si el usuario pertenece a más de una organización, también permite cambiar de una a otra.
 * Teclado: Enter/Espacio/↓ abren, ↑↓ Inicio Fin recorren, Escape cierra y devuelve el foco al botón.
 */
export function AccountMenu({
  name,
  sub,
  onLogout,
}: {
  name?: string;
  sub?: string | null;
  onLogout: () => void;
}) {
  // Al pie de la barra lateral: el menú se abre hacia arriba
  const m = useAccountMenu();
  const { open, setOpen, box, trigger, menu, close, onMenuKey } = m;
  return (
    <div ref={box} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("ui.account.menu")}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="flex min-h-12 w-full cursor-pointer flex-col justify-center rounded-md px-3 text-left text-sm leading-tight hover:bg-surco/[0.05] lg:min-h-10"
      >
        <span className="block truncate font-medium">{name}</span>
        {sub && <span className="truncate text-xs text-tinta-2">{sub}</span>}
      </button>
      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label={t("ui.account.menu")}
          onKeyDown={onMenuKey}
          className="anim-pop absolute bottom-full left-0 z-50 mb-2 w-64 max-w-[calc(100vw-2rem)] rounded-md border border-linea bg-papel shadow-lg"
        >
          <OrgSwitcher m={m} />
          <Link to="/cuenta" role="menuitem" className={itemCls} onClick={() => close(false)}>
            {t("ui.common.account")}
          </Link>
          <Link to="/cuenta" hash="preferencias" role="menuitem" className={itemCls} onClick={() => close(false)}>
            {t("ui.common.preferences")}
          </Link>
          <Link to="/ayuda" role="menuitem" className={itemCls} onClick={() => close(false)}>
            {t("ui.help.link")}
          </Link>
          <button
            type="button"
            role="menuitem"
            className={itemCls}
            onClick={() => {
              close(false);
              onLogout();
            }}
          >
            {t("ui.common.logout")}
          </button>
        </div>
      )}
    </div>
  );
}
