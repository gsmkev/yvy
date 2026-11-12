/** Ganadería, segunda tanda (gan-p2): rotación, pasto, reproducción, pesadas, animales, abigeato, suplementos, calor. */
import { Hono } from "hono";
import { z } from "zod";
import { animalInput } from "@yvy/shared";
import { animalHistory, createAnimal, deleteAnimal, listAnimals, updateAnimal } from "../db/animals";
import { farmHeatStress, farmReproduction, farmSupplements, farmTheft, farmWeighings } from "../db/herd";
import { parse, readJson } from "../lib/http";
import type { AppEnv } from "../types";

export const herd = new Hono<AppEnv>();

// G-32: estrés térmico (THI) de las próximas 48 horas.
herd.get("/farms/:id/heat-stress", async (c) => c.json(await farmHeatStress(c.var.sdb, c.req.param("id"))));

/** Rango opcional de fechas (epoch ms) de los listados. */
const range = z.object({
  from: z.coerce.number().int().nonnegative().optional(),
  to: z.coerce.number().int().nonnegative().optional(),
});

// G-13: abigeato (faltantes y denuncias).
herd.get("/farms/:id/theft", async (c) => {
  const q = parse(range, c.req.query());
  return c.json(await farmTheft(c.var.sdb, c.req.param("id"), q.from, q.to));
});

// G-31: suplementación y sal mineral por potrero.
herd.get("/farms/:id/supplements", async (c) => {
  const q = parse(range, c.req.query());
  return c.json(await farmSupplements(c.var.sdb, c.req.param("id"), q.from, q.to));
});

// G-22: pesadas y ganancia diaria de peso.
herd.get("/farms/:id/weighings", async (c) => {
  const q = parse(range, c.req.query());
  return c.json(await farmWeighings(c.var.sdb, c.req.param("id"), q.from, q.to));
});

// G-20: reproducción (servicio, tacto, parición, destete) e índices.
herd.get("/farms/:id/reproduction", async (c) => {
  const q = parse(range, c.req.query());
  return c.json(await farmReproduction(c.var.sdb, c.req.param("id"), q.from, q.to));
});

// G-21: animales con caravana (búsqueda, alta, edición, baja e historial).
herd.get("/farms/:id/animals", async (c) => {
  const q = parse(z.object({ q: z.string().max(40).optional() }), c.req.query());
  return c.json(await listAnimals(c.var.sdb, c.req.param("id"), q.q));
});
herd.post("/farms/:id/animals", async (c) => {
  const b = parse(animalInput, await readJson(c.req));
  return c.json(await createAnimal(c.var.sdb, c.req.param("id"), b), 201);
});
herd.patch("/animals/:id", async (c) => {
  const b = parse(animalInput.partial(), await readJson(c.req));
  await updateAnimal(c.var.sdb, c.req.param("id"), b);
  return c.json({ ok: true });
});
herd.delete("/animals/:id", async (c) => {
  await deleteAnimal(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});
herd.get("/animals/:id/history", async (c) => c.json(await animalHistory(c.var.sdb, c.req.param("id"))));
