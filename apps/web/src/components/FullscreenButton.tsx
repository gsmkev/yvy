import { useEffect, useState, type RefObject } from "react";
import { t } from "../lib/i18n";

/** Pantalla completa del contenedor del mapa (U-15). Oculto si el navegador no la soporta. */
export function FullscreenButton({
  target,
  className = "",
}: {
  target: RefObject<HTMLElement | null>;
  className?: string;
}) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(document.fullscreenElement === target.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, [target]);
  if (typeof document === "undefined" || !document.fullscreenEnabled) return null;
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void target.current?.requestFullscreen().catch(() => {});
  };
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={toggle}
      className={`cursor-pointer rounded-md border border-white/15 bg-surco/85 px-3 py-1.5 text-xs font-medium text-lino backdrop-blur hover:bg-surco ${className}`}
    >
      {on ? t("ui.fullscreenExit") : t("ui.fullscreen")}
    </button>
  );
}
