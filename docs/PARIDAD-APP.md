# Paridad de funciones entre la web y la app móvil

14 de noviembre de 2026. Rama `paridad-app`, desde `81f9a17`. Auditoría de solo lectura: no cambia código.

**Resultado en una línea.** La web tiene 141 funciones relevantes; la app cubre 17 completas, 35 en parte y 89 no existen. De las 89 ausentes y las 35 parciales, solo una parte conviene llevar al teléfono (ver sección 7).

**Cómo se hizo.** Leí `CLAUDE.md`, `docs/BACKLOG.md`, `docs/PRD-roles.md` y los ADR 0002 a 0004; recorrí `apps/web/src/router.tsx` (34 rutas: 7 públicas y 27 con sesión), `routes/*`, `components/*` y `lib/nav.ts`; en la app recorrí `apps/mobile/app` (cuatro pestañas, 15 pantallas y 9 del laboratorio), `src/lib`, `src/db/store.ts` y `src/lib/sync.ts`; y contrasté permisos con el objeto `can` de `apps/api/src/db/scoped.ts` y con `PULL_TABLES` de `packages/shared/src/sync-protocol.ts`. Una función cuenta como presente solo si encontré la pantalla o el código que la hace; donde no pude confirmarlo lo digo. No ejecuté ninguna de las dos apps.

**Leyenda.**

- Roles: **D** dueño, **A** administrador, **G** agrónomo, **S** supervisor (capataz, solo sus estancias), **C** contratista, **E** empleado. Los roles de campo son C y E; "oficina" es D, A, G y S (`!isFieldRole`).
- Datos: **Sync** ya baja al celular (`PULL_TABLES`) o ya sube (mutaciones del push); **Sync+** conviene sincronizarla (tabla nueva en `PULL_TABLES` y en `TABLES` de `apps/mobile/src/db/store.ts`); **REST** alcanza con la API en línea; **Local** no usa servidor.
- Sin conexión: **Sí** funciona con lo que ya hay en el celular; **Parcial** con la última copia guardada (solo si se construye la caché de lectura, ola 0); **No** necesita servidor.
- Olas: **0** cimientos, **1** a **4** por prioridad de valor, **Hecha** ya está, **No llevar** se propone dejarla en la web. Esfuerzo: S (horas a 2 días), M (3 a 10 días), L (más de 2 semanas), como en el BACKLOG.

## 1. Hallazgos que condicionan el plan

1. **La app es un cliente de campo con sincronización, no un cliente de la API.** Baja 17 tablas (`farms`, `plots`, `points_of_interest`, `plot_assignments`, `tasks`, `records`, `attachments`, `alerts`, `plot_index_stats`, `farm_layers`, `seasons`, `plot_seasons`, `products`, `machines`, `animals`, `comments`, `warehouses`) y sube solo registros, adjuntos, estado, checklist y comentarios de tareas, puntos de interés, lotes y comentarios. No hay ninguna pantalla que lea la API para mostrar datos de oficina.
2. **Las únicas lecturas en línea de la app** son el pronóstico (`GET /org/farms/:id/forecast`), las horas de pulverizar (`/spray-windows`), `/org/form-config`, los nombres de miembros (`/org/members`, solo roles de oficina) y `/me` para la URL de mapas. Guardan el resultado en `kv` a mano, cada una con su código. No hay un patrón reutilizable ni indicación de "datos de hace X".
3. **Los roles de oficina usan la misma app que el empleado.** Cuatro pestañas (Hoy, Mapa, Historial, Más) y un botón Anotar. El único ajuste por rol es el modo solo lectura del dueño (F-29) y algunos botones (`canMarkPoi`, `canCount`). No hay menú de gestión ni equivalente de `buildNav` (`apps/web/src/lib/nav.ts`).
4. **El protocolo de push no cubre las ediciones de oficina.** Las mutaciones válidas son `records`, `attachments`, `tasks.status/check/comment`, `pois.upsert`, `plots.upsert` y `comments`. No existen crear tarea, crear estancia, borrar lote ni nada de campañas o productos. Todo eso, si se lleva, va por REST en línea (`POST /org/tasks`, `POST /org/farms`, etc.) o exige ampliar el protocolo y sus reglas de conflicto.
5. **El ERP no debe bajar al celular.** El ADR 0004 dice que solo los catálogos (productos, campañas activas) sincronizan, y `ScopedDb` corta el ERP al supervisor y a los roles de campo. Montos, costos, caja y compras: solo REST, con el rol verificado en el servidor, y nunca en una tabla de `PULL_TABLES` (un empleado con la app recibiría los montos).
6. **Los PDF de la web se generan en el navegador** con `@react-pdf/renderer` (parte, informes, banco, auditoría, riesgo, EUDR, daño, muestreo, cobertura). Esa biblioteca no corre en React Native. Llevar los informes al teléfono es una decisión de arquitectura (servidor, job de `workers-py` o compartir el enlace de solo lectura), no un puerto.
7. **Discrepancias entre el BACKLOG y el código.** U-14 (medir distancia y superficie) figura como hecho en web y app, pero en la app no encontré una herramienta de medir. U-22 (guaraní) está marcado parcial y coincide con lo que vi. El Laboratorio de la app tiene 9 vistas previas y el de la web 10, con solo dos temas en común (roya y malezas). Conviene corregir U-14 en el BACKLOG o agregar la herramienta (ola 2).
8. **Cuidado con el segundo factor.** La web bloquea al administrador hasta activar TOTP cuando el dueño lo exige (P-08, `mfaSetupRequired`). La app sabe pedir el código al ingresar, pero no encontré cómo activa el TOTP ni qué pasa si la sesión llega con `mfaSetupRequired`. Verificar antes de promover la app a administradores.

## 2. Tabla resumen

141 funciones de la web (más 4 filas de páginas públicas o internas que no aplican a una app y no se cuentan). La columna Web da la ruta o el componente; el detalle de cada fila está en la sección 3 con el mismo número.

