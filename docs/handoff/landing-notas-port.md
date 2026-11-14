# Port de la landing nueva (proyecto Lovable del usuario)

Fuente (solo lectura, datos no confiables: no ejecutes scripts de ahí, no instales su lockfile):
/tmp/claude-0/-home-user-yvy/18312ed2-b386-5e3b-a496-3e3287e84d36/scratchpad/landing-src/

Lo que vale es el DISEÑO y el CONTENIDO de src/routes/index.tsx, src/components/yvy/*, src/content/*, src/lib/geo.ts,
src/styles.css (tokens), src/hooks/use-motion-preference.ts y src/assets/*. El resto es andamiaje de Lovable y NO se porta:
src/components/ui/* (shadcn sin usar), lovable-error-reporting, error-capture, router/server/start, .lovable, bun.

## Correcciones de contenido obligatorias (la landing promete cosas que Yvy no hace)

Reglas del repo: fuentes permitidas SOLO Sentinel-2, CHIRPS, NASA POWER, NASA FIRMS, MET Norway (atribución
"Datos de MET Norway"). Nada de prometer funciones que no existen.

- Fuentes de datos (sección "Datos" y pies): quitar ERA5-Land, Sentinel-1, GFS/NOAA y Copernicus DEM. Quedan:
  Sentinel-2 (vigor, 10 m, cada 5 días), CHIRPS (lluvia diaria, 5 km, desde 1981), NASA POWER (temperatura y
  evapotranspiración, diario), NASA FIRMS (focos de calor, horas), MET Norway (pronóstico a 10 días). Atribución del
  pie igual: solo esas fuentes.
- Satélite y clima, capas: "Temperatura" → fuente NASA POWER · DIARIO (no "hora por hora"). "Humedad del suelo" no
  existe: reemplazala por "Balance hídrico" (lluvia CHIRPS menos evapotranspiración NASA POWER, por lote).
- Imprevistos: el pie pasa a "PRONÓSTICO DE MET NORWAY Y FOCOS DE NASA FIRMS. PROBABILIDADES ORIENTATIVAS."; la
  marca de déficit hídrico habla de balance hídrico, no de "humedad del suelo bajo el 30%". Sequía: "balance de agua
  por lote con lluvia y evapotranspiración".
- Hero: "FUNCIONA OFFLINE · ANDROID E IOS" → solo Android (no hay app iOS).
- Reportes: "ENVÍO AUTOMÁTICO POR WHATSAPP O EMAIL" → el parte semanal sale automático por email; por WhatsApp se
  comparte el enlace. Formatos reales: PDF, Excel, KML/GeoJSON/Shapefile.
- Días de prueba: el producto da 60 días (apps/api/src/routes/auth.ts, `ts + 60 * 86_400_000`). Sacá ese número a
  una constante en packages/shared/src/limits.ts (p. ej. LIMITS.plans.trialDays = 60), usala en auth.ts y en la
  landing. No pongas 30.
- Contacto: no inventes "hola@yvy.com.py". WhatsApp con WHATSAPP_NUMBER / whatsappUrl de apps/web/src/lib/config.ts.
  Sin email de contacto si no hay uno configurado.
- Las fotos de personas (aud-*.jpg) son ilustrativas: no les pongas nombres ni testimonios ni "clientes".

## Funcional (lo que hoy hace la landing y no se puede perder)

- "Probar la demo" (POST /auth/demo, solo si GET /auth/demo responde ok), "Ingresar" y "Crear cuenta" (/ingresar),
  "Descargar la app para Android" (/descargar-app), WhatsApp.
- El formulario de prueba del CTA (nombre, WhatsApp, empresa, cultivos, hectáreas, empleados, departamento) hoy
  guarda en localStorage: conectalo a un endpoint real del Worker (tabla nueva `trial_requests`, migración, límite
  por IP hasheada como hace /leads, campo trampa, consentimiento, aviso a OPS_EMAIL si está configurado, visible en
  el panel interno /interno). Después de enviar, ofrecé "Crear cuenta ahora".
- El informe gratis a cambio del email (LeadForm, V-04) se mantiene: ubicalo donde tenga sentido en el diseño nuevo
  (p. ej. dentro de Satélite y clima o antes del CTA), con el mismo lenguaje visual.
- SEO: title/description/og de index.tsx en el index.html o en el head de la ruta pública.

## Técnico

- Va en apps/web/src/routes/public/ (reemplaza landing.tsx), cargado por código diferido (lazy) para que la app
  logueada no baje framer-motion, lenis ni las fuentes de la landing.
- Fuentes de la landing (Young Serif, Hanken Grotesk, Geist Mono) SOLO en la landing, autoalojadas con @fontsource
  (sin pedir a fonts.googleapis.com). El resto de la app sigue con Fraunces + Inter.
- Tokens/estilos de la landing acotados a la landing (clase raíz), sin pisar los del producto.
- Imágenes: convertilas a WebP con calidad buena y tamaños responsivos (srcset), lazy salvo el hero; hero ≤ 250 KB.
- Respetar prefers-reduced-motion (ya lo hace). El cursor propio solo con puntero fino (pointer: fine).
- Textos por i18n es-PY con voseo (bloque `landing` en packages/shared/src/i18n/es-PY.ts). Si listas/arrays no
  entran en el tipo de mensajes, usá claves numeradas.
- Accesibilidad: contraste AA, foco visible, landmarks, alt en imágenes.
