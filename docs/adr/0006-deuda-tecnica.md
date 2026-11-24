# ADR 0006 · Deuda técnica: refactor de todos los módulos

24 de noviembre de 2026. Sale de un scan real del monorepo (`jscpd` 4.0.5, `knip` 5.70.0 y conteos propios),
sin tests, landing, i18n, migraciones ni generados.

## Lo que midió el scan

| Medida | Valor |
|---|---|
| Código (TS, TSX, Python) | ~102.000 líneas: web 33,8 k · app 21,9 k · API 19,1 k · shared 12,6 k · geo 0,7 k · sync 0,2 k · workers 3,6 k |
| Duplicación | 1,5 % (1.523 líneas, 80 bloques). Web↔web 759 (paneles ERP, `charts.tsx`), app↔web 621 (lógica copiada en la paridad), API 100 (`jobs/notify.ts`) |
| Sin usar (knip) | 3 archivos, 6 dependencias + 1 de desarrollo, 116 exportaciones, 176 tipos, 32 textos de i18n |
| Funciones o componentes > 150 líneas | 59. Peores: `FarmPage` 965, `applyPush` 922, `FarmMap` 629, `Annotate` 574, `MapScreen` 318, `recordEffects` 273, `PlotDraw` 273, `RecordsPage` 267 |
| Archivos > 800 líneas | `schema.ts` 2.209, `db/queries.ts` 1.334, `db/scoped.ts` 1.197, `routes/farm.tsx` 1.186, `annotate/index.tsx` 1.112, `mobile/db/store.ts` 982, `db/push.ts` 981, `db/system.ts` 940, `shared/erp.ts` 848, `FarmMap.tsx` 833 |
| Complejidad ciclomática > 20 (ESLint) | 84 funciones. Peores: `applyPush` 213, `FarmPage` 153, `describeRecord` 97, `Annotate` 87, `recordEffects` 66, `PlotPanel` 55, `MapScreen` 53, `ReportPage` 49, `OverviewPanel` 46 |
| Dependencias circulares (madge) | 4: web `tableExport ↔ exports`, `ZonesSection ↔ RatePrescription`, `PrescriptionModal ↔ ProductsPanel`; shared `animals → livestock → production`. API y app sin ciclos |
| Código muerto en Python (vulture, 80 %) | Ninguno |
| Escapes de tipos | 0 `any`, 33 `as never`, 1 `@ts-expect-error`, 0 `eslint-disable` |
| Restos | 3 `console.log`, 3 TODO/FIXME |

Conclusión: el código está sano en tipos y duplicación; la deuda es **de tamaño y de responsabilidades**
(funciones y archivos que hacen demasiado) y **lógica repetida entre web y app**.

## Reglas para todo el refactor

1. **Sin cambios de comportamiento.** Cada fase deja los mismos tests en verde (API 718, web 233, app 217,
   shared 141, workers 107) y el e2e. Si un refactor necesita cambiar un test, es que cambió el comportamiento.
2. **Tamaño:** función o componente ≤ 80 líneas como guía; archivo ≤ 400 líneas salvo tablas de datos
   (esquema, i18n). Partir por responsabilidad, no por número de líneas.
3. **Patrones, solo donde sacan código:** tabla de manejadores (estrategia) en lugar de cadenas de `if` por
   tipo; repositorios por dominio detrás de la misma fachada `ScopedDb`; hooks de datos separados de la vista;
   componentes de presentación sin efectos. Nada de abstracciones con una sola implementación.
4. **Un solo lugar para cada regla:** lógica pura que usan web y app vive en `packages/shared` con su test.
5. **Sin dependencias nuevas.** Las reglas de CLAUDE.md siguen valiendo (ScopedDb, bumpVersion, chunkForParams,
   10 ms de CPU, i18n).
6. Un PR por fase; se mergea con CI en verde.

## Fases

| # | Fase | Alcance |
|---|---|---|
| 1 | Limpieza | Romper los 4 ciclos de imports; Borrar lo que knip marca sin usar (verificando cada caso: tests, CSS, plugins de Expo), las 32 claves de i18n, los `console.log`; reemplazar los 33 `as never` por tipos reales |
| 2 | Lógica compartida | Llevar a `packages/shared` lo copiado entre web y app: zonas de amortiguación, cambios de cobertura, clima, órdenes de trabajo, calendario, unidades, dinero, riesgo, fechas y formatos |
| 3 | API | `applyPush` como tabla de manejadores por tabla sincronizable; `db/queries.ts`, `scoped.ts`, `system.ts` en repositorios por dominio; `erp-effects.ts`; `jobs/notify.ts` |
| 4 | Shared | `schema.ts` y `erp.ts` en un archivo por dominio con el mismo índice de exportación (drizzle-kit apuntando a la carpeta) |
| 5 | Web | `farm.tsx` y `FarmMap.tsx` en hooks + subcomponentes por pestaña y capa; páginas largas (registros, nueva estancia, parte, exportes); patrón común para los paneles ERP (lista + filtros + formulario) y `charts.tsx` |
| 6 | App | `annotate/index.tsx` por paso, `map.tsx`, `plot-draw.tsx`, `db/store.ts` por dominio, `_layout.tsx` |
| 7 | Workers | Lo que el scan marque en `workers-py` (poco) |
