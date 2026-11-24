import { useEffect, useSyncExternalStore } from "react";
import { getLocale, LOCALES, LOCALE_NAMES } from "@yvy/shared";
import { SectionHead } from "./ui";
import { chooseLocale } from "../lib/locale";
import { t } from "../lib/i18n";
import { getTheme, setTheme, subscribeTheme } from "../lib/theme";
import { getUnits, setUnits, subscribeUnits, type Units } from "../lib/units";

function Choice<T extends string>({
  legend,
  value,
  options,
  onChange,
  help,
}: {
  legend: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  help?: string;
}) {
  return (
    <div className="border-b border-linea py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span id={`pref-${legend}`} className="text-sm font-medium">
          {legend}
        </span>
        <div role="radiogroup" aria-labelledby={`pref-${legend}`} className="inline-flex rounded-md border border-linea bg-papel p-0.5">
          {options.map((o) => (
            <label
              key={o.value}
              className={`flex h-8 cursor-pointer items-center rounded px-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accion/40 ${value === o.value ? "bg-surco text-lino" : "text-tinta-2 hover:text-surco"}`}
            >
              <input type="radio" name={legend} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
              {o.label}
            </label>
          ))}
        </div>
      </div>
      {help && <p className="mt-1.5 text-xs text-tinta-2">{help}</p>}
    </div>
  );
}

/** Preferencias de este navegador: unidades y, más abajo, el tema. Se guardan en localStorage. */
export function Preferences() {
  const units = useSyncExternalStore(subscribeUnits, getUnits);
  const theme = useSyncExternalStore(subscribeTheme, getTheme);
  const set = (patch: Partial<Units>) => setUnits(patch);
  // Llegar desde el menú de la cuenta (#preferencias) lleva hasta esta sección
  useEffect(() => {
    if (window.location.hash === "#preferencias") document.getElementById("preferencias")?.scrollIntoView();
  }, []);
  return (
    <section id="preferencias" className="scroll-mt-4">
      <SectionHead title={t("ui.prefs.title")} />
      <p className="mt-3 text-tinta-2">{t("ui.prefs.intro")}</p>
      <div className="mt-2">
        <Choice
          legend={t("ui.common.languageLabel")}
          value={getLocale()}
          onChange={chooseLocale}
          options={LOCALES.map((l) => ({ value: l, label: LOCALE_NAMES[l] }))}
        />
        <Choice
          legend={t("ui.theme.label")}
          value={theme}
          onChange={setTheme}
          options={[
            { value: "auto", label: t("ui.theme.auto") },
            { value: "light", label: t("ui.theme.light") },
            { value: "dark", label: t("ui.theme.dark") },
          ]}
        />
        <Choice
          legend={t("ui.unit.area")}
          help={units.area === "cuadra" ? t("ui.unit.cuadraNote") : undefined}
          value={units.area}
          onChange={(area) => set({ area })}
          options={[
            { value: "ha", label: t("ui.unit.hectares") },
            { value: "cuadra", label: t("ui.unit.cuadras") },
          ]}
        />
        <Choice
          legend={t("ui.unit.rain")}
          value={units.rain}
          onChange={(rain) => set({ rain })}
          options={[
            { value: "mm", label: t("ui.unit.mm") },
            { value: "in", label: t("ui.unit.inches") },
          ]}
        />
        <Choice
          legend={t("ui.unit.temp")}
          value={units.temp}
          onChange={(temp) => set({ temp })}
          options={[
            { value: "c", label: "°C" },
            { value: "f", label: "°F" },
          ]}
        />
      </div>
    </section>
  );
}
