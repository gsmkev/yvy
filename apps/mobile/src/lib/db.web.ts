// Vista previa web de la app: SQLite en memoria con sql.js (WebAssembly), misma lógica de LocalDb.
import initSqlJs, { type Database } from "sql.js";
import { LocalDb } from "../db/store";
import type { Param, Sql } from "../db/sql";

let instance: LocalDb | null = null;
let loading: Promise<void> | null = null;

function wrap(db: Database): Sql {
  let depth = 0;
  const rows = <T>(q: string, p: Param[] = []): T[] => {
    const st = db.prepare(q);
    st.bind(p);
    const out: T[] = [];
    while (st.step()) out.push(st.getAsObject() as T);
    st.free();
    return out;
  };
  return {
    run: (q, p = []) => void db.run(q, p),
    all: rows,
    get: <T>(q: string, p: Param[] = []) => rows<T>(q, p)[0],
    tx<T>(fn: () => T): T {
      if (depth++ > 0) {
        try {
          return fn();
        } finally {
          depth--;
        }
      }
      db.run("BEGIN");
      try {
        const r = fn();
        db.run("COMMIT");
        return r;
      } catch (e) {
        db.run("ROLLBACK");
        throw e;
      } finally {
        depth--;
      }
    },
  };
}

export function dbReady(): Promise<void> {
  loading ??= initSqlJs({ locateFile: () => "/sql-wasm.wasm" }).then((SQL) => {
    instance = new LocalDb(wrap(new SQL.Database()));
    instance.migrate();
  });
  return loading;
}

export function getDb(): LocalDb {
  if (!instance) throw new Error("Base local no inicializada (dbReady)");
  return instance;
}
