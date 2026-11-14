/** Cache API en memoria para probar el service worker. Imita lo que importa: rechaza las 206 y conserva el orden de inserción. */

interface Entry {
  body: ArrayBuffer;
  status: number;
  statusText: string;
  headers: [string, string][];
  type: ResponseType;
}

const keyOf = (r: RequestInfo | URL): string => (typeof r === "string" ? r : r instanceof URL ? r.href : r.url);

export class FakeCache {
  readonly entries = new Map<string, Entry>();

  async match(req: RequestInfo | URL): Promise<Response | undefined> {
    const e = this.entries.get(keyOf(req));
    if (!e) return undefined;
    return new Response(e.body.slice(0), { status: e.status, statusText: e.statusText, headers: e.headers });
  }

  async put(req: RequestInfo | URL, res: Response): Promise<void> {
    if (res.status === 206) throw new TypeError("Partial response (status code 206) is unsupported");
    const k = keyOf(req);
    const body = await res.arrayBuffer();
    this.entries.delete(k); // como Chromium: reemplazar deja la entrada al final
    this.entries.set(k, { body, status: res.status, statusText: res.statusText, headers: [...res.headers.entries()], type: res.type });
  }

  async delete(req: RequestInfo | URL): Promise<boolean> {
    return this.entries.delete(keyOf(req));
  }

  async keys(): Promise<Request[]> {
    return [...this.entries.keys()].map((u) => new Request(u));
  }
}

export class FakeCacheStorage {
  readonly stores = new Map<string, FakeCache>();

  async open(name: string): Promise<Cache> {
    let c = this.stores.get(name);
    if (!c) this.stores.set(name, (c = new FakeCache()));
    return c as unknown as Cache;
  }

  async keys(): Promise<string[]> {
    return [...this.stores.keys()];
  }

  async delete(name: string): Promise<boolean> {
    return this.stores.delete(name);
  }

  async has(name: string): Promise<boolean> {
    return this.stores.has(name);
  }

  asStorage(): CacheStorage {
    return this as unknown as CacheStorage;
  }
}
