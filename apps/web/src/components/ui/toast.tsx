/** Avisos de texto efímeros. El estado vive fuera de React, así el aviso sigue corriendo aunque cambie la pantalla. */
import { useSyncExternalStore } from "react";

interface ToastItem {
  id: number;
  message: string;
  action?: { label: string; onClick: () => void };
}
interface ToastOpts {
  /** Duración en ms (3 s por defecto). */
  ms?: number;
  /** Botón de texto, por ejemplo "Deshacer". Al usarlo el aviso se cierra sin llamar a onExpire. */
  action?: { label: string; onClick: () => void };
  /** Se llama solo cuando el aviso termina por tiempo. */
  onExpire?: () => void;
}

let toasts: ToastItem[] = [];
let toastSeq = 0;
const toastListeners = new Set<() => void>();
const emitToasts = () => toastListeners.forEach((l) => l());

function dismissToast(id: number) {
  toasts = toasts.filter((x) => x.id !== id);
  emitToasts();
}

/** Aviso de texto abajo al centro. Vive fuera de React: sigue corriendo aunque la pantalla cambie. */
export function toast(message: string, opts: ToastOpts = {}): number {
  const id = ++toastSeq;
  const timer = setTimeout(() => {
    dismissToast(id);
    opts.onExpire?.();
  }, opts.ms ?? 3000);
  const action = opts.action && {
    label: opts.action.label,
    onClick: () => {
      clearTimeout(timer);
      dismissToast(id);
      opts.action!.onClick();
    },
  };
  toasts = [...toasts, { id, message, action }];
  emitToasts();
  return id;
}

const subscribeToasts = (cb: () => void) => {
  toastListeners.add(cb);
  return () => {
    toastListeners.delete(cb);
  };
};

/** Contenedor de los avisos; se monta una sola vez en la raíz de la aplicación. */
export function Toaster() {
  const list = useSyncExternalStore(subscribeToasts, () => toasts);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none print:hidden fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[60] lg:bottom-4 flex flex-col items-center gap-2 px-4"
    >
      {list.map((x) => (
        <div
          key={x.id}
          className="anim-toast pointer-events-auto flex items-center gap-4 rounded-md bg-surco px-4 py-2.5 text-sm text-lino"
        >
          <span>{x.message}</span>
          {x.action && (
            <button
              className="cursor-pointer font-medium underline underline-offset-4 hover:text-trigo"
              onClick={x.action.onClick}
            >
              {x.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
