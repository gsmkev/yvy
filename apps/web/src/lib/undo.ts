/**
 * Borrado con "Deshacer": el pedido DELETE se demora hasta que el aviso vence (6 s).
 * Si la persona toca "Deshacer" no se manda nada. El estado vive fuera de React para que siga
 * corriendo aunque la pantalla cambie.
 */
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { toast } from "../components/ui";
import { t } from "./i18n";

export const UNDO_MS = 6000;

const pending = new Set<string>();

/** Las consultas descartan estos ids para que un refetch no los muestre mientras dura el aviso. */
export const isPendingDelete = (id: string) => pending.has(id);

export function deleteWithUndo({
  qc,
  id,
  message,
  hide,
  request,
  invalidate,
}: {
  qc: QueryClient;
  id: string;
  message: string;
  /** Saca el elemento de la caché ya mismo. */
  hide: () => void;
  /** El pedido real; solo corre si el aviso vence sin deshacer. */
  request: () => Promise<unknown>;
  invalidate: QueryKey[];
}) {
  const refresh = () => invalidate.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
  pending.add(id);
  hide();
  toast(message, {
    ms: UNDO_MS,
    action: {
      label: t("ui.undo"),
      onClick: () => {
        pending.delete(id);
        refresh();
      },
    },
    onExpire: () => {
      request()
        .catch((e: unknown) => toast(t("ui.error", { message: e instanceof Error ? e.message : String(e) })))
        .finally(() => {
          pending.delete(id);
          refresh();
        });
    },
  });
}
