import * as SQLite from "expo-sqlite";
import type { Param, Sql } from "../db/sql";

export function expoSql(name = "yvy.db"): Sql {
  const db = SQLite.openDatabaseSync(name);
  db.execSync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;");
  let depth = 0;
  return {
    run: (q, p: Param[] = []) => void db.runSync(q, p),
    all: <T>(q: string, p: Param[] = []) => db.getAllSync<T>(q, p),
    get: <T>(q: string, p: Param[] = []) => db.getFirstSync<T>(q, p) ?? undefined,
    tx<T>(fn: () => T): T {
      if (depth > 0) return fn();
      let out!: T;
      depth++;
      try {
        db.withTransactionSync(() => {
          out = fn();
        });
      } finally {
        depth--;
      }
      return out;
    },
  };
}
