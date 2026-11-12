# Backlog completo de Yvy

10 de noviembre de 2026. Todo lo que se podría agregar a la web, la app y la plataforma, desde un detalle de usabilidad
hasta un ERP de campo. Es un inventario para elegir, no un plan: el orden de trabajo sale de la sección 0.

Complementa a `docs/REVISION.md` (bugs y pulido) y a los PRD. Lo que ya está hecho no se repite salvo para marcar lo que falta.

**Cómo leer las tablas**

- **Prioridad.** P0: sin esto no conviene mostrarlo a un cliente. P1: antes de cobrar. P2: ventaja frente a la competencia. P3: más adelante.
- **Esfuerzo.** S: horas a 2 días. M: 3 a 10 días. L: más de 2 semanas.
- **Estado.** Falta, Parcial o Hecho.
- **Dónde.** Web, App, API, Jobs (Python en GitHub Actions) o Ops (cuentas, legales, comercial).

**Restricciones que condicionan el backlog**

- **Plan gratis de Cloudflare.** 10 ms de CPU por request y 5 GB en D1. Todo cálculo pesado (zonas de manejo, informes, índices) va a `workers-py`. El ERP con muchos movimientos necesita archivar a R2 o pasar a Workers Paid (US$ 5/mes).
- **Fuentes de datos.** CLAUDE.md solo permite Sentinel-2, CHIRPS, NASA POWER, NASA FIRMS y MET Norway. Copernicus DEM, Sentinel-1, Landsat, OpenStreetMap o cualquier API de precios necesitan un ADR nuevo en `docs/adr/` que revise la licencia comercial.
- **Offline primero.** Toda función de campo tiene que andar sin señal; si no puede, lo dice.

---

## 0. Selección recomendada

Lo que más mueve la aguja para salir a vender, en orden:

1. Primer valor en minutos al crear la estancia: satélite procesado al instante y 6 meses de historia (M-01, S-01, S-02).
2. Buscador y ubicación con un clic al crear la estancia (U-01, U-10, U-11).
3. Vigor por lote en la tabla y "lotes que empeoraron" (S-05, S-06).
4. Informe gratis de riesgo climático del campo como imán de clientes (C-10, V-04).
5. Selector de organización para agrónomos y de estancia en la app (K-01, F-20).
6. Vigor en el mapa de la app y "¿Te sirvió?" en la app (F-21, F-22).
7. Compartir por WhatsApp (K-10, K-11).
8. Landing, demo pública, términos y Play Store (V-01, V-02, V-03, P-30).
9. Para ganadería: rodeo por potrero, carga animal y calendario sanitario (G-01, G-03, G-10).
10. Para agricultura: campañas, aplicaciones y cosecha por lote con costo por hectárea (A-01, A-10, A-20, E-30).
11. Cumplimiento EUDR (libre de deforestación) para quien exporta soja o carne a Europa (S-30).

---

## 1. Usabilidad básica

Detalles que un usuario espera sin pedirlos.

| ID | Qué | Por qué | Dónde | Prio | Esf | Estado |
|---|---|---|---|---|---|---|
| U-01 | Barra de búsqueda global: estancias, lotes, empleados, registros, puntos de interés | Con 80 lotes la tabla no alcanza | Web | P0 | M | Hecho |
| U-02 | Buscador dentro de la tabla de lotes y en el selector de lote de la app | Elegir lote rápido | Web, App | P0 | S | Hecho |
| U-03 | Atajo de teclado `/` o `Ctrl+K` para buscar | Usuarios de oficina | Web | P2 | S | Hecho |
| U-04 | Ordenar la tabla de lotes por nombre, superficie, cultivo, vigor o última visita | Ver primero lo importante | Web | P1 | S | Hecho |
| U-05 | Filtros guardados en Registros (por ejemplo "plagas de esta semana") | Uso diario del agrónomo | Web | P2 | S | Hecho |
| U-06 | Filtros por tipo en el Historial de la app | Encontrar la lluvia de ayer | App | P1 | S | Hecho |
| U-07 | Recordar la última estancia, pestaña y capa elegidas | Menos clics al volver | Web, App | P1 | S | Hecho |
| U-08 | Deshacer durante unos segundos después de borrar | Errores de dedo | Web, App | P1 | S | Hecho |
| U-09 | Avisos breves de confirmación ("Guardado", "Se manda cuando haya señal") | Tranquilidad en el campo | Web, App | P1 | S | Hecho |
| U-10 | Botón "Usar mi ubicación" al crear una estancia: centra el mapa con el GPS del navegador o del celular | Un clic para llegar al campo | Web, App | P0 | S | Hecho |
| U-11 | Buscar la estancia por departamento, distrito o localidad, con una lista de Paraguay incluida en la app (anda sin internet) | La gente no sabe sus coordenadas | Web, App | P0 | S | Hecho |
| U-12 | Pegar coordenadas o un enlace de Google Maps o WhatsApp y que el mapa vaya ahí | Así se pasan ubicaciones en Paraguay | Web, App | P1 | S | Hecho |
| U-13 | Copiar las coordenadas de un punto o lote con un toque, en formato decimal y en grados-minutos | Para pasárselas a un contratista | Web, App | P1 | S | Hecho |
| U-14 | Medir distancia y superficie sobre el mapa | Pregunta frecuente | Web, App | P1 | S | Hecho |
| U-15 | Pantalla completa del mapa | Presentaciones y pantallas chicas | Web | P2 | S | Hecho |
| U-16 | Web usable en el celular: alternar Mapa y Lista | El dueño mira desde el celular | Web | P0 | M | Hecho |
| U-17 | Web instalable (PWA) con ícono y uso básico sin conexión en la oficina | Starlink se corta | Web | P2 | M | Hecho |
| U-18 | Indicador de conexión en la web y reintento automático | Hoy un error de red muestra un mensaje técnico | Web | P1 | S | Hecho |
| U-19 | Alturas reservadas mientras carga, sin saltos | Sensación de calidad | Web | P2 | S | Hecho |
| U-20 | Modo oscuro | De noche en el campo la pantalla blanca encandila | App, Web | P2 | M | Hecho |
| U-21 | Respetar el tamaño de letra del sistema | Usuarios mayores | App | P1 | M | Hecho |
| U-22 | Guaraní (gn-PY) con selector de idioma | Diferencial real con el empleado | App, Web | P2 | M | Parcial (navegación y Anotar) |
| U-23 | Unidades configurables: hectáreas o cuadras, mm, °C, kg o arrobas | Costumbres locales | Web, App | P2 | S | Hecho |
| U-24 | Recorrido guiado de primera vez (4 pasos con estado) | Activación sin acompañamiento | Web | P1 | M | Parcial |
| U-25 | Centro de ayuda con videos cortos y botón de WhatsApp de soporte | Soporte barato | Web, App | P1 | S | Hecho |
| U-26 | Accesibilidad completa: "saltar al contenido", foco visible en el mapa, grupos de opciones leídos por TalkBack | Calidad y licitaciones | Web, App | P2 | M | Parcial |
| U-27 | Vista de impresión para la ficha del lote y la estancia | Reuniones en papel | Web | P2 | S | Hecho |
| U-28 | Exportar cualquier tabla a Excel y CSV | El contador y el banco | Web | P1 | S | Parcial |
| U-29 | Notificaciones con preferencias por tipo (helada sí, tareas no) y horario de silencio | No molestar de más | Web, App | P1 | M | Hecho |
| U-30 | Menú de cuenta con perfil, idioma, notificaciones y cerrar sesión | Orden | Web | P2 | S | Hecho |

