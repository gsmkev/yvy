/** I-04: el .ics de tareas lo piden Google Calendar y Outlook sin sesión; el token secreto de la URL es la credencial. */
import { Hono } from "hono";
import { getDb } from "../db/client";
import { renderFeed } from "../db/calendar-feed";
import type { AppEnv } from "../types";

export const calendar = new Hono<AppEnv>();

calendar.get("/calendar/:file", async (c) => {
  const m = /^([A-Za-z0-9_-]{20,80})\.ics$/.exec(c.req.param("file"));
  c.header("X-Robots-Tag", "noindex");
  c.header("Cache-Control", "private, max-age=300");
  const ics = m ? await renderFeed(getDb(c.env.DB), m[1]!, c.env.APP_URL) : null;
  if (!ics) return c.json({ error: "Enlace inexistente" }, 404);
  return c.body(ics, 200, { "content-type": "text/calendar; charset=utf-8" });
});
