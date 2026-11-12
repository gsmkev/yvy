import { Hono } from "hono";
import { pullRequest, pushRequest } from "@yvy/shared";
import { localDate } from "@yvy/shared";
import { applyPush } from "../db/push";
import { inBackground } from "../lib/dispatch";
import { refreshWaterAlert } from "../jobs/water";
import { touchActivity } from "../auth/plan";
import { parse, readJson } from "../lib/http";
import type { AppEnv } from "../types";

export const sync = new Hono<AppEnv>();

sync.get("/state", async (c) => {
  await touchActivity(c.var.sdb.db, c.var.auth);
  return c.json(await c.var.sdb.syncState());
});

sync.post("/push", async (c) => {
  const body = parse(pushRequest, await readJson(c.req));
  const res = await applyPush(c.var.sdb, body.deviceId, body.mutations);
  // G-30: un registro de agua de una aguada puede abrir o cerrar el aviso de aguada baja de la estancia.
  const waterFarms = new Set<string>();
  body.mutations.forEach((m, i) => {
    if (m.kind === "records.upsert" && m.row.kind === "water" && m.row.poiId && res.results[i]?.status === "applied")
      waterFarms.add(m.row.farmId);
  });
  if (waterFarms.size) {
    const { db, auth } = c.var.sdb;
    const now = Date.now();
    await inBackground(
      c,
      Promise.all(
        [...waterFarms].map((id) =>
          refreshWaterAlert(db, { id, organizationId: auth.orgId }, now, localDate(now)).catch((e) =>
            console.error("[water] aviso de aguada", e),
          ),
        ),
      ),
    );
  }
  return c.json(res);
});

sync.post("/pull", async (c) => {
  const body = parse(pullRequest, await readJson(c.req));
  return c.json(await c.var.sdb.pull(body.table, body.cursor));
});
