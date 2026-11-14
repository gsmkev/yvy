import { useState } from "react";
import { motion } from "framer-motion";
import { useMotionPreference as useReducedMotion } from "@/hooks/use-motion-preference";
import { site } from "@/content/site";
import { farmPlots, toPath, centroid, vigorColor, mix } from "@/lib/geo";
import { EASE, FadeIn, SignalZone, Title } from "./primitives";

type LayerId = "vigor" | "lluvia" | "temp" | "humedad";

const fillFor = (id: LayerId, p: (typeof farmPlots)[number]) => {
  if (id === "vigor") return vigorColor(p.vigor);
  if (id === "lluvia") return mix("var(--lino-2)", "var(--cielo)", 0.2 + p.lluvia * 0.8);
  if (id === "temp") return mix("var(--cielo)", "var(--alerta)", p.temp);
  return mix("var(--vigor-1)", "var(--cielo)", p.humedad);
};
const scaleFor: Record<LayerId, string> = {
  vigor: "linear-gradient(90deg, var(--vigor-1), var(--vigor-2), var(--vigor-3), var(--vigor-4), var(--vigor-5))",
  lluvia: "linear-gradient(90deg, var(--lino-2), var(--cielo))",
  temp: "linear-gradient(90deg, var(--cielo), var(--alerta))",
  humedad: "linear-gradient(90deg, var(--vigor-1), var(--cielo))",
};

function Map({ id, onHover }: { id: LayerId; onHover?: (i: number) => void }) {
  return (
    <svg viewBox="0 0 800 500" className="absolute inset-0 h-full w-full">
      {farmPlots.map((p, i) => (
        <g key={p.name} onMouseEnter={() => onHover?.(i)}>
          <polygon points={toPath(p.pts)} fill={fillFor(id, p)} fillOpacity={0.85} stroke="var(--surco)" strokeWidth={2} />
          <text x={centroid(p.pts)[0]} y={centroid(p.pts)[1]} textAnchor="middle" fill="var(--surco)" style={{ font: "500 11px var(--font-mono)", letterSpacing: "0.06em" }}>
            {p.name}
          </text>
        </g>
      ))}
    </svg>
  );
}

function Spark({ s }: { s: number[] }) {
  const d = s.map((v, i) => `${i === 0 ? "M" : "L"}${(i / (s.length - 1)) * 200} ${60 - v * 55}`).join(" ");
  return (
    <svg viewBox="0 0 200 62" className="mt-4 h-14 w-full max-w-[220px]">
      <path d={d} fill="none" stroke="var(--soja)" strokeWidth={1.5} />
    </svg>
  );
}

export function Satelite() {
  const [layer, setLayer] = useState<LayerId>("vigor");
  const [prev, setPrev] = useState<LayerId>("vigor");
  const [hover, setHover] = useState(3);
  const reduce = useReducedMotion();
  const L = site.satelite.layers.find((l) => l.id === layer)!;
  const p = farmPlots[hover]!;
  const avg = farmPlots.reduce((a, x) => a + x.vigor, 0) / farmPlots.length;
  const diff = Math.round(((p.vigor - avg) / avg) * 100);

  return (
    <SignalZone mode="online" id="satelite" className="bg-surco px-5 py-28 text-lino md:px-10 md:py-40">
      <Title text={site.satelite.title} className="max-w-[16ch]" />
      <FadeIn><p className="body-yvy mt-8 text-lino/80">{site.satelite.lead}</p></FadeIn>

      <div className="mt-16 grid gap-10 lg:grid-cols-[1fr_300px]">
        <div className="relative aspect-[8/5] w-full overflow-hidden bg-surco-2">
          <Map id={prev} />
          <motion.div
            key={layer}
            className="absolute inset-0"
            initial={reduce ? false : { clipPath: "inset(0 100% 0 0)" }}
            animate={{ clipPath: "inset(0 0% 0 0)" }}
            transition={{ duration: 1, ease: EASE }}
            onAnimationComplete={() => setPrev(layer)}
          >
            <Map id={layer} onHover={setHover} />
          </motion.div>
        </div>
        <aside className="border-l border-soja pl-5" aria-live="polite">
          <p className="mono-yvy text-lino/60">{p.name} · {p.crop} · {p.ha} HA</p>
          <p className="mt-3 font-display text-5xl">{p.vigor.toFixed(2).replace(".", ",")}</p>
          <p className="mono-yvy mt-2">VIGOR · {diff > 0 ? "+" : "−"}{Math.abs(diff)}% VS. PROMEDIO DEL CAMPO</p>
          <p className="mono-yvy mt-1">LLUVIA 30 D: {Math.round(p.lluvia * 130)} MM</p>
          <Spark s={p.series} />
          <p className="mono-yvy mt-1 text-lino/50">VIGOR EN LA CAMPAÑA</p>
        </aside>
      </div>

      <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 border-t border-linea-oscuro pt-6" role="radiogroup" aria-label="Capas del mapa">
        {site.satelite.layers.map((l) => (
          <button
            key={l.id}
            role="radio"
            aria-checked={layer === l.id}
            onClick={() => layer !== l.id && setLayer(l.id as LayerId)}
            className={`mono-yvy link-yvy text-[13px] ${layer === l.id ? "link-on text-lino" : "text-lino/55"}`}
          >
            {l.label}
          </button>
        ))}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <p className="max-w-[52ch] text-[17px] text-lino/80">{L.text}</p>
        <div className="w-full md:w-72">
          <div className="h-[3px] w-full" style={{ background: scaleFor[layer] }} />
          <div className="mono-yvy mt-2 flex justify-between text-[11px] text-lino/60"><span>{L.scale[0]}</span><span>{L.scale[1]}</span></div>
          <p className="mono-yvy mt-2 text-[11px] text-trigo">{L.source}</p>
        </div>
      </div>
    </SignalZone>
  );
}
