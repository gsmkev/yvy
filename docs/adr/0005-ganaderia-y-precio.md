# ADR 0005 · Ganadería a fondo y precio para el ganadero

24 de noviembre de 2026. Sale del feedback de una productora ganadera (21/11): ampliar lo que ofrece la
ganadería (SENACSA, reproducción, carga, tipo de sistema) y un precio que tenga sentido para campos grandes,
cobrado por año o por ciclo, porque en la ganadería la plata entra por zafra y no por mes.

## Decisiones

### 1. Sistema productivo por estancia
`farm_livestock_settings.system`: `cria` (vende terneros) · `recria` · `invernada` · `ciclo_completo` ·
`feedlot` · `tambo`. Nulo = sin elegir (se pregunta una vez en la pestaña Hacienda). Cambia qué se muestra
primero y qué indicadores importan:

| Sistema | Lo que mira | Indicadores |
|---|---|---|
| Cría | vientres, servicio, tacto, parición, destete, venta de terneros | % preñez, % parición, % destete, kg de ternero destetado por ha |
| Recría / invernada | entradas, pesadas, ventas | ganancia diaria (GDP), kg producidos por ha y año, días en campo |
| Ciclo completo | todo lo anterior | los dos juegos |
| Feedlot | raciones, consumo, conversión | conversión, GDP, costo por kg |
| Tambo | (sin módulo propio todavía) | se muestra lo general |

### 2. Calendario oficial de SENACSA con recordatorios
`packages/shared/src/senacsa.ts`: campañas oficiales por año (vacunación contra la aftosa en dos períodos y
brucelosis de terneras en los mismos períodos), con desde, hasta, a quién alcanza y la fuente. Las fechas las
fija cada año una resolución de SENACSA y suelen prorrogarse, así que **son datos, no lógica**: se actualizan
con un cambio de código. 2026: 1.er período 17/02–28/03 (registro hasta 04/04); 2.º período mayo–26/06
(prorrogado). Para 2027 se carga lo que publique SENACSA; el país planea dejar de vacunar contra la aftosa
(2027–2028), así que la lista puede quedar sin aftosa sin tocar el resto.
- Las campañas aparecen en el calendario sanitario de cada estancia con hacienda, marcadas "Oficial · SENACSA".
- Recordatorios: aviso (push y email según preferencias) 14 días antes de que abra el período, al abrir, y
  7 días antes del cierre si la estancia no registró la vacunación. Un cron diario de la API los genera.
- "Planificar" desde la campaña crea el evento sanitario y las tareas, como hoy.
- *ponytail:* constantes en código; si cambian más de dos veces por año, pasar a una tabla editable en /interno.

### 3. Plan reproductivo
Estación de servicio por estancia (`breedingStart`, `breedingDays`, por defecto 1/11 y 90 días: parición de
agosto a octubre, con la mejor oferta de pasto). Del plan salen las fechas de cada etapa, como tareas y avisos:
preparación de vientres y revisación de toros (45 días antes), servicio, tacto (60 días después del fin del
servicio), parición (283 días después de cada día de servicio), destete (por defecto a los 7 meses) y
vacunación de terneras contra la brucelosis (3 a 8 meses). Texto de ayuda con por qué esa época, marcado como
orientativo (cada campo ajusta). Indicadores del ciclo con lo que ya se registra (tactos, pariciones, destetes).

### 4. Carga animal recomendada
Además del tope que ya existe (UA/ha), una referencia por tipo de pastura y época: campo natural 0,5 UA/ha,
pastura implantada 1,2, pastura mejorada con manejo intensivo 2; en invierno (junio–agosto) 30 % menos.
Por potrero: carga actual, recomendada, y cuántas UA sobran o faltan. Orientativo, editable.

### 5. Precio
- Lo que se publica es **por año**: US$ 0,80/ha/año en agricultura y US$ 0,30/ha/año en ganadería, con
  **escalones** que bajan el precio por hectárea en campos grandes de ganadería: primeras 2.000 ha a 0,30,
  de 2.001 a 10.000 a 0,15, y más de 10.000 a 0,08. Ejemplo: 10.000 ha de ganadería = US$ 1.800/año
  (≈ Gs. 14 millones al año, ≈ Gs. 1,2 millones por mes), no US$ 10.000/mes.
- **Cobro anual o por ciclo** (una o dos cuotas por zafra), además de mensual. Anual tiene 2 meses de regalo.
- Se muestra en guaraníes y en dólares, con calculadora, en la pantalla Plan de la cuenta (web y app) y en la
  respuesta al pedido de cambio de plan. La landing queda como está (pospuesta).
- El cobro sigue siendo manual (no hay pasarela): el pedido de plan lleva la forma de pago elegida.
