/** Vistas previas del Laboratorio sobre fotos de campo: animales, plantas, malezas, granizo e infraestructura. */
import { Button } from "../../components/ui";
import { AnimalCountIllustration, HailIllustration, InfraIllustration, StandCountIllustration, WeedsIllustration } from "../../components/labs/illustrations";
import { t, tk } from "../../lib/i18n";
import { Figure, Flow, Legend, Table, nf } from "./parts";

const PADDOCKS = [
  { id: "norte", ha: 38, n: 142 },
  { id: "monte", ha: 27, n: 96 },
  { id: "aguada", ha: 15, n: 58 },
];

/** Vista previa del conteo de animales. */
export function Animals() {
  const total = PADDOCKS.reduce((s, p) => s + p.n, 0);
  return (
    <Flow>
      <Figure value={nf(total)} label={t("ui.labs.animalsTotal")} />
      <AnimalCountIllustration label={t("ui.labs.animalsIllustrationLabel")} className="w-full border border-linea" />
      <Legend color="#D2462B" label={t("ui.labs.legendAnimal")} />
      <Table
        head={[t("ui.labs.paddock"), t("ui.labs.paddockArea"), t("ui.labs.animalsCount"), t("ui.labs.animalsDensity")]}
        rows={PADDOCKS.map((p) => [tk(`ui.labs.paddock_${p.id}`), `${nf(p.ha)} ha`, nf(p.n), nf(p.n / p.ha, 1)])}
      />
      <p className="text-sm">{t("ui.labs.animalsNote")}</p>
      <div>
        <Button disabled>{t("ui.labs.export")}</Button>
      </div>
    </Flow>
  );
}

const ZONES = [
  { id: "norte", perM: 12.4, gaps: 4.1 },
  { id: "centro", perM: 11.1, gaps: 9.8 },
  { id: "sur", perM: 12.8, gaps: 3.2 },
];

/** Vista previa del conteo de plantas. */
export function Stand() {
  const avg = (k: "perM" | "gaps") => ZONES.reduce((s, z) => s + z[k], 0) / ZONES.length;
  return (
    <Flow>
      <div className="grid grid-cols-2 gap-4">
        <Figure value={nf(avg("perM"), 1)} label={t("ui.labs.standPlantsPerM")} />
        <Figure value={`${nf(avg("gaps"), 1)} %`} label={t("ui.labs.standGaps")} />
      </div>
      <StandCountIllustration label={t("ui.labs.standIllustrationLabel")} className="w-full border border-linea" />
      <Legend color="#D2462B" label={t("ui.labs.legendGap")} />
      <Table
        head={[t("ui.labs.standZone"), t("ui.labs.standPlantsPerM"), t("ui.labs.standGaps")]}
        rows={ZONES.map((z) => [tk(`ui.labs.standZone_${z.id}`), nf(z.perM, 1), `${nf(z.gaps, 1)} %`])}
      />
      <p className="text-sm">{t("ui.labs.standNote")}</p>
    </Flow>
  );
}

/** Vista previa de la detección de malezas. */
export function Weeds() {
  const lot = 48;
  const affected = 6.7;
  return (
    <Flow>
      <p className="text-sm text-tinta-2">{t("ui.labs.weedsLot", { ha: lot })}</p>
      <div className="grid grid-cols-2 gap-4">
        <Figure value={`${nf(affected, 1)} ha`} label={t("ui.labs.weedsArea")} />
        <Figure value={`${nf((affected / lot) * 100)} %`} label={t("ui.labs.weedsPct")} />
      </div>
      <WeedsIllustration label={t("ui.labs.weedsIllustrationLabel")} className="w-full border border-linea" />
      <Legend color="#D2462B" label={t("ui.labs.legendWeed")} />
      <p className="text-sm">{t("ui.labs.weedsNote")}</p>
      <div>
        <Button disabled>{t("ui.labs.prescription")}</Button>
      </div>
    </Flow>
  );
}

const HAIL = [
  { id: "severe", ha: 4.2, color: "#D2462B" },
  { id: "moderate", ha: 11.5, color: "#D9A93A" },
] as const;

/** Vista previa de la evaluación de granizo. */
export function Hail() {
  const lot = 48;
  const damaged = HAIL.reduce((s, h) => s + h.ha, 0);
  const label = { severe: t("ui.labs.hailSevere"), moderate: t("ui.labs.hailModerate") };
  return (
    <Flow>
      <p className="text-sm text-tinta-2">{t("ui.labs.hailLot", { ha: lot })}</p>
      <div className="grid grid-cols-2 gap-4">
        <Figure value={`${nf(damaged, 1)} ha`} label={t("ui.labs.hailArea")} />
        <Figure value={`${nf((damaged / lot) * 100)} %`} label={t("ui.labs.hailPct")} />
      </div>
      <HailIllustration label={t("ui.labs.hailIllustrationLabel")} className="w-full border border-linea" />
      {HAIL.map((h) => (
        <Legend key={h.id} color={h.color} label={label[h.id]} />
      ))}
      <Table
        head={[t("ui.labs.hailClass"), t("ui.labs.paddockArea"), t("ui.labs.weedsPct")]}
        rows={[
          ...HAIL.map((h) => [label[h.id], `${nf(h.ha, 1)} ha`, `${nf((h.ha / lot) * 100)} %`]),
          [t("ui.labs.hailNone"), `${nf(lot - damaged, 1)} ha`, `${nf(((lot - damaged) / lot) * 100)} %`],
        ]}
      />
      <p className="text-sm">{t("ui.labs.hailNote")}</p>
      <div>
        <Button disabled>{t("ui.labs.hailReport")}</Button>
      </div>
    </Flow>
  );
}

/** Vista previa del estado de la infraestructura. */
export function Infra() {
  const rows = [
    [t("ui.labs.infraFence"), t("ui.labs.infraFencePlace"), t("ui.labs.infraFenceSize")],
    [t("ui.labs.infraPond"), t("ui.labs.infraPondPlace"), t("ui.labs.infraPondSize")],
    [t("ui.labs.infraRoad"), t("ui.labs.infraRoadPlace"), t("ui.labs.infraRoadSize")],
  ];
  return (
    <Flow>
      <InfraIllustration label={t("ui.labs.infraIllustrationLabel")} className="w-full border border-linea" />
      <Legend color="#D2462B" label={t("ui.labs.infraLegend")} />
      <Table head={[t("ui.labs.infraFinding"), t("ui.labs.infraPlace"), t("ui.labs.infraSize")]} rows={rows} />
      <p className="text-sm">{t("ui.labs.infraNote")}</p>
      <div>
        <Button disabled>{t("ui.labs.infraTask")}</Button>
      </div>
    </Flow>
  );
}
