/** Catálogos de la organización: campañas, productos, máquinas, animales y depósitos. */
import { normalizeTag } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { type Season, type Product, type Machine, type Animal, type Warehouse, type PlotSeason, type Ctx, fromRow } from "./core";

/** Campañas activas de la organización, la más reciente primero. */
export function activeSeasons(db: Ctx): Season[] {
  return db.sql
    .all("SELECT * FROM seasons WHERE deleted_at IS NULL AND active = 1 ORDER BY start_date DESC, created_at DESC")
    .map((r) => fromRow<Season>(s.seasons, r));
}

/** Catálogo de productos de la organización. */
export function products(db: Ctx): Product[] {
  return db.sql
    .all("SELECT * FROM products WHERE deleted_at IS NULL ORDER BY name")
    .map((r) => fromRow<Product>(s.products, r));
}

/** Maquinaria y vehículos de la organización (para cargar combustible). */
export function machines(db: Ctx): Machine[] {
  return db.sql
    .all("SELECT * FROM machines WHERE deleted_at IS NULL ORDER BY name")
    .map((r) => fromRow<Machine>(s.machines, r));
}

/** Animales con caravana de las estancias del celular; con `query`, los que tienen ese texto en la caravana. */
export function animals(db: Ctx, query = "", limit = 30): Animal[] {
  // La caravana solo lleva letras, números y guiones: lo demás no puede coincidir (y no se pasa al LIKE).
  const needle = normalizeTag(query).replace(/[^A-Z0-9-]/g, "");
  return db.sql
    .all("SELECT * FROM animals WHERE deleted_at IS NULL AND tag LIKE ? ORDER BY tag LIMIT ?", [`%${needle}%`, limit])
    .map((r) => fromRow<Animal>(s.animals, r));
}

/** Depósitos de la organización (para el recuento de inventario). */
export function warehouses(db: Ctx): Warehouse[] {
  return db.sql
    .all("SELECT * FROM warehouses WHERE deleted_at IS NULL ORDER BY name")
    .map((r) => fromRow<Warehouse>(s.warehouses, r));
}

/** Lo planificado en un lote para una campaña (cultivo, variedad), si bajó al celular. */
export function plotSeason(db: Ctx, plotId: string, seasonId: string): PlotSeason | null {
  const r = db.sql.get(
    "SELECT * FROM plot_seasons WHERE plot_id = ? AND season_id = ? AND deleted_at IS NULL",
    [plotId, seasonId],
  );
  return r ? fromRow<PlotSeason>(s.plotSeasons, r) : null;
}