| # | Función | Web | App | Rol | Ola |
|---|---|---|---|---|---|
| 1 | Ingreso con email + código y TOTP | `/ingresar` | Sí | DAGSCE | Hecha |
| 2 | Ingreso con Google | `/ingresar?google` | No | DAGS | 4 (S) |
| 3 | Alta de organización (registro, código de referido, prueba) | `/ingresar?modo=registro` | No | D (nuevo) | No llevar |
| 4 | Selector de organización (agrónomo con varios clientes) | Menú de cuenta, `/auth/switch` | No | DAG | 0 (S) |
| 5 | Resumen de clientes del agrónomo | `/clientes` | No | G | 1 (S) |
| 6 | Buscador global (estancias, lotes, registros) | Barra superior, Ctrl+K | Parcial | DAGSCE | 2 (S) |
| 7 | Menú de cuenta y cerrar sesión | Menú de cuenta | Sí | DAGSCE | Hecha |
| 8 | Preferencias: idioma, tema, unidades (ha/cuadras, mm/pulgadas, °C) | `/cuenta#preferencias` | Parcial | DAGSCE | 1 (S) |
| 9 | Preferencias de notificaciones (push, email, horario de silencio) | `/cuenta#notificaciones` | Sí | DAGSCE | Hecha |
| 10 | Calendario iCal (URL para Google Calendar) | `/cuenta#calendario` | No | DAGSCE | 4 (S) |
| 11 | Código de referido del agrónomo | `/cuenta#referido` | No | G | 4 (S) |
| 12 | Segundo factor TOTP: activar, códigos de recuperación, exigirlo a administradores | `/cuenta#segundo-factor`, pantalla bloqueante | No | DAGS (política: D) | 3 (M) |
| 13 | Webhooks de la organización | `/cuenta#webhooks` | No | DA | No llevar |
| 14 | Plan y límites (ver y pedir cambio de plan) | `/cuenta#plan` | No | D | 4 (S) |
| 15 | Baja de la cuenta | `/cuenta#baja` | No | D | 4 (S) |
| 16 | Centro de ayuda (videos, WhatsApp de soporte) | `/ayuda` | No | DAGSCE | 4 (S) |
| 17 | Guía de primeros pasos | Inicio (`FirstRunGuide`) | No | DAG | 4 (S) |
| 18 | Lista de estancias con resumen (área, lotes, registros de 7 días, avisos, último registro) | `/` | Parcial | DAGSCE | 1 (S) |
| 19 | Tablero del dueño (actividad, lluvia del mes, área por cultivo, margen, avisos) | `/` (`OwnerDashboard`) | Parcial | DA | 1 (M) |
| 20 | Nueva estancia (buscar localidad, usar mi ubicación, dibujar, varias partes, importar lotes) | `/estancias/nueva` | No | DAG | 3 (M) |
| 21 | Cambiar de estancia | Selector de la ficha | Sí | DAGSCE | Hecha |
| 22 | Mapa con lotes (color por cultivo, etiquetas) y panel al tocar el lote | Mapa de la estancia | Sí | DAGSCE | Hecha |
| 23 | Puntos de interés: ver, crear, QR pegable, escanear QR | Mapa, menú Agregar punto | Sí | DAGS crean; todos ven | Hecha |
| 24 | Líneas del campo (caminos, cercas, canales): ver y dibujar | Pestaña Lotes (`LinesPanel`) | No | DAGS | 2 (S) |
| 25 | Capas de satélite: color real y vigor (NDVI) con leyenda | Control de capas | Sí | DAGSCE | Hecha |
| 26 | Capa de límites administrativos | Control de capas | No | DAGSCE | 4 (S) |
| 27 | Capas propias (imágenes de dron, mapas de suelo): ver | Control de capas (`CustomLayersControl`) | No | DAGS ven | 4 (M) |
| 28 | Capas propias: subir y borrar (con esquinas georreferenciadas) | Control de capas | No | DAG | No llevar |
| 29 | Escenas por fecha: línea de tiempo y comparar dos fechas con cortina | `SceneControls` | No | DAGS | 4 (M) |
| 30 | Medir distancia y superficie sobre el mapa | `MapTools` | Parcial | DAGSCE | 2 (S) |
| 31 | Mi ubicación, brújula, zoom, pantalla completa | `MapTools`, `FullscreenButton` | Sí | DAGSCE | Hecha |
| 32 | Copiar coordenadas (decimal y grados-minutos); pegar coordenadas o enlace de Google Maps | `CopyCoords`, buscador | Parcial | DAGSCE | 2 (S) |
| 33 | Dibujar lote nuevo (nombre, tipo, cultivo) | Botón Nuevo lote | Sí | DAGS | Hecha |
| 34 | Dibujar el perímetro caminando con el GPS | - | Sí | DAGS | Hecha |
| 35 | Editar la forma del lote (vértices) | Menú del lote, `shapeEdit` | Sí | DAGS | Hecha |
| 36 | Editar atributos del lote (nombre, tipo, cultivo, campaña, siembra, pastura) | Ficha del lote, Editar | Parcial | DAGS | 2 (S) |
| 37 | Dividir un lote con una línea | `SplitModal` | No | DAGS | No llevar |
| 38 | Unir lotes | `MergeModal` | No | DAGS | No llevar |
| 39 | Eliminar lote (con deshacer) | Ficha del lote | No | DAGS | 3 (S) |
| 40 | Importar geodatos (KML, KMZ, GeoJSON, Shapefile) con vista previa y advertencias de solapamiento | `ImportPlots` | No | DAGS | No llevar |
| 41 | Exportar lotes y puntos a KML, GeoJSON y Shapefile | Menú Exportar | No | DAGS | 4 (S) |
| 42 | Grilla de muestreo de suelo (5 o 10 ha) con puntos numerados | `SamplingGrid` (mapa, PDF, CSV) | Parcial | DAGS | 4 (S) |
| 43 | Resumen del lote: cultivo, área, asignados | `PlotPanel` | Sí | DAGSCE | Hecha |
| 44 | Vigor actual contra promedio de la estancia, aviso de baja confianza | `PlotPanel` | Parcial | DAGS | 2 (S) |
| 45 | Curva de NDVI en el tiempo (gráfico) | `PlotPanel` | No | DAGS | 2 (M) |
| 46 | Áreas problema del satélite y envío como tarea a un empleado | `PlotPanel` | Parcial | Ver DAGS; enviar DAGS | 2 (M) |
| 47 | Historial de campañas y rotación del lote (rinde, cosecha, siembra) | `PlotPanel` | No | DAGS | 2 (S) |
| 48 | Últimos registros, tareas abiertas y lluvia del mes del lote | Ficha de la app | Sí | DAGSCE | Hecha |
| 49 | Fenología (etapa estimada del cultivo) | `PhenologySection` | No | DAGS | 2 (S) |
| 50 | Balance hídrico y registrar riego | `WaterBalanceSection` | Parcial | DAGS | 2 (S) |
| 51 | Carencias y reingreso aplicados al lote | `WithdrawalSection` | No | DAGS | 2 (S) |
| 52 | Pronóstico del lote | `PlotForecastSection` | Parcial | DAGSCE | 1 (S) |
| 53 | Zonas de manejo y benchmark contra la zona | `ZonesSection`, `ZoneBenchmark` | No | DAGS | 4 (M) |
| 54 | Mapa de rinde y rinde contra vigor (carga de archivo de cosechadora) | `YieldMapSection`, `YieldVigorSection` | No | DAG | No llevar |
| 55 | Prescripción de dosis variable (Shapefile para el tractor) | `RatePrescription` | No | DAG | No llevar |
| 56 | Informe de daño del lote (PDF con fotos para el seguro) | `DamageReportModal` | No | DAGS | 4 (L) |
| 57 | Historia de vigor por campaña (pedir desde 2017) | `VigorSeasons` | No | DA pide; DAGS ven | 4 (S) |
| 58 | Lotes: tabla con vigor, orden, filtro por días sin visitar, resumen por cultivo | Pestaña Lotes | Parcial | DAGSCE | 2 (S) |
| 59 | Campañas: ver, crear, plan por lote, cerrar | Pestaña Campañas | No | Ver DAGS; editar DAG | 2 ver, 3 editar (S + M) |
| 60 | Productos: catálogo, rangos de dosis, receta agronómica a tareas | Pestaña Productos (`ProductsPanel`) | Parcial | Ver DAGS; editar DAG | 2 ver y receta, 3 editar (M) |
| 61 | Registros de la estancia | Pestaña Registros | Sí | DAGSCE | Hecha |
| 62 | Tareas: crear, asignar, checklist, vencimiento, prioridad | Pestaña Tareas (`TasksPanel`) | Parcial | Crear DAGS; cumplir todos | 1 (M) |
| 63 | Clima: pronóstico 10 días, lluvia 30 días contra normal, lluvia satelital, humedad de suelo, Tmax/Tmin | Pestaña Clima (`ClimatePanel`) | Parcial | DAGSCE | 1 (M) |
| 64 | Clima: horas aptas para pulverizar | `SprayWindows` | Sí | DAGS | Hecha |
| 65 | Clima: índice de sequía SPI | `SpiPanel` | No | DAGS | 4 (S) |
| 66 | Avisos de la estancia con ¿Te sirvió? | Pestaña Avisos (`AlertsList`) | Parcial | DAGSCE | 1 (S) |
| 67 | Ganadería: existencias por potrero y UA, límite de carga | `HerdPanel` > Existencias | Parcial | DAGS | 2 (S) |
| 68 | Ganadería: rotación de potreros (ocupación, descanso, próximo) | `RotationPanel` | No | DAGS | 3 (M) |
| 69 | Ganadería: forraje y pasturas | `ForagePanel` | No | DAGS | 3 (M) |
| 70 | Ganadería: animales con caravana (alta, edición, historial) | `AnimalsPanel` | Parcial | Editar DAGS; ver todos | 2 (S) |
| 71 | Ganadería: reproducción (servicio, tacto, preñez, parición, índices) | `ReproPanel` | Parcial | DAGS | 3 (M) |
| 72 | Ganadería: pesadas y ganancia diaria | `WeighingsPanel` | Parcial | DAGS | 3 (M) |
| 73 | Ganadería: suplementación y sal | `SupplementPanel` | Parcial | DAGS | 3 (S) |
| 74 | Ganadería: abigeato | `TheftPanel` | Parcial | DAGS | 3 (S) |
| 75 | Ganadería: estrés calórico (ITH) | `HeatStress` | No | DAGS | 2 (S) |
| 76 | Agronomía: plan de siembra (semilla y densidad por lote) | `SowingPlan` | No | DAGS | 3 (S) |
| 77 | Agronomía: ventana de siembra (humedad de suelo + pronóstico) | `SowingWindow` | No | DAGS | 2 (S) |
| 78 | Agronomía: carencias y reingresos vigentes | `WithdrawalPanel` | No | DAGS | 2 (S) |
| 79 | Agronomía: zonas de amortiguación (escuelas, cursos de agua) y avisos | `BufferPanel` | No | DAGS | 2 (S) |
| 80 | Agronomía: análisis de suelo (alta y lectura) | `SoilPanel` | No | DAGS | 3 (M) |
| 81 | Agronomía: fertilidad (mapa y recomendación) | `FertilityPanel` | No | DAGS | 4 (M) |
| 82 | Agronomía: entregas de cosecha al acopio (bruto, impurezas, descuentos) | `DeliveriesPanel` | Parcial | DAGS | 3 (M) |
| 83 | Parte semanal (lluvia, registros, avisos, rango de fechas) y compartir por WhatsApp | `/parte` | No | DAGS | 1 (M) |
| 84 | Enlaces de solo lectura (crear 7 o 30 días, copiar, revocar) | `/parte` (`ShareLinks`) | No | D | 1 (S) |
| 85 | Informe de campaña en PDF (por lote o estancia) | `/informes` | No | DAGS | 4 (L) |
| 86 | Informe para el banco en PDF | `/informes` | No | DAGS | No llevar |
| 87 | Informe de auditoría en PDF | `/informes` | No | DAGS | No llevar |
| 88 | Exportar los datos de la estancia | `/informes` | No | DAGS | No llevar |
| 89 | Informes programados por email | `/informes` (`ReportSchedules`) | No | DA | No llevar |
| 90 | Pluviómetros: lista, lluvia por mes y campaña, contra satélite | `/pluviometros` | Parcial | DAGSCE | 2 (S) |
| 91 | Riesgo climático del campo (sequía, incendios, heladas) y PDF | `/riesgo` | No | DAGS | 4 (M) |
| 92 | EUDR: deforestación por lote y PDF de cumplimiento | `/eudr` | No | DAG | No llevar |
| 93 | Cambios de cobertura y áreas quemadas | `/cambios` | No | DAGS | 4 (M) |
| 94 | Registros: filtros por estancia, autor, tipo y fechas; filtros guardados | `/registros` | Parcial | DAGSCE (campo ve lo suyo) | 2 (S) |
| 95 | Registros: exportar CSV o Excel | `/registros` | No | DAGS | No llevar |
| 96 | Detalle de registro: fotos, estaciones MIP, comentarios, editar, borrar con deshacer | `RecordsList` | Sí | DAGSCE | Hecha |
| 97 | Compartir un registro por WhatsApp | Detalle de registro | Sí | DAGSCE | Hecha |
| 98 | Tareas globales (todas las estancias) | `/tareas` | Parcial | DAGSCE | 1 (S) |
| 99 | Calendario de tareas (mes y semana, vencimientos) | `/calendario` | No | DAGSCE | 1 (S) |
| 100 | Para revisar: registros raros (lluvia alta, dosis fuera de rango, rinde) y marcar OK | `/para-revisar` | No | DAGS | 1 (S) |
| 101 | Comparar estancias y campañas | `/comparar` | No | DAG (con 2 o más estancias) | 2 (S) |
| 102 | Sanidad: calendario del rodeo, eventos, crear tareas, estado atrasado | `/sanidad` | No | DAGS | 3 (M) |
| 103 | Formularios: definir campos propios por tipo de registro | `/formularios` | No | DA | No llevar |
| 104 | Equipo: lista de miembros con actividad y última sincronización | `/equipo` | No | DA | 1 (S) |
| 105 | Equipo: alta de empleado o contratista, QR para vincular el celular, PIN | `/equipo` | No | DA | 1 (M) |
| 106 | Equipo: asignar lotes a empleados | `/equipo` | No | DAGS asignan | 1 (S) |
| 107 | Equipo: acceso por estancia (supervisor, nivel ver o editar) | `/equipo` | No | D | 3 (S) |
| 108 | Equipo: invitar o quitar a un miembro de oficina | `/equipo` | No | D | 3 (S) |
| 109 | Avisos: lista global con voto ¿Te sirvió? | `/avisos` | Parcial | DAGSCE | 1 (S) |
| 110 | Avisos: ajustar umbrales por estancia | `/avisos` (`AlertSettings`) | No | DA | 3 (S) |
| 111 | Registro de cambios (auditoría de la organización) | `/cambios` | No | D | No llevar |
| 112 | API pública: crear y revocar tokens | `/api-publica` | No | D | No llevar |
| 113 | Admin: Productos | `/administracion?s=products` | Parcial | DA edita; DAG ve | 3 (M) |
| 114 | Admin: Depósitos | `/administracion?s=warehouses` | Parcial | DA | 3 (S) |
| 115 | Admin: Máquinas | `/administracion?s=machines` | Parcial | DA | 3 (S) |
| 116 | Admin: Terceros (proveedores y clientes) | `/administracion?s=parties` | No | DA | 3 (S) |
| 117 | Admin: Compras (con líneas, factura y recepción) | `/administracion?s=purchases` | No | DA | 3 (M) |
| 118 | Admin: Granos (contratos, entregas, liquidaciones) | `/administracion?s=grain` | No | DA | 4 (M) |
| 119 | Admin: Hacienda (compra y venta de animales) | `/administracion?s=cattle` | No | DA | 3 (M) |
| 120 | Admin: Stock (saldos, movimientos, vencimientos, ajustes) | `/administracion?s=stock` | Parcial | DA editan; G ve cantidades | 3 (S) |
| 121 | Admin: Stock mínimo y faltantes | `/administracion?s=minstock` | No | DAG | 3 (S) |
| 122 | Admin: Combustible (informe por máquina) | `/administracion?s=fuel` | Parcial | DA | 3 (S) |
| 123 | Admin: Órdenes de trabajo | `/administracion?s=orders` | Parcial | DA | 3 (M) |
| 124 | Admin: Mantenimiento de máquinas (planes, vencidos, bitácora) | `/administracion?s=maintenance` | No | DA | 3 (M) |
| 125 | Admin: Costo laboral | `/administracion?s=labor` | No | DA | No llevar |
| 126 | Admin: Contratistas (servicios) | `/administracion?s=contractors` | No | DA | No llevar |
| 127 | Admin: Engorde a corral (raciones, informe) | `/administracion?s=feedlot` | No | DA | No llevar |
| 128 | Admin: Caja y bancos, por pagar y por cobrar | `/administracion?s=cash` | No | DA | 3 (M) |
| 129 | Admin: Costos por lote y campaña | `/administracion?s=costs` | No | DA | 3 (M) |
| 130 | Admin: Presupuesto contra real | `/administracion?s=budget` | No | DA | No llevar |
| 131 | Admin: Resultados y márgenes por lote | `/administracion?s=results` | No | DA | 3 (M) |
| 132 | Admin: Tipos de cambio | `/administracion?s=rates` | No | DA | No llevar |
| 133 | Admin: Personal (asistencia, pagos, planilla) | `/administracion?s=staff` | No | DA (asistencia en 3; planilla: escritorio) | 3 (M) |
| 134 | Admin: Contador (mapa de cuentas) | `/administracion?s=accountant` | No | DA | No llevar |
| 135 | Admin: Exportes contables y formatos | `/administracion?s=export` | No | DA | No llevar |
| 136 | Exportar tablas a CSV o Excel (`ExportableTable`, `TableExportMenu`, unas 20 pantallas) | Menú de cada tabla | No | DAGS | No llevar |
| 137 | Imprimir la estancia o el parte (`printPage`) | Menú Más acciones | No | DAGS | No llevar |
| 138 | Generar PDF en el cliente (`@react-pdf/renderer`: parte, informes, banco, auditoría, riesgo, EUDR, daño, muestreo, cobertura) | `apps/web/src/lib/*Pdf.tsx` | No | DAGS | 4 (L) |
| 139 | Laboratorio: 10 vistas previas de IA (animales, plantas, malezas, preguntar, resumen, roya, granizo, infraestructura, rinde, consejo) | `/laboratorio` | Parcial | DAGSCE | No llevar |
| 140 | Panel interno de la plataforma (pedidos, plan, auditoría, embudo) | `/interno` | No | Solo staff (`ADMIN_EMAILS`) | No llevar |
| 141 | Landing pública | `/` sin sesión | N/A | - | No llevar |
| 142 | Términos y privacidad | `/terminos`, `/privacidad` | No | - | 4 (S) |
| 143 | Estado del servicio y documentación de la API | `/estado`, `/api-docs` | N/A | - | No llevar |
| 144 | Informe público de lead | `/informe/$id/$sig` | N/A | - | No llevar |
| 145 | Informe compartido de solo lectura | `/compartido/$token` | N/A | - | Hecha |

