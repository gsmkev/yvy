import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMotionPreference as useReducedMotion } from "@/hooks/use-motion-preference";
import { site } from "@/content/site";
import { media } from "@/content/media";
import { heroPlots, toPath, centroid } from "@/lib/geo";
import { EASE, LazyVideo, SignalZone, Title, Vertex } from "./primitives";

const VIG = ["var(--vigor-1)", "var(--vigor-2)", "var(--vigor-3)", "var(--vigor-4)", "var(--vigor-5)"];

function DrawnPlots() {
  const reduce = useReducedMotion();
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1920 1088" preserveAspectRatio="xMidYMid slice" aria-hidden>
      {heroPlots.map((p, i) => {
        const d = i * 1.1 + 0.4;
        const [cx, cy] = centroid(p.pts);
        return (
          <g key={i}>
            <motion.polygon
              points={toPath(p.pts)}
              fill={VIG[p.v]}
              initial={reduce ? { fillOpacity: 0.3 } : { fillOpacity: 0 }}
              animate={{ fillOpacity: 0.3 }}
              transition={{ delay: reduce ? 0 : d + 1, duration: reduce ? 0 : 0.6, ease: EASE }}
            />
            <motion.polygon
              points={toPath(p.pts)}
              fill="none"
              stroke="var(--lino)"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: reduce ? 0 : d, duration: reduce ? 0 : 1.1, ease: EASE }}
            />
            {p.pts.map(([x, y], j) => (
              <motion.g key={j} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduce ? 0 : d + j * 0.25, duration: reduce ? 0 : 0.3 }}>
                <Vertex x={x} y={y} fill="var(--lino)" />
              </motion.g>
            ))}
            <motion.text
              x={cx}
              y={cy}
              textAnchor="middle"
              className="hidden md:block"
              fill="var(--lino)"
              style={{ font: "500 15px var(--font-mono)", letterSpacing: "0.06em" }}
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: reduce ? 0 : d + 1.2, duration: reduce ? 0 : 0.6 }}
            >
              {site.hero.plots[i]}
            </motion.text>
          </g>
        );
      })}
    </svg>
  );
}

function ClickPolygons({ area }: { area: React.RefObject<HTMLElement | null> }) {
  const [pts, setPts] = useState<[number, number][]>([]);
  const [closed, setClosed] = useState<{ id: number; pts: [number, number][] }[]>([]);
  useEffect(() => {
    const el = area.current;
    if (!el || !window.matchMedia("(pointer: fine)").matches) return;
    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("a,button")) return;
      const r = el.getBoundingClientRect();
      const p: [number, number] = [e.clientX - r.left, e.clientY - r.top];
      setPts((prev) => {
        const next = [...prev, p];
        if (next.length === 3) {
          const id = Date.now();
          setClosed((c) => [...c, { id, pts: next }]);
          setTimeout(() => setClosed((c) => c.filter((x) => x.id !== id)), 1600);
          return [];
        }
        return next;
      });
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [area]);
  return (
    <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full" aria-hidden>
      {pts.map(([x, y], i) => (
        <Vertex key={i} x={x} y={y} fill="var(--trigo)" />
      ))}
      {pts.length === 2 && <line x1={pts[0]![0]} y1={pts[0]![1]} x2={pts[1]![0]} y2={pts[1]![1]} stroke="var(--trigo)" strokeDasharray="3 3" />}
      <AnimatePresence>
        {closed.map((c) => (
          <motion.polygon
            key={c.id}
            points={toPath(c.pts)}
            fill="var(--soja)"
            fillOpacity={0.25}
            stroke="var(--soja)"
            strokeWidth={1.5}
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 1.5, ease: EASE }}
          />
        ))}
      </AnimatePresence>
    </svg>
  );
}

export function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false);
  return (
    <SignalZone mode="online" className="hero-yvy relative overflow-hidden bg-surco text-lino">
      <div ref={ref} className="absolute inset-0">
        <LazyVideo src={media.hero.video} poster={media.hero.poster} eager className="media-treat absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-surco/55" />
        <DrawnPlots />
        <ClickPolygons area={ref} />
      </div>

      <header className="relative z-20 flex items-start justify-between px-5 pt-4 md:px-10 md:pt-5">
        <a href="#" className="font-display text-3xl leading-none md:text-4xl">{site.brand}</a>
        <nav className="mr-44 hidden gap-6 pt-2 lg:flex">
          {site.nav.map((n) => (
            <a key={n.href} href={n.href} className="link-yvy mono-yvy">{n.label}</a>
          ))}
        </nav>
        <button onClick={() => setMenu(true)} className="link-yvy mono-yvy mr-40 pt-2 lg:hidden">Menú</button>
      </header>

      <div className="hero-copy relative z-20 bg-surco px-5 py-8 md:px-10 md:py-10">
        <Title as="h1" text={site.hero.title} className="max-w-[23ch]" />
        <div className="pointer-events-auto mt-6 flex flex-col gap-6 md:mt-8 md:flex-row md:items-end md:justify-between">
          <p className="body-yvy max-w-[48ch] text-lino/85">{site.hero.lead}</p>
          <div className="flex flex-col gap-2 md:items-end">
            <a href="#probar" className="link-yvy link-on font-sans text-2xl tabular-nums lg:text-3xl">{site.hero.cta}</a>
            <span className="mono-yvy text-lino/60">{site.hero.note}</span>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {menu && (
          <motion.div
            className="fixed inset-0 z-[70] flex flex-col bg-surco px-5 pt-5 text-lino"
            initial={{ clipPath: "inset(0 0 100% 0)" }}
            animate={{ clipPath: "inset(0 0 0% 0)" }}
            exit={{ clipPath: "inset(0 0 100% 0)" }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            <div className="flex justify-between">
              <span className="font-display text-3xl">{site.brand}</span>
              <button onClick={() => setMenu(false)} className="mono-yvy link-yvy mr-40">Cerrar</button>
            </div>
            <nav className="mt-12 flex flex-col">
              {site.nav.map((n) => (
                <a key={n.href} href={n.href} onClick={() => setMenu(false)} className="border-b border-linea-oscuro py-3 font-display text-[2.6rem] leading-none">
                  {n.label}
                </a>
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </SignalZone>
  );
}

export function Cursor() {
  const [pos, setPos] = useState({ x: -50, y: -50 });
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    setOn(true);
    document.body.classList.add("has-cursor");
    const m = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", m);
    return () => {
      window.removeEventListener("mousemove", m);
      document.body.classList.remove("has-cursor");
    };
  }, []);
  if (!on) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-[80] h-2 w-2 bg-trigo mix-blend-difference"
      style={{ transform: `translate(${pos.x - 4}px, ${pos.y - 4}px)` }}
    />
  );
}
