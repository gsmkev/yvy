import { useEffect, useRef, useState } from "react";
import { animate, motion, useInView, useMotionValueEvent, useScroll } from "framer-motion";
import { comoPeople, comoRecords, comoSteps, L } from "./content";
import { toPath, type Pt } from "./geo";
import { media } from "./media";
import { EASE, Poster, signal, Vertex } from "./primitives";
import { useMotionPreference as useReducedMotion } from "./useMotionPreference";

// Traced on the real field edges of satellite.jpg (1280x960 -> 800x600).
const MAIN: Pt[] = [[221, 102], [484, 102], [484, 194], [221, 194]];
const ZONES: { pts: Pt[]; c: string; at: Pt }[] = [
  { pts: [[4, 106], [204, 106], [204, 366], [4, 366]], c: "var(--soja)", at: [14, 118] },
  { pts: [[221, 202], [484, 202], [484, 458], [221, 458]], c: "var(--trigo)", at: [232, 214] },
  { pts: [[588, 100], [796, 100], [796, 286], [588, 286]], c: "var(--cielo)", at: [600, 112] },
];
const DOTS: Pt[] = [[110, 250], [360, 330], [700, 220]];

function Counter({ to }: { to: number }) {
  const [v, setV] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return setV(to);
    const c = animate(0, to, { duration: 1.4, ease: EASE, onUpdate: setV });
    return () => c.stop();
  }, [to, reduce]);
  return <>{v.toFixed(1).replace(".", ",")}</>;
}

function Typed({ text, delay }: { text: string; delay: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      className="block overflow-hidden whitespace-nowrap"
      initial={reduce ? false : { width: 0 }}
      animate={{ width: "auto" }}
      transition={{ delay, duration: 0.8, ease: "linear" }}
    >
      {text}
    </motion.span>
  );
}

