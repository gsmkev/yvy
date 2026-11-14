# ADR 0005 · La web como PWA que funciona sin conexión

Fecha: 2026-11-14 · Estado: aceptado

Amplía U-17 (web instalable con uso básico sin conexión). Hoy el service worker guarda la cáscara y dos lecturas
de estancias. La oficina y los encargados que trabajan desde una notebook o una tableta en el campo necesitan más:
seguir viendo lo que ya miraron, anotar lo de campo y que se mande solo cuando vuelva la señal. El PRD §11
resuelve esto en el celular con outbox y pull por cursor; esta ADR dice qué parte de eso se repite en la web y
qué parte no.

## Decisión

La web es una PWA instalable. El **servidor sigue siendo la fuente de verdad** de lo que se lee; lo que se escribe
sin conexión pasa por un **outbox local** que usa el mismo protocolo de `/sync/push` y el mismo motor
(`packages/sync`) que la app.

### Qué funciona sin conexión

| Función | Sin conexión | Cómo |
|---|---|---|
| Abrir la app instalada o recargar la pestaña | Sí | Cáscara completa precacheada, versionada por hash |
| Ver lo ya visitado (estancias, lotes, tareas, registros, clima, vigor) | Sí, con el aviso "Sin conexión · mostrando lo guardado el …" | Caché de TanStack Query en IndexedDB + copia de respaldo de los GET de `/org/*` y `/me` en el service worker |
| Mapa (fondo satelital y último NDVI) de estancias visitadas | Sí | PMTiles por rango en la Cache API; botón "Guardar esta estancia para usar sin conexión" baja los archivos enteros |
| Fondo del país | Solo hasta un zoom bajo (`LIMITS.webOffline.countryMaxZoom`) sobre la zona de las estancias guardadas | Teselas sueltas por rango |
| Anotar registros, marcar puntos de interés, tildar y comentar tareas, crear y editar lotes | Sí | Outbox en IndexedDB; se manda solo al volver la señal |
| Ver la cola de pendientes, reintentar, descartar | Sí | Hoja "Pendientes" |
| ERP con montos, pagos, panel interno, API pública, Cuenta, Clientes | **No**: "Necesita conexión" | Ni se guardan ni se editan |
| Exportes que arma el servidor, Equipo (altas, QR), pedidos de plan | **No** | Fallan con "Necesita conexión" en vez de un error técnico |
| Ingresar por primera vez, cambiar de organización | **No** | Piden servidor |
| Imágenes nuevas de satélite, avisos nuevos, lluvia nueva | **No** (se ve lo último guardado) | — |

Fotos y notas de voz **no** se anotan desde la web sin conexión (la web no las captura hoy); si se agregan, van al
mismo outbox como `attachments.upsert` y las sube un `AttachmentUploader` aparte.

### Cómo se guarda

- **Cáscara y assets**: plugin de Vite propio (`apps/web/scripts/pwa-plugin.ts`). Al terminar el build lista todos
  los archivos de `apps/api/public` (salvo `landing/`, `sw.js` y mapas de fuente), calcula una versión a partir de
  sus hashes y compila `src/sw/index.ts` a `/sw.js` con la lista incrustada. Se descartan `vite-plugin-pwa` y
  Workbox: sin dependencias nuevas, el service worker queda en TypeScript con tests y el despliegue en el Worker
  (`run_worker_first` para las rutas de API) no cambia. Las navegaciones sirven el `index.html` precacheado.
  El service worker nuevo **espera**: la web muestra "Hay una versión nueva · Actualizar" y recién ahí toma el
  control (un cambio de versión no rompe lo que la persona está haciendo).
- **Lecturas**: `persistQueryClient` guarda la caché de TanStack Query en IndexedDB (`yvy-offline`, almacén `kv`),
  con `buster` = versión de la app + organización, vigencia de 30 días (RF-45) y un tope de tamaño. Se excluyen las
  consultas de ERP, administración, API pública, webhooks, seguridad, enlaces y otras organizaciones. El service
  worker, además, responde red primero con copia de respaldo a `GET /org/*` y `GET /me` (sin `auth`, `sync`,
  `ingest`, `admin`, `media` ni URLs firmadas, que vencen). La copia lleva la fecha en que se guardó.
- **Mapa**: los PMTiles viven en R2 (otro origen) y MapLibre los pide por rango. El service worker responde esos
  pedidos desde (a) el archivo entero si la persona guardó la estancia, cortando el rango, o (b) el rango exacto
  que ya se había pedido. Con red, pasa los pedidos y guarda el rango (tope por `LIMITS.webOffline`, se descarta
  lo más viejo). El archivo entero se baja una sola vez, con el tamaño estimado a la vista.
