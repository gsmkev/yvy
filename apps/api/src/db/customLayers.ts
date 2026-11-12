/**
 * Capas propias (M-17): imagen georreferenciada por estancia (dron, mapa de suelos). El Worker solo valida tipo y tamaño
 * y guarda el archivo en R2; un GeoTIFF lo convierte el job `custom_layers` de workers-py. Solo la web las usa.
 */
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { LIMITS } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { bumpVersion, currentVersion, runBatch } from "./client";
import { can, NotFoundError, type ScopedDb } from "./scoped";

export type Corners = [number, number][];

export const IMAGE_MIMES = ["image/png", "image/jpeg"] as const;
export const GEOTIFF_MIME = "image/tiff";

const ext = (mime: string) => (mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : "tif");
export const layerKey = (orgId: string, id: string, kind: "original" | "image", mime: string) =>
  `layers/${orgId}/${id}/${kind}.${ext(mime)}`;

/** Tipo real del archivo por sus primeros bytes (el content-type lo manda el cliente). */
export function sniffMime(head: Uint8Array): string | null {
  const b = (...v: number[]) => v.every((x, i) => head[i] === x);
  if (b(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (b(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (b(0x49, 0x49, 0x2a, 0x00) || b(0x4d, 0x4d, 0x00, 0x2a) || b(0x49, 0x49, 0x2b, 0x00) || b(0x4d, 0x4d, 0x00, 0x2b))
    return "image/tiff";
  return null;
}

/** Cuatro esquinas [lon, lat] válidas: dentro del globo y con extensión real. */
export function parseCorners(raw: string | undefined): Corners | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(v) || v.length !== 4) return null;
  const pts: Corners = [];
  for (const p of v) {
    if (!Array.isArray(p) || p.length !== 2) return null;
    const [lon, lat] = p as [unknown, unknown];
    if (typeof lon !== "number" || typeof lat !== "number" || !Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
    pts.push([lon, lat]);
  }
  const lons = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  if (Math.max(...lons) - Math.min(...lons) < 1e-6 || Math.max(...lats) - Math.min(...lats) < 1e-6) return null;
  return pts;
}

const cols = {
  id: s.customLayers.id,
  name: s.customLayers.name,
  kind: s.customLayers.kind,
  status: s.customLayers.status,
  bytes: s.customLayers.bytes,
  corners: s.customLayers.corners,
  createdAt: s.customLayers.createdAt,
};

export async function listCustomLayers(sdb: ScopedDb, farmId: string) {
  sdb.require(can.viewAll);
  await sdb.requireFarmVisible(farmId);
  const rows = await sdb.db
    .select(cols)
    .from(s.customLayers)
    .where(
      and(
        eq(s.customLayers.farmId, farmId),
        eq(s.customLayers.organizationId, sdb.auth.orgId),
        isNull(s.customLayers.deletedAt),
      ),
    )
    .orderBy(asc(s.customLayers.createdAt));
  return rows.map((r) => ({ ...r, corners: r.corners ? (JSON.parse(r.corners) as Corners) : null }));
}

/** Verifica permiso, estancia y tope por estancia antes de recibir el archivo. */
export async function assertCanAddLayer(sdb: ScopedDb, farmId: string) {
  sdb.require(can.manageCustomLayers);
  await sdb.requireFarm(farmId, true);
  const [n] = await sdb.db
    .select({ n: sql<number>`count(*)` })
    .from(s.customLayers)
    .where(
      and(
        eq(s.customLayers.farmId, farmId),
        eq(s.customLayers.organizationId, sdb.auth.orgId),
        isNull(s.customLayers.deletedAt),
      ),
    );
  if (Number(n?.n ?? 0) >= LIMITS.customLayers.maxPerFarm)
    throw new HTTPException(400, { message: `Máximo ${LIMITS.customLayers.maxPerFarm} capas propias por estancia` });
}

export async function insertCustomLayer(
  sdb: ScopedDb,
  input: {
    id: string;
    farmId: string;
    name: string;
    mime: string;
    originalPath: string;
    bytes: number;
    corners: Corners | null;
  },
) {
  const ts = sdb.now();
  const direct = input.mime !== GEOTIFF_MIME;
  await runBatch(sdb.db, [
    bumpVersion(sdb.db),
    sdb.db.insert(s.customLayers).values({
      id: input.id,
      organizationId: sdb.auth.orgId,
      farmId: input.farmId,
      name: input.name,
      kind: direct ? "image" : "geotiff",
      status: direct ? "ready" : "processing",
      mime: input.mime,
      originalPath: input.originalPath,
      imagePath: direct ? input.originalPath : null,
      imageMime: direct ? input.mime : null,
      bytes: input.bytes,
      corners: input.corners ? JSON.stringify(input.corners) : null,
      createdAt: ts,
      updatedAt: ts,
      version: currentVersion,
    }),
  ]);
}

async function requireLayer(sdb: ScopedDb, id: string) {
  const [row] = await sdb.db
    .select({
      id: s.customLayers.id,
      farmId: s.customLayers.farmId,
      status: s.customLayers.status,
      originalPath: s.customLayers.originalPath,
      imagePath: s.customLayers.imagePath,
      imageMime: s.customLayers.imageMime,
    })
    .from(s.customLayers)
    .where(
      and(
        eq(s.customLayers.id, id),
        eq(s.customLayers.organizationId, sdb.auth.orgId),
        isNull(s.customLayers.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError("No existe");
  await sdb.requireFarmVisible(row.farmId);
  return row;
}

/** Ruta en R2 de la imagen lista para dibujar. */
export async function customLayerImage(sdb: ScopedDb, id: string) {
  sdb.require(can.viewAll);
  const row = await requireLayer(sdb, id);
  if (row.status !== "ready" || !row.imagePath) throw new NotFoundError("La capa todavía no está lista");
  return { path: row.imagePath, mime: row.imageMime ?? "image/png" };
}

/** Borrado lógico; devuelve las rutas de R2 para que la ruta las elimine. */
export async function deleteCustomLayer(sdb: ScopedDb, id: string): Promise<string[]> {
  sdb.require(can.manageCustomLayers);
  const row = await requireLayer(sdb, id);
  await sdb.requireFarm(row.farmId, true);
  const ts = sdb.now();
  await runBatch(sdb.db, [
    bumpVersion(sdb.db),
    sdb.db
      .update(s.customLayers)
      .set({ deletedAt: ts, updatedAt: ts, version: currentVersion })
      .where(and(eq(s.customLayers.id, id), eq(s.customLayers.organizationId, sdb.auth.orgId))),
  ]);
  return [...new Set([row.originalPath, row.imagePath].filter((p): p is string => !!p))];
}
