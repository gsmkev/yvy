# ADR 0004 · Modelo de datos de agricultura, ganadería y ERP sencillo

Fecha: 2026-11-10 · Estado: aceptado

Cubre los ítems A-*, G-* y E-* de `docs/BACKLOG.md`. Se escribe antes de implementar para que tres módulos
grandes compartan un mismo modelo y no se cargue nada dos veces.

## Principio

**Lo que pasa en el campo es un registro; lo que se planifica o se paga es de la oficina.**

- Una aplicación, una siembra, una cosecha, un conteo de hacienda o un movimiento entre potreros ocurren en el
  campo, muchas veces sin señal. Son **registros** (`records`) con un tipo nuevo y su esquema Zod en
  `packages/shared/src/records.ts`. Reusan todo lo que ya existe: outbox, sincronización, fotos, GPS,
  permisos de empleado, ventana de edición de 24 h, Historial y Registros.
- Campañas, productos, depósitos, proveedores, facturas y costos se cargan en la oficina. Son **tablas nuevas**,
  solo web, salvo los catálogos que el celular necesita para cargar sin señal (productos, campañas activas).
- El ERP se alimenta de los registros: una aplicación registrada descuenta stock y carga costo al lote sin que
  nadie la cargue de nuevo.

## Tipos de registro nuevos

Se suman a `RECORD_KINDS` sin subir `RECORD_SCHEMA_VERSION` (son tipos nuevos, no cambios incompatibles).
Un celular viejo que reciba un tipo desconocido lo muestra como "Registro" con el resumen en texto.

| Tipo | Datos principales | Ítems |
|---|---|---|
| `sowing` | campaña, cultivo, variedad, densidad (semillas/m o kg/ha), superficie hecha | A-01 |
| `application` | campaña, productos [{productId, dosis, unidad}], volumen L/ha, superficie hecha, viento km/h, temperatura, humedad, Delta T, máquina o contratista, receta (id de tarea) | A-10, A-11, A-12, E-13 |
| `fertilization` | productos [{productId, kg/ha}], método, superficie | A-16 |
| `harvest` | campaña, toneladas, humedad %, superficie, destino (silo, acopio) | A-20 |
| `herd_count` | potrero, cantidades por categoría (vaca, vaquilla, novillo, ternero, toro) | G-01, G-06 |
| `herd_move` | potrero origen, potrero destino, cantidades por categoría, motivo | G-02 |
| `health` | producto, dosis, categorías y cabezas, motivo (aftosa, brucelosis, garrapata, desparasitación, otro) | G-10, G-11, E-13 |
| `mortality` | categoría, cabezas, causa, foto | G-12 |
| `fuel_load` | máquina, litros, horómetro | E-16 |

Los potreros son lotes con `kind = "pasture"`: no hace falta otra tabla.

## Tablas nuevas

**Campañas (agricultura)**

- `seasons` (organización, nombre "Zafra 2026/27", inicio, fin, activa). Sincroniza al celular.
- `plot_seasons` (lote, campaña, cultivo, variedad, fecha de siembra prevista, rinde objetivo). Reemplaza de a
  poco `plots.crop` y `plots.season`, que quedan como "campaña actual" para no romper nada.

**Hacienda.** Sin tabla de stock: la hacienda de un potrero se **calcula** desde el último `herd_count` más los
`herd_move`, `mortality` y ventas posteriores. Así un conteo en la manga corrige cualquier error acumulado.
Animales individuales con caravana (G-21) quedan para después, como tabla `animals` aparte.

**ERP**

- `products` (nombre, tipo: semilla, agroquímico, fertilizante, combustible, veterinario, otro; unidad;
  principio activo, carencia en días, clase toxicológica). Sincroniza al celular.
- `warehouses` (estancia, nombre, tipo: galpón, tanque, silo).
- `stock_moves` (producto, depósito, cantidad con signo, costo unitario, moneda, fecha, origen:
  compra, consumo, ajuste o transferencia, y el id del registro o del documento que lo generó).
  El stock es la suma; el costo de consumo es el promedio ponderado al momento.
- `parties` (proveedores y clientes, con RUC).
- `documents` y `document_lines` (compras y ventas con fecha, moneda, tipo de cambio, vencimiento, estado de pago,
  foto de la factura como adjunto).
- `cost_entries` (monto, moneda, fecha, centro de costo: estancia, lote, campaña y actividad agricultura,
  ganadería o administración; origen). Todo costo termina acá: consumos valorizados, labores de contratistas,
  jornales y gastos sueltos. El margen y el costo por hectárea salen de una consulta sobre esta tabla.
- `exchange_rates` (fecha, USD a PYG). Montos en unidades enteras (guaraníes) o centavos (dólares).

## Permisos

| Acción | Dueño | Admin | Agrónomo | Empleado |
|---|---|---|---|---|
| Registros de campo nuevos | Todos | Todos | Todos | Los de sus lotes |
| Campañas y productos | Editar | Editar | Editar | Ver |
| Stock, compras, ventas, costos | Editar | Editar | No ve montos | No |

Cada permiso nuevo lleva su test en `apps/api/test`, como pide CLAUDE.md.

## Límites del plan gratis

- Un consumo por aplicación genera como mucho 1 `stock_move` por producto y 1 `cost_entry` por lote: con 5
  productos y 10 lotes son 60 filas en un `db.batch()`. Las aplicaciones a muchos lotes se parten en lotes de
  sentencias para no pasar los 100 parámetros.
- El margen por lote y campaña se calcula con una consulta agrupada; si crece, se guarda un resumen diario.
- El archivado a R2 (P-06) entra antes de pasar 1 GB en D1.

## Orden de implementación

1. Campañas y registros agrícolas: `seasons`, `plot_seasons`, `sowing`, `application`, `fertilization`, `harvest`.
2. Hacienda: `herd_count`, `herd_move`, `health`, `mortality`, stock por potrero y carga animal.
3. Inventario y costos: `products`, `warehouses`, `stock_moves`, `cost_entries`, consumo automático,
   costo por hectárea y margen.
4. Compras, ventas y tesorería: `parties`, `documents`, `exchange_rates`.
