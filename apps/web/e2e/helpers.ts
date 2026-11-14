/** Ayudas de las pruebas E2E de la web: ingreso por código (se lee del log de `wrangler dev`) y datos por API. */
import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";

const LOG = process.env.E2E_DEV_LOG ?? "";
const codes = () => [...readFileSync(LOG, "utf8").matchAll(/código es (\d{6})/g)].map((m) => m[1]!);

/** Crea una organización nueva y entra. Termina en "Tus estancias". */
export async function signUp(page: Page, org = "Agro Offline") {
  const email = `e2e-off-${Date.now()}-${Math.floor(Math.random() * 1e4)}@yvy.test`;
  await page.goto("/ingresar?modo=registro");
  await page.getByLabel("Nombre de la organización").fill(org);
  await page.getByLabel("Tu nombre").fill("Dueña Offline");
  await page.getByLabel("Tu email").fill(email);
  const before = codes().length;
  await page.getByRole("button", { name: "Mandame el código" }).click();
  await expect(page.getByText(/Te mandamos un código/)).toBeVisible();
  await expect.poll(() => codes().length).toBeGreaterThan(before);
  await page.getByLabel("Código de 6 dígitos").fill(codes().at(-1)!);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByRole("heading", { name: "Tus estancias" })).toBeVisible();
}

export interface SessionInfo {
  token: string;
  userId: string;
  orgId: string;
}

export const session = (page: Page): Promise<SessionInfo> =>
  page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("yvy.session")!);
    return { token: s.accessToken as string, userId: s.user.id as string, orgId: s.organization.id as string };
  });

/** Llamada a la API con la sesión de la página (no pasa por el navegador: sirve también sin conexión). */
export async function apiCall<T>(page: Page, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const s = await session(page);
  const res = await page.request.fetch(path, {
    method,
    headers: { authorization: `Bearer ${s.token}`, "content-type": "application/json" },
    data: body === undefined ? undefined : JSON.stringify(body),
  });
  expect(res.status(), `${method} ${path}`).toBeLessThan(300);
  return (await res.json()) as T;
}

const square = (lon: number, lat: number, d: number) => ({
  type: "Polygon" as const,
  coordinates: [
    [
      [lon, lat],
      [lon + d, lat],
      [lon + d, lat + d],
      [lon, lat + d],
      [lon, lat],
    ],
  ],
});

/** Estancia con 3 lotes y una tarea del día para la persona que ingresó. */
export async function seedFarm(page: Page, name = "Estancia Offline") {
  const farm = await apiCall<{ id: string }>(page, "POST", "/org/farms", {
    name,
    geometry: square(-55.955, -27.205, 0.07),
  });
  await apiCall(page, "POST", `/org/farms/${farm.id}/plots`, {
    plots: [
      { name: "Lote Norte", kind: "crop", geometry: square(-55.95, -27.2, 0.02) },
      { name: "Lote Centro", kind: "crop", geometry: square(-55.92, -27.2, 0.02) },
      { name: "Potrero Sur", kind: "pasture", geometry: square(-55.95, -27.17, 0.02) },
    ],
  });
  const me = await session(page);
  const today = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  await apiCall(page, "POST", "/org/tasks", {
    farmId: farm.id,
    assigneeId: me.userId,
    title: "Revisar el bebedero",
    dueDate: today,
    recurrence: "none",
    priority: "normal",
  });
  return { farmId: farm.id, name };
}
