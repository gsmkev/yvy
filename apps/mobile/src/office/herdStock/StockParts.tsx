/** Piezas de presentación de la pantalla de existencias de hacienda. */
import { indicatorLabel, indicatorValueText, t, uaPerHa, type FarmStockResponse, type MessageKey, type ProductionResponse, type ProductionSystem } from "@yvy/shared";
import { C, T } from "../../ui/theme";
import { SectionHeader, Text } from "../../ui/kit";
import { fmtNumber } from "../format";
import { DataList, StatSummary } from "../ui";
import { herdDetail, herdSubtitle, loadLine, type HerdRow } from "./model";

/** Sistema de producción de la estancia con el enlace para cambiarlo (o la pregunta si todavía no se eligió). */
export function SystemLine({ system, onChange }: { system: ProductionSystem | null; onChange: () => void }) {
  return (
    <>
      {!system && <Text style={T.bodyMedium}>{t("ui.herd.sysQuestion")}</Text>}
      {!system && <Text style={[T.small, { marginBottom: 8 }]}>{t("ui.herd.sysQuestionHint")}</Text>}
      <Text accessibilityRole="button" onPress={onChange} style={[T.bodyMedium, { color: C.accion, marginBottom: 8 }]}>
        {system ? `${t("ui.herd.sysLabel")}: ${t(`ui.herd.sys_${system}` as MessageKey)} · ${t("ui.herd.sysChange")}` : t("ui.herd.sysChange")}
      </Text>
    </>
  );
}

/** Indicadores de producción de la estancia, en una tarjeta de cifras. */
export function Indicators({ data }: { data: ProductionResponse }) {
  if (data.indicators.length === 0) return null;
  return (
    <>
      <SectionHeader title={t("ui.herd.indTitle")} />
      <StatSummary items={data.indicators.map((i) => ({ label: indicatorLabel(i), value: indicatorValueText(i) }))} />
    </>
  );
}

/** Cabezas, UA y carga de la estancia, con la línea del límite y el aviso de potreros que lo pasan. */
export function StockTotals({ head, ua, farmUaHa, over, maxUa, isDefault }: { head: number; ua: number; farmUaHa: number | null; over: HerdRow[]; maxUa: number; isDefault: boolean }) {
  const max = fmtNumber(maxUa, 2);
  return (
    <>
      <StatSummary
        items={[
          { label: t("office.herd.stockHeads"), value: fmtNumber(head, 0) },
          { label: t("office.herd.stockUa"), value: fmtNumber(ua) },
          ...(farmUaHa !== null ? [{ label: t("office.herd.stockUaHa"), value: fmtNumber(farmUaHa, 2), tone: farmUaHa > maxUa ? ("danger" as const) : undefined }] : []),
        ]}
      />
      <Text style={[T.small, { marginTop: 12 }]}>{t(isDefault ? "office.herd.stockLimitDefault" : "office.herd.stockLimit", { max })}</Text>
      {over.length > 0 && (
        <Text accessibilityRole="alert" style={[T.bodyMedium, { color: C.peligro, marginTop: 12 }]}>
          {t("ui.herd.overLimit", { max, plots: over.map((r) => r.plot.name).join(", ") })}
        </Text>
      )}
    </>
  );
}

/** Potreros con hacienda: carga en UA/ha a la derecha (roja si pasa el límite) y la ficha por categoría al tocar. */
export function PlotList({ rows, maxUa, areaUnit, plots }: { rows: HerdRow[]; maxUa: number; areaUnit: Parameters<typeof herdSubtitle>[1]; plots: FarmStockResponse["plots"] }) {
  const byId = new Map(plots.map((p) => [p.plotId, p]));
  return (
    <DataList
      rows={rows}
      keyOf={(r) => r.plot.id}
      title={(r) => r.plot.name}
      subtitle={(r) => herdSubtitle(r, areaUnit)}
      detail={herdDetail}
      right={(r) => {
        const v = uaPerHa(r.st!.counts, r.plot.areaHa);
        const rp = byId.get(r.plot.id);
        return (
          <>
            <Text style={[T.bodyMedium, { textAlign: "right", color: v !== null && v > maxUa ? C.peligro : C.tinta }]}>{v === null ? "—" : `${fmtNumber(v, 2)} UA/ha`}</Text>
            <Text style={[T.small, { textAlign: "right" }]}>{t("office.herd.stockPlotLine", { head: fmtNumber(r.st!.total, 0), ua: fmtNumber(r.ua) })}</Text>
            {rp && <Text style={[T.small, { textAlign: "right" }]}>{loadLine(rp)}</Text>}
          </>
        );
      }}
      empty={{ title: t("office.herd.stockEmpty") }}
    />
  );
}
