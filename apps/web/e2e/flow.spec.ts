/**
 * Flujo de la Fase 1 en un navegador real contra `wrangler dev` (ver playwright.config.ts).
 * El código de ingreso se lee del log de wrangler (en desarrollo no se manda email).
 */
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const LOG = process.env.E2E_DEV_LOG ?? "";
const codes = () => [...readFileSync(LOG, "utf8").matchAll(/código es (\d{6})/g)].map((m) => m[1]!);

test("dueño: registro, estancia, importación de 20 lotes y empleado", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const email = `e2e-${Date.now()}@yvy.test`;
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /el campo no tiene señal/i })).toBeVisible();
  await page.getByRole("link", { name: "Crear cuenta" }).first().click();
  await expect(page).toHaveURL(/ingresar/);
  await page.getByLabel("Nombre de la organización").fill("Agro E2E");
  await page.getByLabel("Tu nombre").fill("Dueña E2E");
  await page.getByLabel("Tu email").fill(email);
  const before = codes().length;
  await page.getByRole("button", { name: "Mandame el código" }).click();
  await expect(page.getByText(/Te mandamos un código/)).toBeVisible();
  await expect.poll(() => codes().length).toBeGreaterThan(before); // el código de este ingreso, no uno anterior
  await page.getByLabel("Código de 6 dígitos").fill(codes().at(-1)!);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByRole("heading", { name: "Tus estancias" })).toBeVisible();

  await page.getByRole("button", { name: /Nueva estancia/ }).click();
  await page.getByLabel("Nombre de la estancia").fill("Estancia E2E");
  await page.locator("input[type=file]").setInputFiles("e2e/estancia.kml");
  await expect(page.getByText(/Superficie/)).toBeVisible();
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("heading", { name: "Estancia E2E" })).toBeVisible();

  await page.getByRole("button", { name: "Más acciones" }).click();
  await page.getByRole("menuitem", { name: "Importar" }).click();
  await page.getByTestId("import-input").setInputFiles("e2e/lotes.kml");
  await expect(page.getByText("Encontramos 20 polígonos")).toBeVisible();
  await page.getByRole("button", { name: "Importar 20 lotes" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText(/ha · 20 lotes/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Lote 20/ })).toBeVisible();
  await page.waitForTimeout(1500); // que el mapa termine de dibujar
  await page.screenshot({ path: "e2e/out/estancia.png" });

  await page.getByRole("link", { name: "Equipo" }).click();
  await page.getByRole("button", { name: /Agregar persona/ }).click();
  await page.getByLabel("Tu nombre").fill("Ramón");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Ramón")).toBeVisible();
  await page.getByRole("button", { name: /Vincular celular/ }).click();
  await expect(page.getByRole("dialog")).toContainText("escanea este código");
  await page.screenshot({ path: "e2e/out/qr.png" });
  await page.getByRole("button", { name: "Cerrar" }).click();

  // Asignar 3 lotes a Ramón
  await page.getByRole("button", { name: "Lotes asignados" }).nth(1).click();
  for (const n of ["Lote 1", "Lote 2", "Lote 3"]) await page.getByRole("dialog").getByText(n, { exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  // Tarea diaria
  await page.getByRole("link", { name: "Tareas" }).click();
  await page.getByRole("button", { name: /Nueva tarea/ }).click();
  await page.getByRole("textbox", { name: "Tarea" }).fill("Medir lluvia");
  await page.getByLabel("Estancia").selectOption({ label: "Estancia E2E" });
  await page.getByLabel("Responsable").selectOption({ label: "Ramón" });
  await page.getByLabel("Repetición").selectOption({ label: "Todos los días" });
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Medir lluvia")).toBeVisible();
  await expect(page.getByText(/Todos los días/)).toBeVisible();

  // Estancia: Ramón figura en el lote, clima y parte semanal
  // Mientras la guía de primeros pasos no esté completa, "Mapa" muestra el inicio con la guía (U-24);
  // después abre la única estancia directamente.
  await page.getByRole("link", { name: "Mapa" }).click();
  await expect(page.getByRole("region", { name: "Primeros pasos" })).toBeVisible();
  await page.getByRole("link", { name: /Estancia E2E/ }).first().click();
  await expect(page.getByRole("heading", { name: "Estancia E2E", level: 1 })).toBeVisible();
  await page
    .getByRole("button", { name: /^Lote 1\b/ })
    .first()
    .click();
  await expect(page.getByText("Ramón")).toBeVisible();
  await page.getByRole("tab", { name: "Clima" }).click();
  await expect(page.getByText("Lluvia 30 días").first()).toBeVisible();
  await page.screenshot({ path: "e2e/out/clima.png" });
  await page.getByRole("button", { name: /Parte semanal/ }).click();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: /Descargar PDF/ }).click();
  const file = await dl;
  expect(file.suggestedFilename()).toMatch(/^parte-Estancia E2E-.*\.pdf$/);
  // Fuera del entorno de prueba el fondo de Esri carga; acá su host no está permitido.
  expect(errors.filter((e) => !/arcgisonline|ERR_|Failed to load resource/.test(e))).toEqual([]);
});
