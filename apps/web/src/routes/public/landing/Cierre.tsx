import { useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring } from "framer-motion";
import { WhatsappLink } from "./actions";
import { audiences, datosRows, faq, L, tarifaRows } from "./content";
import { media } from "./media";
import { EASE, FadeIn, SignalZone, Title } from "./primitives";
import { useMotionPreference as useReducedMotion } from "./useMotionPreference";

export function ParaQuien() {
  const [active, setActive] = useState<number | null>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 120, damping: 30 });
  const sy = useSpring(my, { stiffness: 120, damping: 30 });
  const ref = useRef<HTMLDivElement>(null);
  const list = audiences();
  return (
    <SignalZone mode="offline" className="relative bg-lino-2 px-5 py-28 text-surco md:px-10 md:py-40">
      <p className="mono-yvy mb-10 text-surco/70">{L("paraQuien.label")}</p>
      <div
        ref={ref}
        className="relative border-t border-linea-claro"
        onMouseMove={(e) => {
          const r = ref.current!.getBoundingClientRect();
          mx.set(e.clientX - r.left);
          my.set(e.clientY - r.top);
        }}
        onMouseLeave={() => setActive(null)}
      >
        {list.map((a, i) => {
          const img = media.audiences[i]!;
          return (
            <div key={a.n}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => setActive(active === i ? null : i)}
                aria-expanded={active === i}
                className="group grid w-full gap-2 border-b border-linea-claro py-6 text-left md:grid-cols-[1fr_auto] md:items-baseline"
              >
                <span className="font-display text-[clamp(2rem,5.5vw,5rem)] leading-[0.95] transition-transform duration-700 ease-[var(--ease-yvy)] md:group-hover:translate-x-6">{a.n}</span>
                <span className="mono-yvy text-surco/80">{a.g}</span>
              </button>
              <AnimatePresence>
                {active === i && (
                  <motion.img
                    src={img.src}
                    srcSet={img.srcSet}
                    sizes="100vw"
                    alt={a.n}
                    loading="lazy"
                    decoding="async"
                    className="media-treat w-full object-cover md:hidden"
                    initial={{ height: 0 }}
                    animate={{ height: 260 }}
                    exit={{ height: 0 }}
                    transition={{ duration: 0.6, ease: EASE }}
                  />
                )}
              </AnimatePresence>
            </div>
          );
        })}
        <motion.div className="pointer-events-none absolute left-0 top-0 z-10 hidden md:block" style={{ x: sx, y: sy }} aria-hidden>
          <AnimatePresence>
            {active !== null && (
              <motion.img
                key={active}
                src={media.audiences[active]!.src}
                srcSet={media.audiences[active]!.srcSet}
                sizes="208px"
                alt=""
                decoding="async"
                className="media-treat absolute h-64 w-52 -translate-x-1/2 -translate-y-1/2 object-cover"
                initial={{ opacity: 0, scale: 1.08 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, ease: EASE }}
              />
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </SignalZone>
  );
}

export function Datos() {
  const reduce = useReducedMotion();
  return (
    <SignalZone mode="online" className="bg-surco px-5 py-28 text-lino md:px-10 md:py-40">
      <Title text={L("datos.title")} className="max-w-[14ch]" />
      <div className="mt-16 text-[16px]">
        <div className="mono-yvy hidden grid-cols-[1.2fr_1.5fr_1fr] gap-6 border-b border-lino/40 pb-3 text-lino/70 md:grid">
          <span>{L("datos.colSource")}</span>
          <span>{L("datos.colMeasures")}</span>
          <span>{L("datos.colFreq")}</span>
        </div>
        {datosRows().map((r, i) => (
          <motion.div
            key={r[0]}
            className="grid gap-1 border-b border-linea-oscuro py-4 md:grid-cols-[1.2fr_1.5fr_1fr] md:gap-6"
            initial={reduce ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-5% 0px" }}
            transition={{ delay: i * 0.06, duration: 0.6, ease: EASE }}
          >
            <span className="font-display text-xl">{r[0]}</span>
            <span className="text-lino/80">{r[1]}</span>
            <span className="mono-yvy text-trigo">{r[2]}</span>
          </motion.div>
        ))}
      </div>
    </SignalZone>
  );
}

export function Tarifas() {
  return (
    <SignalZone mode="offline" id="tarifas" className="bg-lino px-5 py-28 text-surco md:px-10 md:py-40">
      <Title text={L("tarifas.title")} tone="light" className="max-w-[14ch]" />
      <FadeIn>
        <p className="body-yvy mt-8">{L("tarifas.lead")}</p>
      </FadeIn>
      <div className="mt-16 max-w-4xl">
        {tarifaRows().map(([k, v], i) => (
          <FadeIn key={k} delay={i * 0.06} className="flex items-baseline gap-3 py-3">
            <span className={`text-xl leading-tight md:text-3xl ${/\d/.test(k) ? "font-sans tabular-nums" : "font-display"}`}>{k}</span>
            <span className="mb-2 flex-1 border-b border-dotted border-surco/40" aria-hidden />
            <span className="font-mono text-[clamp(13px,1.4vw,17px)] whitespace-nowrap">{v}</span>
          </FadeIn>
        ))}
      </div>
      <p className="mono-yvy mt-10 text-[11px] text-surco/70">{L("tarifas.foot")}</p>
      <WhatsappLink className="mono-yvy mt-6" label={L("tarifas.agroCta")} text="account.agroWhatsappText" />

      <div className="mt-32 grid gap-x-16 md:grid-cols-2">
        <p className="mono-yvy mb-6 text-surco/70 md:col-span-2">{L("tarifas.faqLabel")}</p>
        {faq().map((f) => (
          <FadeIn key={f.q} className="border-t border-linea-claro py-7">
            <h3 className="font-display text-2xl leading-tight md:text-3xl">{f.q}</h3>
            <p className="mt-3 max-w-[48ch] text-[17px] text-surco/85">{f.a}</p>
          </FadeIn>
        ))}
      </div>
    </SignalZone>
  );
}
