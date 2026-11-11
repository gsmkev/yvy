import { useEffect, useRef, useState } from "react";
import { t } from "../lib/i18n";

/** "-25.28123, -57.63456": latitud y longitud en decimal, 5 decimales (~1 m). */
export const fmtCoords = (lon: number, lat: number) => `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

/** Botón de texto que copia las coordenadas y dice "Copiado" durante 2 s. */
export function CopyCoords({ lon, lat, className = "" }: { lon: number; lat: number; className?: string }) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fmtCoords(lon, lat));
    } catch {
      // Sin permiso de portapapeles (http o navegador viejo): copia con un campo temporal.
      const ta = document.createElement("textarea");
      ta.value = fmtCoords(lon, lat);
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setDone(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), 2000);
  };
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void copy();
      }}
      aria-live="polite"
      className={`cursor-pointer text-sm text-tinta-2 underline-offset-4 hover:text-surco hover:underline ${className}`}
    >
      {done ? t("ui.copied") : t("ui.copyCoords")}
    </button>
  );
}
