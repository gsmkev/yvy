# Yvy · Brief de rediseño UI/UX (web y app)

El producto funciona, pero la interfaz se siente armada por acumulación: cada ítem del backlog agregó su botón, su
pestaña y su subtítulo, y nadie ordenó el conjunto. El objetivo no es "más lindo": es que un productor encuentre lo que
necesita en 2 clics, que la pantalla diga una cosa por vez y que nada parezca una plantilla genérica.

Referentes de criterio (no copiar): Linear (jerarquía y densidad), Climate FieldView / Auravant (mapa como protagonista,
herramientas que no tapan), Stripe Dashboard (tablas, menús de acción, estados vacíos útiles).

## Reglas de diseño (obligatorias)

1. **Un primario por pantalla.** Un solo botón relleno (soja). Lo demás: botón secundario, o adentro de un menú "Más"
   (icono de tres puntos) o "Exportar". Nunca 6 botones en fila.
2. **Nada de texto de relleno.** Fuera los subtítulos que repiten el título ("Productos, depósitos, stock…", "Los
   últimos 30 días…"). Un texto de ayuda solo si cambia lo que la persona hace, y entonces corto y en el lugar.
3. **Sin pills, badges, eyebrows en mayúscula ni iconos decorativos.** Íconos solo cuando reemplazan texto en una
   herramienta conocida (zoom, medir, capas, más, cerrar) y siempre con `aria-label` y tooltip.
4. **Metadatos solo si informan.** No mostrar valores por defecto ("No se repite", "Comentarios (0)", "Prioridad
   normal"). Fechas relativas cuando importa la urgencia ("Vence hoy", "Venció hace 2 días"); absolutas en tablas.
5. **Navegación que escala.** Ningún menú horizontal con más de 6 elementos ni pestañas que se corten. Más de 6 →
   navegación lateral agrupada o menú. Pestañas que no entran → desplazables con borde que se desvanece, o "Más".
6. **El mapa es el protagonista.** Los controles no lo tapan: una barra de herramientas compacta con íconos y un
   panel "Capas" que se abre y se cierra. En celular todo arranca cerrado.
7. **Tipografía y ritmo.** Fraunces solo en títulos de página (no en secciones chicas). Inter para todo lo demás. Escala:
   título 28/32, sección 18/24, cuerpo 14/20, meta 12/16. Espaciado en múltiplos de 4. Alineación consistente a una grilla.
8. **Paleta de marca, con contraste AA.** lino #F1EEE4 (fondo), surco #1E2419 (texto/tinta), soja #7A9A3F (acción),
   trigo #D9A93A, cielo #8DB3C7, alerta #D2462B. Rojo solo para lo que pide acción ya. Estados de sync: pendiente =
   borde punteado trigo, sincronizado = sólido soja.
9. **Formato es-PY en todo.** `lang="es-PY"` en el HTML; fechas dd/mm/aaaa (no el input nativo en mm/dd), números con
   coma decimal y punto de miles, guaraníes sin decimales.
10. **Estados completos.** Cargando (esqueleto del mismo alto), vacío (qué es y la acción para salir del vacío, no una
    frase suelta en una página en blanco), error (qué pasó y qué hacer). Las secciones que no aplican no se muestran
    (ej. "Comparar" con una sola estancia, "Sanidad" sin hacienda).
11. **Accesible.** Foco visible, objetivos de 40 px mínimo (48 en el celular), contraste AA, etiquetas en todo control.
12. **Verificá mirando.** Cada cambio se revisa con captura de pantalla (Playwright) en 1440×900 y 390×844 antes y
    después. Si no lo viste renderizado, no está terminado.

## Hallazgos en producción (capturas del 12/11, cuenta demo)

### Web · global
- Barra superior con 10 secciones + buscador + organización. No escala y en celular queda "Mapa, Registros" y nada más.
- `<input type="date">` muestra mm/dd/yyyy (falta `lang="es-PY"` y un selector propio).
- Subtítulos genéricos debajo de los títulos en Administración, Comparar y otras.
- "Exportar Excel" y "Exportar CSV" como dos botones de texto encima de cada tabla (U-28), a veces duplicados (ficha de
  la estancia los muestra dos veces). Debe ser un solo menú "Exportar" chico en la barra de la tabla.

### Web · Mapa / estancia
- Siete cajas apiladas a la izquierda (Medir, Satélite/Vigor, Fecha, Departamentos/Distritos, Capas propias, Plagas,
  Recorridas) tapan un tercio del mapa; en celular lo tapan entero.
- Franja vacía de ~37 px entre el encabezado y el mapa (el lienzo arranca más abajo que el contenedor).
- Etiquetas de lotes pisadas por los íconos de puntos de interés ("Lote 2 Maíz" con un ícono encima).
- Panel derecho: título partido en dos líneas, 9 acciones visibles (Imprimir, Nueva estancia, Nuevo lote, Importar,
  Agregar punto, Parte semanal, KML, GeoJSON, Shapefile), pestañas cortadas ("Clima" a medias), exportar duplicado.

### Web · otras pantallas
- Registros: puntos del mapa todos del mismo color (sin tipo ni agrupamiento); filtros de fecha en formato EE.UU.
- Tareas: cada fila repite "No se repite", "Comentarios (0)", "Borrar", "Abre el registro: …"; las hechas tachadas con
  todo su metadato; fechas absolutas sin urgencia.
- Administración: 15+ pestañas horizontales que se cortan ("Stock mínim…").
- Comparar: página en blanco con una frase cuando hay una sola estancia.

### App (Expo)
- Revisar con `expo start --web` + capturas y en el código: jerarquía de Hoy, Anotar, Historial, Mapa y Más; el mapa con
  controles que tapan; listas largas en Más (Laboratorio, Emergencia, idioma, solo lectura…) sin agrupar.
