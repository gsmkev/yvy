/** Stock, fotos de comprobantes, combustible y feedlot. */
import { z } from "zod";
import { LIMITS } from "@yvy/shared";
import { feedRationInput, noonAsuncion, isoDate, stockAdjustmentInput, stockMinimumInput, stockConsumptionInput, stockPurchaseInput, stockTransferInput } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { HTTPException } from "hono/http-exception";
import { PHOTO_KINDS, photoTarget, setPhotoPath, type PhotoKind } from "../../db/erp-photos";
import { presign } from "../../lib/r2";
import { fuelReport } from "../../db/fuel";
import { feedlotReport, listRations, requireRationProducts } from "../../db/feedlot";
import { adjustStock, consumeStock, deleteMove, expiringLots, listMoves, purchaseStock, stockSummary, transferStock } from "../../db/stock-moves";
import { deleteMinimum, listMinimums, lowStock, saveMinimum } from "../../db/stock-minimums";
import { erpCreate, erpDelete, erpUpdate } from "../../db/erp";
import { can, type ScopedDb } from "../../db/scoped";
import { parse, readJson } from "../../lib/http";
import type { AppEnv } from "../../types";
import { uuid } from "../schemas";
import { Hono } from "hono";

export const routes = new Hono<AppEnv>();

// ---------- Stock (E-11) ----------
// Ver cantidades: dueño, administrador y agrónomo (sin montos). Cargar o borrar movimientos: dueño y administrador.

routes.get("/stock", async (c) => c.json(await stockSummary(c.var.sdb)));
routes.get("/stock/expiring", async (c) => c.json(await expiringLots(c.var.sdb)));
routes.get("/stock/moves", async (c) =>
  c.json(await listMoves(c.var.sdb, parse(z.object({ productId: uuid.optional(), warehouseId: uuid.optional() }), c.req.query()))),
);
routes.get("/stock/low", async (c) => c.json(await lowStock(c.var.sdb)));
routes.get("/stock/minimums", async (c) => c.json(await listMinimums(c.var.sdb)));
routes.put("/stock/minimums", async (c) => {
  await saveMinimum(c.var.sdb, parse(stockMinimumInput, await readJson(c.req)));
  return c.json({ ok: true });
});
routes.delete("/stock/minimums/:id", async (c) => {
  await deleteMinimum(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});
routes.post("/stock/purchases", async (c) =>
  c.json(await purchaseStock(c.var.sdb, parse(stockPurchaseInput, await readJson(c.req))), 201),
);
routes.post("/stock/consumptions", async (c) =>
  c.json(await consumeStock(c.var.sdb, parse(stockConsumptionInput, await readJson(c.req))), 201),
);
routes.post("/stock/transfers", async (c) =>
  c.json(await transferStock(c.var.sdb, parse(stockTransferInput, await readJson(c.req))), 201),
);
routes.post("/stock/adjustments", async (c) =>
  c.json(await adjustStock(c.var.sdb, parse(stockAdjustmentInput, await readJson(c.req))), 201),
);
routes.delete("/stock/moves/:id", async (c) => {
  await deleteMove(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});

// ---------- Foto de la factura o el ticket (E-37) ----------

const photoKind = (v: string): PhotoKind => parse(z.enum(PHOTO_KINDS), v);

/** URL firmada para subir la foto (PUT directo a R2). */
routes.post("/photos/:kind/:id/upload-url", async (c) => {
  const { key } = await photoTarget(c.var.sdb, photoKind(c.req.param("kind")), c.req.param("id"));
  const ttl = LIMITS.photos.uploadUrlTtlSeconds;
  return c.json({ url: await presign(c.env, "PUT", key, ttl), expiresAt: Date.now() + ttl * 1000 });
});

/** Confirma la subida: verifica el objeto y su tamaño y recién entonces lo asocia al movimiento. */
routes.post("/photos/:kind/:id/uploaded", async (c) => {
  const kind = photoKind(c.req.param("kind"));
  const { key } = await photoTarget(c.var.sdb, kind, c.req.param("id"));
  const head = await c.env.MEDIA.head(key);
  if (!head) throw new HTTPException(409, { message: "La foto todavía no está en el almacenamiento" });
  if (head.size > LIMITS.photos.maxBytes) {
    await c.env.MEDIA.delete(key);
    throw new HTTPException(413, { message: "Foto demasiado grande" });
  }
  await setPhotoPath(c.var.sdb, kind, c.req.param("id"), key);
  return c.json({ ok: true });
});

routes.get("/photos/:kind/:id", async (c) => {
  const { photoPath } = await photoTarget(c.var.sdb, photoKind(c.req.param("kind")), c.req.param("id"));
  if (!photoPath) throw new HTTPException(404, { message: "No tiene foto" });
  return c.json({ url: await presign(c.env, "GET", photoPath, LIMITS.photos.downloadUrlTtlSeconds) });
});

routes.delete("/photos/:kind/:id", async (c) => {
  const kind = photoKind(c.req.param("kind"));
  const { key, photoPath } = await photoTarget(c.var.sdb, kind, c.req.param("id"));
  await setPhotoPath(c.var.sdb, kind, c.req.param("id"), null);
  if (photoPath) await c.env.MEDIA.delete(key);
  return c.json({ ok: true });
});

// ---------- Combustible (E-16) ----------

routes.get("/fuel/report", async (c) =>
  c.json(await fuelReport(c.var.sdb, parse(z.object({ farmId: uuid.optional(), from: isoDate.optional(), to: isoDate.optional() }), c.req.query()))),
);

// ---------- Feedlot (G-33) ----------
// Raciones (maestro de oficina) y resumen por corral. Los suministros son registros `feed` que llegan por /sync/push.

const rationRow = async (sdb: ScopedDb, v: z.infer<typeof feedRationInput>) => {
  if (!(await requireRationProducts(sdb, v.items.map((i) => i.productId)))) throw new HTTPException(400, { message: "Un ingrediente no está en el catálogo" });
  return { name: v.name, items: JSON.stringify(v.items), note: v.note ?? null };
};
routes.get("/feedlot/rations", async (c) => c.json(await listRations(c.var.sdb)));
routes.post("/feedlot/rations", async (c) => {
  c.var.sdb.require(can.manageErp);
  const row = await rationRow(c.var.sdb, parse(feedRationInput, await readJson(c.req)));
  return c.json(await erpCreate(c.var.sdb, s.feedRations, can.manageErp, row), 201);
});
routes.put("/feedlot/rations/:id", async (c) => {
  c.var.sdb.require(can.manageErp);
  const row = await rationRow(c.var.sdb, parse(feedRationInput, await readJson(c.req)));
  await erpUpdate(c.var.sdb, s.feedRations, can.manageErp, c.req.param("id"), row);
  return c.json({ ok: true });
});
routes.delete("/feedlot/rations/:id", async (c) => {
  await erpDelete(c.var.sdb, s.feedRations, can.manageErp, c.req.param("id"));
  return c.json({ ok: true });
});
routes.get("/feedlot/report", async (c) => {
  const q = parse(z.object({ farmId: uuid.optional(), from: isoDate, to: isoDate }), c.req.query());
  return c.json(await feedlotReport(c.var.sdb, { farmId: q.farmId, from: noonAsuncion(q.from) - 12 * 3_600_000, to: noonAsuncion(q.to) + 12 * 3_600_000 - 1 }));
});
