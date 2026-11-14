# Pendiente al 14/11/2026

Esta rama (`claude/pendiente`) junta lo terminado que no llegó a `main` y lo que quedó a medias. Todo pasa
`pnpm typecheck` y `pnpm test`; lo marcado WIP no está revisado en pantalla ni terminado.

## 1. Terminado, sin mergear

Los 7 primeros commits de la rama son el PR [#341](https://github.com/gsmkev/yvy/pull/341) (rama
`claude/ux-web-pendientes`), con CI en verde y revisado con capturas. Se puede mergear tal cual:

- Ficha de la estancia: un primario por pestaña, menú "Más" de pestañas, un solo Exportar, ficha del lote con menú.
- Formularios (`FormActions`, ~35 formularios), Nueva tarea con "Más opciones", Nueva compra en tarjetas.
- Editar tarea desde el menú de la fila (el PATCH valida lote de la organización y la estancia; tests).
- Equipo con columna de última conexión; gráfico de lluvia en la unidad elegida; hoja "Más" con la cuenta arriba.
- Cuenta › Avisos mostraba "undefined" en dos tipos (faltaban claves); montos negativos, presupuesto y stock mínimo.

## 2. Web como PWA sin conexión (a medias)

Plan y alcance en `docs/adr/0005-web-pwa-offline.md`.

| Fase | Estado |
|---|---|
| 0 · ADR | Hecho |
| 1 · Instalable, cáscara precacheada, aviso de versión nueva | Hecho (commit) |
| 2 · Lectura sin conexión de todo lo visitado (TanStack Query persistido en IndexedDB, aviso global) | Hecho (commit) |
| 3 · Mapa sin conexión (PMTiles por rango desde la caché, botón "Guardar esta estancia") | WIP: `lib/offline/tiles.ts`, `tilePlan.ts`, `sw/tiny-pmtiles.ts`, `SaveOfflineButton.tsx`; falta integrar y probar en el navegador |
| 4 · Escrituras sin conexión (SyncStore de `packages/sync` sobre IndexedDB, outbox, cola visible) | No empezado |
| 5 · Borrado de todo lo local al cerrar sesión o cambiar de organización (IndexedDB y teselas) | No empezado (hoy borra solo la caché del SW) |
| Prueba E2E offline (Playwright con `context.setOffline`) | No hecha |

## 3. Paridad de la app con la web (a medias)

Inventario y olas en `docs/PARIDAD-APP.md` (141 funciones de la web: 17 en la app, 35 parciales, 89 ausentes).

- **Olas 0 y 1 · WIP** (último commit): pestaña Gestión para roles de oficina, caché de lectura en línea
  (`httpCache.ts`), escrituras en línea (`writeOnline.ts`), selector de organización, pantalla de MFA requerido,
  pantallas en `app/manage/`. Con tests de lógica; no revisado en pantalla. Revisar `apps/mobile/package.json` y
  `pnpm-lock.yaml`: el WIP agregó dependencias.
- **Olas 2, 3 y 4:** sin empezar.
- **Decisión abierta:** el documento recomienda NO llevar 28 funciones de escritorio al teléfono (webhooks, API
  pública, formularios, panel interno, dividir/unir/importar lotes, mapa de rinde, prescripción, informes para banco,
  auditoría y EUDR, exportes, siete secciones de Administración, Laboratorio). Falta que lo decida el dueño.
- Decisiones tomadas para las olas 0 y 1: pestaña Gestión solo para dueño/admin/agrónomo/supervisor; el teléfono
  sigue los permisos de la API; el supervisor entra en lo suyo; el admin podrá activar el segundo factor en la app.

## 4. Para revisar con criterio de diseño

- El mapa nativo de la app (MapLibre) con la barra de herramientas nueva no se vio en un teléfono: solo en la versión
  web de la app. Probar con el APK.
- Pasos de Anotar sin ver renderizados: temporada, catálogo y máquina (la demo no tiene esos datos); los pasos de
  punto y potrero siguen con "Otro" como texto suelto.
- Web: con "Más", las pestañas de la ficha quedan justas cuando la elegida tiene nombre largo; la tabla del plan de
  siembra en Agronomía es densa en el panel de 480 px; en celular el selector de Cuenta queda arriba del título.
- Inicio con varias estancias: el mapa encuadra una sola.
- Landing: `index.html` sigue pidiendo Fraunces e Inter a Google Fonts para toda la SPA (autoalojarlas). Se quitó la
  calculadora de precios y la sección de agrónomos de la landing anterior porque el diseño nuevo no las tiene.

## 5. Lo que tiene que hacer el dueño

- Correr una vez en *Actions → Jobs de datos*: `country_basemap` (fondo de todo Paraguay, ~1 h), `boundaries`
  (límites) y `s2_basemap` para las estancias existentes (color nuevo).
- Correr *Actions → Cargar demo* para cargar los lotes reales de la demo.
- Variable `VITE_WHATSAPP_NUMBER` (hoy el número es de relleno) y, si se quiere, `OPS_EMAIL` para recibir los pedidos
  de prueba de la landing.
- Revisiones humanas: guaraní (`gn-PY.ts`), política de privacidad y textos de consentimiento, umbrales de registros
  raros y de calidad de foto, ISOXML en una máquina real.
- La demo dice "Hohenau" pero queda unos 35 km al oeste del pueblo.

## 6. Backlog que depende de decisiones o cuentas

21 ítems en `docs/BACKLOG.md` quedan en "Falta": 4 nuevas fuentes de datos (curvas de nivel, OpenStreetMap,
Sentinel-1, precios), 15 que necesitan cuenta, contrato o hardware (Play Store, iOS, dominio propio, cobro, Bancard,
SIFEN, SITRAP, WhatsApp, John Deere, balanzas y RFID, estaciones, sensores LoRa, pruebas en Android real) y 2 de
contenido del piloto (casos de éxito y video).
