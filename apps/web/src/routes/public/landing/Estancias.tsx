import { useRef, useState } from "react";
import { motion, useMotionValueEvent, useScroll } from "framer-motion";
import { estanciaList, L } from "./content";
import { SignalZone, Title } from "./primitives";

const PY = "M15.0,160.0 L32.2,103.0 L33.3,77.3 L54.3,35.4 L130.4,21.6 L171.0,22.2 L211.6,46.6 L212.4,61.3 L225.3,87.8 L222.4,152.4 L268.5,161.6 L286.3,152.2 L315.8,165.1 L324.0,179.3 L328.1,223.0 L333.2,241.3 L349.5,243.4 L365.9,235.7 L381.6,244.4 L381.5,270.6 L375.6,298.7 L367.1,326.2 L359.9,368.3 L320.3,404.7 L285.8,412.4 L236.7,405.1 L192.7,392.2 L235.7,319.8 L229.4,298.7 L184.4,280.1 L131.0,244.9 L95.3,237.7 L15.0,160.0 Z";
const RIO = "M213.1,62.4 C 222,90 224,120 221.8,152.9 S 236,210 239.3,224.3 S 248,270 239.3,291.0 S 222,325 215.3,338.6 S 204,380 193.4,400.6";
const mini = (x: number, y: number) => `${x - 9},${y - 7} ${x + 10},${y - 9} ${x + 8},${y + 8} ${x - 8},${y + 7}`;

function Country({ active }: { active: number }) {
  return (
    <svg viewBox="0 0 400 430" className="h-full w-full" aria-hidden>
      <path d={PY} fill="none" stroke="var(--lino)" strokeOpacity={0.7} strokeWidth={1} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <path d={RIO} fill="none" stroke="var(--cielo)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
      <path d={PY} fill="var(--lino)" fillOpacity={0.04} stroke="none" />
      <rect x={233.3} y={301.8} width={5} height={5} fill="var(--lino)" />
      <text x={243} y={308} fill="var(--lino)" fillOpacity={0.6} style={{ font: "500 8px var(--font-mono)", letterSpacing: "0.06em" }}>{L("estancias.asuncion")}</text>
      <text x={60} y={120} fill="var(--lino)" fillOpacity={0.35} style={{ font: "500 8px var(--font-mono)", letterSpacing: "0.1em" }}>{L("estancias.chaco")}</text>
      <text x={265} y={215} fill="var(--lino)" fillOpacity={0.35} style={{ font: "500 8px var(--font-mono)", letterSpacing: "0.1em" }}>{L("estancias.oriental")}</text>
      {estanciaList().map((e, i) => (
        <polygon key={e.line} points={mini(e.x, e.y)} fill={i === active ? "var(--soja)" : "transparent"} fillOpacity={0.4} stroke={e.warn ? "var(--trigo)" : "var(--soja)"} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

function Desktop() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => setActive(Math.min(2, Math.floor(v * 3))));
  const list = estanciaList();
  return (
    <div ref={ref} className="relative hidden h-[300vh] lg:block">
      <div className="sticky top-0 grid h-screen grid-cols-[1fr_1fr] items-center gap-10 px-10">
        <div>
          <Title text={L("estancias.title")} className="max-w-[12ch]" />
          <motion.p key={active} className="mono-yvy mt-12 max-w-[44ch] border-l border-soja pl-4 text-[13px]" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} aria-live="polite">
            {list[active]?.line}
          </motion.p>
        </div>
        <div className="relative h-[80vh] overflow-hidden">
          <motion.div className="h-full w-full" animate={{ scale: 1 }}>
            <Country active={active} />
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export function Estancias() {
  return (
    <SignalZone mode="online" className="bg-surco text-lino">
      <Desktop />
      <div className="px-5 py-28 lg:hidden">
        <Title text={L("estancias.title")} />
        <div className="mt-12 flex flex-col">
          {estanciaList().map((e, i) => (
            <div key={e.line} className="grid grid-cols-[96px_1fr] items-center gap-4 border-t border-linea-oscuro py-5">
              <div className="h-24 w-24">
                <Country active={i} />
              </div>
              <p className="mono-yvy text-[11px]">{e.line}</p>
            </div>
          ))}
        </div>
      </div>
    </SignalZone>
  );
}