---

## 2. Mapa y geometría

| ID | Qué | Por qué | Dónde | Prio | Esf | Estado |
|---|---|---|---|---|---|---|
| M-01 | Procesar el mapa base satelital al crear la estancia, no el domingo | Primer valor en minutos | API, Jobs | P0 | S | Hecho |
| M-02 | Editar vértices de un lote existente | Ningún import sale perfecto | Web | P1 | M | Hecho |
| M-03 | Dibujar y editar lotes desde la app | Pequeños productores sin computadora | App | P2 | L | Hecho |
| M-04 | Dibujar el perímetro caminando con el GPS | El borde real del lote | App | P2 | M | Hecho |
| M-05 | Dividir un lote en dos y unir dos lotes | Cambios de campaña | Web | P2 | M | Hecho |
| M-06 | Vista previa de la importación dibujada en el mapa | Elegir bien antes de guardar | Web | P1 | S | Hecho |
| M-07 | Importar shapefile (.zip), GeoJSON y KMZ además de KML | Archivos de agrimensores y maquinaria | Web | P1 | M | Hecho |
| M-08 | Importar perímetro y lotes del mismo archivo en un paso | Hoy se sube dos veces | Web | P1 | S | Hecho |
| M-09 | Estancia con varios polígonos (cascos separados) | Muy común | Web | P1 | S | Hecho |
| M-10 | Avisar si dos lotes se superponen o si un lote sale de la estancia | Errores de carga | Web, API | P1 | S | Hecho |
| M-11 | Limpiar vértices duplicados y espigas al importar | Áreas correctas | Web | P2 | S | Hecho |
| M-12 | Etiquetas por punto interior garantizado en la app | Lotes en L | App | P2 | S | Hecho |
| M-13 | Zoom al lote al elegirlo en la app | Coherencia con la web | App | P1 | S | Hecho |
| M-14 | Curvas de nivel y pendiente (Copernicus DEM, necesita ADR) | Erosión, terrazas, siembra | Web, Jobs | P2 | M | Falta |
| M-15 | Caminos, arroyos y localidades de fondo (OpenStreetMap, necesita ADR) | Orientarse | Web, App | P2 | M | Falta |
| M-16 | Límites de departamentos y distritos | Contexto y búsqueda | Web | P3 | S | Hecho |
| M-17 | Capas personalizadas: subir una imagen de dron o un mapa de suelos | Productores grandes | Web | P3 | M | Hecho |
| M-18 | Grilla de muestreo de suelo sobre el lote (cada 5 o 10 ha) con puntos numerados | Planificar análisis | Web, App | P2 | M | Hecho |
| M-19 | Puntos de interés con más tipos: silo, galpón, tranquera, puente, molino, bebedero, manga, embarcadero | Mapa del campo completo | Web, App | P1 | S | Hecho |
| M-20 | Líneas en el mapa: alambrados, caminos internos, cañerías, con su largo | Mantenimiento | Web | P2 | M | Hecho |
| M-21 | Exportar lotes y puntos a KML, shapefile y GeoJSON para maquinaria y agrimensores | Interoperabilidad | Web | P1 | S | Hecho |

---

## 3. Campo sin señal (app)