### Totales

| | Funciones |
|---|---|
| Funciones de la web | 141 |
| Presentes en la app | 17 |
| Parciales | 35 |
| Ausentes | 89 |
| Filas que no aplican (landing, estado, informe de lead, API docs) | 4 |

Por ola (sobre las funciones que cuentan):

| Ola | Funciones |
|---|---|
| Hecha | 17 |
| 0 | 1 |
| 1 | 17 |
| 2 | 24 |
| 3 | 31 |
| 4 | 23 |
| No llevar | 28 |

Una fila con dos olas (por ejemplo "2 ver, 3 editar") se cuenta en la primera. La ola 0 no tiene filas de función propias salvo el selector de organización: es infraestructura (sección 5).

## 3. Inventario detallado

Por cada función: qué hay hoy en la app, qué datos necesita, si tiene sentido sin conexión y el esfuerzo estimado de llevarla (con la ola 0 ya hecha).

### 3.1 Acceso, cuenta y navegación

Rutas `/ingresar`, `/cuenta`, `/ayuda`, menú de cuenta y buscador.

| # | Función | App hoy | Datos | Sin conexión | Esfuerzo |
|---|---|---|---|---|---|
| 1 | Ingreso con email + código y TOTP | Sí: email, PIN de teléfono (empleados) y TOTP | REST | No | - |
| 2 | Ingreso con Google | No | REST | No | S |
| 3 | Alta de organización (registro, código de referido, prueba) | No: la app solo ingresa a una cuenta existente | REST | No | - |
| 4 | Selector de organización (agrónomo con varios clientes) | No: hay que cerrar sesión (existe cambio de usuario, no de organización) | REST | No | S |
| 5 | Resumen de clientes del agrónomo | No | REST | No | S |
| 6 | Buscador global (estancias, lotes, registros) | Parcial: buscador de lote al anotar y de animales | Sync | Sí | S |
| 7 | Menú de cuenta y cerrar sesión | Sí | - | Sí | - |
| 8 | Preferencias: idioma, tema, unidades (ha/cuadras, mm/pulgadas, °C) | Parcial: idioma es/gn; sin selector de tema ni de unidades | Local | Sí | S |
| 9 | Preferencias de notificaciones (push, email, horario de silencio) | Sí | REST + local | Parcial | - |
| 10 | Calendario iCal (URL para Google Calendar) | No | REST | No | S |
| 11 | Código de referido del agrónomo | No | REST | No | S |
| 12 | Segundo factor TOTP: activar, códigos de recuperación, exigirlo a administradores | No: la app lo pide al ingresar pero no lo activa | REST | No | M |
| 13 | Webhooks de la organización | No | REST | No | - |
| 14 | Plan y límites (ver y pedir cambio de plan) | No | REST | No | S |
| 15 | Baja de la cuenta | No | REST | No | S |
| 16 | Centro de ayuda (videos, WhatsApp de soporte) | No | Estático | Sí | S |
| 17 | Guía de primeros pasos | No | REST | No | S |