function Visual({ step }: { step: number }) {
  const synced = step >= 3;
  const people = comoPeople();
  const records = comoRecords();
  return (
    <div className={`relative w-full overflow-hidden bg-surco-2 ${step >= 2 ? "min-h-[320px] aspect-[4/3]" : "aspect-[4/3]"}`}>
      <Poster
        img={media.satellite}
        alt={L("como.mapAlt")}
        sizes="(min-width: 1024px) 58vw, 100vw"
        className="media-treat absolute inset-0 h-full w-full object-cover opacity-80"
      />
      <div className="absolute inset-0 bg-surco/30" />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 800 600" aria-hidden>
        <defs>
          <marker id={`sync-arrow-${step}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 Z" fill="var(--soja)" />
          </marker>
        </defs>
        {/* 01 draw */}
        <motion.polygon
          points={toPath(MAIN)}
          fill="var(--soja)"
          initial={{ fillOpacity: 0 }}
          animate={{ fillOpacity: step >= 0 ? 0.25 : 0 }}
          transition={{ delay: 1.2, duration: 0.5 }}
        />
        <motion.polygon
          points={toPath(MAIN)}
          fill="none"
          stroke="var(--lino)"
          strokeWidth={1.5}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, ease: EASE }}
        />
        {MAIN.map(([x, y], i) => (
          <Vertex key={i} x={x} y={y} fill="var(--lino)" />
        ))}
        {/* 02 assign */}
        {step >= 1 &&
          ZONES.map((z, i) => (
            <motion.polygon
              key={i}
              points={toPath(z.pts)}
              fill={z.c}
              stroke={z.c}
              strokeWidth={1}
              initial={{ fillOpacity: 0, strokeOpacity: 0 }}
              animate={{ fillOpacity: 0.18, strokeOpacity: 0.8 }}
              transition={{ delay: i * 0.2, duration: 0.6 }}
            />
          ))}
        {/* 03 records + 04 threads */}
        {step >= 2 &&
          DOTS.map(([x, y], i) => (
            <motion.rect
              key={i}
              x={x - 7}
              y={y - 7}
              width={14}
              height={14}
              fill={synced ? "var(--soja)" : "transparent"}
              stroke={synced ? "var(--soja)" : "var(--trigo)"}
              strokeDasharray={synced ? "0" : "3 2"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 + i * 0.4, duration: 0.4 }}
            />
          ))}
        {synced &&
          DOTS.map(([x, y], i) => (
            <motion.path
              key={i}
              d={`M650 ${425 + i * 30} Q ${x + 80} ${425 + i * 30}, ${x} ${y + 12}`}
              fill="none"
              stroke="var(--soja)"
              strokeWidth={2}
              markerEnd={`url(#sync-arrow-${step})`}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: i * 0.25, duration: 1, ease: EASE }}
            />
          ))}
      </svg>
      <p className="mono-yvy absolute bottom-4 left-4 bg-surco/80 px-2 py-1 text-lino">
        {L("como.lotTag")} · <Counter to={186.4} /> {L("como.haUnit")}
      </p>
      {step >= 1 && !synced && (
        <div className="absolute inset-0 hidden sm:block">
          {people.map((p, i) => (
            <div key={p.n} className="absolute text-lino" style={{ left: `${(ZONES[i]!.at[0] / 800) * 100}%`, top: `${(ZONES[i]!.at[1] / 600) * 100}%` }}>
              <motion.p className="font-display text-xl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 + i * 0.2 }}>
                {p.n}
              </motion.p>
              <div className="mono-yvy text-[11px] text-lino/80">
                {p.tasks.map((t, j) => (
                  <Typed key={t} text={t} delay={0.6 + i * 0.3 + j * 0.5} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {step >= 2 && (
        <motion.div
          className="absolute bottom-3 right-3 w-[46%] max-w-[230px] rounded-[2px] border border-lino/70 bg-surco p-3 text-lino sm:right-6"
          initial={{ x: "120%" }}
          animate={{ x: 0 }}
          transition={{ duration: 0.9, ease: EASE }}
        >
          <div className="mx-auto mb-3 h-1 w-10 bg-lino/30" />
          <p className={`mono-yvy text-[10px] ${synced ? "text-soja" : "text-trigo"}`}>{synced ? L("como.synced") : L("como.pending")}</p>
          <div className="mt-3 flex flex-col gap-2 pb-6">
            {records.map((r, i) => (
              <motion.p
                key={r}
                className={`px-2 py-2 text-[11px] leading-snug transition-[outline-color] duration-[400ms] ${synced ? "lp-synced" : "lp-pending"}`}
                style={synced ? { background: "linear-gradient(color-mix(in oklab, var(--soja) 18%, transparent), color-mix(in oklab, var(--soja) 18%, transparent)) no-repeat", animation: `sync-fill 400ms ${i * 250}ms both` } : {}}
                initial={synced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + i * 0.4, duration: 0.5 }}
              >
                {r}
              </motion.p>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

function StepText({ i, active }: { i: number; active: boolean }) {
  const s = comoSteps()[i]!;
  return (
    <div>
      <h3 className="h2-yvy">{s.t}</h3>
      <p className={`body-yvy mt-6 ${active ? "" : "opacity-70"}`}>{s.d}</p>
    </div>
  );
}

const BG = ["var(--surco)", "var(--lino)", "var(--lino)", "var(--surco)"];
const FG = ["var(--lino)", "var(--surco)", "var(--surco)", "var(--lino)"];

function Desktop() {
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const inView = useInView(ref, { margin: "-50% 0px -50% 0px" });
  useMotionValueEvent(scrollYProgress, "change", (v) => setStep(Math.min(3, Math.floor(v * 4))));
  useEffect(() => {
    if (inView) signal.set(step === 1 || step === 2 ? "offline" : "online");
  }, [inView, step]);
  return (
    <motion.div ref={ref} className="relative hidden h-[400vh] lg:block" animate={{ backgroundColor: BG[step]!, color: FG[step]! }} transition={{ duration: 0.9, ease: EASE }}>
      <div className="sticky top-0 grid h-screen grid-cols-[5fr_7fr] items-center gap-16 px-10">
        <div>
          <p className="mono-yvy mb-10 opacity-70">{L("como.label")}</p>
          <div className="mb-10 flex gap-4" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="w-14">
                <span className="mono-yvy">{String(i + 1).padStart(2, "0")}</span>
                <div className="mt-2 h-px bg-current opacity-20" />
                <motion.div className="-mt-px h-px origin-left bg-current" animate={{ scaleX: i <= step ? 1 : 0 }} transition={{ duration: 0.6, ease: EASE }} />
              </div>
            ))}
          </div>
          <motion.div key={step} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }}>
            <StepText i={step} active />
          </motion.div>
        </div>
        <Visual step={step} key={step === 0 ? "a" : "b"} />
      </div>
    </motion.div>
  );
}

function MobileStep({ i }: { i: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20% 0px" });
  const live = useInView(ref, { margin: "-50% 0px -50% 0px" });
  useEffect(() => {
    if (live) signal.set(i === 1 || i === 2 ? "offline" : "online");
  }, [live, i]);
  return (
    <div ref={ref} className="px-5 py-16" style={{ backgroundColor: BG[i], color: FG[i] }}>
      <p className="mono-yvy mb-4 opacity-70">{L("como.stepOf", { n: String(i + 1).padStart(2, "0") })}</p>
      <StepText i={i} active />
      <div className="mt-8">{inView && <Visual step={i} />}</div>
    </div>
  );
}

export function ComoFunciona() {
  return (
    <section id="como-funciona">
      <Desktop />
      <div className="lg:hidden">
        {[0, 1, 2, 3].map((i) => (
          <MobileStep key={i} i={i} />
        ))}
      </div>
    </section>
  );
}
