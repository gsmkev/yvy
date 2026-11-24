/**
 * Generador de rutas CRUD para los maestros del ERP.
 */
import type { Hono } from "hono";
import type { AppEnv } from "../../types";
import { z } from "zod";
import type { Role } from "@yvy/shared";
import { erpCreate, erpDelete, erpList, erpUpdate, type ErpTable } from "../../db/erp";
import { can, type ScopedDb } from "../../db/scoped";
import { parse, readJson } from "../../lib/http";

/** Opciones de un maestro: permisos de lectura y escritura y ganchos antes y después de guardar. */
interface MasterOpts {
  read?: (r: Role) => boolean;
  write?: (r: Role) => boolean;
  /** Validación extra con acceso a la base (por ejemplo, que la estancia sea de la organización). */
  check?: (sdb: ScopedDb, values: Record<string, unknown>) => Promise<void>;
  /** Ajusta los valores antes de guardar (por ejemplo, un null que la columna no admite). */
  normalize?: (values: Record<string, unknown>) => Record<string, unknown>;
  /** Después de guardar (alta o cambio) con el id de la fila. */
  after?: (sdb: ScopedDb, id: string) => Promise<void>;
  /** Antes de borrar: puede rechazar el borrado. */
  beforeDelete?: (sdb: ScopedDb, id: string) => Promise<void>;
}

/**
 * Registra en `erp` las rutas GET, POST, PATCH y DELETE de un maestro, validadas con `schema`.
 * @param path segmento de la URL (`/${path}`).
 * @param order columnas por las que se ordena el listado.
 */
export function master(erp: Hono<AppEnv>, path: string, table: ErpTable, schema: z.ZodObject, order: Parameters<typeof erpList>[3], o: MasterOpts = {}) {
  const read = o.read ?? can.manageErp;
  const write = o.write ?? can.manageErp;
  erp.get(`/${path}`, async (c) => c.json(await erpList(c.var.sdb, table, read, order)));
  erp.post(`/${path}`, async (c) => {
    const b = (o.normalize ?? ((v) => v))(parse(schema, await readJson(c.req)) as Record<string, unknown>);
    c.var.sdb.require(write);
    await o.check?.(c.var.sdb, b);
    const created = await erpCreate(c.var.sdb, table, write, b);
    await o.after?.(c.var.sdb, created.id);
    return c.json(created, 201);
  });
  erp.patch(`/${path}/:id`, async (c) => {
    const b = (o.normalize ?? ((v) => v))(parse(schema.partial(), await readJson(c.req)) as Record<string, unknown>);
    c.var.sdb.require(write);
    await o.check?.(c.var.sdb, b);
    await erpUpdate(c.var.sdb, table, write, c.req.param("id"), b);
    await o.after?.(c.var.sdb, c.req.param("id"));
    return c.json({ ok: true });
  });
  erp.delete(`/${path}/:id`, async (c) => {
    c.var.sdb.require(write);
    await o.beforeDelete?.(c.var.sdb, c.req.param("id"));
    await erpDelete(c.var.sdb, table, write, c.req.param("id"));
    return c.json({ ok: true });
  });
}

/** La estancia de una máquina o un depósito tiene que ser de la organización. */
export const farmCheck = async (sdb: ScopedDb, v: Record<string, unknown>) => {
  if (typeof v.farmId === "string") await sdb.requireFarm(v.farmId);
};
