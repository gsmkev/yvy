import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { AlertTriangle, CircleAlert, X, type LucideIcon } from "lucide-react";
import { t, tk } from "../lib/i18n";
import { displayToIso, isoToDisplay, maskDate } from "../lib/dateInput";

type Variant = "primary" | "secondary" | "quiet" | "danger";

const VARIANT: Record<Variant, string> = {
  primary: "bg-accion text-sobre hover:bg-accion-2 border border-accion",
  secondary: "bg-papel text-surco border border-linea hover:border-tinta-2/40 hover:bg-lino",
  quiet: "text-tinta-2 hover:text-surco hover:bg-surco/5 border border-transparent",
  danger: "bg-papel text-peligro border border-peligro/40 hover:bg-peligro hover:text-sobre",
};

export function Button({
  variant = "secondary",
  icon: Icon,
  className = "",
  children,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: LucideIcon }) {
  return (
    <button
      type="button"
      {...p}
      className={`inline-flex h-10 cursor-pointer print:hidden items-center justify-center gap-2 rounded-md px-3.5 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45 ${VARIANT[variant]} ${className}`}
    >
      {/* Ícono solo en botones sin texto: con texto, el texto alcanza */}
      {Icon && !children && <Icon size={16} strokeWidth={2} aria-hidden />}
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-tinta-2">{hint}</span>}
    </label>
  );
}

const inputCls =
  "h-10 rounded-md border border-linea bg-papel px-3 text-[15px] outline-none transition-colors placeholder:text-tinta-2/60 focus:border-accion focus:ring-2 focus:ring-accion/20";

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) =>
  p.type === "date" ? (
    <DateInput {...p} value={String(p.value ?? "")} />
  ) : (
    <input {...p} className={`${inputCls} ${p.className ?? ""}`} />
  );

/**
 * Fecha en dd/mm/aaaa (el campo nativo muestra mm/dd/yyyy según el navegador). El valor es siempre ISO (aaaa-mm-dd),
 * como el de `<input type="date">`: `Input type="date"` usa este componente, así que los formularios no cambian.
 * Mientras la fecha esté incompleta o no exista, el valor es "" y el campo queda inválido (avisa al enviar).
 */
export function DateInput({
  value,
  onChange,
  onValueChange,
  min,
  max,
  className = "",
  type: _type,
  ...p
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value"> & {
  value?: string;
  /** Recibe la fecha ISO ("" si no es válida). */
  onValueChange?: (iso: string) => void;
}) {
  const [text, setText] = useState(isoToDisplay(value ?? ""));
  const ref = useRef<HTMLInputElement>(null);
  // Un valor que cambia desde afuera (limpiar el formulario, cargar un registro) reemplaza lo escrito
  useEffect(() => {
    if ((value ?? "") !== (displayToIso(text) ?? "")) setText(isoToDisplay(value ?? ""));
  }, [value]);
  const iso = displayToIso(text);
  const range = iso && ((min && iso < String(min)) || (max && iso > String(max)));
  useEffect(() => {
    ref.current?.setCustomValidity(text && !iso ? t("ui.dateInvalid") : range ? t("ui.dateOutOfRange") : "");
  }, [text, iso, range]);
  return (
    <input
      {...p}
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={t("ui.datePlaceholder")}
      maxLength={10}
      size={10}
      value={text}
      onChange={(e) => {
        const next = maskDate(e.target.value);
        setText(next);
        const v = displayToIso(next) ?? "";
        if (v === (value ?? "")) return;
        onValueChange?.(v);
        // Los formularios leen e.target.value: se entrega el mismo evento con la fecha ISO
        const target = { value: v, name: e.target.name, id: e.target.id } as HTMLInputElement;
        onChange?.({ ...e, target, currentTarget: target });
      }}
      className={`${inputCls} min-w-0 !px-2.5 !text-sm ${className}`}
    />
  );
}

