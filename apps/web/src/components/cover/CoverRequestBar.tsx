import { Button, Field, FilterBar, Input } from "../ui";
import { t } from "../../lib/i18n";
import { iso } from "./util";

/** Fechas del análisis y botón de calcular (solo dueño y administrador). */
export function CoverRequestBar({
  from,
  to,
  onFrom,
  onTo,
  datesOk,
  disabled,
  onCompute,
}: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  datesOk: boolean;
  disabled: boolean;
  onCompute: () => void;
}) {
  return (
    <FilterBar>
      <Field label={t("ui.coverFrom")}>
        <Input type="date" value={from} min="2017-01-01" onChange={(e) => onFrom(e.target.value)} />
      </Field>
      <Field label={t("ui.coverTo")}>
        <Input type="date" value={to} max={iso(new Date())} onChange={(e) => onTo(e.target.value)} />
      </Field>
      <Button variant="secondary" disabled={disabled} onClick={onCompute}>
        {t("ui.coverCompute")}
      </Button>
      {!datesOk && <span className="pb-2.5 text-xs text-tinta-2">{t("ui.coverDatesInvalid")}</span>}
    </FilterBar>
  );
}
