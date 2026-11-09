import { LocalDb } from "../db/store";
import { expoSql } from "./expo-sql";

let instance: LocalDb | null = null;

export function getDb(): LocalDb {
  if (!instance) {
    instance = new LocalDb(expoSql());
    instance.migrate();
  }
  return instance;
}
