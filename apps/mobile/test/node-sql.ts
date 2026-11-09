import { DatabaseSync } from "node:sqlite";
import type { Param, Sql } from "../src/db/sql";

export function nodeSql(): Sql {
  const db = new DatabaseSync(":memory:");
  let depth = 0;
  return {
    run: (q: string, p: Param[] = []) => void db.prepare(q).run(...p),
    all: <T>(q: string, p: Param[] = []) => db.prepare(q).all(...p) as T[],
    get: <T>(q: string, p: Param[] = []) => db.prepare(q).get(...p) as T | undefined,
    tx<T>(fn: () => T): T {
      if (depth++ > 0) {
        try {
          return fn();
        } finally {
          depth--;
        }
      }
      db.exec("BEGIN");
      try {
        const r = fn();
        db.exec("COMMIT");
        return r;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      } finally {
        depth--;
      }
    },
  };
}
