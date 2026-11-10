# Revisión de Yvy · qué falta, qué falla y qué pulir

10 de noviembre de 2026. Hecha probando el código, no de memoria: geometrías raras contra `packages/geo`,
inventario de rutas y pantallas, y lectura de los puntos críticos (sincronización, permisos, borrado).

Prioridad: **P0** bloquea el piloto, **P1** antes de cobrar, **P2** después.

## 1. Geometrías: lo que aguanta y lo que no

Probé triángulo, rombo rotado 45°, polígono con hueco (laguna), forma de L, multipolígono, anillo en sentido
horario, vértice duplicado, espiga, lote de 0,01 ha y otro de 500.000 ha, y coordenadas 3D de KML.

| Caso | Área, bbox, punto en polígono | Comentario |
|---|---|---|
| Triángulo, rombo rotado | Bien | El bbox es más grande que el lote, pero la detección final usa el polígono real |
| Hueco (laguna) | Bien | El área descuenta el hueco; un punto en la laguna no cae en el lote |
| L / formas cóncavas | Bien el cálculo; **etiqueta dudosa** | El nombre del lote se pone en el centro del rectángulo (web `FarmMap.centerOf`, app `map.web.tsx`); en formas en L, C o herradura ese punto puede caer fuera del lote. Usar un punto interior garantizado (`turf/point-on-feature`) |
| Multipolígono | Bien | |
| Sentido horario | Bien | |
| Vértice duplicado | Pasa la validación | Debería limpiarse al importar (`turf/clean-coords`) para no inflar el KML exportado |
| Espiga (vértice de ida y vuelta) | **Pasa la validación** | Es una autointersección degenerada; `kinks` no la detecta. Impacto bajo, pero el área puede quedar rara |
| 0,01 ha | Pasa | Falta un mínimo razonable (0,1 ha) y un aviso al importar |
| 500.000 ha | Pasa | Falta un máximo (p. ej. 100.000 ha por estancia) y un tope de vértices real: hoy el límite es por largo de texto, 200 KB, muy permisivo |
| 3D (KML con altura) | Bien en la web (se quita la Z al importar) | **El Worker no la quita**: un GeoJSON 3D mandado directo a la API se guarda con Z y el área sale bien, pero MapLibre y Python pueden fallar. Normalizar en `routes/org.ts` |

Otros casos no contemplados:

- **Lotes que se superponen.** No se detecta ni al importar ni al dibujar. Con GPS, `detectPlot` devuelve el primero que encuentra (orden alfabético), que puede ser el equivocado. Falta: aviso al importar (`turf/boolean-overlap`) y, en la app, cuando el punto cae en más de uno, preguntar.
- **Lote fuera del perímetro de la estancia.** No se valida. Después, en el NDVI, la grilla se arma con el bbox de la estancia y el lote queda recortado o sin datos. Falta: aviso si el lote no está contenido (`turf/boolean-within`), permitiendo igual guardar.
- **Precisión del GPS.** Si el punto cae en un lote pero a 2 m del borde con ±25 m de error, la asignación es dudosa. Falta: cuando `accuracy` es mayor que la distancia al borde, marcar el lote como "probable" y pedir confirmación.
- **Lotes muy finos** (franjas de 20 m). Con píxeles Sentinel de 10 m y `all_touched=False`, un lote de 1-2 píxeles de ancho pierde casi todo. Falta: para lotes de ancho < 30 m usar `all_touched=True` o avisar que el NDVI no es confiable.
- **Edición de vértices.** La web solo dibuja polígonos nuevos; no se puede mover un vértice de un lote existente (el PRD lo pedía en RF-10). terra-draw tiene el modo `select` para eso.
- **Estancias con dos cascos separados** (muy común). El perímetro es un solo polígono; conviene aceptar multipolígono también en la estancia (hoy la API lo acepta pero la UI de "Nueva estancia" solo toma el polígono más grande del archivo).

## 2. Bugs encontrados

