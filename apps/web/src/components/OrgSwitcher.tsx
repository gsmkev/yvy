import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { getSession, onSession, post, setSession, type Session } from "../lib/api";
import { t, tk } from "../lib/i18n";

/** Organizaciones del usuario según la sesión guardada. */
export const useOrganizations = () =>
  useSyncExternalStore(
    (cb) => onSession(cb),
    () => getSession(),
  )?.organizations ?? [];

/** Nombre de la organización; si el usuario pertenece a más de una, se vuelve un menú para cambiar. */
export function OrgSwitcher({ name, sub }: { name?: string; sub?: string | null }) {
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

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const head = (
    <>
      <p className="font-medium">{name}</p>
      {sub && <p className="text-xs text-tinta-2">{sub}</p>}
    </>
  );
  if (orgs.length < 2) return <div className="hidden text-right text-sm leading-tight md:block">{head}</div>;

  const choose = async (id: string) => {
    if (id === current) return setOpen(false);
    setBusy(id);
    setError(false);
    try {
      const s = await post<Session>("/auth/switch", { organizationId: id, deviceId: "web" });
      setSession(s);
      // Todo lo cacheado era de la otra organización
      qc.clear();
      setOpen(false);
      navigate({ to: "/" });
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div ref={box} className="relative hidden md:block">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("ui.orgSwitch")}
        onClick={() => setOpen(!open)}
        className="cursor-pointer text-right text-sm leading-tight underline-offset-4 hover:underline"
      >
        {head}
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute top-full right-0 z-30 mt-2 w-64 rounded-md border border-linea bg-papel"
        >
          <p className="px-3 pt-3 pb-1 text-xs text-tinta-2">{t("ui.orgSwitch")}</p>
          <ul>
            {orgs.map((o) => (
              <li
                key={o.id}
                role="option"
                aria-selected={o.id === current}
                className="border-b border-linea last:border-0"
              >
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => choose(o.id)}
                  className="flex w-full cursor-pointer flex-col px-3 py-2 text-left hover:bg-surco/[0.05] disabled:cursor-wait"
                >
                  <span className={`text-sm ${o.id === current ? "font-semibold" : "font-medium"}`}>{o.name}</span>
                  <span className="text-xs text-tinta-2">
                    {busy === o.id
                      ? t("ui.orgSwitching")
                      : o.id === current
                        ? t("ui.orgCurrent")
                        : tk(`ui.role_${o.role}`)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {error && (
            <p role="alert" className="px-3 py-2 text-sm text-peligro">
              {t("ui.orgSwitchFailed")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
