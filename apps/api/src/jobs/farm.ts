/**
 * Tipos comunes de los jobs por estancia.
 */
/** La estancia que lee cada job (una por mensaje de la cola). */
export type Farm = { id: string; organizationId: string; name: string; lat: number; lon: number; tz: string };

/** Dependencias inyectables de un job (red y reloj) para probarlo sin tocar el mundo real. */
export interface JobDeps {
  fetch: typeof fetch;
  now: () => number;
}
