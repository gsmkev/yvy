/**
 * Analítica propia (P-03): avisa al servidor qué pantalla se abrió. Sin terceros, sin datos personales: solo el
 * nombre ("view:tareas"); el servidor muestrea y limita. Si falla, no pasa nada.
 */
import { getSession, post } from "./api";

let last = "";

/** "view:" + primer tramo de la ruta (la raíz es "view:mapa"). Repetidos seguidos no se mandan. */
export function trackView(pathname: string): void {
  const seg = pathname.split("/").filter(Boolean)[0] ?? "mapa";
  const name = `view:${seg.toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 30) || "mapa"}`;
  if (name === last || !getSession() || getSession()?.support) return;
  last = name;
  post("/events", { name }).catch(() => {});
}
