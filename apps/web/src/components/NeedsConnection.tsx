import { useState, useSyncExternalStore, type ComponentType } from "react";
import { WifiOff } from "lucide-react";
import { isNetworkDown, onNetworkChange } from "../lib/api";
import { t } from "../lib/i18n";

/** Lo que no tiene sentido sin conexión (ERP con montos, pagos, administración) avisa en vez de fallar. */
export function NeedsConnectionNotice({ message }: { message?: string }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 p-8 text-center" role="status">
      <WifiOff size={28} className="text-trigo-texto" aria-hidden />
      <h1 className="text-[22px] leading-tight">{t("offline.needsConnection")}</h1>
      <p className="text-sm text-tinta-2">{message ?? t("offline.needsConnectionPage")}</p>
    </div>
  );
}

/**
 * Pantalla que necesita conexión: si se entra sin conexión muestra el aviso (y se abre sola al volver la señal).
 * Si la conexión se corta con la pantalla ya abierta no la reemplaza, para no perder lo que se está escribiendo.
 */
export function requireConnection(Page: ComponentType<any>) {
  return function RequireConnection(props: any) {
    const down = useSyncExternalStore(onNetworkChange, isNetworkDown);
    const [enteredOffline] = useState(down);
    return enteredOffline && down ? <NeedsConnectionNotice /> : <Page {...props} />;
  };
}
