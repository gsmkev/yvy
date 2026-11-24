/** La estancia que lee cada job (una por mensaje de la cola). */
export type Farm = { id: string; organizationId: string; name: string; lat: number; lon: number; tz: string };

export interface JobDeps {
  fetch: typeof fetch;
  now: () => number;
}
