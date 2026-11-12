/**
 * V-10: Academia. Los temas son fijos (textos en i18n); los videos se cargan al compilar con VITE_ACADEMY_VIDEOS, un JSON
 * `{ "mapa": "https://…", "registro": { "es": "https://…", "gn": "https://…" } }`. Solo se aceptan enlaces https. Un tema
 * sin enlace se muestra como "Próximamente": no hay videos de relleno.
 */
export const ACADEMY_TOPICS = ["map", "record", "offline", "tasks", "alerts", "reports", "team"] as const;
export type AcademyTopic = (typeof ACADEMY_TOPICS)[number];
export type AcademyLang = "es" | "gn";
export type AcademyLinks = Partial<Record<AcademyTopic, Partial<Record<AcademyLang, string>>>>;

const httpsUrl = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
};

export function parseAcademyVideos(raw: string | undefined): AcademyLinks {
  if (!raw) return {};
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!json || typeof json !== "object") return {};
  const out: AcademyLinks = {};
  for (const topic of ACADEMY_TOPICS) {
    const v = (json as Record<string, unknown>)[topic];
    const links: Partial<Record<AcademyLang, string>> = {};
    if (typeof v === "string") {
      const u = httpsUrl(v);
      if (u) links.es = u;
    } else if (v && typeof v === "object") {
      for (const lang of ["es", "gn"] as const) {
        const u = httpsUrl((v as Record<string, unknown>)[lang]);
        if (u) links[lang] = u;
      }
    }
    if (Object.keys(links).length) out[topic] = links;
  }
  return out;
}

export const ACADEMY_VIDEOS: AcademyLinks = parseAcademyVideos(import.meta.env.VITE_ACADEMY_VIDEOS);