| # | Prioridad | Dónde | Qué pasa | Arreglo |
|---|---|---|---|---|
| B1 | P0 | `queries.ts deletePlot/deleteFarm` | Al borrar un lote **no se tocan** sus asignaciones, tareas ni registros. El empleado sigue viendo el lote en la app (la asignación sigue viva) y las tareas apuntan a un lote borrado | Borrado lógico en cascada: asignaciones, tareas abiertas (cancelar), y subir `assignments_version` para que el celular rehaga sus tablas |
| B2 | P0 | App, `startAutoSync` | El cierre de sesión llama a `wipeSynced` pero **no detiene** el intervalo de sincronización ni resetea `engine`; si otra persona ingresa en el mismo celular, el motor sigue con el store anterior en memoria | Guardar el `stop()` que devuelve `startAutoSync` y llamarlo en logout; recrear `engine` |
| B3 | P0 | Push de la app | Llega la notificación pero **tocarla no abre nada** (no hay `addNotificationResponseReceivedListener`). Para el dueño, el aviso de helada queda en una lista que tiene que ir a buscar | Al tocar, navegar a Hoy con el aviso resaltado |
| B4 | P1 | `detectPlot` | Si el GPS da `accuracy = 0` o `null` (emuladores, algunos equipos), se muestra "± 0 m", lo que parece exacto | Mostrar "sin precisión" cuando falta |
| B5 | P1 | Web, registros | **No se pueden editar ni borrar registros** desde la web, aunque el PRD §9 lo permite al dueño ("Todos"). La API lo soporta por `/sync/push`; falta la pantalla | Botones Editar/Borrar en la ficha, usando el mismo push |
| B6 | P1 | App | El empleado **tampoco puede editar ni borrar** sus registros en las 24 h (RF-34). El store lo soporta (`deleteRecord`, `saveRecord` con id); falta la pantalla | Ficha del registro con Editar y Borrar mientras dure la ventana |
| B7 | P1 | `scoped.ts` pull de `tasks` | Al empleado le bajan **todas** sus tareas de la historia, incluidas las hechas de hace meses. Crece sin límite | Filtrar: abiertas, o completadas en los últimos 30 días |
| B8 | P1 | `alerts.ts upsertAlert` | Un aviso de helada que se va corriendo día a día (hoy para el jueves, mañana para el viernes) genera **un aviso nuevo por cada fecha de inicio** porque la clave es `farm:kind:validFrom` | Clave por ventana solapada: si hay un aviso activo del mismo tipo que se solapa, actualizarlo |
| B9 | P1 | `notify.ts` | Si Expo responde 200 pero con errores por token (`DeviceNotRegistered`), se marca enviado y **nunca se limpia el token** | Leer `data[].status` y borrar tokens inválidos |
| B10 | P1 | Web `records.tsx` | El filtro por fecha usa el huso -03:00 fijo; bien para Paraguay, pero si la estancia tiene otro `timezone` (campo existente) se ignora | Usar `farm.timezone` |
| B11 | P2 | `internal.tsx` | Encabezados de tabla en español **fuera de i18n** ("Organización", "Estancias", …) | Pasar a `ui.*` |
| B12 | P2 | Web | El bundle principal pesa 1,8 MB (4 MB total). En 3G rural tarda | Partir por ruta (`React.lazy`), y cargar MapLibre solo en pantallas con mapa |
| B13 | P2 | `records.ts` (Zod) | `pest` acepta `intensity` y `perMeter` a la vez; el resumen muestra los dos. Menor | Elegir uno en la UI |
| B14 | P2 | App `login.tsx` | Si el QR es de **otra organización** del mismo usuario, la sesión se emite igual (correcto) pero sin aviso de cambio de estancia | Mostrar a qué organización entró |

## 3. Módulos y funciones que faltan

### Del PRD, sin implementar

