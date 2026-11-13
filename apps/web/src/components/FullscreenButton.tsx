import { useEffect, useState, type RefObject } from "react";
import { Maximize, Minimize } from "lucide-react";
import { t } from "../lib/i18n";

/** Pantalla completa del contenedor del mapa (U-15), como botón de ícono de la barra. Oculto si el navegador no la soporta. */
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
  const label = on ? t("ui.fullscreenExit") : t("ui.fullscreen");
  return (
    <button type="button" aria-pressed={on} aria-label={label} title={label} onClick={toggle} className={className}>
      {on ? <Minimize size={18} aria-hidden /> : <Maximize size={18} aria-hidden />}
    </button>
  );
}
