import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { cors } from "hono/cors";
import { requireAuth } from "./auth/middleware";
import { ForbiddenError, NotFoundError } from "./db/scoped";
import { agri } from "./routes/agri";
import { auth } from "./routes/auth";
import { ingest } from "./routes/ingest";
import { media } from "./routes/media";
import { org } from "./routes/org";
import { share } from "./routes/share";
import { sync } from "./routes/sync";
import { web } from "./routes/web";
import { admin } from "./routes/admin";
import { readOnlyDemo, readOnlyWhenExpired } from "./auth/plan";
import type { AppEnv } from "./types";

export const app = new Hono<AppEnv>();

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  if (err instanceof ForbiddenError) return c.json({ error: err.message }, 403);
  if (err instanceof NotFoundError) return c.json({ error: err.message }, 404);
  console.error(err);
  return c.json({ error: "Error interno" }, 500);
});

// Solo en desarrollo: la vista previa web de la app (otro puerto) llama a la API local.
app.use("*", async (c, next) => {
  if (c.env.APP_ENV !== "development") return next();
  return cors({
    origin: (o) => (o.startsWith("http://localhost:") ? o : null),
    allowHeaders: ["content-type", "authorization"],
  })(c, next);
});

app.get("/health", (c) => c.json({ ok: true }));
/** APK firmado en el bucket público (anexo §4.10: distribución directa sin Play Store). */
app.get("/descargar-app", (c) => c.redirect(`${c.env.TILES_PUBLIC_URL.replace(/\/$/, "")}/app/yvy.apk`, 302));
// La demo no puede escribir tampoco por sync, media, dispositivos ni vinculando empleados.
app.use("/auth/link", requireAuth, readOnlyDemo);
app.route("/auth", auth);
app.route("/ingest", ingest as unknown as Hono<AppEnv>);
app.route("/public", share);

const authed = new Hono<AppEnv>();
// La sesión se exige solo en rutas de la API; el resto es la web (static assets).
for (const path of ["/sync/*", "/org/*", "/media/*", "/admin/*", "/me", "/me/*", "/devices"]) authed.use(path, requireAuth);
authed.use("/org/*", readOnlyWhenExpired);
for (const path of ["/sync/push", "/media/*", "/devices", "/me/*"]) authed.use(path, readOnlyDemo);
authed.route("/sync", sync);
authed.route("/org", org);
authed.route("/org", agri);
authed.route("/media", media);
authed.route("/", web);
authed.route("/admin", admin);
app.route("/", authed);

/** Cualquier otra ruta GET es una pantalla de la web (SPA): se sirve index.html. */
app.notFound(async (c) => {
  if (c.req.method === "GET" && c.env.ASSETS) return c.env.ASSETS.fetch(new Request(new URL("/index.html", c.req.url)));
  return c.json({ error: "No existe" }, 404);
});
