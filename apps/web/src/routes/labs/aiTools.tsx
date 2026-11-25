/** Vistas previas del Laboratorio de consultas en lenguaje natural. */
import { Button } from "../../components/ui";
import { t, tk } from "../../lib/i18n";
import { Flow } from "./parts";

/** Vista previa de la consulta a la estancia. */
export function Ask() {
  const pairs = [1, 2, 3] as const;
  return (
    <div className="flex flex-col gap-4">
      <input
        disabled
        aria-label={t("ui.labs.askPlaceholder")}
        placeholder={t("ui.labs.askPlaceholder")}
        className="h-10 rounded-md border border-linea bg-papel px-3 text-sm disabled:opacity-45"
      />
      <Flow drop={false}>
        <p className="text-sm text-tinta-2">
          {t("ui.labs.askExampleLabel")}. {t("ui.labs.askFarm")}
        </p>
        <ul>
          {pairs.map((n) => (
            <li key={n} className="flex flex-col gap-1 border-b border-linea py-4">
              <p className="font-semibold">{tk(`ui.labs.askQ${n}`)}</p>
              <p>{tk(`ui.labs.askA${n}`)}</p>
            </li>
          ))}
        </ul>
      </Flow>
    </div>
  );
}

/** Vista previa del resumen escrito de la estancia. */
export function Summary() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button disabled>{t("ui.labs.summaryPick")}</Button>
      </div>
      <Flow drop={false}>
        <p className="text-sm text-tinta-2">
          {t("ui.labs.summaryDraft")}. {t("ui.labs.summaryWeek")}
        </p>
        <p className="border-b border-linea pb-4">{t("ui.labs.summaryText")}</p>
      </Flow>
    </div>
  );
}
