import { afterEach, describe, expect, it, vi } from "vitest";
import { get, isNetworkDown, NetworkError, offlineSavedAt } from "./api";

afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json", ...headers } });

describe("sin conexión", () => {
  it("una respuesta que el service worker sirvió de su copia cuenta como sin conexión y trae la fecha", async () => {
    vi.stubGlobal("fetch", async () => json([{ id: "f1" }], { "x-yvy-from-cache": "1700000000000" }));
    expect(await get("/org/farms")).toEqual([{ id: "f1" }]);
    expect(isNetworkDown()).toBe(true);
    expect(offlineSavedAt()).toBe(1_700_000_000_000);
  });

  it("de varias copias, muestra la más vieja", async () => {
    vi.stubGlobal("fetch", async () => json({}));
    await get("/org/farms"); // vuelve la red: empieza un corte nuevo
    vi.stubGlobal("fetch", async (u: string) => json({}, { "x-yvy-from-cache": u.endsWith("nueva") ? "1700000900000" : "1700000100000" }));
    await get("/org/vieja");
    await get("/org/nueva");
    expect(offlineSavedAt()).toBe(1_700_000_100_000);
  });

  it("una respuesta real del servidor lo saca del corte", async () => {
    vi.stubGlobal("fetch", async () => json({ ok: 1 }));
    await get("/org/farms");
    expect(isNetworkDown()).toBe(false);
  });

  it("sin respuesta falla con NetworkError y queda sin conexión", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(get("/org/farms")).rejects.toBeInstanceOf(NetworkError);
    expect(isNetworkDown()).toBe(true);
  });
});
