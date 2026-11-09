# ADR 0002 · Decisiones del backend que ajustan el PRD

Fecha: 2026-11-09 · Estado: aceptado

| Tema | PRD | Decisión | Por qué |
|---|---|---|---|
| Cursor del pull | `updated_at` + desempate por `id` | Columna `version` (contador `sync_seq` subido dentro del mismo `db.batch`) + desempate por `id` | Los Workers corren en muchos datacenters con relojes distintos; con `updated_at` un cliente puede saltearse filas escritas en el mismo ms. D1 serializa las transacciones, así que `version` es monotónico. Cuesta 1 fila escrita por lote. |
| Reset por asignaciones | `reset: [...]` en el pull | `memberships.assignments_version` expuesto en `GET /sync/state`; si cambia, el cliente rehace `ASSIGNMENT_SCOPED_TABLES` | El pull es por tabla; el estado se consulta una vez por ciclo. |
| Página de pull | 500 filas | 200 (`LIMITS.sync.pullPageSize`) | Margen para los 10 ms de CPU del plan gratis. |
| Formato de mutación | `{mutation_id, table, op, row}` | `{mutationId, kind: "records.upsert" \| … , row}` | Unión discriminada de Zod; camelCase como el resto del TS. `tasks` solo admite `tasks.status`. |
| Ingreso | Email+contraseña, teléfono+PIN | Código por email y QR de vinculación (anexo Cloudflare §4.2) | CPU. Responde también la pregunta abierta 3 del PRD. |
| Fotos | 5 por registro, JPEG 1600 px | 3, WebP 1280 px (anexo §4.4) | Cuota de R2. |
| Ventana de 24 h del empleado | — | Se cuenta desde `created_at` del servidor | El reloj del celular puede estar mal. |
| Tests de permisos | pgTAP | Vitest en el runtime de Workers (`@cloudflare/vitest-plugin`, sucesor de `vitest-pool-workers`) | No hay Postgres. |
| Tipos de `alerts` | `plot_ids uuid[]`, `probability numeric` | `alert_plots` (consulta) + `plot_ids` JSON (cliente); `probability` low/medium/high | SQLite y MET Norway sin ensemble. |
