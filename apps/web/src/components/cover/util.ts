export const CLASSES = ["forest", "pasture", "crop", "other"] as const;
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const day = (s: string) => new Date(`${s}T12:00:00Z`).toLocaleDateString("es-PY", { timeZone: "UTC" });
