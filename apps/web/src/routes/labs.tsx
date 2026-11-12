import { useState, type ReactNode } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { Button } from "../components/ui";
import { AnimalCountIllustration, HailIllustration, InfraIllustration, StandCountIllustration, WeedsIllustration } from "../components/labs/illustrations";
import { t, tk } from "../lib/i18n";

type ToolId = "animals" | "stand" | "weeds" | "ask" | "summary" | "rust" | "hail" | "infra" | "yield" | "advice";
const TOOLS: ToolId[] = ["animals", "stand", "weeds", "ask", "summary", "rust", "hail", "infra", "yield", "advice"];

const nf = (n: number, digits = 0) =>
  n.toLocaleString("es-PY", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Aviso fijo: toda pantalla del Laboratorio dice que es una vista previa con datos de muestra. */
function PreviewNotice() {
  return <p className="bg-trigo/15 px-4 py-3 text-sm">{t("ui.labsNotice")}</p>;
}

export function LabsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">{t("ui.labsTitle")}</h1>
        <p className="text-sm text-tinta-2">{t("ui.labsIntro")}</p>
      </div>
      <PreviewNotice />
      <ul>
        {TOOLS.map((id) => (
          <li key={id} className="flex flex-wrap items-center gap-3 border-b border-linea py-4">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{tk(`ui.labsTool_${id}_name`)}</div>
              <div className="text-sm text-tinta-2">{tk(`ui.labsTool_${id}_desc`)}</div>
            </div>
            <Link
              to="/laboratorio/$tool"
              params={{ tool: id }}
              className="text-sm font-medium text-accion underline-offset-4 hover:underline"
            >
              {t("ui.labsOpen")}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LabsToolPage() {
  const { tool } = useParams({ strict: false }) as { tool: string };
  const id = TOOLS.find((x) => x === tool);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <Link to="/laboratorio" className="text-sm text-tinta-2 underline-offset-4 hover:text-surco hover:underline">
        {t("ui.labsBack")}
      </Link>
      {!id ? (
        <p>{t("ui.labsUnknownTool")}</p>
      ) : (
        <>
          <div>
            <h1 className="text-xl font-semibold">{tk(`ui.labsTool_${id}_name`)}</h1>
            <p className="text-sm text-tinta-2">{tk(`ui.labsTool_${id}_desc`)}</p>
          </div>
          <PreviewNotice />
          <ToolBody id={id} />
        </>
      )}
    </div>
  );
}

function ToolBody({ id }: { id: ToolId }) {
  switch (id) {
    case "animals":
      return <Animals />;
    case "stand":
      return <Stand />;
    case "weeds":
      return <Weeds />;
    case "ask":
      return <Ask />;
    case "summary":
      return <Summary />;
    case "hail":
      return <Hail />;
    case "infra":
      return <Infra />;
    case "yield":
      return <Yield />;
    case "advice":
      return <Advice />;
    case "rust":
      return <p className="border-b border-linea pb-4">{t("ui.labsRustBody")}</p>;
  }
}

/** Zona de carga simulada: no hay input de archivo y no se envía nada. */
function DropZone() {
  return (
    <div className="flex flex-col items-start gap-2 border border-dashed border-linea px-4 py-6">
      <Button disabled>{t("ui.labsPickFile")}</Button>
      <p className="text-sm text-tinta-2">{t("ui.labsPickFileHelp")}</p>
    </div>
  );
}

/** Pasos comunes: carga simulada, botón del ejemplo y el resultado ilustrativo. */
function Flow({ drop = true, children }: { drop?: boolean; children: ReactNode }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      {drop && <DropZone />}
      <div>
        <Button variant="primary" onClick={() => setShown((v) => !v)} aria-expanded={shown}>
          {shown ? t("ui.labsHideExample") : t("ui.labsShowExample")}
        </Button>
      </div>
      {shown && (
        <section className="flex flex-col gap-4">
          <h2 className="font-serif text-lg font-semibold">{t("ui.labsExampleTitle")}</h2>
          {children}
        </section>
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-tinta-2">
      <span className="inline-block h-2.5 w-2.5 border" style={{ borderColor: color }} aria-hidden />
      {label}
    </p>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-b border-linea pb-3">
      <div className="num font-serif text-5xl leading-none font-semibold">{value}</div>
      <div className="mt-1 text-sm text-tinta-2">{label}</div>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <table className="num w-full text-sm">
      <thead>
        <tr className="border-b border-linea text-left text-tinta-2">
          {head.map((h, i) => (
            <th key={h} className={`py-2 font-medium ${i > 0 ? "text-right" : ""}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r[0]} className="border-b border-linea">
            {r.map((c, i) => (
              <td key={i} className={`py-2 ${i > 0 ? "text-right" : ""}`}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const PADDOCKS = [
  { id: "norte", ha: 38, n: 142 },
  { id: "monte", ha: 27, n: 96 },
  { id: "aguada", ha: 15, n: 58 },
];

function Animals() {
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

function Stand() {
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

function Weeds() {
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

function Hail() {
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

function Infra() {
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

const YIELD_PLOTS = [
  { id: "Norte 1", crop: "soy", ha: 120, low: 3100, high: 3700 },
  { id: "Norte 2", crop: "soy", ha: 92, low: 2900, high: 3500 },
  { id: "Sur 2", crop: "corn", ha: 64, low: 6800, high: 8200 },
] as const;

function Yield() {
  const sum = (k: "low" | "high") => YIELD_PLOTS.reduce((s, p) => s + (p.ha * p[k]) / 1000, 0);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button disabled>{t("ui.labsYieldPick")}</Button>
      </div>
      <Flow drop={false}>
        <p className="text-sm text-tinta-2">
          {t("ui.labsYieldCampaign")} · {t("ui.labsAskFarm")}
        </p>
        <Figure
          value={t("ui.labsYieldTotalValue", { low: nf(sum("low")), high: nf(sum("high")) })}
          label={t("ui.labsYieldTotal")}
        />
        <Table
          head={[t("ui.labsYieldPlot"), t("ui.labsYieldCrop"), t("ui.labsPaddockArea"), t("ui.labsYieldRange")]}
          rows={YIELD_PLOTS.map((p) => [
            p.id,
            tk(`ui.labsYieldCrop_${p.crop}`),
            `${nf(p.ha)} ha`,
            t("ui.labsYieldRangeValue", { low: nf(p.low), high: nf(p.high) }),
          ])}
        />
        <div>
          <h3 className="font-semibold">{t("ui.labsYieldBasis")}</h3>
          <ul className="mt-1 list-disc pl-5 text-sm">
            <li>{t("ui.labsYieldBasis1")}</li>
            <li>{t("ui.labsYieldBasis2")}</li>
            <li>{t("ui.labsYieldBasis3")}</li>
          </ul>
        </div>
        <p className="text-sm">{t("ui.labsYieldNote")}</p>
        <div>
          <Button disabled>{t("ui.labsYieldExport")}</Button>
        </div>
      </Flow>
    </div>
  );
}

function Advice() {
  const sources = [1, 2, 3] as const;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button disabled>{t("ui.labsAdvicePick")}</Button>
      </div>
      <Flow drop={false}>
        <p className="text-sm text-tinta-2">
          {t("ui.labsSummaryDraft")} · {t("ui.labsAdviceWalk")}
        </p>
        <div>
          <h3 className="font-semibold">{t("ui.labsAdviceSource")}</h3>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {sources.map((n) => (
              <li key={n}>{tk(`ui.labsAdviceSource${n}`)}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-semibold">{t("ui.labsAdviceDraftTitle")}</h3>
          <p className="mt-1 border-b border-linea pb-4">{t("ui.labsAdviceText")}</p>
        </div>
        <p className="text-sm">{t("ui.labsAdviceReview")}</p>
        <div>
          <Button disabled>{t("ui.labsAdviceEdit")}</Button>
        </div>
      </Flow>
    </div>
  );
}

function Ask() {
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

function Summary() {
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
