/**
 * Lotes: tabla de lotes de la estancia elegida desde la base local (anda sin señal). Orden elegible,
 * filtro por días sin visitar y resumen de superficie por cultivo. Tocar un lote abre su ficha.
 */
import { useMemo, useState } from "react";
import { router } from "expo-router";
import { t, type MessageKey, areaLabel, haToArea } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { areaByCrop, fmtArea, latestVigorByPlot, sortPlotLines, unvisitedOver, type PlotLine, type PlotSort } from "../../src/lib/plotInfo";
import { daysSince } from "../../src/lib/plotSheet";
import { useUnits } from "../../src/lib/units";
import { useLocal } from "../../src/lib/useLocal";
import { FarmChips, useFarmPick } from "../../src/office/farmPick";
import { fmtNumber } from "../../src/office/format";
import { OfficeScreen } from "../../src/office/OfficeScreen";
import { BarList, DataList, FilterChips, StatRow } from "../../src/office/ui";
import { EmptyState, SectionHeader } from "../../src/ui/kit";

type Days = "all" | "7" | "14" | "30";
const k = (s: string) => s as MessageKey;

/** Listado de lotes con orden y filtros; abre la ficha de cada uno. */
export default function Plots() {
  const units = useUnits();
  const { farms, farm, setFarmId } = useFarmPick();
  const all = useLocal(() => {
    const db = getDb();
    const vigor = latestVigorByPlot(db);
    const visits = db.lastVisitByPlot();
    const now = Date.now();
    return db.plots().map<PlotLine>((p) => ({
      id: p.id,
      name: p.name,
      farmId: p.farmId,
      kind: p.kind,
      crop: p.crop,
      areaHa: p.areaHa,
      vigor: vigor.get(p.id)?.mean ?? null,
      visitDays: visits.has(p.id) ? daysSince(visits.get(p.id)!, now) : null,
    }));
  });
  const [sort, setSort] = useState<PlotSort>("name");
  const [days, setDays] = useState<Days>("all");

  const inFarm = useMemo(() => (farm ? all.filter((p) => p.farmId === farm.id) : all), [all, farm]);
  const shown = useMemo(() => sortPlotLines(days === "all" ? inFarm : unvisitedOver(inFarm, Number(days)), sort), [inFarm, days, sort]);
  const hasVigor = inFarm.some((p) => p.vigor !== null);
  const crops = useMemo(() => areaByCrop(inFarm), [inFarm]);
  const totalHa = inFarm.reduce((a, p) => a + p.areaHa, 0);
  const cropLabel = (key: string) => (key === "pasture" ? t("ui.common.pasture") : key === "none" ? t("ui.dash.noCrop") : t(k(`ui.crop.name_${key}`)));

  const lineSub = (p: PlotLine) =>
    [
      p.kind === "pasture" ? t("ui.common.pasture") : p.crop ? t(k(`ui.crop.name_${p.crop}`)) : t("ui.dash.noCrop"),
      fmtArea(p.areaHa, units),
      p.vigor !== null ? t("office.plots.vigor", { value: fmtNumber(p.vigor, 2) }) : null,
      p.visitDays === null ? t("app.no.visits") : p.visitDays === 0 ? t("app.last.visitToday") : p.visitDays === 1 ? t("app.last.visitYesterday") : t("app.last.visit", { days: p.visitDays }),
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <OfficeScreen title={t("office.plots.title")} subtitle={farm && farms.length > 1 ? undefined : farm?.name}>
      <FarmChips farms={farms} value={farm?.id} onChange={setFarmId} />
      {inFarm.length === 0 ? (
        <EmptyState title={t("office.plots.empty")} hint={t("office.plots.emptyHint")} />
      ) : (
        <>
          <StatRow items={[{ label: t("ui.common.plots"), value: inFarm.length }, { label: t("office.plots.area"), value: fmtNumber(haToArea(totalHa, units.area), 0), unit: areaLabel(units.area) }]} />

          <SectionHeader title={t("office.plots.sortBy")} />
          <FilterChips<PlotSort>
            value={sort}
            onChange={setSort}
            options={[
              { value: "name", label: t("office.plots.sort_name") },
              { value: "area", label: t("office.plots.sort_area") },
              ...(hasVigor ? [{ value: "vigor" as const, label: t("office.plots.sort_vigor") }] : []),
              { value: "visit", label: t("office.plots.sort_visit") },
            ]}
          />
          <SectionHeader title={t("office.plots.unvisited")} />
          <FilterChips<Days>
            value={days}
            onChange={setDays}
            options={[
              { value: "all", label: t("ui.filter.all") },
              { value: "7", label: t("office.plots.overDays", { n: 7 }), count: unvisitedOver(inFarm, 7).length },
              { value: "14", label: t("office.plots.overDays", { n: 14 }), count: unvisitedOver(inFarm, 14).length },
              { value: "30", label: t("office.plots.overDays", { n: 30 }), count: unvisitedOver(inFarm, 30).length },
            ]}
          />

          <SectionHeader title={t("office.plots.listTitle", { n: shown.length })} />
          <DataList
            rows={shown}
            keyOf={(p) => p.id}
            title={(p) => p.name}
            subtitle={lineSub}
            onPress={(p) => router.push({ pathname: "/plot/[id]", params: { id: p.id } })}
            empty={{ title: t("office.plots.noMatch", { n: days }), hint: t("office.plots.noMatchHint") }}
          />

          {crops.length > 0 && (
            <>
              <SectionHeader title={t("ui.dash.areaByCrop")} />
              <BarList
                rows={crops.map((c) => ({
                  label:
                    cropLabel(c.key) +
                    " · " +
                    t(c.plots === 1 ? "ui.plots.countOne" : "ui.plots.countMany", { n: c.plots }),
                  value: Math.round(haToArea(c.ha, units.area) * 10) / 10,
                }))}
                unit={areaLabel(units.area)}
              />
            </>
          )}
        </>
      )}
    </OfficeScreen>
  );
}