| RF | Qué | Prioridad | Dónde encaja |
|---|---|---|---|
| RF-10 | Dibujar y **editar vértices** de lotes en la app (P1 en el PRD) y editar vértices en la web | P1 | terra-draw `select` en web; en la app, MapLibre RN + arrastre |
| RF-14 | Puntos de interés **desde la app** | P1 | Pantalla simple con GPS actual |
| RF-22 | Tareas vencidas por empleado en la web | Hecho parcial | Falta un filtro "vencidas" y un contador en la lista de Equipo |
| RF-34 | Editar/borrar registros (app y web) | P1 | Ver B5, B6 |
| RF-44 | Paquete offline con **NDVI**: hoy solo baja el fondo satelital si existe la capa; el NDVI local se descarga pero la app no lo muestra | P1 | Switch Satélite/NDVI en el mapa de la app |
| RF-54 | Señalar lotes con **caída de NDVI > 15 %** entre dos escenas | P1 | Regla en `plotNdvi` y un aviso de tipo nuevo o un ícono en la tabla de lotes |
| RF-61 | Clima **por lote** si > 2.000 ha | P2 | NASA POWER por centroide de lote |
| RF-73 | Empleado recibe helada y fuego de sus lotes | Hecho en la API | Falta la pantalla al tocar la push (B3) |
| RF-75 | "¿Te sirvió?" **en la app** | P1 | Hoy solo en la web; el empleado no puede votar |
| RF-81 | Resumen de campaña por lote en PDF | P2 | Reusar `reportPdf.tsx` |
| RF-83 | Parte semanal automático por email los lunes | Hecho a medias | Manda un resumen en texto con enlace; el PRD pedía el PDF adjunto. Browser Rendering (anexo §4.9) queda pendiente |
| §5.1 | **Varias organizaciones** por usuario (agrónomo con varios clientes) | P1 | La API tiene `/auth/switch` y `organizations[]`; falta el selector en web y app |
| §5.12 | Multi estancia en la **app**: el empleado con lotes en dos estancias ve todo mezclado en Hoy y en el mapa | P1 | Selector de estancia en la app cuando hay más de una |
| Fase 8 | Onboarding guiado paso a paso | Hecho solo como texto | Un asistente real de 4 pasos con estado |
| Fase 8 | Sentry | No hay | `@sentry/react` y `sentry-expo`; DSN como variable |

### Que el PRD no pide pero el uso real va a reclamar

- **Historial de un lote**: todos los registros de ese lote en orden, con fotos. Hoy hay que filtrar en Registros.
- **Buscador** de lotes y registros (una estancia con 80 lotes no se navega con una tabla).
- **Compartir un registro** por WhatsApp (texto + foto). Es la vía por la que hoy circula todo; cuesta poco y ayuda a la adopción.
- **Registro con varios lotes** (una lluvia general, una recorrida por 5 lotes). Hoy es un lote o ninguno.
- **Pluviómetro: acumulado y comparación** en la ficha del punto de interés.
- **Registro rápido de lluvia desde Hoy**, sin pasar por Cargar (es el registro más frecuente).
- **Mapa de calor de registros** por lote (dónde se recorre y dónde no).
- **Exportación completa** de la organización (ZIP con Excel, KML y fotos), prometida en §7 Privacidad.
- **Baja de la cuenta** y borrado de datos, por la misma promesa.
- **Modo oscuro** en la app: en el campo, de noche, la pantalla blanca encandila. Los tokens ya están pensados para eso.
- **Texto grande**: respetar el tamaño de fuente del sistema (Android "Dynamic Type"); hoy las fuentes son fijas.
- **Guaraní**: la estructura de i18n está lista; falta el archivo `gn-PY` y un selector.

## 4. Pulido de interfaz

**Web**

1. **Mapa a pantalla completa en celular**: con 360 px de ancho el mapa queda en 320 px de alto y el panel abajo. Mejor: pestaña "Mapa / Lista" en móvil.
2. **Tabla de lotes**: ordenar por columna, buscar, y mostrar el NDVI actual con un color de la rampa al lado del nombre (hoy hay que entrar a cada lote).
3. **Lote seleccionado**: al tocar un lote el mapa no hace zoom al lote. Debería encuadrarlo (`fitBounds` con padding).
4. **Formulario de importación**: la vista previa no dibuja los polígonos en el mapa antes de importar. Hay que verlos para elegir bien.
5. **Nueva estancia**: después de importar el perímetro, ofrecer importar los lotes del mismo archivo (hoy son dos pasos separados y el usuario sube el KML dos veces).
6. **Confirmaciones**: `confirm()` del navegador para borrar; reemplazar por un modal propio con el nombre de lo que se borra y "deshacer" durante unos segundos.
7. **Estados de carga**: en Clima y Lote se ven placeholders grises, bien; en Inicio, la lista de estancias salta cuando llegan los datos. Reservar alto.
8. **Fechas**: "9/11, 08:53 p. m." en Registros; en el campo se usa 24 h. Unificar a `HH:mm` en toda la web (la app ya lo hace).
9. **Teclado**: las pestañas y la tabla de lotes se navegan con Tab, pero el mapa se traga el foco. Añadir "saltar al contenido".
10. **Impresión**: el parte semanal en PDF es bueno; falta `@media print` para la ficha del lote.

