import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { useMotionPreference as useReducedMotion } from "@/hooks/use-motion-preference";
import { site } from "@/content/site";
import { EASE, FadeIn, SignalZone, Title } from "./primitives";

const MIN = [9, 7, 4, -1, 2, 6, 9, 12, 14, 15, 17, 18, 16, 15];
const RAIN = [0, 4, 12, 0, 0, 2, 0, 0, 0, 0, 0, 0, 1, 0];

export function Imprevistos() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20% 0px" });
  const reduce = useReducedMotion();
  const W = 1400;
  const col = W / 14;
  const y = (t: number) => 150 - (t + 2) * 6;
  const d = MIN.map((t, i) => `${i ? "L" : "M"}${i * col + col / 2} ${y(t)}`).join(" ");
  const show = inView || reduce;

  return (
    <SignalZone mode="online" id="imprevistos" className="bg-surco-2 px-5 py-28 text-lino md:px-10 md:py-40">
      <Title text={site.imprevistos.title} />
      <FadeIn><p className="body-yvy mt-8 text-lino/80">{site.imprevistos.lead}</p></FadeIn>

      <div ref={ref} className="no-scrollbar mt-16 overflow-x-auto">
        <div className="relative min-w-[900px]">
          <div className="mono-yvy mb-2 grid grid-cols-14 text-[10px] text-lino/50" style={{ gridTemplateColumns: "repeat(14,1fr)" }}>
            {MIN.map((_, i) => <span key={i} className="pl-2">D{i + 1}</span>)}
          </div>
          <svg viewBox={`0 0 ${W} 260`} className="w-full" aria-label="Pronóstico de 14 días">
            {MIN.map((_, i) => <line key={i} x1={i * col} x2={i * col} y1={0} y2={260} stroke="var(--linea-oscuro)" />)}
            <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--cielo)" strokeDasharray="2 4" strokeOpacity={0.5} />
            <motion.path d={d} fill="none" stroke="var(--lino)" strokeWidth={1.5} initial={{ pathLength: 0 }} animate={{ pathLength: show ? 1 : 0 }} transition={{ duration: 1.6, ease: EASE }} />
            {RAIN.map((r, i) => (
              <motion.rect key={i} x={i * col + col / 2 - 3} width={6} y={180} fill="var(--cielo)" initial={{ height: 0 }} animate={{ height: show ? r * 5 + 1 : 0 }} transition={{ delay: 0.8 + i * 0.04, duration: 0.6 }} />
            ))}
            {site.imprevistos.marks.map((m) => (
              <motion.g key={m.text} initial={{ opacity: 0 }} animate={{ opacity: show ? 1 : 0 }} transition={{ delay: 1.4, duration: 0.6 }}>
                <rect x={(m.day - 1) * col} y={0} width={m.span * col} height={260} fill={`var(--${m.tone})`} fillOpacity={0.08} />
                <line x1={(m.day - 1) * col + 1} x2={(m.day - 1) * col + 1} y1={0} y2={260} stroke={`var(--${m.tone})`} strokeWidth={2} />
              </motion.g>
            ))}
          </svg>
          <div className="mt-4 flex flex-col gap-2">
            {site.imprevistos.marks.map((m) => (
              <p key={m.text} className="mono-yvy border-l-2 pl-3 text-[11px]" style={{ marginLeft: `${((m.day - 1) / 14) * 100}%`, borderColor: `var(--${m.tone})` }}>
                D{m.day}{m.span > 1 ? `–${m.day + m.span - 1}` : ""} · {m.text}
              </p>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-24 border-t border-linea-oscuro">
        {site.imprevistos.index.map((it, i) => (
          <FadeIn key={it.n} delay={i * 0.06} className="grid gap-3 border-b border-linea-oscuro py-8 md:grid-cols-[1.2fr_1.5fr_auto] md:items-baseline md:gap-10">
            <h3 className="font-display text-[clamp(2.2rem,5vw,4rem)] leading-none">{it.n}</h3>
            <p className="max-w-[44ch] text-[17px] text-lino/80">{it.d}</p>
            <p className="mono-yvy text-trigo">{it.a}</p>
          </FadeIn>
        ))}
      </div>
      <p className="mono-yvy mt-8 text-[11px] text-lino/50">{site.imprevistos.foot}</p>
    </SignalZone>
  );
}
