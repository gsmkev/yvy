/** Color de cada familia de registros, compartido por el mapa, la leyenda y las listas. */
import { BRAND, RECORD_KINDS } from "@yvy/shared";

/** Familias de registros con un color de la paleta cada una (mapa, leyenda y lista). */
export const RECORD_GROUPS = [
  { id: "crop", color: BRAND.soja },
  { id: "issue", color: BRAND.alerta },
  { id: "water", color: BRAND.cielo },
  { id: "herd", color: BRAND.trigo },
  { id: "other", color: BRAND.lino },
] as const;
type RecordGroupId = (typeof RECORD_GROUPS)[number]["id"];

const GROUP_OF: Record<(typeof RECORD_KINDS)[number], RecordGroupId> = {
  scouting: "crop",
  crop_status: "crop",
  pasture_status: "crop",
  sowing: "crop",
  application: "crop",
  fertilization: "crop",
  harvest: "crop",
  pest: "issue",
  health: "issue",
  mortality: "issue",
  theft: "issue",
  rain: "water",
  water: "water",
  irrigation: "water",
  herd_count: "herd",
  herd_move: "herd",
  stock_count: "herd",
  supplement: "herd",
  weighing: "herd",
  reproduction: "herd",
  feed: "herd",
  note: "other",
  track: "other",
  fuel_load: "other",
};

/** Familia a la que pertenece un tipo de registro; "other" si no está mapeado. */
export const recordGroup = (kind: string): RecordGroupId => GROUP_OF[kind as keyof typeof GROUP_OF] ?? "other";

/** Color de la paleta que corresponde a un tipo de registro. */
export const recordColor = (kind: string): string => RECORD_GROUPS.find((g) => g.id === recordGroup(kind))!.color;
