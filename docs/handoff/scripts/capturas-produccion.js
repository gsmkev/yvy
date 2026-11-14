const { chromium } = require('playwright');
const BASE = 'https://yvy-api.gsmkev.workers.dev';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await p.screenshot({ path: '00-landing.png' });
  await p.screenshot({ path: '00-landing-full.png', fullPage: true });
  const btn = p.getByRole('button', { name: /demo/i }).or(p.getByRole('link', { name: /demo/i })).first();
  await btn.click();
  await p.waitForTimeout(5000);
  const routes = ['/', '/registros', '/tareas', '/calendario', '/comparar', '/sanidad', '/avisos', '/equipo', '/administracion', '/laboratorio', '/cuenta', '/para-revisar', '/ayuda'];
  let i = 1;
  for (const r of routes) {
    await p.goto(BASE + r, { waitUntil: 'networkidle' }).catch(() => {});
    await p.waitForTimeout(3000);
    await p.screenshot({ path: `${String(i++).padStart(2, '0')}-${r.replace(/\//g, '_') || 'home'}.png` });
  }
  // abrir la estancia
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(3000);
  const farmLink = await p.locator('a[href*="/estancias/"]').first().getAttribute('href').catch(() => null);
  console.log('farm', farmLink);
  if (farmLink) {
    await p.goto(BASE + farmLink, { waitUntil: 'networkidle' });
    await p.waitForTimeout(5000);
    await p.screenshot({ path: '20-farm.png' });
    for (const sub of ['parte', 'informes', 'pluviometros', 'riesgo']) {
      await p.goto(BASE + farmLink + '/' + sub, { waitUntil: 'networkidle' }).catch(() => {});
      await p.waitForTimeout(3000);
      await p.screenshot({ path: `21-farm-${sub}.png` });
    }
  }
  const m = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const mp = await m.newPage();
  const st = await ctx.storageState();
  await m.addInitScript((ls) => { for (const { name, value } of ls) localStorage.setItem(name, value); }, st.origins.find(o => o.origin === BASE)?.localStorage ?? []);
  for (const r of ['/', '/registros', '/tareas']) {
    await mp.goto(BASE + r, { waitUntil: 'networkidle' }).catch(() => {});
    await mp.waitForTimeout(3000);
    await mp.screenshot({ path: `30-mobile${r.replace(/\//g, '_')}.png` });
  }
  await b.close();
})();
