/**
 * Animales con caravana (G-21). Tabla sincronizable: toda escritura hace bumpVersion() primero y guarda
 * `version: currentVersion`. El historial sale de los registros que llevan la caravana (no hay tabla de historial).
 */
import { and, asc, desc, eq, inArray, isNull, like, ne, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  newId,
  normalizeTag,
  TAGGED_RECORD_KINDS,
  weightSeries,
  type AnimalHistoryResponse,
  type AnimalInput,
  type AnimalRow,
  type WeightPoint,
} from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { bumpVersion, currentVersion, runBatch } from "./client";
import { updateSynced } from "./queries";
import { can, NotFoundError, type ScopedDb } from "./scoped";

const MAX_LIST = 50;
const MAX_HISTORY = 100;
/** Registros que se leen para armar el historial y la ganancia de peso (cuidado con los 10 ms de CPU). */
const MAX_HISTORY_SCAN = 300;

const toRow = (a: typeof s.animals.$inferSelect): AnimalRow => ({
  id: a.id,
  farmId: a.farmId,
  tag: a.tag,
  category: a.category,
  sex: a.sex,
  birthDate: a.birthDate,
  note: a.note,
});

/** Animales de una estancia; con `q` busca por caravana (contiene el texto, sin distinguir mayúsculas). */
export async function listAnimals(sdb: ScopedDb, farmId: string, q?: string): Promise<AnimalRow[]> {
  await sdb.requireFarmVisible(farmId);
  // La caravana solo lleva letras, números y guiones: lo demás no puede coincidir y no se pasa al LIKE.
  const needle = q ? normalizeTag(q).replace(/[^A-Z0-9-]/g, "") : "";
  const rows = await sdb.db
    .select()
    .from(s.animals)
    .where(
      and(
        eq(s.animals.organizationId, sdb.auth.orgId),
        eq(s.animals.farmId, farmId),
        isNull(s.animals.deletedAt),
        needle ? like(s.animals.tag, `%${needle}%`) : undefined,
        sdb.workerFilter("animals"),
      ),
    )
    .orderBy(asc(s.animals.tag))
    .limit(MAX_LIST);
  return rows.map(toRow);
}

async function tagTaken(sdb: ScopedDb, tag: string, exceptId?: string): Promise<boolean> {
  const [dup] = await sdb.db
    .select({ id: s.animals.id })
    .from(s.animals)
    .where(
      and(
        eq(s.animals.organizationId, sdb.auth.orgId),
        eq(s.animals.tag, tag),
        isNull(s.animals.deletedAt),
        exceptId ? ne(s.animals.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  return !!dup;
}

const conflict = () => new HTTPException(409, { message: "Ya hay un animal con esa caravana" });

export async function createAnimal(sdb: ScopedDb, farmId: string, input: AnimalInput) {
  sdb.require(can.editAnimals, "Solo el dueño, un administrador o un agrónomo cargan animales");
  await sdb.requireFarm(farmId);
  if (await tagTaken(sdb, input.tag)) throw conflict();
  const id = newId();
  const ts = sdb.now();
  await runBatch(sdb.db, [
    bumpVersion(sdb.db),
    sdb.db.insert(s.animals).values({
      id,
      organizationId: sdb.auth.orgId,
      farmId,
      tag: input.tag,
      category: input.category,
      sex: input.sex,
      birthDate: input.birthDate ?? null,
      note: input.note ?? null,
      createdAt: ts,
      updatedAt: ts,
      version: currentVersion,
    }),
  ]);
  return { id };
}

export async function updateAnimal(sdb: ScopedDb, id: string, patch: Partial<AnimalInput>) {
  sdb.require(can.editAnimals, "Solo el dueño, un administrador o un agrónomo editan animales");
  if (patch.tag && (await tagTaken(sdb, patch.tag, id))) throw conflict();
  await updateSynced(sdb, s.animals, id, patch);
}

export async function deleteAnimal(sdb: ScopedDb, id: string) {
  sdb.require(can.editAnimals, "Solo el dueño, un administrador o un agrónomo borran animales");
  await updateSynced(sdb, s.animals, id, { deletedAt: sdb.now() });
}

/** Ficha del animal con los registros que llevan su caravana y su ganancia diaria de peso (2 consultas). */
export async function animalHistory(sdb: ScopedDb, id: string): Promise<AnimalHistoryResponse> {
  const [animal] = await sdb.db
    .select()
    .from(s.animals)
    .where(
      and(
        eq(s.animals.id, id),
        eq(s.animals.organizationId, sdb.auth.orgId),
        isNull(s.animals.deletedAt),
        sdb.workerFilter("animals"),
      ),
    )
    .limit(1);
  if (!animal) throw new NotFoundError("Animal inexistente");
  const rows = await sdb.db
    .select({ id: s.records.id, kind: s.records.kind, plotId: s.records.plotId, capturedAt: s.records.capturedAt, data: s.records.data })
    .from(s.records)
    .where(
      and(
        eq(s.records.organizationId, sdb.auth.orgId),
        inArray(s.records.kind, [...TAGGED_RECORD_KINDS]),
        isNull(s.records.deletedAt),
        sql`json_extract(${s.records.data}, '$.tag') = ${animal.tag}`,
        sdb.workerFilter("records"),
      ),
    )
    .orderBy(desc(s.records.capturedAt))
    .limit(MAX_HISTORY_SCAN + 1);
  const scan = rows.slice(0, MAX_HISTORY_SCAN);
  const records: AnimalHistoryResponse["records"] = [];
  const points: WeightPoint[] = [];
  for (const r of scan) {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(r.data) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (records.length < MAX_HISTORY) records.push({ id: r.id, kind: r.kind, capturedAt: r.capturedAt, plotId: r.plotId, data });
    if (r.kind === "weighing" && typeof data.kg === "number") points.push({ at: r.capturedAt, kg: data.kg, head: 1 });
  }
  return {
    animal: toRow(animal),
    records,
    weight: points.length ? weightSeries(animal.tag, animal.tag, points) : null,
    truncated: rows.length > MAX_HISTORY_SCAN,
  };
}
