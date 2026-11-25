/** Resultados del buscador global: qué coincide con el texto y adónde lleva cada uno. */
import { describeData } from "./exports";
import { tk, type MessageKey } from "./i18n";
import type { FarmDetail, FarmSummary, Member, RecordRow } from "./types";

/** Tipos de resultado, en el orden en que se muestran los grupos. */
export type SearchKind = "farms" | "plots" | "members" | "pois" | "records";

/** Un resultado de la búsqueda. */
export interface SearchHit {
  key: string;
  kind: SearchKind;
  title: string;
  sub?: string;
  go: () => void;
}

/** Grupos de resultados con su título. */
export const SEARCH_GROUPS: { kind: SearchKind; label: MessageKey }[] = [
  { kind: "farms", label: "ui.search.farms" },
  { kind: "plots", label: "ui.search.plots" },
  { kind: "members", label: "ui.search.members" },
  { kind: "pois", label: "ui.search.pois" },
  { kind: "records", label: "ui.search.records" },
];

/** Sin mayúsculas ni tildes, para comparar lo escrito con los nombres. */
export const normSearch = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Datos ya cargados donde se busca, y cómo navegar al elegir un resultado. */
export interface SearchSource {
  farms: FarmSummary[];
  details: FarmDetail[];
  members: Member[];
  records: RecordRow[];
  toFarm: (farmId: string, lote?: string) => () => void;
  toTeam: () => void;
}

type Out = Record<SearchKind, SearchHit[]>;
type Has = (...s: (string | null | undefined)[]) => boolean;

function farmHits(src: SearchSource, has: Has, out: Out) {
  for (const f of src.farms)
    if (has(f.name, f.department))
      out.farms.push({ key: `f${f.id}`, kind: "farms", title: f.name, sub: f.department ?? undefined, go: src.toFarm(f.id) });
}

function detailHits(src: SearchSource, has: Has, out: Out, farmName: Map<string, string>) {
  for (const d of src.details) {
    for (const p of d.plots)
      if (has(p.name, p.crop))
        out.plots.push({
          key: `p${p.id}`,
          kind: "plots",
          title: p.name,
          sub: [farmName.get(p.farmId), p.crop].filter(Boolean).join(", "),
          go: src.toFarm(p.farmId, p.id),
        });
    for (const p of d.pois)
      if (has(p.name))
        out.pois.push({
          key: `o${p.id}`,
          kind: "pois",
          title: p.name,
          sub: [farmName.get(p.farmId), tk(`ui.poi.kinds_${p.kind}`)].join(", "),
          go: src.toFarm(p.farmId),
        });
  }
}

function recordHits(src: SearchSource, has: Has, out: Out, farmName: Map<string, string>) {
  for (const r of src.records) {
    const text = describeData(r.kind, r.data);
    if (has(text, tk(`record-kinds.kind.${r.kind}`), r.authorName, r.plotName))
      out.records.push({
        key: `r${r.id}`,
        kind: "records",
        title: text,
        sub: [tk(`record-kinds.kind.${r.kind}`), r.plotName ?? farmName.get(r.farmId)].filter(Boolean).join(", "),
        go: src.toFarm(r.farmId, r.plotId ?? undefined),
      });
  }
}

/** Resultados para el texto `q` (ya normalizado), hasta `perGroup` por grupo. */
export function searchHits(q: string, src: SearchSource, perGroup: number): SearchHit[] {
  const has: Has = (...s) => s.some((x) => x && normSearch(x).includes(q));
  const farmName = new Map(src.farms.map((f) => [f.id, f.name]));
  const out: Out = { farms: [], plots: [], members: [], pois: [], records: [] };
  farmHits(src, has, out);
  detailHits(src, has, out, farmName);
  for (const m of src.members)
    if (has(m.fullName, m.email, m.phone))
      out.members.push({ key: `m${m.userId}`, kind: "members", title: m.fullName, sub: tk(`ui.role.${m.role}`), go: src.toTeam });
  recordHits(src, has, out, farmName);
  return SEARCH_GROUPS.flatMap((g) => out[g.kind].slice(0, perGroup));
}