| ID | Qué | Por qué | Dónde | Prio | Esf | Estado |
|---|---|---|---|---|---|---|
| F-01 | GPS sin internet explicado en pantalla: el GPS anda sin datos; avisar cuando tarda (arranque en frío) | Expectativas claras | App | P1 | S | Hecho |
| F-02 | Mostrar mis coordenadas y la precisión en el mapa | Confianza en el dato | App | P1 | S | Hecho |
| F-03 | "Llevame ahí": rumbo y distancia a un lote, punto o registro, sin internet (brújula y flecha) | Encontrar el foco de plaga que marcó otro | App | P1 | M | Hecho |
| F-04 | Brújula en el mapa y mapa que gira con el rumbo | Orientarse en el lote | App | P2 | S | Hecho |
| F-05 | Grabar la recorrida (track GPS) solo cuando el usuario lo pide, con distancia y tiempo | Probar que se recorrió | App | P2 | M | Hecho |
| F-06 | Mapa de calor de recorridas por lote: dónde se camina y dónde no | Supervisión | Web | P2 | M | Hecho |
| F-07 | Marcar puntos de interés desde la app con la ubicación actual | Primera carga del campo | App | P1 | S | Hecho |
| F-08 | Varias fotos con dibujo encima (flecha, círculo) | Señalar la plaga | App | P2 | M | Hecho |
| F-09 | Nota de voz grabada sin señal; transcripción cuando vuelve la señal | El peón prefiere hablar | App, Jobs | P2 | M | Hecho |
| F-10 | Anotar en varios lotes a la vez (lluvia general, recorrida de 5 lotes) | Menos carga repetida | App | P1 | M | Hecho |
| F-11 | Lluvia en un toque desde Hoy y desde un widget de Android | El registro más frecuente | App | P1 | S | Parcial (hecho: botón en Hoy y atajo de Android al mantener el ícono; falta el widget, que pide un módulo nativo que no se puede probar sin compilar el APK) |
| F-12 | Monitoreo de plagas por estaciones: N puntos por lote con conteo, promedio y comparación con el umbral de daño | Manejo integrado de plagas real | App, Web | P1 | M | Hecho |
| F-13 | Plantillas de monitoreo por cultivo (soja: chinches, orugas, roya; maíz: cogollero, chicharrita) | Carga guiada | App | P1 | M | Hecho |
| F-14 | Formularios configurables por la organización (campos propios) | Cada estancia mide distinto | Web, App | P2 | L | Hecho |
| F-15 | Listas de verificación en tareas (revisar bebederos 1 a 5) | Rutinas | App, Web | P1 | M | Hecho |
| F-16 | Recordatorios locales de tareas sin internet | El aviso llega igual | App | P1 | S | Hecho |
| F-17 | Fotos: quitar una mal sacada y ver miniaturas en el Historial | Detalle de uso | App | P1 | S | Hecho |
| F-18 | Cola de envío visible: qué falta mandar, tamaño, reintentar o mandar por wifi | Control del dato | App | P1 | S | Hecho |
| F-19 | Uso de almacenamiento y borrar fotos ya subidas | Celulares de 32 GB | App | P2 | S | Hecho |
| F-20 | Selector de estancia en la app cuando hay más de una | Hoy se mezclan | App | P0 | S | Hecho |
| F-21 | Satélite y vigor (NDVI) en el mapa de la app, sin señal | El dueño en el campo | App | P0 | S | Hecho |
| F-22 | "¿Te sirvió?" en los avisos de la app | Métrica de avisos | App | P1 | S | Hecho |
| F-23 | Ficha del lote en la app: últimas anotaciones, vigor, lluvia del mes, tareas | Contexto antes de anotar | App | P1 | M | Hecho |
| F-24 | Ingreso por teléfono y PIN además del QR | Pregunta abierta del PRD | App, API | P2 | M | Hecho |
| F-25 | Celular compartido: cambiar de usuario sin perder lo pendiente | Un celular por cuadrilla | App | P2 | M | Hecho |
| F-26 | Mapa sin conexión de varias estancias y de zonas de camino | Viajes entre campos | App | P2 | M | Parcial (hecho: varias estancias en fila con tope de LIMITS.offline.maxMapBytes; faltan las zonas de camino: sin mapa de fondo de caminos no hay qué bajar, depende de M-15 y su ADR de OpenStreetMap) |
| F-27 | Lector de caravanas electrónicas (RFID) por Bluetooth | Ganadería (ver G-21) | App | P3 | L | Falta |
| F-28 | Escanear código QR de un punto de interés pegado en un bebedero o silo para anotar ahí | Anotar sin buscar | App | P2 | S | Hecho |
| F-29 | Modo "solo lectura" para el dueño en la app con todos los lotes | Hoy la app está pensada para el empleado | App | P1 | M | Hecho |
| F-30 | Mensaje de texto (SMS) de emergencia con coordenadas si no hay datos pero hay señal de voz | Accidentes y fuego | App | P3 | S | Hecho |

---

## 4. Agricultura

