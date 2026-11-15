// Temporal (auditoría UI): capturas de todas las pantallas con la sesión demo. Uso: node e2e/_shots.mjs <outDir>
import { chromium } from "@playwright/test";
const out = process.argv[2];
const BASE = "http://localhost:5173";
const session = await (await fetch("http://localhost:8787/auth/demo", { method: "POST" })).json();
const farms = await (await fetch("http://localhost:8787/org/farms", { headers: { authorization: `Bearer ${session.accessToken}` } })).json().catch(() => []);
const farmId = (farms.farms ?? farms)[0]?.id;
console.log("farm", farmId, Object.keys(session));
const ADMIN = ["products","warehouses","machines","parties","purchases","grain","cattle","stock","minstock","fuel","orders","maintenance","labor","contractors","feedlot","cash","costs","budget","results","rates","staff","accountant","export"];
const routes = [
  ["home", "/"], ["farm", `/estancias/${farmId}`], ["parte", `/estancias/${farmId}/parte`], ["informes", `/estancias/${farmId}/informes`],
  ["pluviometros", `/estancias/${farmId}/pluviometros`], ["riesgo", `/estancias/${farmId}/riesgo`], ["eudr", `/estancias/${farmId}/eudr`],
  ["cambios-farm", `/estancias/${farmId}/cambios`], ["registros", "/registros"], ["tareas", "/tareas"], ["sanidad", "/sanidad"],
  ["equipo", "/equipo"], ["formularios", "/formularios"], ["calendario", "/calendario"], ["para-revisar", "/para-revisar"],
  ["comparar", "/comparar"], ["api-publica", "/api-publica"], ["cambios", "/cambios"], ["ayuda", "/ayuda"], ["avisos", "/avisos"],
  ["cuenta", "/cuenta"], ["estancia-nueva", "/estancias/nueva"],

];
const browser = await chromium.launch();
for (const [tag, viewport] of [["d", { width: 1440, height: 900 }], ["m", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport, locale: "es-PY", deviceScaleFactor: 1 });
  await ctx.addInitScript((s) => localStorage.setItem("yvy.session", JSON.stringify(s)), session);
  const page = await ctx.newPage(); page.on("pageerror", (e) => console.log("PAGEERR", String(e).slice(0,200)));
  for (const [name, path] of routes) {
    if (tag === "m" && name.startsWith("admin-") && !["admin-products","admin-cash","admin-stock"].includes(name)) continue;
    try {
      await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(["farm","home","registros","estancia-nueva","comparar"].includes(name) ? 5000 : 1500);
      await page.screenshot({ path: `${out}/${tag}-${name}.jpg`, type: "jpeg", quality: 60, fullPage: name !== "farm" });
    } catch (e) { console.log("FAIL", tag, name, String(e).slice(0, 120)); }
  }
  await ctx.close();
}
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.goto(BASE + "/ingresar", { waitUntil: "networkidle" });
await p.screenshot({ path: `${out}/d-login.jpg`, type: "jpeg", quality: 60 });
await browser.close();
