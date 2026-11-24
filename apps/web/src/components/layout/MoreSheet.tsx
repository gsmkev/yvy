import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { t } from "../../lib/i18n";
import type { NavGroup, NavItem } from "../../lib/nav";

/** Grupo de la navegación: rótulo y sus ítems, siempre a la vista. */
export function NavSection({ group, render }: { group: NavGroup; render: (n: NavItem) => React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      {group.label && <p className="px-3 pb-0.5 text-meta font-medium text-tinta-2">{t(group.label)}</p>}
      {group.items.map(render)}
    </div>
  );
}

/** Hoja inferior del celular con el resto de la navegación. Escape cierra, Tab queda adentro, el foco vuelve a "Más". */
export function MoreSheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const el = box.current;
    el?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      else if (e.key === "Tab" && el) {
        const items = Array.from(el.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),input:not([disabled])"));
        const first = items[0];
        const last = items[items.length - 1];
        if (!first || !last) return;
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
    <div className="anim-fade fixed inset-0 z-50 flex items-end bg-surco/55 print:hidden" onClick={onClose}>
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={t("ui.navMore")}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="anim-sheet flex max-h-[85vh] w-full flex-col gap-3 overflow-y-auto rounded-t-xl bg-lino p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] outline-none"
      >
        <button
          type="button"
          aria-label={t("ui.close")}
          onClick={onClose}
          className="flex h-12 w-12 cursor-pointer items-center justify-center self-end rounded-md text-tinta-2 hover:bg-surco/5"
        >
          <X size={20} aria-hidden />
        </button>
        {children}
      </div>
    </div>
  );
}


