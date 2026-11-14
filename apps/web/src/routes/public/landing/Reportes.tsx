import { useRef } from "react";
import { motion, useTransform } from "framer-motion";
import { L, reporteEvents, reporteRows } from "./content";
import { media } from "./media";
import { Contours, FadeIn, SignalZone, Title, useSmoothProgress } from "./primitives";
import { useMotionPreference as useReducedMotion } from "./useMotionPreference";

function Sheet({ children }: { children: React.ReactNode }) {
  return <div className="aspect-[1/1.414] w-full bg-lino p-5 text-surco outline outline-1 outline-linea-claro md:p-7">{children}</div>;
}

function Parte() {
  return (
    <Sheet>
      <p className="mono-yvy text-[9px] md:text-[10px]">{L("reportes.sheet1")}</p>
      <div className="mt-3 h-px bg-surco" />
      <svg viewBox="0 0 300 110" className="mt-4 w-full bg-lino-2" aria-hidden>
        <polygon points="20,15 140,10 150,95 25,100" fill="none" stroke="var(--surco)" strokeOpacity={0.4} />
        <polygon points="160,12 285,18 280,98 158,92" fill="none" stroke="var(--surco)" strokeOpacity={0.4} />
        {([[70, 40], [210, 55], [100, 80], [240, 30], [120, 30]] as [number, number][]).map(([x, y], i) => (
          <rect key={i} x={x - 3} y={y - 3} width={6} height={6} fill="var(--soja)" />
        ))}
      </svg>
      <table className="mt-4 w-full text-left text-[8px] md:text-[10px]">
        <tbody>
          {reporteRows().map((r) => (
            <tr key={r.join()} className="border-b border-linea-claro">
              {r.map((c, i) => (
                <td key={i} className={`py-1 ${i < 2 ? "font-mono" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {media.audiences.slice(0, 3).map((s, i) => (
          <img
            key={i}
            src={s.src}
            srcSet={s.srcSet}
            sizes="(min-width: 1024px) 120px, 25vw"
            alt=""
            loading="lazy"
            decoding="async"
            width={s.width}
            height={s.height}
            className="media-treat aspect-square w-full object-cover"
          />
        ))}
      </div>
    </Sheet>
  );
}

function Campana() {
  return (
    <Sheet>
      <p className="mono-yvy text-[9px] md:text-[10px]">{L("reportes.sheet2")}</p>
      <div className="mt-3 h-px bg-surco" />
      <svg viewBox="0 0 300 120" className="mt-5 w-full" aria-hidden>
        <path d="M0 110 C 60 100, 90 60, 150 35 S 250 25, 300 30" fill="none" stroke="var(--soja)" strokeWidth={2} />
        <path d="M0 110 C 60 104, 100 75, 150 55 S 250 45, 300 48" fill="none" stroke="var(--surco)" strokeDasharray="3 3" />
      </svg>
      <p className="mono-yvy text-[8px]">{L("reportes.vigorVs")}</p>
      <svg viewBox="0 0 300 60" className="mt-5 w-full" aria-hidden>
        {Array.from({ length: 30 }).map((_, i) => (
          <rect key={i} x={i * 10} y={60 - ((i * 37) % 50) - 4} width={3} height={((i * 37) % 50) + 4} fill="var(--cielo)" />
        ))}
      </svg>
      <p className="mono-yvy text-[8px]">{L("reportes.rainTotal")}</p>
      <div className="mt-5 text-[9px] md:text-[11px]">
        {reporteEvents().map(([d, t]) => (
          <p key={d} className="flex justify-between border-b border-linea-claro py-1">
            <span className="font-mono">{d}</span>
            <span>{t}</span>
          </p>
        ))}
      </div>
    </Sheet>
  );
}

export function Reportes() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const p = useSmoothProgress(ref);
  const x1 = useTransform(p, [0.2, 0.6], ["6%", "-6%"]);
  const x2 = useTransform(p, [0.2, 0.6], ["-6%", "8%"]);
  const r2 = useTransform(p, [0.2, 0.6], [-1, 3]);
  return (
    <SignalZone mode="offline" className="relative overflow-hidden bg-lino px-5 py-28 text-surco md:px-10 md:py-40">
      <Contours />
      <div className="relative grid gap-16 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div>
          <Title text={L("reportes.title")} tone="light" className="max-w-[12ch]" />
          <FadeIn>
            <p className="body-yvy mt-8">{L("reportes.lead")}</p>
          </FadeIn>
          <p className="mono-yvy mt-8 max-w-[52ch] text-surco/70">{L("reportes.formats")}</p>
        </div>
        <div ref={ref} className="relative mx-auto grid w-full max-w-[620px] grid-cols-2" aria-hidden>
          <motion.div style={reduce ? {} : { x: x1 }} className="relative z-10 translate-y-6">
            <Parte />
          </motion.div>
          <motion.div style={reduce ? {} : { x: x2, rotate: r2 }} className="-ml-[12%]">
            <Campana />
          </motion.div>
        </div>
      </div>
    </SignalZone>
  );
}
