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

/**
 * Menú de cuenta (U-30): el bloque organización + usuario abre Cuenta, Preferencias, Ayuda y Salir.
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
  const orgs = useOrganizations();
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
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      list[(i + 1) % list.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      list[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      list[list.length - 1]?.focus();
    } else if (e.key === "Tab") setOpen(false);
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

  const itemCls =
    "block min-h-12 w-full cursor-pointer border-b border-linea px-3 py-3 text-left lg:min-h-10 lg:py-2 text-sm hover:bg-surco/[0.05] focus-visible:bg-surco/[0.05] last:border-0";

  return (
    <div ref={box} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("ui.accountMenu")}
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
          aria-label={t("ui.accountMenu")}
          onKeyDown={onMenuKey}
          className="absolute bottom-full left-0 z-50 mb-2 w-64 max-w-[calc(100vw-2rem)] rounded-md border border-linea bg-papel shadow-lg"
        >
          {orgs.length > 1 && (
            <>
              <p className="px-3 pt-3 pb-1 text-xs text-tinta-2">{t("ui.orgSwitch")}</p>
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
                    {busy === o.id
                      ? t("ui.orgSwitching")
                      : o.id === current
                        ? t("ui.orgCurrent")
                        : tk(`ui.role_${o.role}`)}
                  </span>
                </button>
              ))}
              {error && (
                <p role="alert" className="px-3 py-2 text-sm text-peligro">
                  {t("ui.orgSwitchFailed")}
                </p>
              )}
              <div className="border-t border-linea" role="separator" />
            </>
          )}
          <Link to="/cuenta" role="menuitem" className={itemCls} onClick={() => close(false)}>
            {t("ui.account")}
          </Link>
          <Link to="/cuenta" hash="preferencias" role="menuitem" className={itemCls} onClick={() => close(false)}>
            {t("ui.preferences")}
          </Link>
          <Link to="/ayuda" role="menuitem" className={itemCls} onClick={() => close(false)}>
            {t("ui.helpLink")}
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
            {t("ui.logout")}
          </button>
        </div>
      )}
    </div>
  );
}
