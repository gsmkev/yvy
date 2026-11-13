/** M-16: elige qué límites administrativos se dibujan sobre el mapa (ninguno, departamentos o distritos). */
import { BOUNDARY_LEVELS, type BoundaryLevel } from "../lib/boundaries";
import { t } from "../lib/i18n";

export function BoundariesControl({
  level,
  onLevel,
  loading,
  missing,
}: {
  level: BoundaryLevel | null;
  onLevel: (l: BoundaryLevel | null) => void;
  loading: boolean;
  missing: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 text-xs font-medium text-lino">
      <div role="group" aria-label={t("ui.layerBoundaries")} className="flex gap-1.5">
        {BOUNDARY_LEVELS.map((l) => (
          <button
            key={l}
            aria-pressed={level === l}
            onClick={() => onLevel(level === l ? null : l)}
            className={`h-10 flex-1 cursor-pointer rounded px-2 transition-colors ${level === l ? "bg-lino text-surco" : "border border-white/20 hover:bg-white/10"}`}
          >
            {t(l === "adm1" ? "ui.boundariesAdm1" : "ui.boundariesAdm2")}
          </button>
        ))}
      </div>
      {loading && <p className="font-normal text-lino/70">{t("ui.boundariesLoading")}</p>}
      {missing && <p className="font-normal text-lino/70">{t("ui.boundariesMissing")}</p>}
    </div>
  );
}