### 3.2 Inicio, mapa y capas de la estancia

Ruta `/` y `/estancias/$farmId` (vista Mapa).

| # | Función | App hoy | Datos | Sin conexión | Esfuerzo |
|---|---|---|---|---|---|
| 18 | Lista de estancias con resumen (área, lotes, registros de 7 días, avisos, último registro) | Parcial: selector de estancia y filtro en Hoy y Mapa; sin tarjetas de resumen | Sync | Sí | S |
| 19 | Tablero del dueño (actividad, lluvia del mes, área por cultivo, margen, avisos) | Parcial: Hoy muestra registros por autor y lotes que empeoraron (modo dueño); sin lluvia, cultivos ni margen | REST (el margen es ERP) | Parcial | M |
| 20 | Nueva estancia (buscar localidad, usar mi ubicación, dibujar, varias partes, importar lotes) | No | REST (`POST /org/farms`) | No | M |
| 21 | Cambiar de estancia | Sí | Sync | Sí | - |
| 22 | Mapa con lotes (color por cultivo, etiquetas) y panel al tocar el lote | Sí | Sync | Sí | - |
| 23 | Puntos de interés: ver, crear, QR pegable, escanear QR | Sí (crear: sin roles de campo) | Sync | Sí | - |
| 24 | Líneas del campo (caminos, cercas, canales): ver y dibujar | No | Sync+ (`farm_lines` no baja al celular) | Sí si se sincroniza | S |
| 25 | Capas de satélite: color real y vigor (NDVI) con leyenda | Sí, y con paquete sin conexión | Sync (`farm_layers`) + PMTiles | Sí | - |
| 26 | Capa de límites administrativos | No | Estático (PMTiles) | Parcial | S |
| 27 | Capas propias (imágenes de dron, mapas de suelo): ver | No | REST (`custom_layers`) | No | M |
| 28 | Capas propias: subir y borrar (con esquinas georreferenciadas) | No | REST | No | - |
| 29 | Escenas por fecha: línea de tiempo y comparar dos fechas con cortina | No | REST (`scenes`) | No | M |
| 30 | Medir distancia y superficie sobre el mapa | Parcial: el área aparece al dibujar o caminar un lote; sin regla libre (BACKLOG U-14 la marca hecha en la app y no la encontré) | Local | Sí | S |
| 31 | Mi ubicación, brújula, zoom, pantalla completa | Sí (la app tiene más: rumbo, seguir, Llevame ahí) | Local | Sí | - |
| 32 | Copiar coordenadas (decimal y grados-minutos); pegar coordenadas o enlace de Google Maps | Parcial: copia coordenadas; no encontré el pegado de enlaces | Local | Sí | S |

### 3.3 Dibujo, edición e importación de lotes

Modos `draw`, `import`, edición de forma, `SplitModal` y `MergeModal` en `routes/farm.tsx`.

| # | Función | App hoy | Datos | Sin conexión | Esfuerzo |
|---|---|---|---|---|---|
| 33 | Dibujar lote nuevo (nombre, tipo, cultivo) | Sí: `plot-draw` | Sync (push `plots.upsert`) | Sí | - |
| 34 | Dibujar el perímetro caminando con el GPS | Sí (solo app, no existe en la web) | Local | Sí | - |
| 35 | Editar la forma del lote (vértices) | Sí: `plot-draw` con `plotId` | Sync | Sí | - |
| 36 | Editar atributos del lote (nombre, tipo, cultivo, campaña, siembra, pastura) | Parcial: se edita junto con la forma; sin pantalla de atributos | Sync | Sí | S |
| 37 | Dividir un lote con una línea | No | REST | No | - |
| 38 | Unir lotes | No | REST | No | - |
| 39 | Eliminar lote (con deshacer) | No: el protocolo de push no tiene `plots.delete` | REST | No | S |
| 40 | Importar geodatos (KML, KMZ, GeoJSON, Shapefile) con vista previa y advertencias de solapamiento | No | REST/local | No | - |
| 41 | Exportar lotes y puntos a KML, GeoJSON y Shapefile | No | Sync | Sí | S |
| 42 | Grilla de muestreo de suelo (5 o 10 ha) con puntos numerados | Parcial: grilla y puntos en el mapa; sin PDF ni CSV | Sync | Sí | S |

### 3.4 Ficha del lote

Panel lateral al elegir un lote (`PlotPanel`, `PlotAgro`) y `app/plot/[id].tsx`.

| # | Función | App hoy | Datos | Sin conexión | Esfuerzo |
|---|---|---|---|---|---|
| 43 | Resumen del lote: cultivo, área, asignados | Sí | Sync | Sí | - |
| 44 | Vigor actual contra promedio de la estancia, aviso de baja confianza | Parcial: vigor y tendencia entre pasadas; sin comparación con la estancia | Sync (`plot_index_stats`) | Sí | S |
| 45 | Curva de NDVI en el tiempo (gráfico) | No | Sync (`plot_index_stats`) | Sí | M |
| 46 | Áreas problema del satélite y envío como tarea a un empleado | Parcial: la app recibe la tarea con punto y navega (Llevame ahí); no ve ni envía áreas | Sync+ (`problem_areas`) | Sí si se sincroniza | M |
| 47 | Historial de campañas y rotación del lote (rinde, cosecha, siembra) | No | Sync (`plot_seasons`, `records`) | Sí | S |
| 48 | Últimos registros, tareas abiertas y lluvia del mes del lote | Sí | Sync | Sí | - |
| 49 | Fenología (etapa estimada del cultivo) | No | REST | Parcial | S |
| 50 | Balance hídrico y registrar riego | Parcial: el riego se carga como registro; sin balance | REST | Parcial | S |
| 51 | Carencias y reingreso aplicados al lote | No | Sync (`records`, `products`) o REST | Sí | S |
| 52 | Pronóstico del lote | Parcial: pronóstico de la estancia en Hoy | REST | Parcial | S |
| 53 | Zonas de manejo y benchmark contra la zona | No | REST (`management_zones`) | Parcial | M |
| 54 | Mapa de rinde y rinde contra vigor (carga de archivo de cosechadora) | No | REST | No | - |
| 55 | Prescripción de dosis variable (Shapefile para el tractor) | No | REST | No | - |
| 56 | Informe de daño del lote (PDF con fotos para el seguro) | No | REST + PDF | Parcial | L |
| 57 | Historia de vigor por campaña (pedir desde 2017) | No | REST | Parcial | S |

### 3.5 Pestañas de la estancia

Pestañas de `routes/farm.tsx`: Lotes, Campañas, Productos, Registros, Tareas, Clima, Avisos, Ganadería y Agronomía (las dos últimas solo para quien edita el campo).

