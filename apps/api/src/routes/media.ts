/**
 * Fotos (PRD §11 y PRD-cloudflare §4.4): URLs firmadas de R2, el archivo no pasa por el Worker.
 * Firmar con SigV4 es HMAC: barato en CPU.
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { isAudioMime, LIMITS } from "@yvy/shared";
import { presign } from "../lib/r2";
import type { AppEnv } from "../types";

export const media = new Hono<AppEnv>();

/** URLs de subida de la foto y su miniatura (después de un push exitoso del adjunto). */
media.post("/attachments/:id/upload-url", async (c) => {
  const a = await c.var.sdb.getAttachment(c.req.param("id"));
  const ttl = LIMITS.photos.uploadUrlTtlSeconds;
  // La nota de voz (F-09) es un solo archivo: `photo` apunta a él y no hay miniatura.
  return c.json({
    photo: await presign(c.env, "PUT", a.storagePath, ttl),
    thumb: a.thumbPath ? await presign(c.env, "PUT", a.thumbPath, ttl) : null,
    mime: a.mime,
    expiresAt: Date.now() + ttl * 1000,
  });
});

/** Confirma la subida: verifica en R2 y marca upload_status = 'uploaded'. */
media.post("/attachments/:id/uploaded", async (c) => {
  const a = await c.var.sdb.getAttachment(c.req.param("id"));
  const audio = isAudioMime(a.mime);
  const [photo, thumb] = await Promise.all([
    c.env.MEDIA.head(a.storagePath),
    a.thumbPath ? c.env.MEDIA.head(a.thumbPath) : Promise.resolve(true),
  ]);
  if (!photo || !thumb)
    throw new HTTPException(409, { message: audio ? "La nota de voz todavía no está en el almacenamiento" : "La foto todavía no está en el almacenamiento" });
  if (photo.size > (audio ? LIMITS.audio.maxBytes : LIMITS.photos.maxBytes)) {
    await c.env.MEDIA.delete([a.storagePath, ...(a.thumbPath ? [a.thumbPath] : [])]);
    throw new HTTPException(413, { message: audio ? "Nota de voz demasiado grande" : "Foto demasiado grande" });
  }
  await c.var.sdb.markAttachmentUploaded(a.id, photo.size);
  return c.json({ ok: true });
});

media.get("/attachments/:id", async (c) => {
  const a = await c.var.sdb.getAttachment(c.req.param("id"));
  if (a.uploadStatus !== "uploaded") throw new HTTPException(404, { message: "Foto pendiente de subida" });
  const key = c.req.query("thumb") && a.thumbPath ? a.thumbPath : a.storagePath;
  return c.json({ url: await presign(c.env, "GET", key, LIMITS.photos.downloadUrlTtlSeconds) });
});