| ID | Qué | Por qué | Dónde | Prio | Esf | Estado |
|---|---|---|---|---|---|---|
| A-01 | Campañas (zafra, zafriña, invierno) con cultivo, variedad, fecha y densidad de siembra por lote | La unidad de análisis del productor | Web, App | P1 | M | Hecho |
| A-02 | Rotación histórica por lote: qué se sembró cada campaña | Planificación y certificaciones | Web | P1 | S | Hecho |
| A-03 | Plan de siembra de la campaña: superficie por cultivo y variedad | Compras de semilla | Web | P2 | M | Hecho |
| A-04 | Fenología estimada por grados-día (NASA POWER) y comparación con lo observado | Saber en qué estado está el cultivo | Web, Jobs | P2 | M | Hecho |
| A-05 | Ventana de siembra según humedad del suelo y pronóstico | Decisión clave en soja | Web | P2 | M | Hecho |
| A-10 | Aplicaciones fitosanitarias: producto, dosis, volumen, lotes, operario, máquina | Registro obligatorio de hecho | Web, App | P1 | M | Hecho |
| A-11 | Receta agronómica del ingeniero que se convierte en orden de trabajo | Flujo agrónomo → campo | Web, App | P1 | M | Hecho |
| A-12 | Condiciones al aplicar: viento, temperatura, humedad y Delta T, guardadas con el registro | Calidad y deriva | App | P1 | S | Hecho |
| A-13 | Ventanas para pulverizar en el pronóstico (horas aptas por viento y Delta T) | Ahorro y eficacia | Web, App | P1 | M | Hecho |
| A-14 | Período de carencia y reingreso por producto, con aviso antes de cosechar | Seguridad y residuos | Web, App | P2 | S | Hecho |
| A-15 | Zonas de amortiguación cerca de casas, escuelas y cursos de agua, con aviso | Cumplimiento ambiental | Web | P2 | M | Hecho |
| A-16 | Fertilización: producto, kg/ha, momento y método | Costo y nutrición | Web, App | P1 | S | Hecho |
| A-20 | Cosecha por lote: toneladas, humedad, descuentos, rinde por hectárea | El resultado final | Web, App | P1 | M | Hecho |
| A-21 | Importar mapas de rendimiento de la cosechadora (shapefile) | Variabilidad real | Web, Jobs | P2 | L | Hecho |
| A-22 | Comparar rinde con vigor satelital por zona del lote | Validar las zonas | Web | P3 | M | Hecho |
| A-23 | Entregas a acopio: ticket de balanza, silo, humedad, descuentos | Cerrar el ciclo con la venta | Web | P2 | M | Hecho |
| A-30 | Análisis de suelo: cargar resultados de laboratorio por punto o lote | Fertilidad | Web | P2 | M | Hecho |
| A-31 | Mapas de fertilidad interpolados (pH, fósforo, potasio, materia orgánica) | Prescripción | Web, Jobs | P3 | L | Hecho |
| A-32 | Zonas de manejo a partir de varias campañas de vigor | Agricultura de precisión básica | Web, Jobs | P2 | L | Hecho |
| A-33 | Prescripción de dosis variable exportable a la maquinaria (shapefile o ISOXML) | Ahorro de insumos | Web, Jobs | P3 | L | Hecho |
| A-40 | Alerta de roya asiática por horas de mojado foliar y temperatura | Enfermedad clave en soja | API, Jobs | P2 | M | Hecho |
| A-41 | Umbral de daño económico por plaga con aviso cuando el monitoreo lo supera | Manejo integrado de plagas | API | P1 | S | Hecho |
| A-42 | Mapa de focos de plaga del último mes sobre los lotes | Ver la dispersión | Web | P1 | S | Hecho |
| A-43 | Riego: láminas aplicadas y balance hídrico por lote | Para quien riega | Web | P3 | M | Hecho |

---

## 5. Ganadería

| ID | Qué | Por qué | Dónde | Prio | Esf | Estado |
|---|---|---|---|---|---|---|
| G-01 | Rodeo por potrero: cantidad por categoría (vacas, vaquillas, novillos, terneros, toros) | Lo primero que pregunta el ganadero | Web, App | P1 | M | Hecho |
| G-02 | Movimientos entre potreros, con fecha y cantidad, desde la app | El dato que hoy se pierde | App, Web | P1 | M | Hecho |
| G-03 | Carga animal (UA/ha) por potrero y estancia, con alerta de sobrecarga | Decisión diaria | Web | P1 | S | Hecho |
| G-04 | Rotación de potreros: días de ocupación y descanso, próximo potrero sugerido | Pastoreo planificado | Web, App | P2 | M | Hecho |
| G-05 | Oferta de pasto estimada con satélite y altura medida | Cuánto comen y cuánto queda | Web, Jobs | P2 | L | Hecho |
| G-06 | Conteo rápido de animales en la app (contador grande con categorías) | Recuento en la manga | App | P1 | S | Hecho |
| G-10 | Calendario sanitario: aftosa (campañas oficiales), brucelosis, carbunclo, garrapata, desparasitación | Obligaciones y pérdidas | Web, App | P1 | M | Hecho |
| G-11 | Registro de tratamientos con producto, dosis, animales y carencia | Trazabilidad | App, Web | P1 | M | Hecho |
| G-12 | Mortandad con causa y foto | Pérdidas visibles | App | P1 | S | Hecho |
| G-13 | Abigeato: registro de faltantes y denuncias | Problema frecuente en Paraguay | App, Web | P2 | S | Hecho |
| G-20 | Reproducción: servicio, tacto, preñez, parición, destete, con índices | Eficiencia del rodeo de cría | Web, App | P2 | L | Hecho |
| G-21 | Identificación individual por caravana, con historial por animal | Ganadería de precisión | Web, App | P2 | L | Hecho |
| G-22 | Pesadas y ganancia diaria de peso por lote de animales | Engorde | Web, App | P2 | M | Hecho |
| G-23 | Integración con la trazabilidad oficial (SITRAP o el sistema vigente) | Exportación | API | P3 | L | Falta |
| G-30 | Aguadas: nivel de tajamares, bebederos y molinos con alerta de seca | Sequía en el Chaco | App, Web | P1 | S | Hecho |
| G-31 | Suplementación y sal mineral: consumo por potrero | Costo | App, Web | P2 | S | Hecho |
| G-32 | Índice de estrés térmico del ganado (temperatura y humedad) con aviso | Olas de calor | API | P2 | S | Hecho |
| G-33 | Feedlot: raciones, consumo y conversión | Engorde intensivo | Web | P3 | L | Hecho |
| G-40 | Compras y ventas de hacienda con guías de traslado | Movimiento de dinero | Web | P2 | M | Hecho (con E-35) |

