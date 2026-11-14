import { useRef } from "react";
import { motion, useTransform, type MotionValue } from "framer-motion";
import { useMotionPreference as useReducedMotion } from "@/hooks/use-motion-preference";
import { site } from "@/content/site";
import { Contours, FadeIn, SignalZone, useSmoothProgress } from "./primitives";

function Word({ w, i, n, p }: { w: string; i: number; n: number; p: MotionValue<number> }) {
  const op = useTransform(p, [i / n, (i + 1) / n], [0.15, 1]);
  return <motion.span style={{ opacity: op }}>{w} </motion.span>;
}

export function SinSenal() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const p = useSmoothProgress(ref, ["start 0.8", "end 0.5"]);
  const words = site.sinSenal.quote.split(" ");
  return (
    <SignalZone mode="offline" id="sin-senal" className="relative overflow-hidden bg-lino px-5 py-28 text-surco md:px-10 md:py-40">
      <Contours />
      <div ref={ref} className="relative">
        <p className="mono-yvy mb-8 text-surco/60">01 · EL PROBLEMA</p>
        <p className="h2-yvy max-w-[18ch]">
          {reduce ? site.sinSenal.quote : words.map((w, i) => <Word key={i} w={w} i={i} n={words.length} p={p} />)}
        </p>
      </div>
      <div className="relative mt-20 grid border-t border-linea-claro md:grid-cols-3">
        {site.sinSenal.facts.map((f, i) => (
          <FadeIn key={f.k} delay={i * 0.08} className="border-b border-linea-claro py-6 md:border-b-0 md:border-l md:px-6 md:first:border-l-0 md:first:pl-0">
            <p className="mono-yvy text-trigo">{f.k}</p>
            <p className="mt-3 max-w-[34ch] text-[17px]">{f.v}</p>
          </FadeIn>
        ))}
      </div>
    </SignalZone>
  );
}
