import { useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring } from "framer-motion";
import { useMotionPreference as useReducedMotion } from "@/hooks/use-motion-preference";
import { site } from "@/content/site";
import { media } from "@/content/media";
import { submitLead, type Lead } from "@/lib/leads";
import { EASE, FadeIn, LazyVideo, SignalZone, Title } from "./primitives";

export function ParaQuien() {
  const [active, setActive] = useState<number | null>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 120, damping: 30 });
  const sy = useSpring(my, { stiffness: 120, damping: 30 });
  const ref = useRef<HTMLDivElement>(null);
  return (
    <SignalZone mode="offline" className="relative bg-lino-2 px-5 py-28 text-surco md:px-10 md:py-40">
      <p className="mono-yvy mb-10 text-surco/60">PARA QUIÉN</p>
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
        {site.audiencias.map((a, i) => (
          <div key={a.n}>
            <button
              onMouseEnter={() => setActive(i)}
              onClick={() => setActive(active === i ? null : i)}
              className="group grid w-full gap-2 border-b border-linea-claro py-6 text-left md:grid-cols-[1fr_auto] md:items-baseline"
            >
              <span className="font-display text-[clamp(2rem,5.5vw,5rem)] leading-[0.95] transition-transform duration-700 ease-[var(--ease-yvy)] md:group-hover:translate-x-6">{a.n}</span>
              <span className="mono-yvy text-surco/70">{a.g}</span>
            </button>
            <AnimatePresence>
              {active === i && (
                <motion.img
                  src={media.audiences[i]}
                  alt={a.n}
                  loading="lazy"
                  className="media-treat w-full object-cover md:hidden"
                  initial={{ height: 0 }}
                  animate={{ height: 260 }}
                  exit={{ height: 0 }}
                  transition={{ duration: 0.6, ease: EASE }}
                />
              )}
            </AnimatePresence>
          </div>
        ))}
        <motion.div className="pointer-events-none absolute left-0 top-0 z-10 hidden md:block" style={{ x: sx, y: sy }}>
          <AnimatePresence>
            {active !== null && (
              <motion.img
                key={active}
                src={media.audiences[active]}
                alt=""
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
      <Title text={site.datos.title} className="max-w-[14ch]" />
      <div className="mt-16 text-[16px]">
        <div className="mono-yvy hidden grid-cols-[1.2fr_1.5fr_1fr] gap-6 border-b border-lino/40 pb-3 text-lino/60 md:grid">
          <span>FUENTE</span><span>QUÉ MIDE</span><span>FRECUENCIA</span>
        </div>
        {site.datos.rows.map((r, i) => (
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
      <Title text={site.tarifas.title} tone="light" className="max-w-[14ch]" />
      <FadeIn><p className="body-yvy mt-8">{site.tarifas.lead}</p></FadeIn>
      <div className="mt-16 max-w-4xl">
        {site.tarifas.rows.map(([k, v], i) => (
          <FadeIn key={k} delay={i * 0.06} className="flex items-baseline gap-3 py-3">
            <span className={`text-xl leading-tight md:text-3xl ${/\d/.test(k ?? "") ? "font-sans tabular-nums" : "font-display"}`}>{k}</span>
            <span className="mb-2 flex-1 border-b border-dotted border-surco/40" />
            <span className="font-mono text-[clamp(13px,1.4vw,17px)] whitespace-nowrap">{v}</span>
          </FadeIn>
        ))}
      </div>
      <p className="mono-yvy mt-10 text-[11px] text-surco/60">{site.tarifas.foot}</p>

      <div className="mt-32 grid gap-x-16 md:grid-cols-2">
        <p className="mono-yvy mb-6 text-surco/60 md:col-span-2">PREGUNTAS</p>
        {site.faq.map((f) => (
          <FadeIn key={f.q} className="border-t border-linea-claro py-7">
            <h3 className="font-display text-2xl leading-tight md:text-3xl">{f.q}</h3>
            <p className="mt-3 max-w-[48ch] text-[17px] text-surco/80">{f.a}</p>
          </FadeIn>
        ))}
      </div>
    </SignalZone>
  );
}

const Field = ({ n, label, children }: { n: string; label: string; children: React.ReactNode }) => (
  <label className="grid grid-cols-[28px_1fr] gap-x-3 py-3">
    <span className="mono-yvy pt-1 text-lino/50">{n}</span>
    <span>
      <span className="mono-yvy block text-lino/70">{label}</span>
      {children}
    </span>
  </label>
);
const inputCls = "mt-1 w-full border-0 border-b border-lino/60 bg-transparent py-2 text-lg text-lino outline-none focus:border-trigo";

export function CTA() {
  const [state, setState] = useState<"idle" | "saving" | "done">("idle");
  const [crops, setCrops] = useState<string[]>([]);
  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setState("saving");
    await submitLead({ ...(Object.fromEntries(fd) as Omit<Lead, "crops">), crops });
    setState("done");
  };
  return (
    <SignalZone mode="online" id="probar" className="relative overflow-hidden bg-surco text-lino">
      <LazyVideo src={media.cta.video} poster={media.cta.poster} className="media-treat absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-surco/75" />
      <div className="relative px-5 py-28 md:px-10 md:py-40">
        <Title text={site.cta.title} className="trial-title max-w-[20ch]" />
        <FadeIn><p className="body-yvy mt-8 text-lino/85">{site.cta.lead}</p></FadeIn>
        <form onSubmit={onSubmit} className="mt-14 max-w-3xl">
          <div className="grid md:grid-cols-2 md:gap-x-10">
            <Field n="01" label="NOMBRE"><input required name="name" className={inputCls} autoComplete="name" /></Field>
            <Field n="02" label="WHATSAPP">
              <span className="flex items-baseline gap-2"><span className="font-mono text-lino/60">+595</span><input required name="whatsapp" inputMode="tel" className={inputCls} /></span>
            </Field>
            <Field n="03" label="ESTANCIA O EMPRESA"><input name="company" className={inputCls} /></Field>
            <Field n="05" label="HECTÁREAS APROXIMADAS"><input name="hectares" inputMode="numeric" className={inputCls} /></Field>
            <Field n="06" label="CANTIDAD DE EMPLEADOS EN EL CAMPO"><input name="employees" inputMode="numeric" className={inputCls} /></Field>
            <Field n="07" label="DEPARTAMENTO"><input name="department" className={inputCls} /></Field>
          </div>
          <div className="grid grid-cols-[28px_1fr] gap-x-3 py-3">
            <span className="mono-yvy pt-1 text-lino/50">04</span>
            <div>
              <span className="mono-yvy block text-lino/70">QUÉ PRODUCÍS</span>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                {site.cta.crops.map((c) => {
                  const on = crops.includes(c);
                  return (
                    <button type="button" key={c} aria-pressed={on} onClick={() => setCrops(on ? crops.filter((x) => x !== c) : [...crops, c])}
                      className={`link-yvy font-display text-2xl ${on ? "link-on text-soja" : "text-lino/70"}`}>
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <button
            type="submit"
            disabled={state !== "idle"}
            className={`mono-yvy mt-10 block w-full px-6 py-6 text-left text-[14px] transition-colors duration-[400ms] ${
              state === "saving" ? "pending bg-transparent text-trigo" : "bg-soja text-lino"
            }`}
          >
            {state === "idle" ? site.cta.submit : state === "saving" ? site.cta.saving : <span className="font-sans text-lg normal-case tracking-normal">{site.cta.done}</span>}
          </button>
          <a href={site.cta.whatsapp} target="_blank" rel="noreferrer" className="link-yvy mt-6 inline-block">{site.cta.whatsappLabel}</a>
        </form>
      </div>
    </SignalZone>
  );
}

export function Footer() {
  return (
    <footer className="overflow-hidden bg-surco px-5 pt-20 text-lino md:px-10">
      <div className="grid gap-10 border-t border-linea-oscuro pt-8 md:grid-cols-[1fr_1fr_1.4fr]">
        <div className="mono-yvy">
          <p>{site.footer.coords}</p>
          <a href={`mailto:${site.footer.contact}`} className="link-yvy mt-2 normal-case">{site.footer.contact}</a>
        </div>
        <nav className="mono-yvy flex flex-col gap-1">
          {site.nav.map((n) => <a key={n.href} href={n.href} className="link-yvy w-fit">{n.label}</a>)}
        </nav>
        <div>
          <p className="text-[13px] text-lino/60">{site.footer.attribution}</p>
          <p className="mono-yvy mt-4 text-lino/50">{site.footer.copy}</p>
        </div>
      </div>
      <svg className="mt-10 block w-full select-none pb-4 font-display text-lino" viewBox="0 0 1000 540" aria-hidden>
        <text x="10" y="385" fontSize="460" fill="currentColor" textLength="980" lengthAdjust="spacingAndGlyphs">{site.brand}</text>
      </svg>
    </footer>
  );
}
