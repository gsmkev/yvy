import { LocalDb } from "../db/store";
import { expoSql } from "./expo-sql";

let instance: LocalDb | null = null;

/** En el celular la base abre al instante; en la vista previa web hay que cargar WebAssembly antes. */
export const dbReady = (): Promise<void> => Promise.resolve();

export function getDb(): LocalDb {
  if (!instance) {
    instance = new LocalDb(expoSql());
    instance.migrate();
  }
  return instance;
}
