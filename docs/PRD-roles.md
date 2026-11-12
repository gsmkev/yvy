# Roles y permisos (amplía PRD §9)

Fuente de verdad en el código: objeto `can` en `apps/api/src/db/scoped.ts`. Cada cambio de permisos lleva un test en
`apps/api/test` (`permissions`, `supervisor`, `contractor`, `farm-access`).

## Roles

| Rol | Quién es | Alcance |
|---|---|---|
| `owner` | Dueño | Toda la organización |
| `admin` | Administrador | Toda la organización (o solo las estancias que el dueño le marque, K-05) |
| `agronomist` | Agrónomo | Igual que administrador en lo de campo; sin gestión de equipo |
| `supervisor` | Capataz (T-09) | Solo las estancias que el dueño le da (tabla `farm_access`). Sin ninguna no ve nada |
| `worker` | Empleado | Solo los lotes asignados y sus tareas |
| `contractor` | Contratista externo (K-03) | Como el empleado, pero sin campañas ni catálogo de productos, y solo ve los registros que cargó él |

`worker` y `contractor` son los **roles de campo** (`isFieldRole`): se limitan por lotes asignados y por tareas asignadas.

## Matriz

| Acción (`can.*`) | owner | admin | agronomist | supervisor | worker | contractor |
|---|---|---|---|---|---|---|
| `manageOrg` (miembros no de campo, baja de cuenta) | sí | | | | | |
| `manageWorkers` (crear empleados y contratistas, QR) | sí | sí | | | | |
| `manageFarmAccess` (limitar estancias de una persona) | sí | | | | | |
| `editField` (estancias, lotes, líneas) / `editPoi` | sí | sí | sí | sí (sus estancias) | | |
| `assign` (tareas y lotes de otros) | sí | sí | sí | sí (sus estancias) | | |
| `viewAll` / `reports` / `planSanitary` | sí | sí | sí | sí (sus estancias) | | |
| `alertSettings` / `dashboard` | sí | sí | | | | |
| `editSeasons` / `editProducts` | sí | sí | sí | | | |
| `shareLinks` (enlaces de solo lectura, K-04) | sí | | | | | |
| `viewAudit` (registro de cambios, K-06) | sí | | | | | |
| `manageApiTokens` (API pública, I-01) | sí | | | | | |
| `scheduleReports` (informes programados, R-10) | sí | sí | | | | |

## Alcance por estancia (T-09, K-05)

`farm_access(organization_id, user_id, farm_id, level)`. `level` es `edit` o `view` (solo lectura).

- `supervisor`: ve únicamente las filas de `farm_access`; sin filas, nada. No puede crear estancias.
- `admin` y `agronomist`: sin filas ven todas (como siempre); con filas quedan limitados a esas, y en las de `view`
  no pueden escribir (la API responde 403 en altas y 404 en ediciones; el sync rechaza la mutación con `forbidden`).
- `owner` y roles de campo no usan la tabla.

El filtro vive en `ScopedDb.farmScopeSql()` y entra por `workerFilter()` (pull, listados, ediciones con `updateSynced`),
`requireFarm()` (todas las rutas con `:farmId`) y `applyPush()` (escrituras desde el celular). Solo el dueño cambia la lista
(`PUT /org/members/:userId/farms`); al cambiarla sube `assignmentsVersion` y el celular rehace sus tablas.

Fuera de alcance, a propósito: los jobs de `workers-py` y los avisos por email/push siguen siendo por organización; el
supervisor y el contratista reciben avisos solo de sus lotes asignados.
