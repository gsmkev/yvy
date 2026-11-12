/** Campos propios de los formularios de la organización (F-14): se bajan con red y quedan en el celular. */
import { formConfigSchema, type FormConfig, type FormField, type RecordKind } from "@yvy/shared";

interface Kv {
  getKv(key: string): string | null;
  setKv(key: string, value: string | null): void;
}

const KEY = "form_config";

/** Lo último que se bajó (vacío si nunca hubo red o la organización no definió campos). Valida: un dato roto no tumba el flujo. */
export function readFormConfig(db: Kv): FormConfig {
  const raw = db.getKv(KEY);
  if (!raw) return {};
  try {
    const parsed = formConfigSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export const fieldsFor = (cfg: FormConfig, kind: RecordKind | null): FormField[] => (kind ? (cfg[kind] ?? []) : []);

/** Baja la configuración y la guarda. Falla en silencio sin red: se sigue con la última. */
export async function refreshFormConfig(db: Kv, fetchConfig: () => Promise<{ config: unknown }>): Promise<void> {
  try {
    const res = await fetchConfig();
    const parsed = formConfigSchema.safeParse(res.config);
    if (parsed.success) db.setKv(KEY, JSON.stringify(parsed.data));
  } catch {
    /* sin red o sin permiso: queda lo anterior */
  }
}
