import { useState, useSyncExternalStore } from "react";
import { applyUpdate, onUpdateAvailable, updateAvailable } from "../lib/pwa";
import { t } from "../lib/i18n";

/** "Hay una versión nueva · Actualizar": la versión descargada espera hasta que la persona decide. */
export function PwaUpdate() {
  const available = useSyncExternalStore(onUpdateAvailable, updateAvailable);
  const [hidden, setHidden] = useState(false);
  if (!available || hidden) return null;
  return (
    <div
      role="status"
      className="pointer-events-none print:hidden fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[70] flex justify-center px-4 lg:bottom-16"
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-md bg-surco px-4 py-2.5 text-sm text-lino">
        <span>{t("offline.updateAvailable")}</span>
        <span aria-hidden>·</span>
        <button className="cursor-pointer font-medium underline underline-offset-4 hover:text-trigo" onClick={applyUpdate}>
          {t("offline.updateAction")}
        </button>
        <button
          className="cursor-pointer text-lino/70 hover:text-lino"
          onClick={() => setHidden(true)}
          aria-label={t("offline.updateLater")}
        >
          {t("offline.updateLater")}
        </button>
      </div>
    </div>
  );
}