| # | Función | App hoy | Datos | Sin conexión | Esfuerzo |
|---|---|---|---|---|---|
| 58 | Lotes: tabla con vigor, orden, filtro por días sin visitar, resumen por cultivo | Parcial: lotes en el mapa y en el selector; sin tabla ordenable | Sync | Sí | S |
| 59 | Campañas: ver, crear, plan por lote, cerrar | No: la app solo usa la campaña activa al anotar | Sync (`seasons`, `plot_seasons`); editar REST | Ver Sí | S + M |
| 60 | Productos: catálogo, rangos de dosis, receta agronómica a tareas | Parcial: el catálogo baja y alimenta Anotar; sin pantalla ni recetas | Sync (`products`); receta REST (`POST /prescriptions`) | Ver Sí | M |
| 61 | Registros de la estancia | Sí (Historial) | Sync | Sí | - |
| 62 | Tareas: crear, asignar, checklist, vencimiento, prioridad | Parcial: ver las propias, tildar checklist, completar y comentar; no crea ni asigna | Sync (`tasks`); crear REST (`POST /org/tasks`) | Ver Sí; crear No | M |
| 63 | Clima: pronóstico 10 días, lluvia 30 días contra normal, lluvia satelital, humedad de suelo, Tmax/Tmin | Parcial: tira de pronóstico en Hoy | REST | Parcial (último descargado) | M |
| 64 | Clima: horas aptas para pulverizar | Sí (`sprayHours`) | REST con caché | Parcial | - |
| 65 | Clima: índice de sequía SPI | No | REST | No | S |
| 66 | Avisos de la estancia con ¿Te sirvió? | Parcial: avisos activos en Hoy con voto; sin lista completa ni historial | Sync (`alerts`) | Sí | S |
| 67 | Ganadería: existencias por potrero y UA, límite de carga | Parcial: cantidad y UA en el panel del lote; sin vista de estancia | Sync (`records`) | Sí | S |
| 68 | Ganadería: rotación de potreros (ocupación, descanso, próximo) | No | REST (`/farms/:id/rotation`) | Parcial | M |
| 69 | Ganadería: forraje y pasturas | No | REST | Parcial | M |
| 70 | Ganadería: animales con caravana (alta, edición, historial) | Parcial: consulta con historial y GDP; sin alta ni edición | Sync (`animals`); editar REST | Ver Sí | S |
| 71 | Ganadería: reproducción (servicio, tacto, preñez, parición, índices) | Parcial: se carga como registro; sin índices | REST | Parcial | M |
| 72 | Ganadería: pesadas y ganancia diaria | Parcial: carga y GDP por animal; sin vista por lote | REST o Sync | Parcial | M |
| 73 | Ganadería: suplementación y sal | Parcial: se carga; sin resumen | REST | Parcial | S |
| 74 | Ganadería: abigeato | Parcial: se carga; sin resumen ni denuncias | REST | Parcial | S |
| 75 | Ganadería: estrés calórico (ITH) | No | REST | Parcial | S |
| 76 | Agronomía: plan de siembra (semilla y densidad por lote) | No | REST | Parcial | S |
| 77 | Agronomía: ventana de siembra (humedad de suelo + pronóstico) | No | REST | Parcial | S |
| 78 | Agronomía: carencias y reingresos vigentes | No | Sync o REST | Sí | S |
| 79 | Agronomía: zonas de amortiguación (escuelas, cursos de agua) y avisos | No | Sync (POI + lotes) o REST | Sí | S |
| 80 | Agronomía: análisis de suelo (alta y lectura) | No | REST (`soil_samples`) | No | M |
| 81 | Agronomía: fertilidad (mapa y recomendación) | No | REST (job en workers-py) | No | M |
| 82 | Agronomía: entregas de cosecha al acopio (bruto, impurezas, descuentos) | Parcial: la cosecha se carga como registro; sin entregas | REST (`grain_deliveries`) | No | M |

### 3.6 Subpáginas de la estancia

Rutas `/estancias/$farmId/parte`, `/informes`, `/pluviometros`, `/riesgo`, `/eudr`, `/cambios`.

| # | Función | App hoy | Datos | Sin conexión | Esfuerzo |
|---|---|---|---|---|---|
| 83 | Parte semanal (lluvia, registros, avisos, rango de fechas) y compartir por WhatsApp | No | REST | Parcial | M |
| 84 | Enlaces de solo lectura (crear 7 o 30 días, copiar, revocar) | No | REST | No | S |
| 85 | Informe de campaña en PDF (por lote o estancia) | No | REST + PDF en cliente | No | L |
| 86 | Informe para el banco en PDF | No | REST + PDF en cliente | No | - |
| 87 | Informe de auditoría en PDF | No | REST + PDF en cliente | No | - |
| 88 | Exportar los datos de la estancia | No | REST | No | - |
| 89 | Informes programados por email | No | REST | No | - |
| 90 | Pluviómetros: lista, lluvia por mes y campaña, contra satélite | Parcial: carga de lluvia y acumulado del mes por lote; sin pantalla de pluviómetros | Sync (`records`, `points_of_interest`) | Sí | S |
| 91 | Riesgo climático del campo (sequía, incendios, heladas) y PDF | No | REST | Parcial | M |
| 92 | EUDR: deforestación por lote y PDF de cumplimiento | No | REST + PDF | No | - |
| 93 | Cambios de cobertura y áreas quemadas | No | REST | Parcial | M |

### 3.7 Páginas transversales

Rutas `/registros`, `/tareas`, `/formularios`, `/calendario`, `/para-revisar`, `/comparar`, `/sanidad`, `/equipo`, `/avisos`, `/cambios`, `/api-publica`.

| # | Función | App hoy | Datos | Sin conexión | Esfuerzo |
|---|---|---|---|---|---|
| 94 | Registros: filtros por estancia, autor, tipo y fechas; filtros guardados | Parcial: Historial local con filtro por tipo (últimos 200) | Sync | Sí | S |
| 95 | Registros: exportar CSV o Excel | No | Sync | Sí | - |
| 96 | Detalle de registro: fotos, estaciones MIP, comentarios, editar, borrar con deshacer | Sí | Sync | Sí | - |
| 97 | Compartir un registro por WhatsApp | Sí | Local | Sí | - |
| 98 | Tareas globales (todas las estancias) | Parcial: igual que la pestaña, solo las propias | Sync | Sí | S |
| 99 | Calendario de tareas (mes y semana, vencimientos) | No: Hoy lista el día y hay recordatorios locales | Sync (`tasks`) | Sí | S |
| 100 | Para revisar: registros raros (lluvia alta, dosis fuera de rango, rinde) y marcar OK | No | REST | Parcial | S |
| 101 | Comparar estancias y campañas | No | REST | Parcial | S |
| 102 | Sanidad: calendario del rodeo, eventos, crear tareas, estado atrasado | No: se carga el registro sanitario, no el calendario | Sync+ (`sanitary_events`) o REST | Sí si se sincroniza | M |
| 103 | Formularios: definir campos propios por tipo de registro | No: la app sí los usa al anotar (`formConfig`) | REST | No | - |
| 104 | Equipo: lista de miembros con actividad y última sincronización | No | REST (`/org/members`) | No | S |
| 105 | Equipo: alta de empleado o contratista, QR para vincular el celular, PIN | No | REST | No | M |
| 106 | Equipo: asignar lotes a empleados | No | REST (`PUT /members/:id/plots`) | No | S |
| 107 | Equipo: acceso por estancia (supervisor, nivel ver o editar) | No | REST | No | S |
| 108 | Equipo: invitar o quitar a un miembro de oficina | No | REST | No | S |
| 109 | Avisos: lista global con voto ¿Te sirvió? | Parcial: Hoy muestra los activos con voto | Sync (`alerts`) | Sí | S |
| 110 | Avisos: ajustar umbrales por estancia | No | REST | No | S |
| 111 | Registro de cambios (auditoría de la organización) | No | REST | No | - |
| 112 | API pública: crear y revocar tokens | No | REST | No | - |

### 3.8 Administración (23 secciones, solo dueño y administrador)

Ruta `/administracion` con `SECTIONS` en `routes/admin-erp.tsx` y los 7 grupos de `lib/adminNav.ts` (catálogo, comercio, stock, operaciones, finanzas, personas, contador). El supervisor y los roles de campo no entran; el agrónomo solo ve cantidades de stock (`can.viewStock`).

| # | Función | App hoy | Datos | Sin conexión | Esfuerzo |
|---|---|---|---|---|---|
| 113 | Admin: Productos | Parcial: el catálogo baja y alimenta Anotar | Sync | Sí | M |
| 114 | Admin: Depósitos | Parcial: baja y sirve al conteo de stock | Sync | Sí | S |
| 115 | Admin: Máquinas | Parcial: baja y sirve a aplicaciones y combustible; sin alta | Sync | Sí | S |
| 116 | Admin: Terceros (proveedores y clientes) | No | REST | No | S |
| 117 | Admin: Compras (con líneas, factura y recepción) | No | REST | No | M |
| 118 | Admin: Granos (contratos, entregas, liquidaciones) | No | REST | No | M |
| 119 | Admin: Hacienda (compra y venta de animales) | No | REST | No | M |
| 120 | Admin: Stock (saldos, movimientos, vencimientos, ajustes) | Parcial: conteo y ajuste de inventario (`stock-count`); sin saldos ni movimientos | REST | Parcial | S |
| 121 | Admin: Stock mínimo y faltantes | No | REST | Parcial | S |
| 122 | Admin: Combustible (informe por máquina) | Parcial: carga de combustible como registro; sin informe | REST | Parcial | S |
| 123 | Admin: Órdenes de trabajo | Parcial: recibe la orden como tarea con productos precargados; sin lista ni alta | REST | Parcial | M |
| 124 | Admin: Mantenimiento de máquinas (planes, vencidos, bitácora) | No | REST | Parcial | M |
| 125 | Admin: Costo laboral | No | REST | No | - |
| 126 | Admin: Contratistas (servicios) | No | REST | No | - |
| 127 | Admin: Engorde a corral (raciones, informe) | No | REST | No | - |
| 128 | Admin: Caja y bancos, por pagar y por cobrar | No | REST | Parcial | M |
| 129 | Admin: Costos por lote y campaña | No | REST | Parcial | M |
| 130 | Admin: Presupuesto contra real | No | REST | No | - |
| 131 | Admin: Resultados y márgenes por lote | No | REST | Parcial | M |
| 132 | Admin: Tipos de cambio | No | REST | No | - |
| 133 | Admin: Personal (asistencia, pagos, planilla) | No | REST | No | M |
| 134 | Admin: Contador (mapa de cuentas) | No | REST | No | - |
| 135 | Admin: Exportes contables y formatos | No | REST | No | - |

