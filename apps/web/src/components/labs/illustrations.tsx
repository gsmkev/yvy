import { useMemo } from "react";

/** Colores de marca: gráficos planos, sin degradados. */
const C = {
  lino: "#F1EEE4",
  surco: "#1E2419",
  soja: "#7A9A3F",
  trigo: "#D9A93A",
  cielo: "#8DB3C7",
  alerta: "#D2462B",
};

/** Generador pseudoaleatorio determinístico: la ilustración es siempre la misma. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Props = { label: string; className?: string };

/** Potreros ilustrativos: posición, tamaño y cantidad de animales (suma 296). */
const PADDOCKS = [
  { x: 20, y: 20, w: 330, h: 190, n: 142 },
  { x: 370, y: 20, w: 210, h: 190, n: 96 },
  { x: 20, y: 230, w: 560, h: 110, n: 58 },
] as const;

export function AnimalCountIllustration({ label, className }: Props) {
  const marks = useMemo(() => {
    const r = rng(7);
    return PADDOCKS.flatMap((p, i) =>
      Array.from({ length: p.n }, (_, k) => ({
        key: `${i}-${k}`,
        x: p.x + 12 + r() * (p.w - 28),
        y: p.y + 12 + r() * (p.h - 28),
        a: r() * 180,
      })),
    );
  }, []);
  return (
    <svg viewBox="0 0 600 360" role="img" aria-label={label} className={className}>
      <rect width="600" height="360" fill={C.lino} />
      {PADDOCKS.map((p, i) => (
        <rect
          key={i}
          x={p.x}
          y={p.y}
          width={p.w}
          height={p.h}
          fill={C.soja}
          fillOpacity={0.35}
          stroke={C.soja}
          strokeWidth="2"
        />
      ))}
      <circle cx="540" cy="285" r="22" fill={C.cielo} />
      {marks.map((m) => (
        <g key={m.key}>
          <ellipse cx={m.x} cy={m.y} rx="3.2" ry="1.8" fill={C.surco} transform={`rotate(${m.a} ${m.x} ${m.y})`} />
          <rect x={m.x - 5} y={m.y - 5} width="10" height="10" fill="none" stroke={C.alerta} strokeWidth="0.7" />
        </g>
      ))}
    </svg>
  );
}

/** Zonas de siembra: probabilidad relativa de huecos por zona. */
const ZONES = [
  { y: 10, gap: 0.04 },
  { y: 130, gap: 0.1 },
  { y: 250, gap: 0.03 },
] as const;

export function StandCountIllustration({ label, className }: Props) {
  const { plants, gaps } = useMemo(() => {
    const r = rng(11);
    const plants: { key: string; x: number; y: number }[] = [];
    const gaps: { key: string; x: number; y: number; h: number }[] = [];
    ZONES.forEach((z, zi) => {
      for (let row = 0; row < 18; row++) {
        const x = 24 + row * 32;
        let y = z.y + 6;
        while (y < z.y + 104) {
          if (r() < z.gap * 1.6) {
            const h = 14 + r() * 16;
            gaps.push({ key: `${zi}-${row}-${y}`, x, y, h });
            y += h + 4;
          } else {
            plants.push({ key: `${zi}-${row}-${y}`, x: x + (r() - 0.5) * 2, y });
            y += 6;
          }
        }
      }
    });
    return { plants, gaps };
  }, []);
  return (
    <svg viewBox="0 0 600 370" role="img" aria-label={label} className={className}>
      <rect width="600" height="370" fill={C.lino} />
      {ZONES.map((z, i) => (
        <rect key={i} x="8" y={z.y} width="584" height="110" fill={C.trigo} fillOpacity={0.18} />
      ))}
      {plants.map((p) => (
        <circle key={p.key} cx={p.x} cy={p.y} r="2.1" fill={C.soja} />
      ))}
      {gaps.map((g) => (
        <rect
          key={g.key}
          x={g.x - 6}
          y={g.y - 2}
          width="12"
          height={g.h + 2}
          fill={C.alerta}
          fillOpacity={0.12}
          stroke={C.alerta}
          strokeWidth="0.9"
        />
      ))}
    </svg>
  );
}

