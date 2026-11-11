/** ERP sencillo desde la web (ADR 0004). Montada en /org/erp. */
import { Hono } from "hono";
import type { z } from "zod";
import { partyInput, type Role } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { erpCreate, erpDelete, erpList, erpUpdate, type ErpTable } from "../db/erp";
import { can, type ScopedDb } from "../db/scoped";
import { parse, readJson } from "../lib/http";
import type { AppEnv } from "../types";

export const erp = new Hono<AppEnv>();

interface MasterOpts {
  read?: (r: Role) => boolean;
  write?: (r: Role) => boolean;
  /** Validación extra con acceso a la base (por ejemplo, que la estancia sea de la organización). */
  check?: (sdb: ScopedDb, values: Record<string, unknown>) => Promise<void>;
}

/** Alta, listado, cambio y baja de un maestro con su esquema Zod. */
function master(path: string, table: ErpTable, schema: z.ZodObject, order: ErpTable[keyof ErpTable][], o: MasterOpts = {}) {
  const read = o.read ?? can.manageErp;
  const write = o.write ?? can.manageErp;
  const cols = order as never as Parameters<typeof erpList>[3];
  erp.get(`/${path}`, async (c) => c.json(await erpList(c.var.sdb, table, read, cols)));
  erp.post(`/${path}`, async (c) => {
    const b = parse(schema, await readJson(c.req)) as Record<string, unknown>;
    c.var.sdb.require(write);
    await o.check?.(c.var.sdb, b);
    return c.json(await erpCreate(c.var.sdb, table, write, b), 201);
  });
  erp.patch(`/${path}/:id`, async (c) => {
    const b = parse(schema.partial(), await readJson(c.req)) as Record<string, unknown>;
    c.var.sdb.require(write);
    await o.check?.(c.var.sdb, b);
    await erpUpdate(c.var.sdb, table, write, c.req.param("id"), b);
    return c.json({ ok: true });
  });
  erp.delete(`/${path}/:id`, async (c) => {
    await erpDelete(c.var.sdb, table, write, c.req.param("id"));
    return c.json({ ok: true });
  });
}

master("parties", s.parties, partyInput, [s.parties.name]);