- **Escrituras**: `WebSyncStore` implementa `SyncStore` sobre IndexedDB. Cada escritura local agrega su
  mutación al almacén `outbox` y su "eco" (lo que la pantalla muestra en el mientras tanto) **en la misma
  transacción**. Los IDs son UUIDv7 del cliente. El push y el reintento son idempotentes (`mutationId`), igual que
  en el celular.

### Lo que la web no copia de la app

- **Sin réplica local completa.** La app baja las tablas con el pull porque lee de SQLite. La web lee de endpoints
  agregados (`/org/farms/:id`, `/org/records`, …) que arman uniones y totales que el pull no trae; duplicarlos
  en IndexedDB sería reescribir las pantallas. Entonces `SyncEngine` corre con `pullTables: []` (push y fotos) y
  después de cada ciclo la web **refresca las consultas**. `WebSyncStore` igual implementa `applyPull` y
  `resetTables` completos y probados, para activar tablas puntuales cuando una pantalla lo necesite.
- **Sin SQLite WASM + OPFS.** Pesa más de 800 kB de WASM, necesita aislamiento de origen (COOP/COEP) que rompe
  las fuentes y el mapa en otro origen, y para un outbox de cientos de filas IndexedDB alcanza.

### Límites de almacenamiento

Todos en `LIMITS.webOffline` (`packages/shared/src/limits.ts`): vigencia de la caché de lecturas (30 días), tope
de la caché de lecturas, tope de mapas guardados y de rangos sueltos, zoom máximo del fondo del país y cantidad
máxima de pendientes. Al guardar una estancia se pide almacenamiento persistente (`navigator.storage.persist()`)
y se muestra el espacio usado. Si el navegador devuelve `QuotaExceededError`, la escritura de una caché se
descarta sin romper la pantalla, pero **un pendiente del outbox nunca se descarta en silencio**: la pantalla avisa
que no hay lugar y la anotación queda en el formulario.

### Borrado

Al **cerrar sesión** o **cambiar de organización** se borra todo lo local: caché de lecturas, outbox, ecos,
cursores, copias del service worker (`yvy-data-*`), mapas (`yvy-tiles-*`). El service worker recibe el mensaje
`clear-data`, y la página borra IndexedDB y las cachés por su cuenta (no depende de que el service worker esté
activo). Antes de cerrar sesión o cambiar de organización con pendientes sin mandar, la web intenta mandarlos y,
si no puede, **pide confirmación** (perderlos es irreversible). Además, al arrancar se compara el dueño guardado
(`usuario:organización`) con la sesión: si no coincide, se borra. La cáscara no tiene datos y se conserva.
Las sesiones de soporte (P-12) no guardan nada.

### Seguridad

- Los datos de la organización quedan **en el navegador del dispositivo**: quien use el equipo sin cerrar sesión
  los ve, igual que hoy ve la sesión en `localStorage`. Por eso se borran al salir y se recomienda cerrar sesión
  en equipos compartidos; el aviso de "Guardar para usar sin conexión" lo dice.
- No se guardan: tokens (siguen en `yvy.session`), códigos de ingreso, secretos de API o webhooks, montos del
  ERP, URLs firmadas de fotos, ni nada de `/auth`, `/admin`, `/ingest`, `/public`, `/v1`.
- El service worker solo atiende `GET` y nunca copia respuestas no exitosas ni con `Set-Cookie`.
- Un servidor que devuelve 401 con una copia disponible no la entrega: el respaldo es solo para fallas de red.

## Consecuencias

- Un registro anotado sin conexión se ve en la lista con borde punteado trigo hasta que el servidor lo acepta;
  entonces pasa a sólido soja (RF-33). Los rechazados quedan en la cola con el motivo.
- Los cambios hechos por otra persona no se ven hasta volver la señal; la barra superior lo dice.
- Subir la versión de la app descarta la caché de lecturas (el `buster`); el outbox **no** se descarta nunca
  por un cambio de versión.
- Cambiar el esquema de la mutación o de la caché exige subir `WEB_OFFLINE_SCHEMA` en
  `apps/web/src/lib/offline/db.ts`.

## Pendientes conocidos

- Fotos y notas de voz desde la web sin conexión.
- Pantallas que nunca se visitaron con conexión no tienen datos guardados: muestran "Necesita conexión".
- Pull de tablas de sync en la web (hoy solo push), si se quisiera trabajar sin servidor agregador.