/** Manchones de malezas como polígonos irregulares. */
const PATCHES = [
  "M60,50 L120,38 L158,70 L142,112 L84,120 L52,90 Z",
  "M330,40 L410,34 L450,66 L428,98 L360,104 L322,76 Z",
  "M470,190 L540,176 L572,214 L548,262 L486,266 L458,226 Z",
  "M90,250 L150,238 L176,276 L140,312 L92,304 Z",
  "M250,170 L290,160 L310,190 L284,212 L252,204 Z",
];
const ROWS = Array.from({ length: 22 }, (_, i) => 14 + i * 16);

export function WeedsIllustration({ label, className }: Props) {
  return (
    <svg viewBox="0 0 600 360" role="img" aria-label={label} className={className}>
      <rect width="600" height="360" fill={C.lino} />
      <rect x="10" y="10" width="580" height="340" fill={C.soja} fillOpacity={0.28} stroke={C.soja} strokeWidth="2" />
      {ROWS.map((y) => (
        <line key={y} x1="10" x2="590" y1={y} y2={y} stroke={C.soja} strokeOpacity={0.55} strokeWidth="1" />
      ))}
      {PATCHES.map((d, i) => (
        <path
          key={i}
          d={d}
          fill={C.trigo}
          fillOpacity={0.55}
          stroke={C.alerta}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

/** Lote con dos clases de daño: moderado (trigo) y severo (alerta), más fuerte del lado oeste. */
const HAIL_MODERATE = [
  "M18,30 L190,22 L236,96 L180,176 L120,230 L18,250 Z",
  "M300,260 L372,236 L416,290 L360,330 L304,320 Z",
];
const HAIL_SEVERE = [
  "M18,60 L100,52 L132,112 L84,172 L18,184 Z",
  "M60,214 L118,206 L136,246 L92,276 L40,262 Z",
];

export function HailIllustration({ label, className }: Props) {
  return (
    <svg viewBox="0 0 600 360" role="img" aria-label={label} className={className}>
      <rect width="600" height="360" fill={C.lino} />
      <rect x="10" y="10" width="580" height="340" fill={C.soja} fillOpacity={0.28} stroke={C.soja} strokeWidth="2" />
      {ROWS.map((y) => (
        <line key={y} x1="10" x2="590" y1={y} y2={y} stroke={C.soja} strokeOpacity={0.55} strokeWidth="1" />
      ))}
      {HAIL_MODERATE.map((d, i) => (
        <path key={`m${i}`} d={d} fill={C.trigo} fillOpacity={0.5} stroke={C.trigo} strokeWidth="1.5" strokeLinejoin="round" />
      ))}
      {HAIL_SEVERE.map((d, i) => (
        <path key={`s${i}`} d={d} fill={C.alerta} fillOpacity={0.5} stroke={C.alerta} strokeWidth="1.5" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

/** Tres potreros con alambrado, un tajamar seco y un camino; los tres problemas van en alerta. */
export function InfraIllustration({ label, className }: Props) {
  return (
    <svg viewBox="0 0 600 360" role="img" aria-label={label} className={className}>
      <rect width="600" height="360" fill={C.lino} />
      <g fill={C.soja} fillOpacity={0.3} stroke={C.surco} strokeWidth="1.5">
        <rect x="20" y="20" width="270" height="190" />
        <rect x="310" y="20" width="270" height="190" />
        <rect x="20" y="230" width="560" height="110" />
      </g>
      {/* Alambrado caído: tramo del límite norte sin línea, con los postes marcados */}
      <rect x="20" y="16" width="270" height="8" fill={C.lino} />
      <line x1="20" y1="20" x2="130" y2="20" stroke={C.surco} strokeWidth="1.5" />
      <line x1="130" y1="20" x2="230" y2="20" stroke={C.alerta} strokeWidth="3" strokeDasharray="2 8" strokeLinecap="round" />
      <rect x="120" y="6" width="120" height="28" fill="none" stroke={C.alerta} strokeWidth="1.5" />
      {/* Tajamar seco: círculo del espejo de agua vacío */}
      <circle cx="440" cy="120" r="34" fill={C.lino} stroke={C.trigo} strokeWidth="2" strokeDasharray="6 4" />
      <rect x="396" y="76" width="88" height="88" fill="none" stroke={C.alerta} strokeWidth="1.5" />
      {/* Camino y cruce cortado */}
      <path d="M0,300 L200,300 M330,300 L600,300" stroke={C.surco} strokeWidth="5" />
      <path d="M200,300 L330,300" stroke={C.cielo} strokeWidth="9" strokeOpacity="0.8" />
      <rect x="190" y="276" width="150" height="48" fill="none" stroke={C.alerta} strokeWidth="1.5" />
    </svg>
  );
}
