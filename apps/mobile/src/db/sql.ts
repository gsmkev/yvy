/** Interfaz SQL mínima: la implementan expo-sqlite (app) y node:sqlite (tests). */
export type Param = string | number | null;

export interface Sql {
  run(sql: string, params?: Param[]): void;
  all<T = Record<string, unknown>>(sql: string, params?: Param[]): T[];
  get<T = Record<string, unknown>>(sql: string, params?: Param[]): T | undefined;
  /** Ejecuta fn en una transacción; si lanza, hace rollback. */
  tx<T>(fn: () => T): T;
}

export const LOCAL_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS outbox (
    mutation_id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    row_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    rejected_reason TEXT,
    rejected_detail TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS outbox_row_idx ON outbox(row_id)`,
  `CREATE TABLE IF NOT EXISTS sync_cursors (tbl TEXT PRIMARY KEY, version INTEGER NOT NULL, id TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS local_files (
    attachment_id TEXT PRIMARY KEY,
    photo_uri TEXT NOT NULL,
    thumb_uri TEXT NOT NULL,
    uploaded INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS offline_packs (
    layer_id TEXT PRIMARY KEY,
    farm_id TEXT NOT NULL,
    layer TEXT NOT NULL,
    uri TEXT NOT NULL,
    bytes INTEGER NOT NULL,
    downloaded_at INTEGER NOT NULL
  )`,
];