**App**

1. **Confirmación al guardar**: hoy vuelve atrás sin más. Un toast "Guardado · se sube cuando haya señal" de 3 s tranquiliza al que está en el campo.
2. **Hoy vacío**: si no hay tareas ni avisos, la pantalla queda casi en blanco. Mostrar los últimos 3 registros propios y un acceso directo a "Cargar lluvia".
3. **Formulario**: con 20 lotes asignados, los chips ocupan media pantalla. Usar el detectado por GPS arriba y un botón "Elegir otro lote" que abre una lista con buscador.
4. **Fotos**: previsualización con botón para quitar; hoy una foto mal tomada no se puede sacar sin volver atrás.
5. **Mapa**: botón "Dónde estoy" (centrar en GPS) y mostrar la posición actual. Es lo primero que busca un empleado nuevo.
6. **Historial**: agrupar por día y filtro por tipo. Mostrar la miniatura de la foto.
7. **Indicador de señal**: cuando el error es de servidor (no de red), hoy se muestra "SIN SEÑAL". Distinguir "No se pudo sincronizar · reintentar".
8. **Rechazados**: aparecen en Más, lejos. Mostrar en el registro mismo con un botón "Corregir" que abra el formulario con los datos cargados.
9. **Accesibilidad**: los chips tienen `accessibilityRole="radio"` pero no están agrupados (`radiogroup`); TalkBack no dice "1 de 5".

## 5. Robustez y operación

- **Reloj del celular**: `capturedAt` se toma del dispositivo. Un celular con fecha mal puesta manda registros "del futuro" o de 2020. El servidor debería rechazar más de 1 h en el futuro y guardar también `receivedAt` (ya existe `sync_mutations.received_at`; falta usarlo en la UI).
- **Fotos huérfanas**: si el adjunto se rechaza, el archivo local queda para siempre. Falta limpieza de `local_files` sin adjunto vivo, y de fotos subidas hace más de 30 días.
- **Almacenamiento del celular**: no hay tope. 3 fotos × 150 KB × 10 registros/día × 30 días = 135 MB por mes; aceptable, pero mostrar el uso en Más y permitir borrar lo ya subido.
- **D1 cerca de los 500 MB**: `usage_daily` mide, pero el **archivado a R2** del anexo (§4.1) no está hecho.
- **Secretos en el log de desarrollo**: el código de ingreso se imprime en consola solo cuando no hay `RESEND_API_KEY`; está bien, pero conviene que en `APP_ENV=production` nunca lo imprima aunque falte la clave.
- **Rate limit**: `/auth/email/start` limita por email (3 cada 10 min), pero no por IP. Alguien puede hacer que mandemos 100 emails/día (el tope de Resend) a víctimas distintas. Falta un límite por IP con KV o con la tabla `email_codes`.
- **CORS**: solo en desarrollo, correcto.
- **Pruebas que faltan**: geometrías raras (este informe), borrado en cascada, cambio de organización, notificación tocada, y una E2E de la app en un Android real (Maestro, como pedía el PRD).

## 6. Orden sugerido

1. **Semana 1 (P0):** B1 borrado en cascada, B2 logout, B3 abrir aviso desde la push, editar/borrar registros en app y web (B5, B6), límites de tamaño y Z en la API.
2. **Semana 2 (P1 campo):** selector de estancia y de organización, NDVI en la app, "¿Te sirvió?" en la app, lluvia rápida desde Hoy, confirmación al guardar, lote probable por precisión del GPS, superposición y lote fuera de la estancia al importar.
3. **Semana 3 (P1 web):** editar vértices, vista previa de importación en el mapa, tabla de lotes con NDVI y orden, zoom al lote, RF-54 caída de NDVI, aviso de helada con ventana solapada (B8), tokens de push inválidos (B9).
4. **Después:** Sentry, modo oscuro, texto grande, guaraní, exportación completa, archivado a R2, parte semanal en PDF por email.
