/** Hacienda calculada por potrero: resumen de la estancia, tabla, límite de carga y equivalencias. */
import { useQuery } from "@tanstack/react-query";
import { HERD_CATEGORIES, UA_EQUIVALENTS, type FarmStockResponse } from "@yvy/shared";
import { get } from "../../lib/api";
import { fmtHa } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { useMe } from "../../lib/queries";
import { HeatStressCard } from "../HeatStress";
import { LoadEditor } from "../HerdSystem";
import { Empty, ErrorBox, Spinner, Stat, StatRow } from "../ui";
import { LimitForm } from "./LimitForm";
import { StockTable } from "./StockTable";
import { dec, int } from "./herdFormat";

/** Total de cabezas, UA y carga de la estancia en cifras, con el aviso si algún potrero pasó el límite. */
function FarmSummary({ d }: { d: FarmStockResponse }) {
  const over = d.plots.filter((p) => p.overLimit);
  return (
    <div>
      <StatRow max={3}>
        <Stat label={t("ui.herd.statHead")} value={int.format(d.farm.total)} />
        <Stat label={t("ui.herd.statUa")} value={dec.format(d.farm.ua)} note={t("ui.herd.statOnArea", { area: fmtHa(d.farm.areaHa) })} />
        {d.farm.uaPerHa !== null && <Stat label={t("ui.herd.statUaPerHa")} value={dec.format(d.farm.uaPerHa)} />}
      </StatRow>
      {(d.farm.overLimit || over.length > 0) && (
        <p role="alert" className="mt-2 text-sm font-medium text-peligro">
          {t("ui.herd.overLimit", { max: dec.format(d.maxUaPerHa), plots: over.map((p) => p.name).join(", ") || t("ui.herd.wholeFarm") })}
        </p>
      )}
      {d.truncated && <p className="mt-2 text-sm text-tinta-2">{t("ui.herd.truncated")}</p>}
    </div>
  );
}

/** Pestaña "Hacienda" de la estancia `farmId`. */
export function StockSection({ farmId }: { farmId: string }) {
  const me = useMe();
  const canEdit = me.data?.role === "owner" || me.data?.role === "admin";
  const stock = useQuery({ queryKey: ["stock", farmId], queryFn: () => get<FarmStockResponse>(`/org/farms/${farmId}/stock`) });
  if (stock.isLoading) return <Spinner rows={5} h={56} />;
  if (stock.error) return <ErrorBox error={stock.error} />;
  const d = stock.data;
  if (!d) return null;
  if (!d.plots.length) return <Empty title={t("ui.herd.noPaddocks")}>{t("ui.herd.noPaddocksHint")}</Empty>;
  return (
    <div className="mt-4 flex flex-col gap-6">
      <FarmSummary d={d} />
      <StockTable plots={d.plots} />
      <LimitForm farmId={farmId} stock={d} canEdit={canEdit} />
      <p className="-mt-3 text-xs text-tinta-2">
        {t("ui.herd.loadHint")}
        {d.winter && ` ${t("ui.herd.loadWinter")}`}
      </p>
      {canEdit && <LoadEditor key={`${d.pastureDefault}|${JSON.stringify(d.pastureLoads)}`} farmId={farmId} d={d} />}
      <HeatStressCard farmId={farmId} />
      <p className="text-xs text-tinta-2">
        {t("ui.herd.equivalents", { list: HERD_CATEGORIES.map((c) => `${tk(`fields.herd.${c}`).toLowerCase()} ${dec.format(UA_EQUIVALENTS[c])}`).join(", ") })}
      </p>
    </div>
  );
}
