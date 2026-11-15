# Auditoría de UI/UX · web y app

14 de noviembre de 2026. Hecha sobre el producto corriendo (organización demo, 45 pantallas web capturadas a
1440 px y 390 px) y leyendo el código de la app (Expo web no levanta: `codegenNativeComponent`, así que la app
se auditó por código, sin capturas). La landing queda fuera.

Prioridad: **A** estructura (lo que hace que "no se entienda"), **B** consistencia, **C** acabado.

## Diagnóstico en una línea

La base visual está bien (paleta, Fraunces + Inter, contraste AA, modo oscuro, accesibilidad). Lo que falla no
es el "look": es la **arquitectura de información**, la **densidad** y la **falta de un sistema de componentes
de datos**. Cada pantalla resuelve tablas, filtros, vacíos y encabezados a su manera, y nada se mueve.

## Web

### A. Estructura

| # | Dónde | Qué pasa | Qué hacer |
|---|---|---|---|
| W1 | Administración | 23 secciones en una segunda barra lateral más alta que la pantalla: Finanzas, Personal y Contador quedan bajo el pliegue y la sección activa ni se ve (Caja y bancos). Dos barras = 500 px perdidos. Entra por Productos (un catálogo), no por el estado del negocio | 5 módulos (Resumen · Compras y ventas · Stock · Operación · Finanzas) como pestañas arriba, subsecciones como pestañas de segundo nivel; Catálogos y Contador pasan a "Configuración". Página de inicio "Resumen" con caja, a pagar/cobrar, stock bajo y margen |
| W2 | Administración, paneles | Cada panel tiene otro esqueleto: pestañas (Caja, Personal), secciones apiladas (Feedlot, Stock), filtros sueltos (Costos). Primarios deshabilitados sin decir por qué ("Guardar", "Anotar suministro"). Requisitos como texto pasivo ("Primero cargá un depósito en Depósitos") en vez de un botón que lleve | Una plantilla: encabezado + barra de filtros + tabla/lista + vacío con acción. El vacío lleva al requisito |
| W3 | Costos y márgenes | 6 cifras "Gs. 0" + 4 tablas casi vacías, cada una con su "Exportar" huérfano; tabla de 10 columnas con encabezados partidos en dos líneas; en el celular se corta | Cifras solo si hay datos; un selector "Por lote / cultivo / campaña / actividad" sobre una sola tabla; un solo Exportar |
| W4 | Informes | Es una lista de párrafos con botones "Descargar PDF": ningún informe se ve en pantalla. Los reportes están repartidos en 9 lugares (Parte, Informes, Riesgo, EUDR, Cambios, Pluviómetros, Comparar, Costos, Sistemas contables), todos escondidos tras el "…" de la estancia | Un solo centro de Informes en la navegación: tarjetas por pregunta ("¿Cómo viene la campaña?", "¿Qué le llevo al banco?"), cada informe se ve en pantalla y el PDF es una acción |
| W5 | Parte semanal | 3 tarjetas (una con "—") y nada más; el contenido real solo existe en el PDF. "Enlace de solo lectura" es otra función pegada abajo | El parte en pantalla: registros por tipo y por persona, lluvia, avisos, tareas; compartir en el encabezado |
| W6 | Navegación | Solo texto, sin íconos. Grupos plegables con un solo ítem ("Hacienda" → Sanidad). "Mapa" es en realidad la ficha de la estancia. Avisos suelto. Sin selector de estancia a la vista | Íconos lucide, grupos sin plegar, "Estancia" con selector arriba, Informes como destino propio |
| W7 | Anchos | 17 pantallas en `max-w-3xl` (720 px) centradas en un monitor de 1440: mitad de la pantalla vacía en Tareas, Avisos, Informes, Sanidad, Riesgo. Otras a 5xl, 6xl o ancho total, sin regla | Dos anchos: lectura (formularios, ajustes) y datos (listas y tablas, hasta 1200 px con columna lateral de contexto) |
| W8 | Ficha de estancia | La mejor pantalla, pero: 9 pestañas que se cortan ("Clim…"), tres "Exportar" visibles a la vez, 6 datos en una línea de prosa, columna Vigor vacía ("—") | Pestañas con desborde a "Más", un Exportar, datos clave como cifras, ocultar columnas sin datos |
| W9 | Registros | El mapa abre mostrando todo el país con un solo punto "87". Cinco filtros en fila con `<select>` nativos | Encuadrar a los registros filtrados; filtros como chips con contador |

