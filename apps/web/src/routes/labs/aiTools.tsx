import { Button } from "../../components/ui";
import { t, tk } from "../../lib/i18n";
import { Flow } from "./parts";

export function Ask() {
  const pairs = [1, 2, 3] as const;
  return (
    <div className="flex flex-col gap-4">
      <input
        disabled
        aria-label={t("ui.labsAskPlaceholder")}
        placeholder={t("ui.labsAskPlaceholder")}
        className="h-10 rounded-md border border-linea bg-papel px-3 text-sm disabled:opacity-45"
      />
      <Flow drop={false}>
        <p className="text-sm text-tinta-2">
          {t("ui.labsAskExampleLabel")} · {t("ui.labsAskFarm")}
        </p>
        <ul>
          {pairs.map((n) => (
            <li key={n} className="flex flex-col gap-1 border-b border-linea py-4">
              <p className="font-semibold">{tk(`ui.labsAskQ${n}`)}</p>
              <p>{tk(`ui.labsAskA${n}`)}</p>
            </li>
          ))}
        </ul>
      </Flow>
    </div>
  );
}

export function Summary() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button disabled>{t("ui.labsSummaryPick")}</Button>
      </div>
      <Flow drop={false}>
        <p className="text-sm text-tinta-2">
          {t("ui.labsSummaryDraft")} · {t("ui.labsSummaryWeek")}
        </p>
        <p className="border-b border-linea pb-4">{t("ui.labsSummaryText")}</p>
      </Flow>
    </div>
  );
}
