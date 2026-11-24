import { Button } from "./Button";
import { ErrorBox } from "./feedback";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { t } from "../../lib/i18n";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Diálogo accesible (U-26): al abrir pasa el foco al primer campo (o al diálogo), Tab queda dentro,
 * Escape cierra y al cerrar el foco vuelve a lo que lo abrió.
 */
export function Modal({
  title,
  onClose,
  children,
  sheet = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** En el celular sube desde abajo como una hoja. */
  sheet?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const el = box.current;
    // Primer campo del formulario; si no hay (confirmaciones), el propio diálogo, para no enfocar una acción destructiva
    const field = el?.querySelector<HTMLElement>(".modal-body :is(input,select,textarea):not([disabled]):not([type=\"hidden\"])");
    (field ?? el)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current();
      } else if (e.key === "Tab" && el) {
        const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (!items.length) return e.preventDefault();
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (before && document.contains(before)) before.focus();
    };
  }, []);
  return (
    <div
      className={`fixed inset-0 z-50 anim-fade flex justify-center bg-surco/55 backdrop-blur-[2px] ${sheet ? "items-end p-0 sm:items-center sm:p-4" : "items-center p-4"}`}
      onClick={onClose}
    >
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`max-h-[90vh] w-full max-w-lg overflow-auto bg-lino shadow-xl outline-none ${sheet ? "anim-sheet rounded-t-xl sm:anim-pop sm:rounded-xl" : "anim-pop rounded-xl"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-linea bg-lino px-5 py-3.5">
          <h2 id={titleId} className="font-serif text-xl font-semibold">
            {title}
          </h2>
          <button
            aria-label={t("ui.common.close")}
            className="cursor-pointer rounded p-1.5 text-tinta-2 hover:bg-surco/5 hover:text-surco"
            onClick={onClose}
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="modal-body p-5">{children}</div>
      </div>
    </div>
  );
}

/** Confirmación de una acción destructiva (reemplaza a window.confirm). */
export function ConfirmModal({
  title,
  message,
  confirmLabel,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  pending?: boolean;
  error?: unknown;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-body">{message}</p>
      {error ? (
        <div className="mt-3">
          <ErrorBox error={error} />
        </div>
      ) : null}
      <div className="mt-5 flex gap-2">
        <Button variant="danger" onClick={onConfirm} disabled={pending}>
          {confirmLabel}
        </Button>
        <Button variant="quiet" onClick={onClose}>
          {t("ui.common.cancel")}
        </Button>
      </div>
    </Modal>
  );
}
