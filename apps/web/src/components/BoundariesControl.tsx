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
    <div className="flex w-56 flex-col gap-1.5 rounded-md border border-white/15 bg-surco/85 p-0.5 text-xs font-medium text-lino backdrop-blur">
      <div role="group" aria-label={t("ui.layerBoundaries")} className="flex">
        {BOUNDARY_LEVELS.map((l) => (
          <button
            key={l}
            aria-pressed={level === l}
            onClick={() => onLevel(level === l ? null : l)}
            className={`flex-1 cursor-pointer rounded px-2 py-1.5 transition-colors ${level === l ? "bg-lino text-surco" : "hover:bg-white/10"}`}
          >
            {t(l === "adm1" ? "ui.boundariesAdm1" : "ui.boundariesAdm2")}
          </button>
        ))}
      </div>
      {loading && <p className="px-2.5 pb-1.5 font-normal text-lino/70">{t("ui.boundariesLoading")}</p>}
      {missing && <p className="px-2.5 pb-1.5 font-normal text-lino/70">{t("ui.boundariesMissing")}</p>}
    </div>
  );
}
