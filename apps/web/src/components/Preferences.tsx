import { useEffect, useSyncExternalStore } from "react";
import { t } from "../lib/i18n";
import { getTheme, setTheme, subscribeTheme } from "../lib/theme";
import { getUnits, setUnits, subscribeUnits, type Units } from "../lib/units";

function Choice<T extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="border-b border-linea py-3">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
        {options.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-center gap-2 text-[15px]">
            <input
              type="radio"
              name={legend}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="accent-accion"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Preferencias de este navegador: unidades (U-23) y, más abajo, el tema (U-20). Se guardan en localStorage. */
export function Preferences() {
  const units = useSyncExternalStore(subscribeUnits, getUnits);
  const theme = useSyncExternalStore(subscribeTheme, getTheme);
  const set = (patch: Partial<Units>) => setUnits(patch);
  // Llegar desde el menú de la cuenta (#preferencias) lleva hasta esta sección
  useEffect(() => {
    if (window.location.hash === "#preferencias") document.getElementById("preferencias")?.scrollIntoView();
  }, []);
  return (
    <section id="preferencias" className="mt-8 scroll-mt-4">
      <h2 className="font-serif text-xl font-semibold">{t("ui.prefsTitle")}</h2>
      <p className="mt-2 text-tinta-2">{t("ui.prefsIntro")}</p>
      <div className="mt-3 border-t border-linea">
        <Choice
          legend={t("ui.themeLabel")}
          value={theme}
          onChange={setTheme}
          options={[
            { value: "auto", label: t("ui.themeAuto") },
            { value: "light", label: t("ui.themeLight") },
            { value: "dark", label: t("ui.themeDark") },
          ]}
        />
        <Choice
          legend={t("ui.unitArea")}
          value={units.area}
          onChange={(area) => set({ area })}
          options={[
            { value: "ha", label: t("ui.unitHectares") },
            { value: "cuadra", label: t("ui.unitCuadras") },
          ]}
        />
        <Choice
          legend={t("ui.unitRain")}
          value={units.rain}
          onChange={(rain) => set({ rain })}
          options={[
            { value: "mm", label: t("ui.unitMm") },
            { value: "in", label: t("ui.unitInches") },
          ]}
        />
        <Choice
          legend={t("ui.unitTemp")}
          value={units.temp}
          onChange={(temp) => set({ temp })}
          options={[
            { value: "c", label: "°C" },
            { value: "f", label: "°F" },
          ]}
        />
      </div>
      <p className="mt-2 text-xs text-tinta-2">{t("ui.unitCuadraNote")}</p>
    </section>
  );
}