### B. Consistencia

- **No hay componente de tabla.** 49 archivos escriben `<table>`/`<select>` a mano; por eso cada tabla alinea, ordena y exporta distinto.
- **Dos estilos de vacío** en la misma pantalla (tarjeta punteada con título vs. texto gris suelto).
- **9 tamaños de letra a mano** (`text-[18px]` 40 veces, `[15px]`, `[11px]`, `[28px]`…) en vez de una escala.
- **Selects, radios y checkboxes nativos** del navegador (azul del sistema en Sistemas contables) sobre una interfaz de marca.
- Las acciones de fila son siempre "…" aunque haya una sola acción obvia.

### C. Acabado (criterio Emil Kowalski)

- **Nada se mueve**: 13 `transition-colors` en toda la web. Modales, menús, toasts y hojas aparecen de golpe; ningún botón responde al presionar.
- `prefers-reduced-motion` apaga todo; lo correcto es dejar los fundidos y sacar los desplazamientos.
- Sin `text-wrap: balance` en títulos ni `tabular-nums` por defecto en columnas.
- El aviso de la demo tapa el pie de todas las pantallas.

### Bugs encontrados de paso

- `vite.config.ts`: el proxy `/admin` atrapa `/administracion`; en desarrollo, recargar Administración da 404.
- `seed-demo.mjs` no carga nada del ERP: en la demo pública las 23 secciones de Administración están vacías.

## App

Base sólida (tokens, 56 px de toque, una acción principal). Lo que falla:

| # | Dónde | Qué pasa | Qué hacer |
|---|---|---|---|
| M1 | Más | Cajón de sastre de 300 líneas: herramientas, cola de envío, mapas sin conexión, almacenamiento, cuenta y laboratorio en un solo scroll. Emergencia es una fila más | Más = herramientas con ícono (Emergencia destacada) + accesos; "Sincronización y almacenamiento" y "Cuenta" como pantallas propias |
| M2 | Todas las listas | `Row` solo texto: una herramienta, un ajuste y una tarea se ven igual | Íconos a la izquierda, chevron cuando navega |
| M3 | Hoy | Aviso → botón lluvia → tareas → resumen del dueño → tu día → pronóstico al fondo. Cada tarea trae un círculo que no es botón y dos botones de texto debajo | Pronóstico arriba (compacto), tareas con check real y acciones en la fila, resumen del dueño como cifras |
| M4 | Interacción | 0 animaciones, 0 hápticos, 20 `Alert.alert` (el idioma se elige en una alerta) | Hojas inferiores, escala al presionar, háptico al guardar |
| M5 | Anotar | Un archivo de 1112 líneas | Partir por paso al rediseñarlo |
| M6 | Tema | Sin modo oscuro (la web sí) | Tokens por esquema |

## Dirección

Se mantiene la identidad (lino, surco, soja, trigo; Fraunces para títulos y cifras, Inter para el resto). Se
cambia la estructura: menos cajas, más tabla y cifra; un patrón por tipo de pantalla; movimiento corto y con
causa (150–220 ms, ease-out, solo transform/opacity).

## Fases

0. **Cimientos**: escala tipográfica, anchos de página, `DataTable`, `Select`/menús propios, un solo vacío, tokens de movimiento, íconos de navegación. Kit de la app: íconos, presión, hápticos, hoja inferior.
1. **Marco y navegación** (W6, W7).
2. **Campo**: estancia, registros, tareas, calendario, avisos (W8, W9).
3. **Administración** (W1–W3).
4. **Informes** (W4, W5).
5. **Equipo, cuenta, formularios y el resto**.
6. **App** (M1–M6).

Un PR por fase. Cada una cierra con capturas antes/después, lint, typecheck y tests.
