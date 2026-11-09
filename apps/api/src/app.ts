import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "./auth/middleware";
import { ForbiddenError, NotFoundError } from "./db/scoped";
import { auth } from "./routes/auth";
import { ingest } from "./routes/ingest";
import { media } from "./routes/media";
import { org } from "./routes/org";
import { sync } from "./routes/sync";
import { web } from "./routes/web";
import type { AppEnv } from "./types";

export const app = new Hono<AppEnv>();

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  if (err instanceof ForbiddenError) return c.json({ error: err.message }, 403);
  if (err instanceof NotFoundError) return c.json({ error: err.message }, 404);
  console.error(err);
  return c.json({ error: "Error interno" }, 500);
});

app.get("/health", (c) => c.json({ ok: true }));
app.route("/auth", auth);
app.route("/ingest", ingest as unknown as Hono<AppEnv>);

const authed = new Hono<AppEnv>();
authed.use("*", requireAuth);
authed.route("/sync", sync);
authed.route("/org", org);
authed.route("/media", media);
authed.route("/", web);
app.route("/", authed);
