/** Pedidos por rango (`Range: bytes=a-b`) de PMTiles: interpretar el rango y cortarlo de un archivo entero guardado. */

export interface ByteRange {
  start: number;
  /** Inclusive; undefined = hasta el final. */
  end?: number;
  /** `bytes=-n`: los últimos n bytes. */
  suffix?: number;
}

export function parseRange(header: string | null): ByteRange | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, a, b] = m;
  if (a === "" && b === "") return null;
  if (a === "") return { start: 0, suffix: Number(b) };
  const start = Number(a);
  if (b === "") return { start };
  const end = Number(b);
  return end < start ? null : { start, end };
}

/** Rango concreto (inclusive) sobre un archivo de `total` bytes; null si no se puede satisfacer. */
export function resolveRange(r: ByteRange, total: number): { start: number; end: number } | null {
  if (total <= 0) return null;
  if (r.suffix !== undefined) {
    if (r.suffix <= 0) return null;
    return { start: Math.max(0, total - r.suffix), end: total - 1 };
  }
  if (r.start >= total) return null;
  return { start: r.start, end: Math.min(r.end ?? total - 1, total - 1) };
}

/** Clave de un rango suelto en la caché: la URL con el rango exacto que se pidió. */
export const rangeKey = (url: string, r: { start: number; end?: number }): string =>
  `${url}${url.includes("?") ? "&" : "?"}__range=${r.start}-${r.end ?? ""}`;

const PASS_HEADERS = ["content-type", "etag", "last-modified", "cache-control"];

/** Respuesta 206 con el rango pedido, cortada de una respuesta 200 con el archivo entero. */
export async function sliceResponse(whole: Response, range: ByteRange): Promise<Response> {
  const blob = await whole.clone().blob();
  const total = blob.size;
  const r = resolveRange(range, total);
  if (!r) {
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${total}` } });
  }
  const headers = new Headers();
  for (const h of PASS_HEADERS) {
    const v = whole.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set("content-range", `bytes ${r.start}-${r.end}/${total}`);
  headers.set("content-length", String(r.end - r.start + 1));
  headers.set("accept-ranges", "bytes");
  return new Response(blob.slice(r.start, r.end + 1), { status: 206, headers });
}
