/** Diálogos modales accesibles: foco atrapado, cierre con Escape y confirmación. */
import { Button } from "./Button";
import { ErrorBox } from "./feedback";
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { t } from "../../lib/i18n";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Lo que el diálogo les ofrece a sus hijos (el pie de un formulario, por ejemplo). */
const ModalContext = createContext<{ close: () => void; footerEl: HTMLElement | null } | null>(null);

/** Cierra el diálogo actual con la animación de salida; `null` fuera de un `Modal`. */
const useModalClose = () => useContext(ModalContext)?.close ?? null;

/** Contenedor del pie fijo del `Modal` actual (`null` fuera de un diálogo o antes de montarse). */
export const useModalFooter = () => useContext(ModalContext)?.footerEl ?? null;

/** Verdadero dentro de un `Modal`. */
export const useInModal = () => useContext(ModalContext) !== null;

/** Milisegundos de la animación de salida (igual a --dur-exit). */
const EXIT_MS = 120;

/**
 * Diálogo accesible: al abrir pasa el foco al primer campo (o al diálogo), Tab queda dentro,
 * Escape cierra y al cerrar el foco vuelve a lo que lo abrió. Entra con fundido y escala (o sube como hoja en el
 * celular) y sale más rápido. Estructura: título fijo arriba, cuerpo con desplazamiento y pie fijo abajo.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  sheet = true,
  size = "md",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Pie fijo debajo del cuerpo (Cancelar y la acción principal). Los formularios usan `FormFooter` dentro del `Form`. */
  footer?: ReactNode;
  /** En el celular sube desde abajo como una hoja. */
  sheet?: boolean;
  /** Ancho máximo: "md" (32 rem) o "lg" (44 rem). */
  size?: "md" | "lg";
}) {
  const box = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const close = useRef(onClose);
  close.current = onClose;
  const [closing, setClosing] = useState(false);
  const [footerEl, setFooterEl] = useState<HTMLElement | null>(null);
  const closingRef = useRef(false);
  // Cierra con la animación de salida; un segundo pedido mientras sale se ignora
  const requestClose = useRef(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setTimeout(() => close.current(), EXIT_MS);
  }).current;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const el = box.current;
    // Primer campo del formulario; si no hay (confirmaciones), el propio diálogo, para no enfocar una acción destructiva
    const field = el?.querySelector<HTMLElement>(".modal-body :is(input,select,textarea):not([disabled]):not([type=\"hidden\"])");
    (field ?? el)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        requestClose();
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
    <ModalContext.Provider value={{ close: requestClose, footerEl }}>
      <div
        className={`fixed inset-0 z-50 flex justify-center bg-surco/55 backdrop-blur-[2px] ${closing ? "anim-fade-out" : "anim-fade"} ${sheet ? "items-end p-0 sm:items-center sm:p-4" : "items-center p-4"}`}
        onClick={requestClose}
      >
        <div
          ref={box}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={`flex max-h-[92dvh] w-full flex-col overflow-hidden bg-lino shadow-xl outline-none sm:max-h-[90dvh] ${size === "lg" ? "max-w-2xl" : "max-w-lg"} ${
            sheet ? `rounded-t-xl sm:rounded-xl ${closing ? "anim-sheet-out sm:anim-pop-out" : "anim-sheet sm:anim-pop"}` : `rounded-xl ${closing ? "anim-pop-out" : "anim-pop"}`
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-linea py-1.5 pr-2 pl-5">
            <h2 id={titleId} className="min-w-0 font-serif text-xl leading-7 font-semibold">
              {title}
            </h2>
            <button
              type="button"
              aria-label={t("ui.common.close")}
              className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-tinta-2 hover:bg-surco/5 hover:text-surco"
              onClick={requestClose}
            >
              <X size={18} aria-hidden />
            </button>
          </div>
          <div className="modal-body min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">{children}</div>
          {/* Pie fijo: lo llena `footer` o, en un formulario, su `FormFooter` por portal */}
          <div ref={setFooterEl} className="flex shrink-0 items-center justify-end gap-2 border-t border-linea bg-lino px-5 py-3 empty:hidden">
            {footer}
          </div>
        </div>
      </div>
    </ModalContext.Provider>
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
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <CancelButton />
          <Button variant="danger" onClick={onConfirm} disabled={pending}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-body">{message}</p>
      {error ? (
        <div className="mt-3">
          <ErrorBox error={error} />
        </div>
      ) : null}
    </Modal>
  );
}

/** Botón "Cancelar" de un diálogo: cierra el `Modal` que lo contiene (con su animación de salida). */
export function CancelButton({ onClick, label }: { onClick?: () => void; /** Texto del botón (por defecto "Cancelar"). */ label?: string }) {
  const close = useModalClose();
  return (
    <Button variant="secondary" onClick={onClick ?? close ?? undefined}>
      {label ?? t("ui.common.cancel")}
    </Button>
  );
}
