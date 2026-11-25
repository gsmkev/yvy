/** Detalle legible de un cambio del registro (sin IDs, con etiquetas y fechas). */
import { t, tk } from "./i18n";
import { fmtDateTime } from "./format";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Claves de referencia (farmId, assigneeId, id): no le sirven a quien lee el registro. */
const ID_KEY = /(^id|Id|_id)$/;
/** Epoch ms entre 1973 y 2100: un número así en el registro es una fecha. */
const EPOCH_MIN = 1e11;
const EPOCH_MAX = 4.1e12;
const KNOWN_KEYS = new Set([
  "title",
  "name",
  "role",
  "status",
  "kind",
  "date",
  "dueAt",
  "createdAt",
  "amount",
  "quantity",
  "description",
  "crop",
  "notes",
  "email",
  "phone",
]);

/** Etiqueta de una clave: traducida si es conocida; si no, en minúsculas separando camelCase. */
export function auditLabel(key: string): string {
  if (KNOWN_KEYS.has(key)) return tk(`ui.audit.key_${key}`);
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();
}

/** Valor legible, o null si no se muestra (UUID, objetos, nulos). */
function auditValue(v: unknown): string | null {
  if (typeof v === "string") return UUID.test(v) ? null : v;
  if (typeof v === "number") return v >= EPOCH_MIN && v <= EPOCH_MAX ? fmtDateTime(v) : String(v);
  if (typeof v === "boolean") return v ? "sí" : "no";
  return null;
}

/** Resumen de una línea del detalle JSON de un cambio ("Título: Lote 3; Cultivo: maíz; cambió: geometry"). */
export function auditSummary(detail: string): string {
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(detail) as Record<string, unknown>;
  } catch {
    return "";
  }
  const parts: string[] = [];
  const add = (o: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(o)) {
      if (ID_KEY.test(k)) continue;
      const shown = auditValue(v);
      if (shown !== null) parts.push(`${auditLabel(k)}: ${shown}`);
    }
  };
  if (d.values && typeof d.values === "object") add(d.values as Record<string, unknown>);
  add(Object.fromEntries(Object.entries(d).filter(([k]) => k !== "values" && k !== "fields")));
  if (Array.isArray(d.fields) && d.fields.length) {
    parts.push(`${t("ui.audit.changed")}: ${d.fields.map((f) => auditLabel(String(f))).join(", ")}`);
  }
  return parts.join("; ");
}