---

## 6. ERP sencillo de campo

Un ERP liviano, pensado para un administrador y un contador externo, no para reemplazar un sistema contable.
Todo movimiento se cuelga de una estancia, un lote o potrero y una campaña, así el costo por hectárea sale solo.
Todo lo que se registra en el campo (aplicación, cosecha, movimiento de hacienda) alimenta el ERP sin cargarlo dos veces.

**6.1 Datos maestros**

| ID | Qué | Prio | Esf | Estado |
|---|---|---|---|---|
| E-01 | Productos e insumos: semillas, agroquímicos (principio activo, clase toxicológica, carencia), fertilizantes, combustible, sales, vacunas | P1 | M | Hecho |
| E-02 | Proveedores y clientes (con RUC) | P1 | S | Hecho |
| E-03 | Maquinaria y vehículos: tipo, marca, año, horómetro u odómetro | P1 | S | Hecho |
| E-04 | Contratistas (siembra, pulverización, cosecha, flete) con tarifas | P1 | S | Hecho |
| E-05 | Centros de costo: estancia, actividad (agricultura, ganadería, administración), lote, campaña | P1 | S | Hecho |
| E-06 | Monedas guaraní y dólar con tipo de cambio diario | P1 | S | Hecho |

**6.2 Inventario**

| ID | Qué | Prio | Esf | Estado |
|---|---|---|---|---|
| E-10 | Depósitos por estancia (galpón, tanque de combustible, silo) | P1 | S | Hecho |
| E-11 | Entradas por compra, salidas por consumo, transferencias entre depósitos | P1 | M | Hecho |
| E-12 | Lote y vencimiento de agroquímicos y vacunas, con aviso | P1 | S | Hecho |
| E-13 | Consumo automático: una aplicación o tratamiento registrado descuenta stock y carga costo al lote | P1 | M | Hecho |
| E-14 | Stock mínimo con aviso de reposición | P2 | S | Hecho |
| E-15 | Recuento físico desde la app (inventario de galpón) | P2 | M | Hecho |
| E-16 | Combustible: carga por máquina, litros por hora y por hectárea | P1 | M | Hecho |

**6.3 Labores y maquinaria**

| ID | Qué | Prio | Esf | Estado |
|---|---|---|---|---|
| E-20 | Órdenes de trabajo: labor, lotes, superficie, insumos, máquina, operario o contratista | P1 | M | Hecho |
| E-21 | Cierre de la orden desde la app con superficie hecha y consumos reales | P1 | M | Hecho |
| E-22 | Mantenimiento preventivo por horas o kilómetros, con historial de reparaciones | P2 | M | Hecho |
| E-23 | Costo de labor propia (combustible, operario, amortización) frente a contratista | P2 | M | Hecho |

**6.4 Personal**

| ID | Qué | Prio | Esf | Estado |
|---|---|---|---|---|
| E-25 | Asistencia y jornales por día, con lote o labor | P2 | M | Hecho |
| E-26 | Adelantos, pagos y saldo por empleado | P2 | M | Hecho |
| E-27 | Planilla simple exportable para el contador (sin cálculo de aportes, que lo hace el contador) | P3 | M | Hecho |

**6.5 Compras, ventas y tesorería**

| ID | Qué | Prio | Esf | Estado |
|---|---|---|---|---|
| E-30 | Costo por hectárea, por tonelada y por kilo de carne, por lote y campaña | P1 | M | Hecho |
| E-31 | Margen bruto por lote, cultivo, actividad y campaña | P1 | M | Hecho |
| E-32 | Presupuesto de campaña y comparación con lo real | P2 | M | Hecho |
| E-33 | Compras: orden, factura de proveedor, recepción en depósito | P2 | M | Hecho |
| E-34 | Ventas de granos: contratos, entregas, precio, liquidaciones | P2 | M | Hecho |
| E-35 | Ventas y compras de hacienda: cabezas, kilos, precio, guía | P2 | M | Hecho |
| E-36 | Caja y bancos por moneda, cuentas a pagar y a cobrar con vencimientos | P2 | L | Hecho |
| E-37 | Adjuntar foto de la factura o ticket a cualquier movimiento | P1 | S | Hecho |
| E-38 | Exportar al contador (Excel con plan de cuentas configurable) | P2 | M | Hecho |
| E-39 | Factura electrónica (SIFEN) para ventas, vía proveedor homologado | P3 | L | Falta |
| E-40 | Precios de referencia de granos y hacienda en la ficha de margen (fuente con licencia, necesita ADR) | P3 | M | Falta |

---

## 7. Clima y riesgo

