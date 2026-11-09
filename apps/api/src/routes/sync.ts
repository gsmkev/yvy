import { Hono } from "hono";
import { pullRequest, pushRequest } from "@yvy/shared";
import { applyPush } from "../db/push";
import { parse, readJson } from "../lib/http";
import type { AppEnv } from "../types";

export const sync = new Hono<AppEnv>();

sync.get("/state", async (c) => c.json(await c.var.sdb.syncState()));

sync.post("/push", async (c) => {
  const body = parse(pushRequest, await readJson(c.req));
  return c.json(await applyPush(c.var.sdb, body.deviceId, body.mutations));
});

sync.post("/pull", async (c) => {
  const body = parse(pullRequest, await readJson(c.req));
  return c.json(await c.var.sdb.pull(body.table, body.cursor));
});