### 3.9 Exportes, impresión y PDF transversales

Funciones repartidas por varias pantallas.

| # | Función | App hoy | Datos | Sin conexión | Esfuerzo |
|---|---|---|---|---|---|
| 136 | Exportar tablas a CSV o Excel (`ExportableTable`, `TableExportMenu`, unas 20 pantallas) | No | Según pantalla | No | - |
| 137 | Imprimir la estancia o el parte (`printPage`) | No | - | No | - |
| 138 | Generar PDF en el cliente (`@react-pdf/renderer`: parte, informes, banco, auditoría, riesgo, EUDR, daño, muestreo, cobertura) | No: `@react-pdf` no corre en React Native | REST | No | L |

### 3.10 Laboratorio, páginas públicas e internas

Rutas `/laboratorio`, `/laboratorio/$tool`, `/interno` y públicas.

| # | Función | App hoy | Datos | Sin conexión | Esfuerzo |
|---|---|---|---|---|---|
| 139 | Laboratorio: 10 vistas previas de IA (animales, plantas, malezas, preguntar, resumen, roya, granizo, infraestructura, rinde, consejo) | Parcial: 9 vistas previas distintas (roya, chinches, pasto, vaca, voz, malezas, caravana, fenología, guaraní); solo coinciden dos temas | Estático (sin modelo real) | Sí | - |
| 140 | Panel interno de la plataforma (pedidos, plan, auditoría, embudo) | No | REST | No | - |
| 141 | Landing pública | No aplica | - | - | - |
| 142 | Términos y privacidad | No: enlace al navegador | Estático | - | S |
| 143 | Estado del servicio y documentación de la API | No aplica | - | - | - |
| 144 | Informe público de lead | No aplica (es captación) | - | - | - |
| 145 | Informe compartido de solo lectura | No aplica: se abre en el navegador desde el enlace | REST | No | - |

### 3.12 Lo que solo existe en la app

No cuenta en los totales: es lo que hace de la app un cliente de campo y no hay que perderlo al sumar pantallas de oficina.

| Función | Dónde |
|---|---|
| Anotar en pasos guiados (unos 25 tipos de registro, varios lotes a la vez, campos propios) | `app/annotate` |
| Lluvia en un toque (botón en Hoy y atajo de Android) | `app/(tabs)/index` |
| Fotos con marcas, varias por registro, y nota de voz con transcripción | `PhotoMarkup`, `VoiceRecorder` |
| Monitoreo de plagas por estaciones y contador de hacienda | `Counter`, `stations` |
| Llevame ahí (rumbo y distancia) y recorrida GPS con track | `app/goto`, `app/walk` |
| SMS de emergencia con coordenadas | `app/emergency` |
| Escanear QR de punto de interés para anotar ahí | `app/scan`, `app/scan-poi` |
| Paquete de mapas sin conexión por estancia, cola de envío y almacenamiento | `(tabs)/more`, `offline.ts` |
| Cambiar de usuario en celular compartido, recordatorios locales, modo solo lectura del dueño | `switchUser.ts`, `reminders.ts`, `readOnly.ts` |

## 4. Qué datos faltan en el celular

Hoy el celular tiene lo necesario para campo. Para la paridad de lectura de oficina hay dos caminos, y conviene elegir por función:

- **REST con caché de lectura (por defecto).** Sin tocar el protocolo ni el esquema. Sirve para todo lo que se mira de vez en cuando: parte, clima, equipo, avisos globales, ERP, comparar, riesgo.
- **Sincronizar (`Sync+`).** Solo tablas chicas, que el celular usa sin señal y que no tienen montos:

| Tabla | Para qué | Notas |
|---|---|---|
| `farm_lines` | Caminos, cercas y canales en el mapa (fila 24) | Chica; hay que agregarla a `PULL_TABLES`, a `TABLES` de `store.ts` y a `scripts/gen-schema.mjs` |
| `sanitary_events` | Calendario sanitario sin señal (fila 102) | Tiene estado vencido calculado: conviene que lo calcule el cliente |
| `problem_areas` | Ver áreas problema del satélite (ficha del lote) | Geometrías: acotar a la pasada más reciente por lote |
| `soil_samples`, `grain_deliveries`, `management_zones` | Solo si se quiere ver sin señal | No recomendado en la primera vuelta; REST con caché alcanza |

Reglas al agregar una tabla: `bumpVersion()` y `version` en las filas, filtro por organización y por lotes asignados en `ScopedDb` (el empleado no debe recibirla si no le corresponde), tests de permisos en `apps/api/test`, y `node apps/mobile/scripts/gen-schema.mjs` tras `db:generate`. No sincronizar nada del ERP con montos.

Lo que ya está en el celular y alcanza para varias filas de lectura sin tocar nada: `records` (hacienda, pluviómetros, existencias, carencias), `plot_index_stats` (curva de NDVI), `plot_seasons` y `seasons` (rotación, campañas), `tasks` (calendario), `alerts` (lista completa), `animals`.

## 5. Capa de pantallas en línea (ola 0)

Es la dependencia de casi todo lo demás. Propuesta mínima, para decidir:

1. **Hook de lectura con caché.** `useOnline(path, { ttl })` sobre el `api()` existente de `src/lib/session.ts` (ya renueva el token). Guarda la respuesta en una tabla local `http_cache` (clave, usuario, organización, cuerpo, fecha) agregada a `LOCAL_SCHEMA` de `src/db/sql.ts`, muestra primero lo guardado y refresca si hay señal (stale-while-revalidate). Se borra al cerrar sesión, al cambiar de usuario y al cambiar de organización (hoy `wipeSynced` y `switchUser` ya limpian el resto). Topes de tamaño por entrada y total, para celulares de 32 GB (F-19).
2. **Aviso uniforme de estado.** Banner "Datos de hace 2 h" o "Sin señal: mostrando lo último que bajó" y estado vacío "Esto necesita señal" cuando no hay copia. Los textos van por i18n (es-PY con voseo; la app ya tiene claves `app.*` y comparte `ui.*`).
3. **Escrituras en línea, sin outbox.** `useOnlineMutation` que se deshabilita sin señal, dice por qué, invalida la caché de la pantalla y muestra el error del servidor (403 por rol, 404 por alcance de estancia). No usar el outbox: la regla de CLAUDE.md (toda escritura local va con su mutación en el outbox) vale para lo sincronizable; estas tablas no lo son y sus reglas de conflicto no están definidas.
4. **Navegación para oficina.** Una pestaña **Gestión** solo para `!isFieldRole` (o un grupo arriba de Más, si no se quiere una quinta pestaña), con los mismos grupos que `buildNav` de la web (Estancia, Hacienda, Gestión, Avisos). Para no duplicar la lógica de roles: mover `buildNav` y las reglas de `can` que se usan en pantalla a `packages/shared`, o hacer que `/me` devuelva los permisos ya evaluados (verificar si hoy los devuelve; en `routes/web.ts` solo vi la ruta). Así un cambio de permisos no queda dividido entre web, app y API.
5. **Selector de organización** (agrónomo con varios clientes): `POST /auth/switch` ya existe. En la app cambiar de organización significa cambiar de base local (las tablas están por organización), igual que `switchUser`; reutilizar ese flujo y avisar si hay envíos pendientes.
6. **Piezas de UI reutilizables.** Lista con filtros, ficha clave-valor, tabla compacta (en el teléfono, tarjetas), gráfico de línea y barras con `react-native-svg` (ya es dependencia; los componentes de `apps/web/src/components/charts.tsx` hay que reescribirlos para RN, tomando los tokens `CHART` de `packages/shared`), hoja de acciones y formulario con validación Zod de `packages/shared/src/records.ts`.
7. **Tipos y consultas compartidos.** Los tipos de respuesta están en `apps/web/src/lib/types.ts` y las consultas en `lib/queries.ts`. Moverlos a `packages/shared` evita escribirlos dos veces; es un trabajo de bajo riesgo y conviene hacerlo antes de la ola 1.

Esfuerzo de la ola 0: **M**. Riesgo principal: que la caché guarde datos sensibles de oficina (montos) en un celular de campo compartido. Mitigación: no cachear rutas `/org/erp/*` (o cachear cifrado y solo para D y A) y borrar al cambiar de usuario.

## 6. Olas propuestas

Prioridad por valor para dueño y agrónomo en el teléfono: ver el estado del campo y decidir sin volver a la oficina, y actuar sobre el equipo y las tareas. Los esfuerzos suponen la ola 0.

