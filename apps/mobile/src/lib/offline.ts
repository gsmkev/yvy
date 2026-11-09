/**
 * Paquete offline de la estancia (RF-44): baja los PMTiles de fondo y NDVI una sola vez por wifi.
 * MapLibre Native los lee locales con pmtiles://file://...
 */
import * as FileSystem from "expo-file-system/legacy";
import * as Network from "expo-network";
import { getDb } from "./db";
import { api } from "./session";

const DIR = `${FileSystem.documentDirectory}tiles/`;

export async function tilesBaseUrl(): Promise<string> {
  const cached = getDb().getKv("tiles_base_url");
  if (cached) return cached;
  const me = await api<{ tilesBaseUrl: string }>("GET", "/me");
  getDb().setKv("tiles_base_url", me.tilesBaseUrl);
  return me.tilesBaseUrl;
}

export function packStatus(farmId: string) {
  const db = getDb();
  const layers = db.latestLayers(farmId);
  const downloaded = db.sql.all<{ layer_id: string; uri: string; layer: string }>(
    "SELECT layer_id, uri, layer FROM offline_packs WHERE farm_id = ?",
    [farmId],
  );
  const missing = layers.filter((l) => !downloaded.some((d) => d.layer_id === l.id));
  return {
    layers,
    missingBytes: missing.reduce((a, l) => a + l.bytes, 0),
    upToDate: layers.length > 0 && missing.length === 0,
    localUri: (layer: "true_color" | "ndvi") => {
      const latest = layers.find((l) => l.layer === layer);
      const d =
        downloaded.find((x) => x.layer === layer && (!latest || x.layer_id === latest.id)) ??
        downloaded.find((x) => x.layer === layer);
      return d?.uri ?? null;
    },
  };
}

export async function isWifi(): Promise<boolean> {
  const n = await Network.getNetworkStateAsync();
  return n.type === Network.NetworkStateType.WIFI || n.type === Network.NetworkStateType.ETHERNET;
}

export async function downloadPack(farmId: string, onProgress: (fraction: number) => void): Promise<void> {
  const db = getDb();
  const base = (await tilesBaseUrl()).replace(/\/$/, "");
  const { layers } = packStatus(farmId);
  const total = layers.reduce((a, l) => a + l.bytes, 0) || 1;
  let done = 0;
  await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
  for (const l of layers) {
    const dest = `${DIR}${l.id}.pmtiles`;
    const dl = FileSystem.createDownloadResumable(`${base}/${l.pmtilesPath}`, dest, {}, (p) =>
      onProgress((done + p.totalBytesWritten) / total),
    );
    const res = await dl.downloadAsync();
    if (!res || res.status >= 300) throw new Error(`Descarga fallida (${res?.status})`);
    const old = db.sql.all<{ uri: string }>(
      "SELECT uri FROM offline_packs WHERE farm_id = ? AND layer = ? AND layer_id <> ?",
      [farmId, l.layer, l.id],
    );
    db.sql.tx(() => {
      db.sql.run("DELETE FROM offline_packs WHERE farm_id = ? AND layer = ?", [farmId, l.layer]);
      db.sql.run(
        "INSERT INTO offline_packs (layer_id, farm_id, layer, uri, bytes, downloaded_at) VALUES (?, ?, ?, ?, ?, ?)",
        [l.id, farmId, l.layer, dest, l.bytes, Date.now()],
      );
    });
    for (const o of old) await FileSystem.deleteAsync(o.uri, { idempotent: true });
    done += l.bytes;
    onProgress(done / total);
  }
}
