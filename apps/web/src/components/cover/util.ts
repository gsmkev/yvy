/** Constantes y funciones de fecha del análisis de cobertura. */
/** Clases de cobertura del análisis. */
export const CLASSES = ["forest", "pasture", "crop", "other"] as const;
/** Fecha ISO (aaaa-mm-dd) en UTC. */
export const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Fecha ISO de un día en formato local de es-PY, sin correr de día por la zona horaria. */
export const day = (s: string) => new Date(`${s}T12:00:00Z`).toLocaleDateString("es-PY", { timeZone: "UTC" });
