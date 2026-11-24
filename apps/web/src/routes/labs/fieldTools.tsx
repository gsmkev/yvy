import { Button } from "../../components/ui";
import { AnimalCountIllustration, HailIllustration, InfraIllustration, StandCountIllustration, WeedsIllustration } from "../../components/labs/illustrations";
import { t, tk } from "../../lib/i18n";
import { Figure, Flow, Legend, Table, nf } from "./parts";

const PADDOCKS = [
  { id: "norte", ha: 38, n: 142 },
  { id: "monte", ha: 27, n: 96 },
  { id: "aguada", ha: 15, n: 58 },
];

export function Animals() {
  const total = PADDOCKS.reduce((s, p) => s + p.n, 0);
  return (
    <Flow>
      <Figure value={nf(total)} label={t("ui.labsAnimalsTotal")} />
      <AnimalCountIllustration label={t("ui.labsAnimalsIllustrationLabel")} className="w-full border border-linea" />
      <Legend color="#D2462B" label={t("ui.labsLegendAnimal")} />
      <Table
        head={[t("ui.labsPaddock"), t("ui.labsPaddockArea"), t("ui.labsAnimalsCount"), t("ui.labsAnimalsDensity")]}
        rows={PADDOCKS.map((p) => [tk(`ui.labsPaddock_${p.id}`), `${nf(p.ha)} ha`, nf(p.n), nf(p.n / p.ha, 1)])}
      />
      <p className="text-sm">{t("ui.labsAnimalsNote")}</p>
      <div>
        <Button disabled>{t("ui.labsExport")}</Button>
      </div>
    </Flow>
  );
}

const ZONES = [
  { id: "norte", perM: 12.4, gaps: 4.1 },
  { id: "centro", perM: 11.1, gaps: 9.8 },
  { id: "sur", perM: 12.8, gaps: 3.2 },
];

export function Stand() {
  const avg = (k: "perM" | "gaps") => ZONES.reduce((s, z) => s + z[k], 0) / ZONES.length;
  return (
    <Flow>
      <div className="grid grid-cols-2 gap-4">
        <Figure value={nf(avg("perM"), 1)} label={t("ui.labsStandPlantsPerM")} />
        <Figure value={`${nf(avg("gaps"), 1)} %`} label={t("ui.labsStandGaps")} />
      </div>
      <StandCountIllustration label={t("ui.labsStandIllustrationLabel")} className="w-full border border-linea" />
      <Legend color="#D2462B" label={t("ui.labsLegendGap")} />
      <Table
        head={[t("ui.labsStandZone"), t("ui.labsStandPlantsPerM"), t("ui.labsStandGaps")]}
        rows={ZONES.map((z) => [tk(`ui.labsStandZone_${z.id}`), nf(z.perM, 1), `${nf(z.gaps, 1)} %`])}
      />
      <p className="text-sm">{t("ui.labsStandNote")}</p>
    </Flow>
  );
}

export function Weeds() {
  const lot = 48;
  const affected = 6.7;
  return (
    <Flow>
      <p className="text-sm text-tinta-2">{t("ui.labsWeedsLot", { ha: lot })}</p>
      <div className="grid grid-cols-2 gap-4">
        <Figure value={`${nf(affected, 1)} ha`} label={t("ui.labsWeedsArea")} />
        <Figure value={`${nf((affected / lot) * 100)} %`} label={t("ui.labsWeedsPct")} />
      </div>
      <WeedsIllustration label={t("ui.labsWeedsIllustrationLabel")} className="w-full border border-linea" />
      <Legend color="#D2462B" label={t("ui.labsLegendWeed")} />
      <p className="text-sm">{t("ui.labsWeedsNote")}</p>
      <div>
        <Button disabled>{t("ui.labsPrescription")}</Button>
      </div>
    </Flow>
  );
}

const HAIL = [
  { id: "severe", ha: 4.2, color: "#D2462B" },
  { id: "moderate", ha: 11.5, color: "#D9A93A" },
] as const;

export function Hail() {
  const lot = 48;
  const damaged = HAIL.reduce((s, h) => s + h.ha, 0);
  const label = { severe: t("ui.labsHailSevere"), moderate: t("ui.labsHailModerate") };
  return (
    <Flow>
      <p className="text-sm text-tinta-2">{t("ui.labsHailLot", { ha: lot })}</p>
      <div className="grid grid-cols-2 gap-4">
        <Figure value={`${nf(damaged, 1)} ha`} label={t("ui.labsHailArea")} />
        <Figure value={`${nf((damaged / lot) * 100)} %`} label={t("ui.labsHailPct")} />
      </div>
      <HailIllustration label={t("ui.labsHailIllustrationLabel")} className="w-full border border-linea" />
      {HAIL.map((h) => (
        <Legend key={h.id} color={h.color} label={label[h.id]} />
      ))}
      <Table
        head={[t("ui.labsHailClass"), t("ui.labsPaddockArea"), t("ui.labsWeedsPct")]}
        rows={[
          ...HAIL.map((h) => [label[h.id], `${nf(h.ha, 1)} ha`, `${nf((h.ha / lot) * 100)} %`]),
          [t("ui.labsHailNone"), `${nf(lot - damaged, 1)} ha`, `${nf(((lot - damaged) / lot) * 100)} %`],
        ]}
      />
      <p className="text-sm">{t("ui.labsHailNote")}</p>
      <div>
        <Button disabled>{t("ui.labsHailReport")}</Button>
      </div>
    </Flow>
  );
}

export function Infra() {
  const rows = [
    [t("ui.labsInfraFence"), t("ui.labsInfraFencePlace"), t("ui.labsInfraFenceSize")],
    [t("ui.labsInfraPond"), t("ui.labsInfraPondPlace"), t("ui.labsInfraPondSize")],
    [t("ui.labsInfraRoad"), t("ui.labsInfraRoadPlace"), t("ui.labsInfraRoadSize")],
  ];
  return (
    <Flow>
      <InfraIllustration label={t("ui.labsInfraIllustrationLabel")} className="w-full border border-linea" />
      <Legend color="#D2462B" label={t("ui.labsInfraLegend")} />
      <Table head={[t("ui.labsInfraFinding"), t("ui.labsInfraPlace"), t("ui.labsInfraSize")]} rows={rows} />
      <p className="text-sm">{t("ui.labsInfraNote")}</p>
      <div>
        <Button disabled>{t("ui.labsInfraTask")}</Button>
      </div>
    </Flow>
  );
}
