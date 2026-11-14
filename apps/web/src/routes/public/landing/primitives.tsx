import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { motion, useInView, useScroll, useSpring, useTransform, type MotionValue } from "framer-motion";
import { L } from "./content";
import { media } from "./media";
import { useMotionPreference as useReducedMotion } from "./useMotionPreference";

export const EASE = [0.22, 1, 0.36, 1] as const;

/* ---------- Signal store: the narrative thread ---------- */
type SignalMode = "online" | "offline";
let mode: SignalMode = "online";
const listeners = new Set<() => void>();
export const signal = {
  set(m: SignalMode) {
    if (m === mode) return;
    mode = m;
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  get: () => mode,
};
export function useSignal() {
  return useSyncExternalStore(signal.subscribe, signal.get, () => "online" as SignalMode);
}

/** Sets the global signal when this zone crosses the middle of the viewport. */
export function SignalZone({
  mode: m,
  children,
  className,
  id,
}: {
  mode: SignalMode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { margin: "-50% 0px -50% 0px" });
  useEffect(() => {
    if (inView) signal.set(m);
  }, [inView, m]);
  return (
    <section ref={ref} id={id} className={className}>
      {children}
    </section>
  );
}

export function SignalIndicator() {
  const m = useSignal();
  const on = m === "online";
  return (
    <div
      className="fixed right-4 top-4 z-50 flex items-center gap-3 bg-surco/80 px-3 py-2 text-lino md:right-6 md:top-5"
      role="status"
      aria-live="polite"
    >
      <div className="flex h-4 items-end gap-[3px]" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="w-[3px] transition-colors duration-300"
            style={{
              height: `${(i + 1) * 25}%`,
              backgroundColor: on ? "var(--soja)" : "var(--linea-oscuro)",
              transitionDelay: on ? `${i * 160}ms` : `${(3 - i) * 220}ms`,
            }}
          />
        ))}
      </div>
      <span className={`mono-yvy text-[11px] ${on ? "text-lino" : "text-trigo"}`}>
        {on ? L("signalOnline") : L("signalOffline")}
      </span>
    </div>
  );
}

/* ---------- Typography ---------- */
export function emParts(text: string) {
  return text.split("*").map((part, i) => ({ part, em: i % 2 === 1 }));
}

export function Title({
  text,
  as = "h2",
  tone = "dark",
  className = "",
}: {
  text: string;
  as?: "h1" | "h2" | "h3";
  tone?: "dark" | "light";
  className?: string;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  const reduce = useReducedMotion();
  const Tag = motion[as];
  let idx = 0;
  return (
    <Tag ref={ref} className={`${as === "h1" ? "h1-yvy" : "h2-yvy"} ${className}`}>
      {emParts(text).map(({ part, em }, pi) =>
        part.split(/(\s+)/).map((w, wi) => {
          if (/^\s+$/.test(w) || !w) return w;
          const i = idx++;
          return (
            <span key={`${pi}-${wi}`} className="inline-block overflow-hidden pb-[0.08em] align-bottom">
              <motion.span
                className={`inline-block ${/\d/.test(w) ? "numeral-yvy" : ""} ${em ? (tone === "dark" ? "em-dark" : "em-light") : ""}`}
                initial={reduce ? false : { y: "110%" }}
                animate={inView || reduce ? { y: "0%" } : { y: "110%" }}
                transition={{ duration: reduce ? 0 : 0.9, ease: EASE, delay: reduce ? 0 : i * 0.06 }}
              >
                {w}
              </motion.span>
            </span>
          );
        }),
      )}
    </Tag>
  );
}

export function FadeIn({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 0.8, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/* ---------- Media ---------- */
type Img = (typeof media)["hero"];

/** Imagen con srcset en WebP. `eager` solo para la del hero; el resto se carga diferido. */
export function Poster({
  img,
  alt = "",
  className,
  sizes,
  eager,
}: {
  img: Img;
  alt?: string;
  className?: string;
  sizes: string;
  eager?: boolean;
}) {
  return (
    <img
      src={img.src}
      srcSet={img.srcSet}
      sizes={sizes}
      alt={alt}
      className={className}
      width={img.width}
      height={img.height}
      loading={eager ? "eager" : "lazy"}
      decoding={eager ? "sync" : "async"}
      {...(eager ? { fetchPriority: "high" as const } : {})}
    />
  );
}

/* ---------- Scroll helpers ---------- */
export function useSmoothProgress(
  ref: React.RefObject<HTMLElement | null>,
  offset: NonNullable<Parameters<typeof useScroll>[0]>["offset"] = ["start end", "end start"],
): MotionValue<number> {
  const { scrollYProgress } = useScroll({ target: ref, offset });
  return useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
}

/* ---------- Ambient ---------- */
export function Grain() {
  return (
    <svg className="pointer-events-none fixed inset-0 z-[60] h-full w-full opacity-[0.05]" aria-hidden>
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#grain)" />
    </svg>
  );
}

export function Contours({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const p = useSmoothProgress(ref);
  const y = useTransform(p, [0, 1], ["-6%", "6%"]);
  return (
    <motion.div ref={ref} aria-hidden className={`pointer-events-none absolute inset-0 ${className}`} style={{ y: reduce ? 0 : y }}>
      <svg className="h-full w-full" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
        {Array.from({ length: 11 }).map((_, i) => (
          <path
            key={i}
            d={`M-50 ${80 + i * 48} C 150 ${40 + i * 50}, 260 ${150 + i * 44}, 420 ${100 + i * 46} S 700 ${30 + i * 52}, 860 ${110 + i * 45}`}
            fill="none"
            stroke="var(--linea-claro)"
            strokeWidth="1"
          />
        ))}
      </svg>
    </motion.div>
  );
}

export function Vertex({ x, y, fill = "currentColor" }: { x: number; y: number; fill?: string }) {
  return <rect x={x - 2.5} y={y - 2.5} width={5} height={5} fill={fill} />;
}