| ID | Qué | Por qué | Dónde | Prio | Esf | Estado |
|---|---|---|---|---|---|---|
| C-01 | Pronóstico de 10 días por estancia | Base | Web | — | — | Hecho |
| C-02 | Pronóstico de 10 días en la app, sin señal con la última descarga | El empleado también decide | App | P1 | S | Hecho |
| C-03 | Pronóstico por lote en estancias de más de 2.000 ha (RF-61) | Variación interna | Jobs, Web | P2 | M | Hecho |
| C-04 | Avisos configurables: el usuario elige umbrales (helada a 2 °C, lluvia de 50 mm) | Cada cultivo es distinto | Web, API | P1 | M | Hecho |
| C-05 | Comparar los pluviómetros propios con el satélite y con la normal | Confianza en el dato | Web | P1 | S | Hecho |
| C-06 | Acumulado por campaña y por mes en la ficha del pluviómetro | Pregunta diaria | Web, App | P1 | S | Hecho |
| C-07 | Índice de sequía estandarizado (SPI) a 1, 3 y 6 meses | Sequía con números | Jobs, Web | P2 | M | Hecho |
| C-08 | Balance hídrico simple por lote (lluvia menos consumo del cultivo) | Riesgo de estrés | Jobs, Web | P2 | M | Hecho |
| C-09 | Informe de daños con fecha, evidencia satelital y fotos para el seguro agrícola | Cobrar el seguro | Web | P2 | M | Hecho |
| C-10 | Informe de riesgo climático del campo: heladas por año, lluvia frente a la normal, sequías, focos de fuego, a partir de 30 años de NASA POWER | Imán de clientes y para el banco | Web, Jobs | P1 | M | Hecho |
| C-11 | Estaciones meteorológicas propias (Davis u otras) conectadas | Productores grandes | API | P3 | L | Falta |
| C-12 | Sensores de nivel de tanque o tajamar (LoRa) | Ganadería extensiva | API | P3 | L | Falta |

---

## 8. Satélite

| ID | Qué | Por qué | Dónde | Prio | Esf | Estado |
|---|---|---|---|---|---|---|
| S-01 | Al crear la estancia, procesar los últimos 6 meses de Sentinel-2 | Curva de campaña desde el primer día | Jobs, API | P0 | M | Hecho |
| S-02 | Disparar los jobs desde el Worker (GitHub `workflow_dispatch`) al crear la estancia, con estado "procesando" | No esperar al cron | API, Web | P0 | S | Hecho |
| S-03 | Historia desde 2017 a pedido: vigor de campañas anteriores | Comparar años | Jobs, Web | P2 | M | Hecho |
| S-04 | Selector de fecha con miniaturas y comparación de dos fechas con cortina | Ver el cambio | Web | P1 | M | Hecho |
| S-05 | Vigor actual por lote en la tabla, con color de la rampa NDVI | Ver todo de un vistazo | Web | P0 | S | Hecho |
| S-06 | Lotes con caída de vigor mayor a 15 % entre dos pasadas (RF-54), con aviso | Encontrar el problema temprano | API, Web | P1 | S | Hecho |
| S-07 | Otros índices: NDRE (nitrógeno), NDMI (humedad), EVI | Más diagnóstico | Jobs, Web | P2 | M | Hecho |
| S-08 | Áreas problema dentro del lote (pixeles muy por debajo de la mediana) marcadas para ir a ver | Recorrida dirigida | Jobs, Web, App | P1 | M | Hecho (web; en la app llega por S-09) |
| S-09 | Enviar esas áreas como tarea al empleado con el punto en la app | Del satélite al campo | Web, App | P1 | S | Hecho |
| S-10 | Animación de la campaña (timelapse) | Impacto en presentaciones | Web | P3 | M | Hecho |
| S-11 | Lotes finos: usar todos los pixeles tocados o avisar que el dato no es confiable | Calidad | Jobs | P2 | S | Hecho |
| S-12 | Imágenes en días nublados con Sentinel-1 radar (necesita ADR) | Verano lluvioso | Jobs | P3 | L | Falta |
| S-20 | Área quemada después de un foco de fuego | Pérdidas en el Chaco | Jobs, Web | P2 | M | Hecho |
| S-30 | Informe de libre deforestación posterior a 2020 para la regulación europea (EUDR), por lote, con la imagen de referencia | Requisito para exportar soja y carne a Europa | Jobs, Web | P1 | L | Hecho |
| S-31 | Cambio de cobertura (monte a pastura o cultivo) entre dos fechas | Cumplimiento ambiental y bancos | Jobs, Web | P2 | M | Hecho |

---

## 9. Tareas, equipo y supervisión

| ID | Qué | Prio | Esf | Estado |
|---|---|---|---|---|
| T-01 | Asignar tarea tocando lotes en el mapa | P1 | S | Hecho |
| T-02 | Prioridad, fecha límite con hora y comentarios en la tarea | P1 | S | Parcial |
| T-03 | Foto y ubicación obligatorias para cerrar ciertas tareas | P2 | S | Hecho |
| T-04 | Calendario semanal de labores por estancia | P2 | M | Hecho |
| T-05 | Tareas vencidas por empleado con contador en Equipo | P1 | S | Parcial |
| T-06 | Actividad del empleado: días activos, registros, lotes visitados, última conexión | P1 | S | Parcial |
| T-07 | Lotes sin visitar hace más de N días, en la web | P1 | S | Parcial (solo app) |
| T-08 | Comentarios y menciones en registros ("@Ramón mirá esto") | P2 | M | Hecho |
| T-09 | Supervisor por estancia con permisos intermedios (capataz) | P2 | M | Hecho |

---

## 10. Reportes

