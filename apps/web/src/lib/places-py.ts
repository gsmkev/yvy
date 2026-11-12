/** Lista incluida de departamentos y ciudades principales de Paraguay (aprox.), para buscar sin conexión. */
export interface Place {
  name: string;
  /** Departamento al que pertenece (en los departamentos, el mismo nombre). */
  department: string;
  kind: "department" | "city";
  lon: number;
  lat: number;
  /** Zoom sugerido al volar ahí. */
  zoom: number;
}

type Row = [name: string, lon: number, lat: number];
const DEPARTMENTS: { name: string; capital: Row; cities: Row[] }[] = [
  { name: "Asunción", capital: ["Asunción", -57.635, -25.282], cities: [] },
  {
    name: "Concepción",
    capital: ["Concepción", -57.435, -23.406],
    cities: [
      ["Horqueta", -57.04, -23.34],
      ["Loreto", -57.2, -23.18],
      ["Belén", -57.23, -23.5],
      ["Yby Yaú", -56.53, -22.96],
    ],
  },
  {
    name: "San Pedro",
    capital: ["San Pedro de Ycuamandiyú", -56.95, -24.09],
    cities: [
      ["Santa Rosa del Aguaray", -56.43, -24.13],
      ["San Estanislao", -56.44, -24.65],
      ["Lima", -56.93, -24.76],
      ["Choré", -56.52, -24.28],
    ],
  },
  {
    name: "Cordillera",
    capital: ["Caacupé", -57.14, -25.39],
    cities: [
      ["Atyrá", -57.31, -25.27],
      ["Tobatí", -57.09, -25.26],
      ["Altos", -57.19, -25.27],
      ["Eusebio Ayala", -56.99, -25.39],
    ],
  },
  {
    name: "Guairá",
    capital: ["Villarrica", -56.43, -25.75],
    cities: [
      ["Iturbe", -56.67, -26.18],
      ["Mbocayaty", -56.3, -25.7],
    ],
  },
  {
    name: "Caaguazú",
    capital: ["Coronel Oviedo", -56.44, -25.45],
    cities: [
      ["Caaguazú", -56.0, -25.46],
      ["Repatriación", -55.75, -25.7],
      ["Yhú", -55.93, -25.0],
      ["Doctor Juan Eulogio Estigarribia", -55.8, -25.3],
    ],
  },
  {
    name: "Caazapá",
    capital: ["Caazapá", -56.37, -26.2],
    cities: [
      ["Yuty", -56.25, -26.62],
      ["San Juan Nepomuceno", -55.9, -26.1],
      ["Abaí", -55.93, -26.0],
    ],
  },
  {
    name: "Itapúa",
    capital: ["Encarnación", -55.87, -27.33],
    cities: [
      ["Cambyretá", -55.83, -27.3],
      ["Hohenau", -55.65, -27.08],
      ["Obligado", -55.63, -27.05],
      ["Bella Vista", -55.58, -27.07],
      ["Capitán Meza", -55.2, -26.9],
      ["Natalio", -55.9, -26.8],
      ["San Pedro del Paraná", -56.2, -26.9],
    ],
  },
  {
    name: "Misiones",
    capital: ["San Juan Bautista", -57.15, -26.67],
    cities: [
      ["Ayolas", -56.9, -27.39],
      ["San Ignacio", -57.0, -26.88],
      ["Santiago", -56.7, -27.13],
    ],
  },
  {
    name: "Paraguarí",
    capital: ["Paraguarí", -57.15, -25.62],
    cities: [
      ["Carapeguá", -57.23, -25.75],
      ["Yaguarón", -57.28, -25.57],
      ["Pirayú", -57.2, -25.45],
      ["Quiindy", -57.22, -25.93],
    ],
  },
  {
    name: "Alto Paraná",
    capital: ["Ciudad del Este", -54.61, -25.51],
    cities: [
      ["Hernandarias", -54.64, -25.4],
      ["Presidente Franco", -54.61, -25.53],
      ["Minga Guazú", -54.77, -25.5],
      ["Santa Rita", -55.05, -25.81],
      ["Naranjal", -55.2, -25.93],
    ],
  },
  {
    name: "Central",
    capital: ["Areguá", -57.38, -25.31],
    cities: [
      ["San Lorenzo", -57.51, -25.34],
      ["Luque", -57.49, -25.27],
      ["Fernando de la Mora", -57.55, -25.32],
      ["Lambaré", -57.61, -25.35],
      ["Capiatá", -57.44, -25.35],
      ["Limpio", -57.48, -25.17],
      ["Ñemby", -57.54, -25.39],
      ["Itauguá", -57.35, -25.39],
      ["Villa Elisa", -57.58, -25.37],
      ["Mariano Roque Alonso", -57.53, -25.21],
      ["Itá", -57.36, -25.5],
      ["Guarambaré", -57.46, -25.49],
    ],
  },
  {
    name: "Ñeembucú",
    capital: ["Pilar", -58.3, -26.86],
    cities: [
      ["Alberdi", -58.15, -26.2],
      ["Humaitá", -58.5, -27.05],
    ],
  },
  {
    name: "Amambay",
    capital: ["Pedro Juan Caballero", -55.73, -22.55],
    cities: [
      ["Capitán Bado", -55.53, -23.27],
      ["Bella Vista Norte", -56.52, -22.13],
    ],
  },
  {
    name: "Canindeyú",
    capital: ["Salto del Guairá", -54.34, -24.06],
    cities: [
      ["Curuguaty", -55.69, -24.47],
      ["Ypejhú", -55.5, -23.9],
      ["La Paloma", -54.84, -24.4],
      ["Katueté", -54.85, -24.15],
    ],
  },
  {
    name: "Presidente Hayes",
    capital: ["Villa Hayes", -57.52, -25.09],
    cities: [
      ["Benjamín Aceval", -57.57, -24.97],
      ["Pozo Colorado", -58.8, -23.49],
      ["Nanawa", -57.77, -25.5],
    ],
  },
  {
    name: "Boquerón",
    capital: ["Filadelfia", -60.04, -22.35],
    cities: [
      ["Loma Plata", -59.85, -22.37],
      ["Neu-Halbstadt", -60.09, -22.36],
      ["Mariscal Estigarribia", -60.62, -22.03],
      ["Neuland", -60.0, -22.45],
    ],
  },
  {
    name: "Alto Paraguay",
    capital: ["Fuerte Olimpo", -57.88, -21.04],
    cities: [
      ["Bahía Negra", -58.17, -20.23],
      ["Carmelo Peralta", -58.0, -22.2],
      ["Puerto Casado", -57.93, -22.28],
    ],
  },
];

export const PLACES_PY: Place[] = DEPARTMENTS.flatMap((d) => [
  {
    name: d.name,
    department: d.name,
    kind: "department" as const,
    lon: d.capital[1],
    lat: d.capital[2],
    zoom: d.name === "Asunción" ? 12 : 8,
  },
  ...(d.name === "Asunción" ? [] : [d.capital, ...d.cities]).map(([name, lon, lat]) => ({
    name,
    department: d.name,
    kind: "city" as const,
    lon,
    lat,
    zoom: 12,
  })),
]);

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/** Busca por nombre sin importar tildes ni mayúsculas; primero los que empiezan con el texto. */
export function searchPlaces(query: string, limit = 8): Place[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const scored: [number, Place][] = [];
  for (const p of PLACES_PY) {
    const n = norm(p.name);
    const i = n.indexOf(q);
    if (i < 0) continue;
    scored.push([(i === 0 ? 0 : 2) + (p.kind === "department" ? 0 : 1), p]);
  }
  return scored
    .sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name, "es"))
    .slice(0, limit)
    .map((x) => x[1]);
}