| Ola | Qué entrega | Esfuerzo | Depende de | Roles que ganan |
|---|---|---|---|---|
| 0 | Capa en línea con caché, aviso de estado, escrituras en línea, pestaña Gestión por rol, selector de organización, tipos compartidos | M | Nada | D, A, G, S |
| 1 | Oficina en el bolsillo: avisos completos, Para revisar, tareas (crear y asignar), calendario, equipo (lista, alta con QR, asignar lotes), parte semanal con compartir por WhatsApp, enlaces de solo lectura, clima de la estancia, inicio y tablero del dueño, clientes del agrónomo, preferencias | L | Ola 0 | D, A, G (S en lo suyo) |
| 2 | Campaña y hacienda en lectura: ficha del lote completa (curva de NDVI, rotación, fenología, balance, carencias), campañas y productos (ver) con receta agronómica, registros con filtros, pluviómetros, comparar, existencias y animales, agronomía informativa, líneas, medir, buscador | L | Ola 0; `farm_lines` y `problem_areas` en el sync; un gráfico RN | G, D, A, S |
| 3 | Administración y edición: lectura de stock, caja, costos y resultados, captura rápida en campo (compra con foto de factura, gasto, asistencia, mantenimiento, hacienda), edición de campañas y productos, nueva estancia, borrar lote, sanidad, resto de ganadería, umbrales de avisos, TOTP, acceso por estancia | L | Ola 1; decidir qué ve el agrónomo del ERP | D, A |
| 4 | Informes y extras: riesgo, cambios y quemadas, escenas, capas propias (ver), PDF (según decisión de motor), exportar KML, ayuda, Google, iCal, plan | M a L | Ola 1; decisión sobre PDF | D, G |

### Ola 0: cimientos (M)

Ver sección 5. Sin esto, cada pantalla de oficina reinventa la caché y los avisos de conexión.

### Ola 1: oficina en el bolsillo (L)

Se parte en entregas de 3 a 5 días que se pueden publicar solas, en este orden:

- 5. Resumen de clientes del agrónomo (S; G; REST)
- 8. Preferencias: idioma, tema, unidades (ha/cuadras, mm/pulgadas, °C) (S; DAGSCE; Local)
- 18. Lista de estancias con resumen (área, lotes, registros de 7 días, avisos, último registro) (S; DAGSCE; Sync)
- 19. Tablero del dueño (actividad, lluvia del mes, área por cultivo, margen, avisos) (M; DA; REST (el margen es ERP))
- 52. Pronóstico del lote (S; DAGSCE; REST)
- 62. Tareas: crear, asignar, checklist, vencimiento, prioridad (M; Crear DAGS; cumplir todos; Sync (`tasks`); crear REST (`POST /org/tasks`))
- 63. Clima: pronóstico 10 días, lluvia 30 días contra normal, lluvia satelital, humedad de suelo, Tmax/Tmin (M; DAGSCE; REST)
- 66. Avisos de la estancia con ¿Te sirvió? (S; DAGSCE; Sync (`alerts`))
- 83. Parte semanal (lluvia, registros, avisos, rango de fechas) y compartir por WhatsApp (M; DAGS; REST)
- 84. Enlaces de solo lectura (crear 7 o 30 días, copiar, revocar) (S; D; REST)
- 98. Tareas globales (todas las estancias) (S; DAGSCE; Sync)
- 99. Calendario de tareas (mes y semana, vencimientos) (S; DAGSCE; Sync (`tasks`))
- 100. Para revisar: registros raros (lluvia alta, dosis fuera de rango, rinde) y marcar OK (S; DAGS; REST)
- 104. Equipo: lista de miembros con actividad y última sincronización (S; DA; REST (`/org/members`))
- 105. Equipo: alta de empleado o contratista, QR para vincular el celular, PIN (M; DA; REST)
- 106. Equipo: asignar lotes a empleados (S; DAGS asignan; REST (`PUT /members/:id/plots`))
- 109. Avisos: lista global con voto ¿Te sirvió? (S; DAGSCE; Sync (`alerts`))

Orden sugerido: avisos y Para revisar (S, solo lectura y un botón), tareas (crear, asignar, calendario), equipo, parte semanal y enlaces, clima y tablero. Criterio de orden (no es un dato medido): ver el parte y los avisos y mandar una tarea a un empleado es lo que más resuelve a quien decide desde el campo, y queda en las primeras tres entregas.

### Ola 2: campaña y hacienda en lectura (L)

- 6. Buscador global (estancias, lotes, registros) (S; Sync)
- 24. Líneas del campo (caminos, cercas, canales): ver y dibujar (S; Sync+ (`farm_lines` no baja al celular))
- 30. Medir distancia y superficie sobre el mapa (S; Local)
- 32. Copiar coordenadas (decimal y grados-minutos); pegar coordenadas o enlace de Google Maps (S; Local)
- 36. Editar atributos del lote (nombre, tipo, cultivo, campaña, siembra, pastura) (S; Sync)
- 44. Vigor actual contra promedio de la estancia, aviso de baja confianza (S; Sync (`plot_index_stats`))
- 45. Curva de NDVI en el tiempo (gráfico) (M; Sync (`plot_index_stats`))
- 46. Áreas problema del satélite y envío como tarea a un empleado (M; Sync+ (`problem_areas`))
- 47. Historial de campañas y rotación del lote (rinde, cosecha, siembra) (S; Sync (`plot_seasons`, `records`))
- 49. Fenología (etapa estimada del cultivo) (S; REST)
- 50. Balance hídrico y registrar riego (S; REST)
- 51. Carencias y reingreso aplicados al lote (S; Sync (`records`, `products`) o REST)
- 58. Lotes: tabla con vigor, orden, filtro por días sin visitar, resumen por cultivo (S; Sync)
- 59. Campañas: ver, crear, plan por lote, cerrar (S + M; Sync (`seasons`, `plot_seasons`); editar REST)
- 60. Productos: catálogo, rangos de dosis, receta agronómica a tareas (M; Sync (`products`); receta REST (`POST /prescriptions`))
- 67. Ganadería: existencias por potrero y UA, límite de carga (S; Sync (`records`))
- 70. Ganadería: animales con caravana (alta, edición, historial) (S; Sync (`animals`); editar REST)
- 75. Ganadería: estrés calórico (ITH) (S; REST)
- 77. Agronomía: ventana de siembra (humedad de suelo + pronóstico) (S; REST)
- 78. Agronomía: carencias y reingresos vigentes (S; Sync o REST)
- 79. Agronomía: zonas de amortiguación (escuelas, cursos de agua) y avisos (S; Sync (POI + lotes) o REST)
- 90. Pluviómetros: lista, lluvia por mes y campaña, contra satélite (S; Sync (`records`, `points_of_interest`))
- 94. Registros: filtros por estancia, autor, tipo y fechas; filtros guardados (S; Sync)
- 101. Comparar estancias y campañas (S; REST)

Dependencias: agregar `farm_lines` y `problem_areas` a `PULL_TABLES`; un componente de gráfico de línea (curva de NDVI, lluvia por mes) que luego reusan las olas 3 y 4.

### Ola 3: administración y edición (L)

- 12. Segundo factor TOTP: activar, códigos de recuperación, exigirlo a administradores (M; DAGS (política: D))
- 20. Nueva estancia (buscar localidad, usar mi ubicación, dibujar, varias partes, importar lotes) (M; DAG)
- 39. Eliminar lote (con deshacer) (S; DAGS)
- 68. Ganadería: rotación de potreros (ocupación, descanso, próximo) (M; DAGS)
- 69. Ganadería: forraje y pasturas (M; DAGS)
- 71. Ganadería: reproducción (servicio, tacto, preñez, parición, índices) (M; DAGS)
- 72. Ganadería: pesadas y ganancia diaria (M; DAGS)
- 73. Ganadería: suplementación y sal (S; DAGS)
- 74. Ganadería: abigeato (S; DAGS)
- 76. Agronomía: plan de siembra (semilla y densidad por lote) (S; DAGS)
- 80. Agronomía: análisis de suelo (alta y lectura) (M; DAGS)
- 82. Agronomía: entregas de cosecha al acopio (bruto, impurezas, descuentos) (M; DAGS)
- 102. Sanidad: calendario del rodeo, eventos, crear tareas, estado atrasado (M; DAGS)
- 107. Equipo: acceso por estancia (supervisor, nivel ver o editar) (S; D)
- 108. Equipo: invitar o quitar a un miembro de oficina (S; D)
- 110. Avisos: ajustar umbrales por estancia (S; DA)
- 113. Admin: Productos (M; DA edita; DAG ve)
- 114. Admin: Depósitos (S; DA)
- 115. Admin: Máquinas (S; DA)
- 116. Admin: Terceros (proveedores y clientes) (S; DA)
- 117. Admin: Compras (con líneas, factura y recepción) (M; DA)
- 119. Admin: Hacienda (compra y venta de animales) (M; DA)
- 120. Admin: Stock (saldos, movimientos, vencimientos, ajustes) (S; DA editan; G ve cantidades)
- 121. Admin: Stock mínimo y faltantes (S; DAG)
- 122. Admin: Combustible (informe por máquina) (S; DA)
- 123. Admin: Órdenes de trabajo (M; DA)
- 124. Admin: Mantenimiento de máquinas (planes, vencidos, bitácora) (M; DA)
- 128. Admin: Caja y bancos, por pagar y por cobrar (M; DA)
- 129. Admin: Costos por lote y campaña (M; DA)
- 131. Admin: Resultados y márgenes por lote (M; DA)
- 133. Admin: Personal (asistencia, pagos, planilla) (M; DA (asistencia en 3; planilla: escritorio))