| ID | Qué | Prio | Esf | Estado |
|---|---|---|---|---|
| R-01 | Parte semanal PDF | — | — | Hecho |
| R-02 | Parte semanal por email los lunes con el PDF adjunto | P1 | M | Hecho |
| R-03 | Resumen de campaña por lote en PDF (RF-81): siembra, aplicaciones, lluvia, vigor, cosecha | P1 | M | Hecho |
| R-04 | Informe para el banco: superficie, historia productiva, vigor, clima, sin deforestación | P1 | M | Hecho |
| R-05 | Informe de auditoría para certificaciones (soja responsable, buenas prácticas) | P2 | M | Hecho |
| R-06 | Tablero del dueño: superficie por cultivo, lluvia, avisos, actividad, margen | P1 | M | Parcial |
| R-07 | Comparación entre estancias y entre campañas | P2 | M | Hecho |
| R-08 | Comparación anónima con la zona (vigor y lluvia de campos vecinos) | P3 | M | Hecho |
| R-09 | Exportación completa de la organización (Excel, KML, fotos en ZIP) | P1 | M | Hecho |
| R-10 | Informes programados por email a terceros (socio, agrónomo, banco) | P2 | S | Hecho |

---

## 11. Colaboración y acceso

| ID | Qué | Prio | Esf | Estado |
|---|---|---|---|---|
| K-01 | Selector de organización para agrónomos con varios clientes | P0 | S | Hecho |
| K-02 | Vista del agrónomo: todos sus clientes en un mapa con avisos | P1 | M | Hecho |
| K-03 | Contratista externo con acceso a ciertos lotes y tareas | P2 | M | Hecho |
| K-04 | Enlace temporal de solo lectura para un banco, auditor o comprador | P1 | S | Hecho |
| K-05 | Permisos finos por estancia | P2 | M | Hecho |
| K-06 | Registro de auditoría: quién cambió qué y cuándo | P2 | M | Hecho |
| K-10 | Compartir un registro por WhatsApp: texto, foto y ubicación | P1 | S | Hecho |
| K-11 | Compartir el parte semanal y avisos por WhatsApp | P1 | S | Hecho |
| K-12 | Cargar registros por WhatsApp (bot que recibe lluvia, foto y ubicación) | P3 | L | Falta |
| K-13 | Avisos por WhatsApp además de push y email (WhatsApp Business, tiene costo) | P2 | M | Falta |

---

## 12. Integraciones

| ID | Qué | Prio | Esf | Estado |
|---|---|---|---|---|
| I-01 | API pública con tokens por organización | P2 | M | Hecho |
| I-02 | Webhooks (aviso nuevo, registro nuevo) | P3 | S | Hecho |
| I-03 | Plataformas de maquinaria (John Deere Operations Center y similares): lotes, labores, rindes | P3 | L | Falta |
| I-04 | Calendario (Google, Outlook) para tareas | P3 | S | Hecho |
| I-05 | Balanzas y lectores de caravanas | P3 | L | Falta |
| I-06 | Sistemas contables locales (exportación con formato) | P3 | M | Hecho |
| I-07 | Pasarela de pago local (Bancard u otra) | P2 | M | Falta |

---

## 13. Plataforma, seguridad y operación

| ID | Qué | Prio | Esf | Estado |
|---|---|---|---|---|
| P-01 | Producción en dominio propio con email de ingreso verificado | P0 | S | Falta (credenciales) |
| P-02 | Monitoreo de errores (Sentry) en web, app y Worker | P1 | S | Hecho |
| P-03 | Analítica de producto: qué pantallas se usan, embudo de activación | P1 | S | Parcial (métricas del PRD) |
| P-04 | Página de estado del servicio | P3 | S | Hecho |
| P-05 | Copias de seguridad verificadas con restauración probada | P1 | S | Parcial |
| P-06 | Archivado de datos viejos de D1 a R2 | P2 | M | Hecho |
| P-07 | Ingreso con Google | P2 | S | Hecho |
| P-08 | Segundo factor para dueños | P3 | S | Hecho |
| P-09 | Baja de la cuenta y borrado de datos | P1 | S | Hecho |
| P-10 | Planes con límites por hectáreas y usuarios, y cambio de plan desde la web | P1 | M | Parcial (manual) |
| P-11 | Facturación y cobro recurrente | P2 | M | Falta |
| P-12 | Panel interno: buscar organización, entrar como soporte en modo lectura, extender prueba | P1 | M | Parcial |
| P-13 | Rechazar fechas imposibles y guardar fecha de recepción | — | — | Hecho |
| P-14 | Límite de envío de códigos por conexión | — | — | Hecho |
| P-20 | Pruebas automáticas de la app en un Android real (Maestro) | P1 | M | Falta |
| P-21 | Pruebas de carga del sync con 10 empleados y 1.000 registros | P1 | S | Hecho |
| P-30 | Publicar en Play Store (cuenta de desarrollador) | P1 | S | Falta (cuenta) |
| P-31 | Actualización de la app sin tienda (EAS Update) | P2 | S | Hecho |
| P-32 | Versión iOS para dueños y agrónomos | P3 | M | Falta |

---

## 14. Comercial y crecimiento

