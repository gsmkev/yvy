# Material para seguir desde otro entorno

Copia de lo que vivía en el scratchpad de la sesión (temporal). El estado del trabajo está en `docs/PENDIENTE.md`.

| Ruta | Qué es |
|---|---|
| `BRIEF-UI-UX.md` | Brief de diseño usado en el rediseño de la web y la app: reglas obligatorias y hallazgos de producción. Punto de partida para seguir con UI/UX. |
| `landing-notas-port.md` | Notas del port de la landing: qué se tomó del proyecto Lovable y las correcciones de contenido obligatorias (fuentes de datos reales, solo Android, 60 días de prueba). |
| `landing-original/` | Fuente original de la landing (proyecto Lovable del dueño), sin `node_modules`. Solo referencia: lo portado vive en `apps/web/src/routes/public/landing/`. |
| `agentes/p3-common.md`, `p4-common.md`, `p5-common.md` | Reglas comunes que se les dio a los agentes que implementaron el backlog (base, commits, verificaciones, diseño, fuentes de datos). Cambiá el hash base antes de reutilizarlas. |
| `scripts/integrate.py` | Apila commits en el PR de cada ítem (`claude/backlog-<id>`), espera CI y mergea en orden. Uso: `python3 integrate.py <commit>...`. Depende de `backlog_rows.py` y de rutas absolutas del scratchpad: ajustá `S` al copiarlo. |
| `scripts/restack.py` | Lleva un arreglo de la primera rama de un stack de PRs a las siguientes, espera CI y mergea. |
| `scripts/pending_prs.py`, `merge_stack.py`, `stack_update.py`, `backlog_rows.py` | Auxiliares del flujo de PRs por ítem del backlog. |
| `scripts/serve-app-web.mjs` | Servidor estático para el export web de la app que además sirve el worker de MapLibre en `/maplibre/`. |
| `scripts/capturas-produccion.js` | Capturas de todas las pantallas de la web en producción entrando por "Probar la demo". |
| `capturas/01-produccion-antes` | Producción antes del rediseño (12/11). |
| `capturas/02` a `05` | Web después de cada ola del rediseño (base; campo; oficina; pendientes, incluidos formularios y ficha de la estancia). |
| `capturas/06-app` | App (versión web, Pixel 7) después del rediseño. |
| `capturas/07-landing-nueva` | Landing nueva en escritorio y celular, y los flujos de demo y formularios. |
| `capturas/08-demo` | Imagen Sentinel-2 de Itapúa con los lotes de la demo trazados encima. |

Las capturas están en WebP, a 1440 px de ancho como máximo.