Dependencias: una decisión de producto sobre qué ve cada rol del ERP (el agrónomo solo cantidades, el supervisor nada), la verificación de `can.manageErp` y `can.viewStock` en cada ruta nueva con tests en `apps/api/test`, y la foto de factura (`/org/erp/photos/:kind/:id/upload-url`, ya existe en la API) con la cámara del teléfono. Es la ola con más valor diferencial del teléfono dentro del ERP: la compra con foto de la factura en el momento.

### Ola 4: informes y extras (M a L)

- 2. Ingreso con Google (S; REST)
- 10. Calendario iCal (URL para Google Calendar) (S; REST)
- 11. Código de referido del agrónomo (S; REST)
- 14. Plan y límites (ver y pedir cambio de plan) (S; REST)
- 15. Baja de la cuenta (S; REST)
- 16. Centro de ayuda (videos, WhatsApp de soporte) (S; Estático)
- 17. Guía de primeros pasos (S; REST)
- 26. Capa de límites administrativos (S; Estático (PMTiles))
- 27. Capas propias (imágenes de dron, mapas de suelo): ver (M; REST (`custom_layers`))
- 29. Escenas por fecha: línea de tiempo y comparar dos fechas con cortina (M; REST (`scenes`))
- 41. Exportar lotes y puntos a KML, GeoJSON y Shapefile (S; Sync)
- 42. Grilla de muestreo de suelo (5 o 10 ha) con puntos numerados (S; Sync)
- 53. Zonas de manejo y benchmark contra la zona (M; REST (`management_zones`))
- 56. Informe de daño del lote (PDF con fotos para el seguro) (L; REST + PDF)
- 57. Historia de vigor por campaña (pedir desde 2017) (S; REST)
- 65. Clima: índice de sequía SPI (S; REST)
- 81. Agronomía: fertilidad (mapa y recomendación) (M; REST (job en workers-py))
- 85. Informe de campaña en PDF (por lote o estancia) (L; REST + PDF en cliente)
- 91. Riesgo climático del campo (sequía, incendios, heladas) y PDF (M; REST)
- 93. Cambios de cobertura y áreas quemadas (M; REST)
- 118. Admin: Granos (contratos, entregas, liquidaciones) (M; REST)
- 138. Generar PDF en el cliente (`@react-pdf/renderer`: parte, informes, banco, auditoría, riesgo, EUDR, daño, muestreo, cobertura) (L; REST)
- 142. Términos y privacidad (S; Estático)

Dependencia clave: decidir el motor de PDF. Opciones: (a) generar el PDF en `workers-py` o en un job y devolver un enlace firmado (respeta el límite de 10 ms de CPU del Worker); (b) `expo-print` con HTML en el celular (más trabajo de maquetar, funciona sin señal); (c) no generar PDF en el teléfono y compartir el enlace de solo lectura (`/compartido/$token`, ya existe). La (c) es la más barata y cubre el caso de mandar el parte por WhatsApp.

## 7. Qué conviene no llevar al teléfono

Para que el usuario decida. Cada punto es una recomendación, no una limitación técnica: salvo los PDF, todos se podrían hacer.

| Función | Por qué dejarla en la web |
|---|---|
| Alta de organización (registro, código de referido, prueba) | Es captación y facturación; el que entra desde la app ya tiene cuenta. Se resuelve con un enlace a la web. |
| Webhooks de la organización | Configuración técnica con URL y secretos largos; la hace quien administra la integración, en escritorio. |
| Capas propias: subir y borrar (con esquinas georreferenciadas) | Archivos grandes y esquinas georreferenciadas; se prepara en una computadora. |
| Dividir un lote con una línea | Trazar una línea de corte precisa con el dedo es incómodo y un error rompe el historial del lote; la web lo hace con el mouse. |
| Unir lotes | Igual que dividir: decide sobre geometrías y se revisa en pantalla grande. |
| Importar geodatos (KML, KMZ, GeoJSON, Shapefile) con vista previa y advertencias de solapamiento | Los archivos KML, KMZ y Shapefile viven en la computadora; el celular recibe el resultado por sincronización. |
| Mapa de rinde y rinde contra vigor (carga de archivo de cosechadora) | Archivos de la cosechadora y análisis; es trabajo de escritorio. |
| Prescripción de dosis variable (Shapefile para el tractor) | El archivo va al monitor del tractor por pendrive desde la computadora. |
| Informe para el banco en PDF | Documento formal que se revisa y firma en escritorio. El celular puede compartir el enlace. |
| Informe de auditoría en PDF | Ídem. |
| Exportar los datos de la estancia | Descarga masiva pensada para escritorio. |
| Informes programados por email | Configuración que se hace una vez; sin urgencia en campo. |
| EUDR: deforestación por lote y PDF de cumplimiento | Documento de cumplimiento para exportación, sin uso en el campo. |
| Registros: exportar CSV o Excel | CSV y Excel se trabajan en planillas; en el teléfono alcanza con compartir un registro. |
| Formularios: definir campos propios por tipo de registro | Es configuración de la organización (dueño y administrador); la app ya consume los campos propios. |
| Registro de cambios (auditoría de la organización) | Auditoría del dueño; consulta ocasional y larga. Si se pide, lectura en la ola 4. |
| API pública: crear y revocar tokens | Gestión de tokens: se hace una vez, en escritorio. |
| Admin: Costo laboral | Planillas y cálculos; escritorio. |
| Admin: Contratistas (servicios) | Alta y servicios de terceros; escritorio. |
| Admin: Engorde a corral (raciones, informe) | Raciones y corral; escritorio. |
| Admin: Presupuesto contra real | Se arma comparando contra el real, con tablas anchas. |
| Admin: Tipos de cambio | Alta diaria o semanal desde la oficina. |
| Admin: Contador (mapa de cuentas) | Mapa de cuentas para el contador; escritorio. |
| Admin: Exportes contables y formatos | Formatos contables para el contador; escritorio. |
| Exportar tablas a CSV o Excel (`ExportableTable`, `TableExportMenu`, unas 20 pantallas) | Pensado para tablas anchas y planillas. |
| Imprimir la estancia o el parte (`printPage`) | No tiene sentido en el teléfono; el reemplazo es compartir. |
| Laboratorio: 10 vistas previas de IA (animales, plantas, malezas, preguntar, resumen, roya, granizo, infraestructura, rinde, consejo) | Vistas ilustrativas sin modelo real; no vale la pena igualarlas entre web y app antes de que existan los modelos (BACKLOG, sección de IA). |
| Panel interno de la plataforma (pedidos, plan, auditoría, embudo) | Solo personal de la plataforma. |

Además, con lo que ya se hizo conviene mantener fuera del teléfono, aunque tengan fila de ola: los PDF generados en el cliente (fila de PDF, ola 4) y el cálculo de fertilidad (corre en `workers-py`; el teléfono solo mostraría el resultado).

## 8. Preguntas para decidir

1. **¿Una pestaña Gestión o un grupo dentro de Más?** La pestaña cambia el diseño de la barra (hoy cuatro pestañas más el botón Anotar). Recomiendo la pestaña, solo para roles de oficina.
2. **¿Qué ve el agrónomo del ERP?** La API ya dice cantidades de stock sí y montos no (`can.viewStock`). Confirmar si el teléfono sigue la misma regla.
3. **¿El supervisor entra a la ola 1?** Tiene alcance por estancia y no ve ERP ni equipo; las pantallas de la ola 1 le sirven en lo suyo (tareas, avisos, para revisar, parte). Confirmar.
4. **PDF en el teléfono.** Elegir entre job en `workers-py`, `expo-print` o solo enlace de solo lectura (sección 6, ola 4).
5. **¿Edición de lotes y de campañas desde el teléfono?** El dibujo ya existe; borrar, dividir y unir no. Recomiendo borrar sí (ola 3) y dividir y unir no.
6. **TOTP en la app.** Definir si el administrador puede activar el segundo factor desde la app o si se le pide hacerlo una vez en la web (ver hallazgo 8).
7. **Tiendas.** Si la app llega a permitir crear cuentas o pedir la baja, las tiendas exigen poder iniciar la eliminación de la cuenta dentro de la app; hoy la app no crea cuentas. Verificar la política vigente antes de la ola 4.

## 9. Límites de esta auditoría

- No ejecuté la web ni la app; el inventario sale de leer el código. Donde una pantalla se arma con componentes y claves de texto, tomé las claves de i18n como señal de qué hace.
- Las secciones de `routes/farm.tsx` (1.192 líneas) y los paneles de ERP los inventarié por su archivo, sus claves de texto y sus rutas de API; no leí cada panel línea por línea.
- "Parcial" en la app significa que hay una parte comprobable en el código (por ejemplo, se carga el registro pero no hay resumen). "No" significa que no encontré pantalla, ruta ni consulta en `apps/mobile/app` ni `apps/mobile/src`.
- Las estimaciones S, M y L son del orden de magnitud del BACKLOG, no un plan de trabajo. No incluyen pruebas en dispositivo ni los permisos nuevos de tiendas.
- Los permisos por rol salen de `can` y de `docs/PRD-roles.md`; en filas donde el rol exacto depende de la ruta del servidor lo indiqué con la regla general.
