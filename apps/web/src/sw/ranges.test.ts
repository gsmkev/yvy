// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseRange, rangeKey, resolveRange, sliceResponse } from "./ranges";

describe("parseRange", () => {
  it("lee los formatos de PMTiles y los demás", () => {
    expect(parseRange("bytes=0-16383")).toEqual({ start: 0, end: 16383 });
    expect(parseRange("bytes=100-")).toEqual({ start: 100 });
    expect(parseRange("bytes=-500")).toEqual({ start: 0, suffix: 500 });
  });
  it("rechaza lo que no es un rango simple", () => {
    for (const h of [null, "", "bytes=-", "bytes=5-2", "items=0-1", "bytes=0-1,5-9", "bytes=a-b"]) expect(parseRange(h)).toBeNull();
  });
});

describe("resolveRange", () => {
  it("recorta al tamaño del archivo", () => {
    expect(resolveRange({ start: 0, end: 99 }, 50)).toEqual({ start: 0, end: 49 });
    expect(resolveRange({ start: 10 }, 50)).toEqual({ start: 10, end: 49 });
    expect(resolveRange({ start: 0, suffix: 20 }, 50)).toEqual({ start: 30, end: 49 });
    expect(resolveRange({ start: 0, suffix: 200 }, 50)).toEqual({ start: 0, end: 49 });
  });
  it("no se puede satisfacer", () => {
    expect(resolveRange({ start: 50 }, 50)).toBeNull();
    expect(resolveRange({ start: 0, end: 1 }, 0)).toBeNull();
    expect(resolveRange({ start: 0, suffix: 0 }, 50)).toBeNull();
  });
});

describe("rangeKey", () => {
  it("distingue cada rango de la misma URL", () => {
    const u = "https://t.example/a.pmtiles";
    expect(rangeKey(u, { start: 0, end: 9 })).not.toBe(rangeKey(u, { start: 0, end: 10 }));
    expect(rangeKey(`${u}?v=1`, { start: 1, end: 2 })).toBe(`${u}?v=1&__range=1-2`);
  });
});

describe("sliceResponse", () => {
  const whole = () =>
    new Response(new Uint8Array(Array.from({ length: 100 }, (_, i) => i)), {
      headers: { "content-type": "application/octet-stream", etag: '"abc"' },
    });

  it("responde 206 con el rango, el content-range y el etag del archivo", async () => {
    const res = await sliceResponse(whole(), { start: 10, end: 19 });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 10-19/100");
    expect(res.headers.get("content-length")).toBe("10");
    expect(res.headers.get("etag")).toBe('"abc"');
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  });
  it("rango abierto y sufijo", async () => {
    const open = await sliceResponse(whole(), { start: 95 });
    expect(open.headers.get("content-range")).toBe("bytes 95-99/100");
    const suf = await sliceResponse(whole(), { start: 0, suffix: 3 });
    expect([...new Uint8Array(await suf.arrayBuffer())]).toEqual([97, 98, 99]);
  });
  it("416 si el inicio pasa del final", async () => {
    const res = await sliceResponse(whole(), { start: 500 });
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */100");
  });
  it("no consume la respuesta original", async () => {
    const w = whole();
    await sliceResponse(w, { start: 0, end: 1 });
    expect((await w.arrayBuffer()).byteLength).toBe(100);
  });
});
