/**
 * Fotos (PRD §11 y PRD-cloudflare §4.4): URLs firmadas de R2, el archivo no pasa por el Worker.
 * Firmar con SigV4 es HMAC: barato en CPU.
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { LIMITS } from "@yvy/shared";
import { presign } from "../lib/r2";
import type { AppEnv } from "../types";

export const media = new Hono<AppEnv>();

/** URLs de subida de la foto y su miniatura (después de un push exitoso del adjunto). */
media.post("/attachments/:id/upload-url", async (c) => {
  const a = await c.var.sdb.getAttachment(c.req.param("id"));
  const ttl = LIMITS.photos.uploadUrlTtlSeconds;
  return c.json({
    photo: await presign(c.env, "PUT", a.storagePath, ttl),
    thumb: await presign(c.env, "PUT", a.thumbPath, ttl),
    expiresAt: Date.now() + ttl * 1000,
  });
});

/** Confirma la subida: verifica en R2 y marca upload_status = 'uploaded'. */
media.post("/attachments/:id/uploaded", async (c) => {
  const a = await c.var.sdb.getAttachment(c.req.param("id"));
  const [photo, thumb] = await Promise.all([c.env.MEDIA.head(a.storagePath), c.env.MEDIA.head(a.thumbPath)]);
  if (!photo || !thumb) throw new HTTPException(409, { message: "La foto todavía no está en el almacenamiento" });
  if (photo.size > LIMITS.photos.maxBytes) {
    await c.env.MEDIA.delete([a.storagePath, a.thumbPath]);
    throw new HTTPException(413, { message: "Foto demasiado grande" });
  }
  await c.var.sdb.markAttachmentUploaded(a.id, photo.size);
  return c.json({ ok: true });
});

media.get("/attachments/:id", async (c) => {
  const a = await c.var.sdb.getAttachment(c.req.param("id"));
  if (a.uploadStatus !== "uploaded") throw new HTTPException(404, { message: "Foto pendiente de subida" });
  const key = c.req.query("thumb") ? a.thumbPath : a.storagePath;
  return c.json({ url: await presign(c.env, "GET", key, LIMITS.photos.downloadUrlTtlSeconds) });
});