export const Select = ({
  options,
  ...p
}: SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) => (
  <select {...p} className={`${inputCls} cursor-pointer pr-8 ${p.className ?? ""}`}>
    {options.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </select>
);

/** Superficie con borde fino. Sin sombras: la jerarquía la dan el espacio y la tipografía. */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-linea bg-papel p-4 ${className}`}>{children}</div>;
}

export function SectionHead({ title, count, action }: { title: string; count?: number | string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 border-b border-linea pb-2">
      <h2 className="eyebrow">
        {title}
        {count !== undefined && <span className="ml-1.5 text-surco">{count}</span>}
      </h2>
      {action}
    </div>
  );
}

export function Stat({
  label,
  value,
  unit,
  note,
  tone,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  note?: ReactNode;
  tone?: "danger";
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="eyebrow">{label}</span>
      <span
        className={`num font-serif text-[28px] leading-tight font-semibold ${tone === "danger" ? "text-peligro" : ""}`}
      >
        {value}
        {unit && <span className="ml-1 text-sm text-tinta-2">{unit}</span>}
      </span>
      {note && <span className="text-xs text-tinta-2">{note}</span>}
    </div>
  );
}

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
      className={`fixed inset-0 z-50 flex justify-center bg-surco/55 backdrop-blur-[2px] ${sheet ? "items-end p-0 sm:items-center sm:p-4" : "items-center p-4"}`}
      onClick={onClose}
    >
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`max-h-[90vh] w-full max-w-lg overflow-auto bg-lino shadow-xl outline-none ${sheet ? "rounded-t-xl sm:rounded-xl" : "rounded-xl"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-linea bg-lino px-5 py-3.5">
          <h2 id={titleId} className="font-serif text-xl font-semibold">
            {title}
          </h2>
          <button
            aria-label={t("ui.close")}
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
      <p className="text-[15px]">{message}</p>
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
          {t("ui.cancel")}
        </Button>
      </div>
    </Modal>
  );
}

/**
 * Marcador de carga con alturas fijas (U-19): reserva el alto que va a ocupar el contenido real
 * para que al llegar los datos la página no salte. `rows` y `h` (px) se ajustan a cada lista.
 */
export const Spinner = ({ rows = 3, h = 48 }: { rows?: number; h?: number }) => (
  <div className="flex flex-col gap-2 p-1" aria-busy="true" aria-label={t("ui.loading")}>
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="animate-pulse rounded-md bg-surco/[0.06]" style={{ height: h }} />
    ))}
  </div>
);

/** Un bloque de carga de alto fijo (px). */
export const Skeleton = ({ h, className = "" }: { h: number; className?: string }) => (
  <div aria-hidden className={`animate-pulse rounded-md bg-surco/[0.06] ${className}`} style={{ height: h }} />
);

export function Empty({
  title,
  children,
}: {
  /** Se acepta por compatibilidad; los vacíos no llevan ícono decorativo. */
  icon?: LucideIcon;
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-1.5 py-6 text-sm text-tinta-2">
      {title && <p className="font-medium text-surco">{title}</p>}
      {children}
    </div>
  );
}

export const ErrorBox = ({ error }: { error: unknown }) => (
  <div role="alert" className="flex gap-2 rounded-md border border-peligro/30 bg-peligro/5 p-3 text-sm text-peligro">
    <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
    {t("ui.error", { message: error instanceof Error ? error.message : String(error) })}
  </div>
);

const SEV = {
  info: "border-cielo text-surco bg-cielo/15",
  watch: "border-trigo text-trigo-texto bg-trigo/15",
  warning: "border-peligro bg-peligro text-sobre",
} as const;

