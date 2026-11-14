import { useState } from "react";
import { motion } from "framer-motion";
import { L, LAYER_IDS, layerInfo, type LayerId } from "./content";
import { farmPlots, toPath, centroid, vigorColor, mix, type FarmPlot } from "./geo";
import { LeadForm } from "./LeadForm";
import { EASE, FadeIn, SignalZone, Title } from "./primitives";
import { useMotionPreference as useReducedMotion } from "./useMotionPreference";

const fillFor = (id: LayerId, p: FarmPlot) => {
  if (id === "vigor") return vigorColor(p.vigor);
  if (id === "lluvia") return mix("var(--lino-2)", "var(--cielo)", 0.2 + p.lluvia * 0.8);
  if (id === "temp") return mix("var(--cielo)", "var(--alerta)", p.temp);
  return mix("var(--vigor-1)", "var(--cielo)", p.balance);
};
const scaleFor: Record<LayerId, string> = {
  vigor: "linear-gradient(90deg, var(--vigor-1), var(--vigor-2), var(--vigor-3), var(--vigor-4), var(--vigor-5))",
  lluvia: "linear-gradient(90deg, var(--lino-2), var(--cielo))",
  temp: "linear-gradient(90deg, var(--cielo), var(--alerta))",
  balance: "linear-gradient(90deg, var(--vigor-1), var(--cielo))",
};

const plotName = (p: FarmPlot) => L(p.kind === "lote" ? "satelite.lote" : "satelite.potrero", { n: p.n });
const plotCrop = (p: FarmPlot) => L(`satelite.crop${p.crop}`);
const plotLine = (p: FarmPlot) => L("satelite.plotLine", { name: plotName(p), crop: plotCrop(p), ha: p.ha });

function PlotMap({ id, onHover }: { id: LayerId; onHover?: (i: number) => void }) {
  return (
    <svg viewBox="0 0 800 500" className="absolute inset-0 h-full w-full" role={onHover ? "group" : undefined} aria-hidden={onHover ? undefined : true}>
      {farmPlots.map((p, i) => (
        <g
          key={i}
          onMouseEnter={() => onHover?.(i)}
          onFocus={() => onHover?.(i)}
          tabIndex={onHover ? 0 : undefined}
          aria-label={onHover ? plotLine(p) : undefined}
        >
          <polygon points={toPath(p.pts)} fill={fillFor(id, p)} fillOpacity={0.85} stroke="var(--surco)" strokeWidth={2} />
          <text x={centroid(p.pts)[0]} y={centroid(p.pts)[1]} textAnchor="middle" fill="var(--surco)" style={{ font: "500 11px var(--font-mono)", letterSpacing: "0.06em" }}>
            {plotName(p)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function Spark({ s }: { s: number[] }) {
  const d = s.map((v, i) => `${i === 0 ? "M" : "L"}${(i / (s.length - 1)) * 200} ${60 - v * 55}`).join(" ");
  return (
    <svg viewBox="0 0 200 62" className="mt-4 h-14 w-full max-w-[220px]" aria-hidden>
      <path d={d} fill="none" stroke="var(--soja)" strokeWidth={1.5} />
    </svg>
  );
}

export function Satelite() {
  const [layer, setLayer] = useState<LayerId>("vigor");
  const [prev, setPrev] = useState<LayerId>("vigor");
  const [hover, setHover] = useState(3);
  const reduce = useReducedMotion();
  const info = layerInfo(layer);
  const p = farmPlots[hover]!;
  const avg = farmPlots.reduce((a, x) => a + x.vigor, 0) / farmPlots.length;
  const diff = Math.round(((p.vigor - avg) / avg) * 100);

  return (
    <SignalZone mode="online" id="satelite" className="bg-surco px-5 py-28 text-lino md:px-10 md:py-40">
      <Title text={L("satelite.title")} className="max-w-[16ch]" />
      <FadeIn>
        <p className="body-yvy mt-8 text-lino/80">{L("satelite.lead")}</p>
      </FadeIn>

      <div className="mt-16 grid gap-10 lg:grid-cols-[1fr_300px]">
        <div className="relative aspect-[8/5] w-full overflow-hidden bg-surco-2">
          <PlotMap id={prev} />
          <motion.div
            key={layer}
            className="absolute inset-0"
            initial={reduce ? false : { clipPath: "inset(0 100% 0 0)" }}
            animate={{ clipPath: "inset(0 0% 0 0)" }}
            transition={{ duration: 1, ease: EASE }}
            onAnimationComplete={() => setPrev(layer)}
          >
            <PlotMap id={layer} onHover={setHover} />
          </motion.div>
        </div>
        <aside className="border-l border-soja pl-5" aria-live="polite">
          <p className="mono-yvy text-lino/70">{plotLine(p)}</p>
          <p className="mt-3 font-display text-5xl">{p.vigor.toFixed(2).replace(".", ",")}</p>
          <p className="mono-yvy mt-2">{L("satelite.vigorVs", { sign: diff > 0 ? "+" : "−", n: Math.abs(diff) })}</p>
          <p className="mono-yvy mt-1">{L("satelite.rain30", { mm: Math.round(p.lluvia * 130) })}</p>
          <Spark s={p.series} />
          <p className="mono-yvy mt-1 text-lino/60">{L("satelite.campaign")}</p>
        </aside>
      </div>

      <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 border-t border-linea-oscuro pt-6" role="radiogroup" aria-label={L("satelite.layersLabel")}>
        {LAYER_IDS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={layer === id}
            onClick={() => layer !== id && setLayer(id)}
            className={`mono-yvy link-yvy text-[13px] ${layer === id ? "link-on text-lino" : "text-lino/65"}`}
          >
            {layerInfo(id).label}
          </button>
        ))}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <p className="max-w-[52ch] text-[17px] text-lino/80">{info.text}</p>
        <div className="w-full md:w-72">
          <div className="h-[3px] w-full" style={{ background: scaleFor[layer] }} />
          <div className="mono-yvy mt-2 flex justify-between text-[11px] text-lino/70">
            <span>{info.scale[0]}</span>
            <span>{info.scale[1]}</span>
          </div>
          <p className="mono-yvy mt-2 text-[11px] text-trigo">{info.source}</p>
        </div>
      </div>

      <LeadForm />
    </SignalZone>
  );
}
