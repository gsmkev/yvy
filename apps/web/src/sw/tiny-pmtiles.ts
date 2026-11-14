/** PMTiles v3 mínimo (sin comprimir, solo directorio raíz) para probar pedidos por rango sin un archivo real. */
import { zxyToTileId } from "pmtiles";

const te = new TextEncoder();
function varint(n: number): number[] {
  const out: number[] = [];
  while (n >= 128) {
    out.push((n & 127) | 128);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return out;
}
export interface TinyTile {
  z: number;
  x: number;
  y: number;
  text: string;
}

/** Teselas con el texto dado como contenido; con solo textos son z0/0/0 y z1/0/0 (ids 0 y 1). */
export function tinyPmtiles(input: string[] | TinyTile[]): Uint8Array<ArrayBuffer> {
  const entries = (input as (string | TinyTile)[])
    .map((t, i) => (typeof t === "string" ? { id: i, text: t } : { id: zxyToTileId(t.z, t.x, t.y), text: t.text }))
    .sort((a, b) => a.id - b.id);
  const tiles = entries.map((e) => e.text);
  const data = tiles.map((t) => te.encode(t));
  // directorio raíz sin comprimir: n, deltas de tileId, runLength, length, offset+1 (0 = contiguo)
  const dir = [
    ...varint(entries.length),
    ...entries.flatMap((e, i) => varint(i === 0 ? e.id : e.id - entries[i - 1]!.id)),
    ...tiles.flatMap(() => varint(1)),
    ...data.flatMap((d) => varint(d.length)),
    ...data.flatMap((_, i) => varint(i === 0 ? 1 : 0)),
  ];
  const dirOffset = 127;
  const tileOffset = dirOffset + dir.length;
  const total = tileOffset + data.reduce((a, d) => a + d.length, 0);
  const buf = new Uint8Array(total);
  const dv = new DataView(buf.buffer);
  buf.set(te.encode("PMTiles"), 0);
  dv.setUint8(7, 3);
  const u64 = (o: number, v: number) => {
    dv.setUint32(o, v >>> 0, true);
    dv.setUint32(o + 4, Math.floor(v / 2 ** 32), true);
  };
  u64(8, dirOffset);
  u64(16, dir.length);
  u64(24, tileOffset); // metadata vacía
  u64(32, 0);
  u64(40, tileOffset); // sin hojas
  u64(48, 0);
  u64(56, tileOffset);
  u64(64, total - tileOffset);
  u64(72, tiles.length);
  u64(80, tiles.length);
  u64(88, tiles.length);
  dv.setUint8(96, 1);
  dv.setUint8(97, 1); // directorios sin comprimir
  dv.setUint8(98, 1); // teselas sin comprimir
  dv.setUint8(99, 3); // jpeg
  dv.setUint8(100, 0);
  dv.setUint8(101, 15);
  buf.set(dir, dirOffset);
  let at = tileOffset;
  for (const d of data) {
    buf.set(d, at);
    at += d.length;
  }
  return buf;
}