/** Severidad siempre con ícono + texto, nunca solo color. */
export function SeverityBadge({ severity }: { severity: keyof typeof SEV }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-xs font-semibold ${SEV[severity]}`}
    >
      <AlertTriangle size={12} aria-hidden />
      {tk(`ui.severity_${severity}`)}
    </span>
  );
}

// ---------- Avisos breves (toast) ----------

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

export function dismissToast(id: number) {
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
          className="pointer-events-auto flex items-center gap-4 rounded-md bg-surco px-4 py-2.5 text-sm text-lino"
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

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  // Si no entran, se desplazan de costado y el borde que tiene más pestañas se desvanece
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () =>
      setEdge({ left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 });
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro?.disconnect();
    };
  }, [tabs.length]);
  // La pestaña activa siempre queda a la vista
  useEffect(() => {
    document.getElementById(`tab-${value}`)?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  }, [value]);
  const fade = (on: boolean) => (on ? "transparent 0, #000 28px" : "#000 0, #000 0");
  const fadeEnd = (on: boolean) => (on ? "#000 calc(100% - 28px), transparent 100%" : "#000 100%, #000 100%");
  const mask = `linear-gradient(to right, ${fade(edge.left)}, ${fadeEnd(edge.right)})`;
  return (
    <div
      ref={scroller}
      role="tablist"
      style={edge.left || edge.right ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
      className="flex shrink-0 gap-5 overflow-x-auto border-b border-linea [scrollbar-width:none] print:hidden [&::-webkit-scrollbar]:hidden"
      onKeyDown={(e) => {
        // Flechas, Inicio y Fin pasan de una pestaña a otra
        const i = tabs.findIndex((x) => x.id === value);
        const to =
          e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
        if (to === null) return;
        e.preventDefault();
        const next = tabs[(to + tabs.length) % tabs.length]!;
        onChange(next.id);
        setTimeout(() => document.getElementById(`tab-${next.id}`)?.focus(), 0);
      }}
    >
      {tabs.map((tb) => (
        <button
          key={tb.id}
          id={`tab-${tb.id}`}
          role="tab"
          tabIndex={value === tb.id ? 0 : -1}
          aria-selected={value === tb.id}
          onClick={() => onChange(tb.id)}
          className={`-mb-px inline-flex h-10 shrink-0 cursor-pointer items-center border-b-2 text-sm font-medium whitespace-nowrap transition-colors ${value === tb.id ? "border-surco text-surco" : "border-transparent text-tinta-2 hover:text-surco"}`}
        >
          {tb.label}
          {tb.count !== undefined && <span className="num ml-1.5 text-xs text-tinta-2">{tb.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Encabezado de página: título en una línea (truncado, completo en el tooltip), un primario y un menú. */
export function PageHeader({
  title,
  titleAction,
  primary,
  menu,
  stacked = false,
  className = "",
}: {
  title: string;
  /** Junto al título: por ejemplo el menú para cambiar de estancia. */
  titleAction?: ReactNode;
  /** La acción principal de la pantalla: un solo botón relleno. */
  primary?: ReactNode;
  /** Lo demás: `ActionMenu` y `ExportMenu`. */
  menu?: ReactNode;
  /** Las acciones van debajo del título (paneles angostos, donde no entran al lado). */
  stacked?: boolean;
  className?: string;
}) {
  const actions = (primary || menu) && (
    <div className="flex shrink-0 items-center gap-2 print:hidden">
      {primary}
      {menu}
    </div>
  );
  return (
    <header className={`flex min-w-0 gap-3 ${stacked ? "flex-col items-stretch" : "items-center"} ${className}`}>
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <h1 title={title} className="min-w-0 truncate text-[28px] leading-8">
          {title}
        </h1>
        {titleAction && <div className="shrink-0 print:hidden">{titleAction}</div>}
      </div>
      {actions}
    </header>
  );
}

/** Vacío con salida: qué es esta sección y la acción para empezar. */
export function EmptyState({
  title,
  children,
  action,
  className = "",
}: {
  title: string;
  /** Una o dos líneas que explican para qué sirve. */
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-start gap-3 rounded-lg border border-dashed border-linea p-5 ${className}`}>
      <div className="flex flex-col gap-1">
        <p className="text-[18px] leading-6 font-medium text-surco">{title}</p>
        {children && <div className="text-sm text-tinta-2">{children}</div>}
      </div>
      {action}
    </div>
  );
}
