// Temporal (auditoría UI): /administracion choca con el proxy /admin de vite, así que se navega del lado del cliente.
import { chromium } from "@playwright/test";
const out = process.argv[2];
const ADMIN = ["products","warehouses","machines","parties","purchases","grain","cattle","stock","minstock","fuel","orders","maintenance","labor","contractors","feedlot","cash","costs","budget","results","rates","staff","accountant","export"];
const session = await (await fetch("http://localhost:8787/auth/demo", { method: "POST" })).json();
const b = await chromium.launch();
for (const [tag, viewport, list] of [["d", { width: 1440, height: 900 }, ADMIN], ["m", { width: 390, height: 844 }, ["products","cash","stock","results"]]]) {
  const ctx = await b.newContext({ viewport, locale: "es-PY" });
  await ctx.addInitScript((s) => localStorage.setItem("yvy.session", JSON.stringify(s)), session);
  const p = await ctx.newPage();
  await p.goto("http://localhost:5173/equipo", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(2500);
  for (const s of list) {
    await p.evaluate((s) => { history.pushState({}, "", `/administracion?s=${s}`); dispatchEvent(new PopStateEvent("popstate")); }, s);
    await p.waitForTimeout(1800);
    await p.screenshot({ path: `${out}/${tag}-admin-${s}.jpg`, type: "jpeg", quality: 60 });
  }
  await ctx.close();
}
await b.close();
