/** Tablero, comentarios, comparaciones y registro de cambios de la organización. */
import { z } from "zod";
import { compareFarms, compareSeasons } from "../../db/compare";
import { addComment, deleteComment, listComments } from "../../db/comments";
import { LIMITS } from "@yvy/shared";
import { listAudit, ownerDashboard } from "../../db/queries";
import { parse, readJson } from "../../lib/http";
import type { AppEnv } from "../../types";
import { Hono } from "hono";

/** Rutas del tablero, comentarios, comparaciones y registro de cambios. */
export const routes = new Hono<AppEnv>();

routes.get("/org/dashboard", async (c) => c.json(await ownerDashboard(c.var.sdb)));
/** Comentarios y menciones en un registro. */
routes.get("/org/records/:id/comments", async (c) => c.json(await listComments(c.var.sdb, c.req.param("id"))));
routes.post("/org/records/:id/comments", async (c) => {
  const b = parse(
    z.object({
      body: z.string().trim().min(1).max(LIMITS.comments.maxLength),
      mentions: z.array(z.string().uuid()).max(LIMITS.comments.maxMentions).default([]),
    }),
    await readJson(c.req),
  );
  return c.json(await addComment(c.var.sdb, c.req.param("id"), b.body, b.mentions), 201);
});
routes.delete("/org/comments/:id", async (c) => {
  await deleteComment(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});
/** Comparación entre estancias y entre campañas. */
routes.get("/org/compare/farms", async (c) => c.json(await compareFarms(c.var.sdb)));
routes.get("/org/compare/seasons", async (c) => c.json(await compareSeasons(c.var.sdb)));
routes.get("/org/audit", async (c) =>
  c.json(
    await listAudit(c.var.sdb, {
      entity: c.req.query("entity") || undefined,
      before: Number(c.req.query("before")) || undefined,
    }),
  ),
);
