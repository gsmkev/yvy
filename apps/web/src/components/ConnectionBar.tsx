import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";
import { isNetworkDown, offlineSavedAt, onNetworkChange } from "../lib/api";
import { fmtDateTime } from "../lib/format";
import { t } from "../lib/i18n";

/** Indicador global y discreto: "Sin conexión · mostrando lo guardado el …". No aparece con conexión. */
export function ConnectionBar() {
  const offline = useSyncExternalStore(onNetworkChange, isNetworkDown);
  const savedAt = useSyncExternalStore(onNetworkChange, offlineSavedAt);
  if (!offline) return null;
  return (
    <p
      role="status"
      className="flex shrink-0 items-center justify-center gap-2 border-b border-trigo/40 bg-trigo/15 px-4 py-1 text-center text-xs text-surco print:hidden"
    >
      <WifiOff size={13} aria-hidden className="shrink-0" />
      <span>
        {savedAt ? t("offline.barSaved", { date: fmtDateTime(savedAt) }) : t("offline.barNoDate")}
      </span>
    </p>
  );
}
