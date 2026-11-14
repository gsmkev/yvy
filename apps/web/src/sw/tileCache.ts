/**
 * Rangos sueltos de PMTiles. La Cache API no admite guardar respuestas 206, así que cada rango se guarda como una
 * 200 con el contenido y el `content-range` original en una cabecera propia, y al servirlo se arma de nuevo la 206.
 * Tope de tamaño: al pasarlo se borran los más viejos (el orden de `keys()` es el de inserción).
 */
import { FROM_CACHE_HEADER, SAVED_AT_HEADER } from "./names";

const RANGE_HEADER = "x-yvy-content-range";
const KEEP = ["content-type", "etag", "last-modified"];

export async function toStored(res: Response, now: number): Promise<Response> {
  const headers = new Headers();
  for (const h of KEEP) {
    const v = res.headers.get(h);
    if (v) headers.set(h, v);
  }
  const body = await res.arrayBuffer();
  headers.set(RANGE_HEADER, res.headers.get("content-range") ?? "");
  headers.set("content-length", String(body.byteLength));
  headers.set(SAVED_AT_HEADER, String(now));
  return new Response(body, { status: 200, headers });
}

export function fromStored(stored: Response): Response {
  const headers = new Headers();
  for (const h of KEEP) {
    const v = stored.headers.get(h);
    if (v) headers.set(h, v);
  }
  const cr = stored.headers.get(RANGE_HEADER);
  if (cr) headers.set("content-range", cr);
  const len = stored.headers.get("content-length");
  if (len) headers.set("content-length", len);
  headers.set("accept-ranges", "bytes");
  headers.set(FROM_CACHE_HEADER, stored.headers.get(SAVED_AT_HEADER) ?? "1");
  return new Response(stored.body, { status: 206, headers });
}

const sizeOf = (r: Response | undefined): number => Number(r?.headers.get("content-length") ?? 0) || 0;

/** Lleva la cuenta de bytes de la caché de rangos y descarta los más viejos al pasar el tope. */
export class PieceCache {
  private total: number | null = null;

  constructor(
    private readonly open: () => Promise<Cache>,
    private readonly maxBytes: number,
  ) {}

  private async scan(cache: Cache): Promise<number> {
    if (this.total !== null) return this.total;
    let sum = 0;
    for (const req of await cache.keys()) sum += sizeOf(await cache.match(req));
    this.total = sum;
    return sum;
  }

  async get(key: string): Promise<Response | null> {
    const cache = await this.open();
    const hit = await cache.match(key);
    return hit ? fromStored(hit) : null;
  }

  async put(key: string, res: Response, now: number): Promise<void> {
    const cache = await this.open();
    const stored = await toStored(res, now);
    const size = sizeOf(stored);
    if (size > this.maxBytes) return;
    await this.scan(cache);
    const prev = sizeOf(await cache.match(key));
    try {
      await cache.put(key, stored);
    } catch {
      return; // sin lugar o respuesta no admitida: el mapa sigue andando con red
    }
    this.total = (this.total ?? 0) - prev + size;
    if (this.total > this.maxBytes) await this.evict(cache);
  }

  /** Borra los más viejos hasta quedar en el 90 % del tope. */
  private async evict(cache: Cache): Promise<void> {
    const target = this.maxBytes * 0.9;
    for (const req of await cache.keys()) {
      if ((this.total ?? 0) <= target) break;
      const size = sizeOf(await cache.match(req));
      if (await cache.delete(req)) this.total = (this.total ?? 0) - size;
    }
  }

  async clear(): Promise<void> {
    this.total = 0;
  }

  /** Bytes que ocupa hoy (para mostrar el uso). */
  async bytes(): Promise<number> {
    return this.scan(await this.open());
  }
}
