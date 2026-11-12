/**
 * Capas propias de la estancia (M-17). El Worker valida tipo y tamaño y pasa el archivo a R2 sin leerlo entero:
 * un GeoTIFF pesado lo convierte workers-py (job custom_layers).
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { LIMITS, newId } from "@yvy/shared";
import {
  assertCanAddLayer,
  customLayerImage,
  deleteCustomLayer,
  GEOTIFF_MIME,
  IMAGE_MIMES,
  insertCustomLayer,
  layerKey,
  listCustomLayers,
  parseCorners,
  sniffMime,
} from "../db/customLayers";
import { dispatchJob } from "../lib/dispatch";
import type { AppEnv } from "../types";

export const layers = new Hono<AppEnv>();

layers.get("/farms/:id/custom-layers", async (c) => c.json(await listCustomLayers(c.var.sdb, c.req.param("id"))));

/** Cuerpo = el archivo (PNG, JPG o GeoTIFF); nombre y esquinas van en la query. */
layers.post("/farms/:id/custom-layers", async (c) => {
  const farmId = c.req.param("id");
  const mime = (c.req.header("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  const isImage = (IMAGE_MIMES as readonly string[]).includes(mime);
  if (!isImage && mime !== GEOTIFF_MIME)
    throw new HTTPException(415, { message: "Subí un PNG, un JPG o un GeoTIFF" });
  const name = (c.req.query("name") ?? "").trim();
  if (!name || name.length > LIMITS.customLayers.nameMaxLength)
    throw new HTTPException(400, { message: "Poné un nombre para la capa" });
  const corners = isImage ? parseCorners(c.req.query("corners")) : null;
  if (isImage && !corners) throw new HTTPException(400, { message: "Faltan las cuatro esquinas de la imagen" });
  const max = isImage ? LIMITS.customLayers.imageMaxBytes : LIMITS.customLayers.geotiffMaxBytes;
  const length = Number(c.req.header("content-length"));
  if (!Number.isFinite(length) || length <= 0) throw new HTTPException(411, { message: "Falta el tamaño del archivo" });
  if (length > max)
    throw new HTTPException(413, { message: `El archivo supera los ${Math.round(max / 1_000_000)} MB` });
  await assertCanAddLayer(c.var.sdb, farmId);

  const id = newId();
  const orgId = c.var.sdb.auth.orgId;
  const key = layerKey(orgId, id, "original", mime);
  const stored = await c.env.MEDIA.put(key, c.req.raw.body, { httpMetadata: { contentType: mime } });
  const drop = async (message: string, status: 400 | 413) => {
    await c.env.MEDIA.delete(key);
    throw new HTTPException(status, { message });
  };
  if (stored.size > max) return drop(`El archivo supera los ${Math.round(max / 1_000_000)} MB`, 413);
  // El content-type lo manda el cliente: se confirma con los primeros bytes
  const head = await c.env.MEDIA.get(key, { range: { offset: 0, length: 8 } });
  const sniffed = head ? sniffMime(new Uint8Array(await head.arrayBuffer())) : null;
  if (sniffed !== mime) return drop("El archivo no es del tipo que dice ser", 400);

  await insertCustomLayer(c.var.sdb, { id, farmId, name, mime, originalPath: key, bytes: stored.size, corners });
  if (!isImage) await dispatchJob(c.env, "custom_layers", farmId); // sin GitHub configurado, lo toma el cron semanal
  return c.json({ id, status: isImage ? "ready" : "processing" }, 201);
});

layers.get("/custom-layers/:id/image", async (c) => {
  const img = await customLayerImage(c.var.sdb, c.req.param("id"));
  const obj = await c.env.MEDIA.get(img.path);
  if (!obj) throw new HTTPException(404, { message: "No existe" });
  return new Response(obj.body, {
    headers: { "content-type": img.mime, "cache-control": "private, max-age=3600", "content-length": String(obj.size) },
  });
});

layers.delete("/custom-layers/:id", async (c) => {
  const paths = await deleteCustomLayer(c.var.sdb, c.req.param("id"));
  await c.env.MEDIA.delete(paths);
  return c.json({ ok: true });
});