| ID | Qué | Prio | Esf | Estado |
|---|---|---|---|---|
| V-01 | Landing pública con la promesa, precio por hectárea, WhatsApp y descarga | P0 | M | Hecho |
| V-02 | Demo pública de solo lectura con una estancia de ejemplo | P0 | S | Hecho |
| V-03 | Términos de uso, política de privacidad y tratamiento de datos | P0 | S | Hecho |
| V-04 | Informe gratis de riesgo climático y vigor a cambio del email (usa C-10 y S-01) | P1 | M | Hecho (riesgo climático; el vigor espera S-01 y el dibujo del campo se reemplazó por coordenadas) |
| V-05 | Programa para agrónomos: cuenta gratis o comisión por cliente que traen | P1 | S | Hecho |
| V-06 | Referidos entre productores | P2 | S | Hecho |
| V-07 | Casos de éxito con números del piloto | P1 | S | Falta |
| V-08 | Video de 2 minutos de la historia completa | P0 | S | Falta |
| V-09 | Calculadora de precio en la landing | P2 | S | Hecho |
| V-10 | Academia: videos cortos por función, en español y guaraní | P2 | M | Hecho |

---

## 15. Inteligencia artificial

Dos familias. **IA local**: el modelo corre en el celular o en el job de Python, sin costo por uso y, en la app,
sin señal. **IA en la nube**: modelos de lenguaje con costo por uso; conviene cuando haya clientes pagando.

Hoy existe solo la **maqueta** de algunas (pantallas "Laboratorio" en la web y en la app, con ejemplos ilustrativos
y el aviso de que están en desarrollo). Ninguna analiza datos reales todavía.

**Cómo se haría la IA local**

- **App:** modelos chicos cuantizados (TensorFlow Lite o ONNX Runtime Mobile, de 5 a 20 MB) que se bajan junto
  con el mapa sin conexión. La inferencia corre en el celular en menos de 2 segundos en gama baja.
- **Web y drones:** el ortomosaico se sube a R2 y un job de Python (GitHub Actions, sin GPU) lo procesa por
  teselas con un detector tipo YOLO. Ortomosaicos grandes necesitan un runner con más memoria.
- **Datos para entrenar:** fotos etiquetadas por agrónomos de los pilotos (consentimiento en los términos),
  más bases públicas de enfermedades de soja. Cada modelo necesita su ADR con licencia, precisión medida y
  qué pasa cuando se equivoca.
- **Regla de producto:** la IA sugiere, no decide. Todo resultado dice su nivel de confianza, pide confirmación
  humana y se guarda como registro normal solo cuando el usuario lo acepta.

**App (en el celular, sin señal)**

| ID | Qué | Por qué | Prio | Esf | Estado |
|---|---|---|---|---|---|
| X-01 | Detector de roya asiática y otras enfermedades de la hoja de soja por foto, con severidad estimada | Detectar temprano la enfermedad que más cuesta | P2 | L | Maqueta |
| X-02 | Conteo de chinches y orugas en el paño vertical por foto, comparado con el umbral de daño | Monitoreo más rápido y parejo | P2 | L | Maqueta |
| X-03 | Cobertura y altura estimada del pasto por foto | Oferta forrajera sin regla | P2 | M | Maqueta |
| X-04 | Condición corporal de la vaca por foto (escala 1 a 5) | Manejo del rodeo de cría | P3 | L | Maqueta |
| X-05 | Nota de voz que se convierte en registro (reconocimiento de voz en el celular) | El peón prefiere hablar | P2 | M | Maqueta |
| X-06 | Identificación de malezas por foto (capín, buva, amargo) con sugerencia de control | Malezas resistentes | P3 | L | Maqueta |
| X-07 | Lectura de caravanas visuales y de etiquetas de productos por foto | Carga sin tipear | P3 | M | Maqueta |
| X-08 | Estado fenológico de la soja o el maíz por foto | Fenología sin experto | P3 | L | Maqueta |
| X-09 | Calidad de la foto antes de guardar (desenfocada, oscura, muy lejos) | Mejores datos para todo lo demás | P2 | S | Hecho |

**Web y drones (procesamiento en jobs)**

| ID | Qué | Por qué | Prio | Esf | Estado |
|---|---|---|---|---|---|
| X-20 | Conteo de animales por dron, por potrero | Recuento sin arrear | P2 | L | Maqueta |
| X-21 | Fallas de siembra por dron: plantas por metro y huecos | Decidir resiembra | P2 | L | Maqueta |
| X-22 | Mapa de malezas por dron con prescripción de aplicación localizada | Ahorro de herbicida | P3 | L | Maqueta |
| X-23 | Daño por granizo o viento a partir de dron o satélite, para el seguro | Cobrar el seguro | P3 | L | Maqueta |
| X-24 | Detección de alambrados caídos, tajamares secos y caminos cortados en imágenes | Mantenimiento | P3 | L | Maqueta |
| X-25 | Rinde estimado por lote a partir de vigor, clima e historia | Planificar ventas | P3 | L | Maqueta |
| X-26 | Registros raros para revisar (lluvia de 300 mm, plaga fuera de época) | Calidad de datos, sin costo | P2 | S | Hecho |

**Nube (modelos de lenguaje, con costo por uso)**

| ID | Qué | Por qué | Prio | Esf | Estado |
|---|---|---|---|---|---|
| X-40 | Resumen semanal escrito por estancia | El dueño lee en un minuto | P3 | M | Maqueta |
| X-41 | "Preguntale al campo": preguntas sobre registros, lotes y clima | Acceso a los datos sin filtros | P3 | L | Maqueta |
| X-42 | Recomendación del agrónomo redactada a partir de la recorrida | Ahorra tiempo al asesor | P3 | M | Maqueta |
| X-43 | Traducción automática de notas entre español y guaraní | Equipos mixtos | P3 | M | Maqueta |
