# Índice de capturas finales

Archivos relativos a esta carpeta. Web: `-d` escritorio 1440x900, `-m` móvil 390x844, `-full` página entera. App: 390x844 @2x (vista web exportada de Expo). Hojas de contacto: `*-sheet*.jpg` en cada carpeta de módulo.

Notas: en la app el mapa no se dibuja en la exportación web (error `Worker failed to load` de MapLibre), por lo que `app/mapa/mapa.jpg` muestra solo etiquetas sobre fondo oscuro; los contornos sí se verifican en la web. `/interno` responde 403 con la cuenta demo (no es admin). Las pantallas de error público usan tokens inexistentes a propósito.

## Web

| Módulo | Pantalla | Ruta | Archivos | Qué muestra | Observaciones |
|---|---|---|---|---|---|
| administracion | admin-accountant | `/administracion?s=accountant` | web/administracion/admin-accountant-d.jpg<br>web/administracion/admin-accountant-m.jpg<br>web/administracion/admin-accountant-m-full.jpg | Administración, exportación para el contador y plan de cuentas. | - |
| administracion | admin-budget | `/administracion?s=budget` | web/administracion/admin-budget-d.jpg<br>web/administracion/admin-budget-d-full.jpg<br>web/administracion/admin-budget-m.jpg<br>web/administracion/admin-budget-m-full.jpg | Administración, presupuesto de la campaña. | - |
| administracion | admin-budget (diálogo/menú) | `/administracion?s=budget` | web/administracion/admin-budget--dialogo-nueva-linea-de-presupuesto-d.jpg<br>web/administracion/admin-budget--dialogo-nueva-linea-de-presupuesto-m.jpg | Diálogo o menú abierto sobre admin-budget: nueva linea de presupuesto. | - |
| administracion | admin-cash | `/administracion?s=cash` | web/administracion/admin-cash-d.jpg<br>web/administracion/admin-cash-m.jpg | Administración, caja y bancos. | - |
| administracion | admin-cash (diálogo/menú) | `/administracion?s=cash` | web/administracion/admin-cash--dialogo-nueva-cuenta-d.jpg<br>web/administracion/admin-cash--dialogo-nueva-cuenta-m.jpg | Diálogo o menú abierto sobre admin-cash: nueva cuenta. | - |
| administracion | admin-cattle | `/administracion?s=cattle` | web/administracion/admin-cattle-d.jpg<br>web/administracion/admin-cattle-m.jpg | Administración, compras y ventas de hacienda. | - |
| administracion | admin-cattle (diálogo/menú) | `/administracion?s=cattle` | web/administracion/admin-cattle--dialogo-nueva-compra-o-venta-d.jpg<br>web/administracion/admin-cattle--dialogo-nueva-compra-o-venta-m.jpg | Diálogo o menú abierto sobre admin-cattle: nueva compra o venta. | - |
| administracion | admin-contractors | `/administracion?s=contractors` | web/administracion/admin-contractors-d.jpg<br>web/administracion/admin-contractors-m.jpg | Administración, contratistas. | - |
| administracion | admin-contractors (diálogo/menú) | `/administracion?s=contractors` | web/administracion/admin-contractors--dialogo-nuevo-contratista-d.jpg<br>web/administracion/admin-contractors--dialogo-nuevo-contratista-m.jpg | Diálogo o menú abierto sobre admin-contractors: nuevo contratista. | - |
| administracion | admin-costs | `/administracion?s=costs` | web/administracion/admin-costs-d.jpg<br>web/administracion/admin-costs-d-full.jpg<br>web/administracion/admin-costs-m.jpg<br>web/administracion/admin-costs-m-full.jpg | Administración, libro de costos y ventas. | - |
| administracion | admin-costs (diálogo/menú) | `/administracion?s=costs` | web/administracion/admin-costs--dialogo-nuevo-costo-o-venta-d.jpg<br>web/administracion/admin-costs--dialogo-nuevo-costo-o-venta-m.jpg | Diálogo o menú abierto sobre admin-costs: nuevo costo o venta. | - |
| administracion | admin-export | `/administracion?s=export` | web/administracion/admin-export-d.jpg<br>web/administracion/admin-export-d-full.jpg<br>web/administracion/admin-export-m.jpg<br>web/administracion/admin-export-m-full.jpg | Administración, exportación contable con IVA. | - |
| administracion | admin-export (diálogo/menú) | `/administracion?s=export` | web/administracion/admin-export--dialogo-cargar-iva-d.jpg<br>web/administracion/admin-export--dialogo-cargar-iva-m.jpg | Diálogo o menú abierto sobre admin-export: cargar iva. | - |
| administracion | admin-feedlot | `/administracion?s=feedlot` | web/administracion/admin-feedlot-d.jpg<br>web/administracion/admin-feedlot-m.jpg | Administración, feedlot (raciones y suministros). | - |
| administracion | admin-feedlot (diálogo/menú) | `/administracion?s=feedlot` | web/administracion/admin-feedlot--dialogo-anotar-suministro-d.jpg<br>web/administracion/admin-feedlot--dialogo-anotar-suministro-m.jpg | Diálogo o menú abierto sobre admin-feedlot: anotar suministro. | - |
| administracion | admin-feedlot (diálogo/menú) | `/administracion?s=feedlot` | web/administracion/admin-feedlot--dialogo-nueva-racion-d.jpg<br>web/administracion/admin-feedlot--dialogo-nueva-racion-m.jpg | Diálogo o menú abierto sobre admin-feedlot: nueva racion. | - |
| administracion | admin-fuel | `/administracion?s=fuel` | web/administracion/admin-fuel-d.jpg<br>web/administracion/admin-fuel-m.jpg | Administración, combustible. | - |
| administracion | admin-fuel (diálogo/menú) | `/administracion?s=fuel` | web/administracion/admin-fuel--dialogo-cargar-combustible-d.jpg<br>web/administracion/admin-fuel--dialogo-cargar-combustible-m.jpg | Diálogo o menú abierto sobre admin-fuel: cargar combustible. | - |
| administracion | admin-grain | `/administracion?s=grain` | web/administracion/admin-grain-d.jpg<br>web/administracion/admin-grain-m.jpg | Administración, venta de granos (contratos, entregas, liquidaciones). | - |
| administracion | admin-grain (diálogo/menú) | `/administracion?s=grain` | web/administracion/admin-grain--dialogo-cargar-entrega-d.jpg | Diálogo o menú abierto sobre admin-grain: cargar entrega. | - |
| administracion | admin-grain (diálogo/menú) | `/administracion?s=grain` | web/administracion/admin-grain--dialogo-nuevo-contrato-d.jpg<br>web/administracion/admin-grain--dialogo-nuevo-contrato-m.jpg | Diálogo o menú abierto sobre admin-grain: nuevo contrato. | - |
| administracion | admin-labor | `/administracion?s=labor` | web/administracion/admin-labor-d.jpg<br>web/administracion/admin-labor-m.jpg | Administración, labor propia y datos de máquinas. | - |
| administracion | admin-labor (diálogo/menú) | `/administracion?s=labor` | web/administracion/admin-labor--dialogo-cargar-datos-de-una-maquina-d.jpg<br>web/administracion/admin-labor--dialogo-cargar-datos-de-una-maquina-m.jpg | Diálogo o menú abierto sobre admin-labor: cargar datos de una maquina. | - |
| administracion | admin-machines | `/administracion?s=machines` | web/administracion/admin-machines-d.jpg<br>web/administracion/admin-machines-m.jpg | Administración, maquinaria. | - |
| administracion | admin-machines (diálogo/menú) | `/administracion?s=machines` | web/administracion/admin-machines--dialogo-nueva-maquina-d.jpg<br>web/administracion/admin-machines--dialogo-nueva-maquina-m.jpg | Diálogo o menú abierto sobre admin-machines: nueva maquina. | - |
| administracion | admin-maintenance | `/administracion?s=maintenance` | web/administracion/admin-maintenance-d.jpg<br>web/administracion/admin-maintenance-m.jpg | Administración, mantenimiento de maquinaria. | - |
| administracion | admin-maintenance (diálogo/menú) | `/administracion?s=maintenance` | web/administracion/admin-maintenance--dialogo-anotar-servicio-d.jpg<br>web/administracion/admin-maintenance--dialogo-anotar-servicio-m.jpg | Diálogo o menú abierto sobre admin-maintenance: anotar servicio. | - |
| administracion | admin-maintenance (diálogo/menú) | `/administracion?s=maintenance` | web/administracion/admin-maintenance--dialogo-anotar-servicio-o-reparacion-d.jpg<br>web/administracion/admin-maintenance--dialogo-anotar-servicio-o-reparacion-m.jpg | Diálogo o menú abierto sobre admin-maintenance: anotar servicio o reparacion. | - |
| administracion | admin-minstock | `/administracion?s=minstock` | web/administracion/admin-minstock-d.jpg<br>web/administracion/admin-minstock-m.jpg | Administración, stock mínimo. | - |
| administracion | admin-minstock (diálogo/menú) | `/administracion?s=minstock` | web/administracion/admin-minstock--dialogo-cargar-minimo-d.jpg<br>web/administracion/admin-minstock--dialogo-cargar-minimo-m.jpg | Diálogo o menú abierto sobre admin-minstock: cargar minimo. | - |
| administracion | admin-orders | `/administracion?s=orders` | web/administracion/admin-orders-d.jpg<br>web/administracion/admin-orders-m.jpg | Administración, órdenes de trabajo. | - |
| administracion | admin-orders (diálogo/menú) | `/administracion?s=orders` | web/administracion/admin-orders--dialogo-nueva-orden-d.jpg<br>web/administracion/admin-orders--dialogo-nueva-orden-m.jpg | Diálogo o menú abierto sobre admin-orders: nueva orden. | - |
| administracion | admin-overview | `/administracion?s=overview` | web/administracion/admin-overview-d.jpg<br>web/administracion/admin-overview-m.jpg<br>web/administracion/admin-overview-m-full.jpg | Administración, resumen (caja, a pagar, a cobrar, margen, stock bajo mínimo). | - |
| administracion | admin-parties | `/administracion?s=parties` | web/administracion/admin-parties-d.jpg<br>web/administracion/admin-parties-m.jpg<br>web/administracion/admin-parties-m-full.jpg | Administración, proveedores y clientes. | - |
| administracion | admin-parties (diálogo/menú) | `/administracion?s=parties` | web/administracion/admin-parties--dialogo-nuevo-proveedor-o-cliente-d.jpg<br>web/administracion/admin-parties--dialogo-nuevo-proveedor-o-cliente-m.jpg | Diálogo o menú abierto sobre admin-parties: nuevo proveedor o cliente. | - |
| administracion | admin-products | `/administracion?s=products` | web/administracion/admin-products-d.jpg<br>web/administracion/admin-products-d-full.jpg<br>web/administracion/admin-products-m.jpg<br>web/administracion/admin-products-m-full.jpg | Administración, catálogo de productos. | - |
| administracion | admin-products (diálogo/menú) | `/administracion?s=products` | web/administracion/admin-products--dialogo-nuevo-producto-d.jpg<br>web/administracion/admin-products--dialogo-nuevo-producto-m.jpg | Diálogo o menú abierto sobre admin-products: nuevo producto. | - |
| administracion | admin-purchases | `/administracion?s=purchases` | web/administracion/admin-purchases-d.jpg<br>web/administracion/admin-purchases-m.jpg<br>web/administracion/admin-purchases-m-full.jpg | Administración, compras. | - |
| administracion | admin-purchases (diálogo/menú) | `/administracion?s=purchases` | web/administracion/admin-purchases--dialogo-nueva-compra-d.jpg<br>web/administracion/admin-purchases--dialogo-nueva-compra-m.jpg | Diálogo o menú abierto sobre admin-purchases: nueva compra. | - |
| administracion | admin-rates | `/administracion?s=rates` | web/administracion/admin-rates-d.jpg<br>web/administracion/admin-rates-d-full.jpg<br>web/administracion/admin-rates-m.jpg<br>web/administracion/admin-rates-m-full.jpg | Administración, tipo de cambio. | - |
| administracion | admin-results | `/administracion?s=results` | web/administracion/admin-results-d.jpg<br>web/administracion/admin-results-d-full.jpg<br>web/administracion/admin-results-m.jpg<br>web/administracion/admin-results-m-full.jpg | Administración, resultados y márgenes. | - |
| administracion | admin-staff | `/administracion?s=staff` | web/administracion/admin-staff-d.jpg<br>web/administracion/admin-staff-d-full.jpg<br>web/administracion/admin-staff-m.jpg<br>web/administracion/admin-staff-m-full.jpg | Administración, personal (asistencia, saldos, empleados). | - |
| administracion | admin-stock | `/administracion?s=stock` | web/administracion/admin-stock-d.jpg<br>web/administracion/admin-stock-d-full.jpg<br>web/administracion/admin-stock-m.jpg<br>web/administracion/admin-stock-m-full.jpg | Administración, stock de insumos. | - |
| administracion | admin-stock (diálogo/menú) | `/administracion?s=stock` | web/administracion/admin-stock--dialogo-registrar-compra-d.jpg<br>web/administracion/admin-stock--dialogo-registrar-compra-m.jpg | Diálogo o menú abierto sobre admin-stock: registrar compra. | - |
| administracion | admin-warehouses | `/administracion?s=warehouses` | web/administracion/admin-warehouses-d.jpg<br>web/administracion/admin-warehouses-m.jpg | Administración, depósitos. | - |
| administracion | admin-warehouses (diálogo/menú) | `/administracion?s=warehouses` | web/administracion/admin-warehouses--dialogo-nuevo-deposito-d.jpg<br>web/administracion/admin-warehouses--dialogo-nuevo-deposito-m.jpg | Diálogo o menú abierto sobre admin-warehouses: nuevo deposito. | - |
| campo | 404 | `/ruta-que-no-existe` | web/campo/404-d.jpg<br>web/campo/404-m.jpg | Pantalla de página no encontrada. | - |
| campo | avisos | `/avisos` | web/campo/avisos-d.jpg<br>web/campo/avisos-m.jpg | Avisos activos (helada, exceso de lluvia, sequía, fuego) con botón de compartir por WhatsApp y los umbrales para recibirlos. | - |
| campo | calendario | `/calendario` | web/campo/calendario-d.jpg<br>web/campo/calendario-m.jpg<br>web/campo/calendario-m-full.jpg | Calendario semanal de labores con las tareas y aplicaciones por día. | - |
| campo | comparar | `/comparar` | web/campo/comparar-d.jpg<br>web/campo/comparar-m.jpg | Comparación entre estancias (superficie, lotes, lluvia, vigor, registros, avisos) y entre campañas. | - |
| campo | estancia-nueva | `/estancias/nueva` | web/campo/estancia-nueva-d.jpg<br>web/campo/estancia-nueva-m.jpg<br>web/campo/estancia-nueva-m-full.jpg | Alta de estancia: mapa para dibujar o importar el perímetro y formulario con nombre, departamento, distrito y búsqueda de lugar. | - |
| campo | inicio | `/` | web/campo/inicio-d.jpg<br>web/campo/inicio-m.jpg<br>web/campo/inicio-m-full.jpg | Mapa de todas las estancias con sus contornos y, al costado, resumen de la semana (lluvia, avisos, registros, empleados activos, margen, superficie por cultivo). | - |
| campo | inicio (diálogo/menú) | `/` | web/campo/inicio--menu-cuenta-d.jpg | Diálogo o menú abierto sobre inicio: menu cuenta. | - |
| campo | para-revisar | `/para-revisar` | web/campo/para-revisar-d.jpg<br>web/campo/para-revisar-m.jpg | Registros raros (p. ej. dosis fuera de lo habitual) para confirmar o abrir. | - |
| campo | registros | `/registros` | web/campo/registros-d.jpg<br>web/campo/registros-d-full.jpg<br>web/campo/registros-m.jpg<br>web/campo/registros-m-full.jpg | Registros de campo sobre un mapa con grupos por zona, filtros (estancia, empleado, tipo, período) y lista cronológica. | - |
| campo | registros (diálogo/menú) | `/registros` | web/campo/registros--exportar-d.jpg<br>web/campo/registros--exportar-m.jpg | Diálogo o menú abierto sobre registros: exportar. | - |
| campo | registros (diálogo/menú) | `/registros` | web/campo/registros--filtros-guardados-d.jpg<br>web/campo/registros--filtros-guardados-m.jpg | Diálogo o menú abierto sobre registros: filtros guardados. | - |
| cuenta | api-publica | `/api-publica` | web/cuenta/api-publica-d.jpg<br>web/cuenta/api-publica-m.jpg | Acceso API: creación de tokens de solo lectura para otros sistemas. | - |
| cuenta | auditoria-cambios | `/cambios` | web/cuenta/auditoria-cambios-d.jpg<br>web/cuenta/auditoria-cambios-m.jpg | Registro de cambios: quién cambió qué y cuándo en la organización. | - |
| cuenta | ayuda | `/ayuda` | web/cuenta/ayuda-d.jpg<br>web/cuenta/ayuda-d-full.jpg<br>web/cuenta/ayuda-m.jpg<br>web/cuenta/ayuda-m-full.jpg | Ayuda: preguntas frecuentes y videos, con contacto por WhatsApp. | - |
| cuenta | cuenta | `/cuenta` | web/cuenta/cuenta-d.jpg<br>web/cuenta/cuenta-m.jpg | Cuenta: preferencias (idioma, tema, unidades), avisos, calendario y referidos. | - |
| cuenta | formularios | `/formularios` | web/cuenta/formularios-d.jpg<br>web/cuenta/formularios-m.jpg | Formularios propios: preguntas personalizadas por tipo de registro. | - |
| equipo | clientes | `/clientes` | web/equipo/clientes-d.jpg<br>web/equipo/clientes-m.jpg | Vista de clientes (organizaciones) con sus estancias y avisos sobre el mapa. | - |
| equipo | equipo | `/equipo` | web/equipo/equipo-d.jpg<br>web/equipo/equipo-m.jpg | Equipo: personas con rol, estancias, registros, lotes visitados y tareas vencidas; alta de persona. | - |
| equipo | equipo (diálogo/menú) | `/equipo` | web/equipo/equipo--dialogo-agregar-persona-d.jpg<br>web/equipo/equipo--dialogo-agregar-persona-m.jpg | Diálogo o menú abierto sobre equipo: agregar persona. | - |
| estancia | cambios | `/estancias/0190d000-0004-7000-8000-000000000001/cambios` | web/estancia/cambios-d.jpg<br>web/estancia/cambios-m.jpg<br>web/estancia/cambios-m-full.jpg | Cambios en el terreno: superficie quemada y cambio de cobertura detectados por satélite, con mapa. | - |
| estancia | estancia-2 | `/estancias/0190d000-0004-7000-8000-000000000002` | web/estancia/estancia-2-d.jpg<br>web/estancia/estancia-2-d-full.jpg<br>web/estancia/estancia-2-m.jpg<br>web/estancia/estancia-2-m-full.jpg | Segunda estancia (San Pedro Norte) con sus lotes y contornos en el mapa. | - |
| estancia | estancia-2 | `/estancias/0190d000-0004-7000-8000-000000000002` | web/estancia/estancia-2-mapa-m.jpg | Vista Mapa en móvil de la pantalla anterior. | - |
| estancia | estancia-agro | `/estancias/0190d000-0004-7000-8000-000000000001` | web/estancia/estancia-agro-d.jpg<br>web/estancia/estancia-agro-d-full.jpg<br>web/estancia/estancia-agro-m.jpg<br>web/estancia/estancia-agro-m-full.jpg | Pestaña Agro: plan de siembra por cultivo y variedad con semilla a comprar. | - |
| estancia | estancia-agro (diálogo/menú) | `/estancias/0190d000-0004-7000-8000-000000000001` | web/estancia/estancia-agro--dialogo-cargar-un-analisis-d.jpg | Diálogo o menú abierto sobre estancia-agro: cargar un analisis. | - |
| estancia | estancia-agro (diálogo/menú) | `/estancias/0190d000-0004-7000-8000-000000000001` | web/estancia/estancia-agro--dialogo-cargar-una-entrega-d.jpg | Diálogo o menú abierto sobre estancia-agro: cargar una entrega. | - |
| estancia | estancia-alerts | `/estancias/0190d000-0004-7000-8000-000000000001` | web/estancia/estancia-alerts-d.jpg<br>web/estancia/estancia-alerts-m.jpg | Pestaña Avisos: avisos de la estancia con feedback (¿te sirvió?) y compartir. | - |
| estancia | estancia-climate | `/estancias/0190d000-0004-7000-8000-000000000001` | web/estancia/estancia-climate-d.jpg<br>web/estancia/estancia-climate-d-full.jpg<br>web/estancia/estancia-climate-m.jpg<br>web/estancia/estancia-climate-m-full.jpg | Pestaña Clima: lluvia de 30 días, humedad del suelo, lluvia diaria (satélite, normal y pluviómetro) y avisos de helada. | - |
| estancia | estancia-herd | `/estancias/0190d000-0004-7000-8000-000000000001` | web/estancia/estancia-herd-d.jpg<br>web/estancia/estancia-herd-d-full.jpg<br>web/estancia/estancia-herd-m.jpg<br>web/estancia/estancia-herd-m-full.jpg | Pestaña Hacienda: indicadores (preñez, parición, destete, ganancia), carga animal en UA/ha y accesos a plan reproductivo y reproducción. | - |
| estancia | estancia-lote-elegido | `/estancias/0190d000-0004-7000-8000-000000000001?lote=0190d000-0005-7000-8000-000000000001` | web/estancia/estancia-lote-elegido-d.jpg<br>web/estancia/estancia-lote-elegido-d-full.jpg<br>web/estancia/estancia-lote-elegido-m.jpg<br>web/estancia/estancia-lote-elegido-m-full.jpg | Lote seleccionado: ficha con NDVI actual, comparación con el promedio del campo y curva de la campaña, resaltado en el mapa. | - |
| estancia | estancia-lote-elegido (diálogo/menú) | `/estancias/0190d000-0004-7000-8000-000000000001?lote=0190d000-0005-7000-8000-000000000001` | web/estancia/estancia-lote-elegido--dialogo-anotar-riego-d.jpg | Diálogo o menú abierto sobre estancia-lote-elegido: anotar riego. | - |
| estancia | estancia-plots | `/estancias/0190d000-0004-7000-8000-000000000001` | web/estancia/estancia-plots-d.jpg<br>web/estancia/estancia-plots-d-full.jpg<br>web/estancia/estancia-plots-m.jpg<br>web/estancia/estancia-plots-m-full.jpg | Ficha de la estancia, pestaña Lotes: mapa con lotes, potreros y puntos; tabla de lotes con cultivo, hectáreas, vigor y última visita; lotes que empeoraron. | - |
| estancia | estancia-plots | `/estancias/0190d000-0004-7000-8000-000000000001` | web/estancia/estancia-plots-mapa-m.jpg | Vista Mapa en móvil de la pantalla anterior. | - |
| estancia | estancia-plots (diálogo/menú) | `/estancias/0190d000-0004-7000-8000-000000000001` | web/estancia/estancia-plots--cambiar-estancia-d.jpg<br>web/estancia/estancia-plots--cambiar-estancia-m.jpg | Diálogo o menú abierto sobre estancia-plots: cambiar estancia. | - |
| estancia | estancia-plots (diálogo/menú) | `/estancias/0190d000-0004-7000-8000-000000000001` | web/estancia/estancia-plots--capas-d.jpg | Diálogo o menú abierto sobre estancia-plots: capas. | - |
| estancia | estancia-plots (diálogo/menú) | `/estancias/0190d000-0004-7000-8000-000000000001` | web/estancia/estancia-plots--mas-acciones-d.jpg<br>web/estancia/estancia-plots--mas-acciones-m.jpg | Diálogo o menú abierto sobre estancia-plots: mas acciones. | - |
| estancia | estancia-products | `/estancias/0190d000-0004-7000-8000-000000000001` | web/estancia/estancia-products-d.jpg<br>web/estancia/estancia-products-d-full.jpg<br>web/estancia/estancia-products-m.jpg<br>web/estancia/estancia-products-m-full.jpg | Pestaña Productos: catálogo de insumos con carencia y dosis, recetas y alta de productos. | - |
| estancia | estancia-products (diálogo/menú) | `/estancias/0190d000-0004-7000-8000-000000000001` | web/estancia/estancia-products--dialogo-nueva-receta-d.jpg | Diálogo o menú abierto sobre estancia-products: nueva receta. | - |
| estancia | estancia-products (diálogo/menú) | `/estancias/0190d000-0004-7000-8000-000000000001` | web/estancia/estancia-products--dialogo-nuevo-producto-d.jpg | Diálogo o menú abierto sobre estancia-products: nuevo producto. | - |
| estancia | estancia-records | `/estancias/0190d000-0004-7000-8000-000000000001` | web/estancia/estancia-records-d.jpg<br>web/estancia/estancia-records-d-full.jpg<br>web/estancia/estancia-records-m.jpg<br>web/estancia/estancia-records-m-full.jpg | Pestaña Registros: registros de la estancia en lista, con puntos en el mapa. | - |
| estancia | estancia-seasons | `/estancias/0190d000-0004-7000-8000-000000000001` | web/estancia/estancia-seasons-d.jpg<br>web/estancia/estancia-seasons-d-full.jpg<br>web/estancia/estancia-seasons-m.jpg<br>web/estancia/estancia-seasons-m-full.jpg | Pestaña Campañas: campaña activa y plan de siembra por lote. | - |
| estancia | estancia-seasons (diálogo/menú) | `/estancias/0190d000-0004-7000-8000-000000000001` | web/estancia/estancia-seasons--dialogo-nueva-campana-d.jpg | Diálogo o menú abierto sobre estancia-seasons: nueva campana. | - |
| estancia | estancia-tasks | `/estancias/0190d000-0004-7000-8000-000000000001` | web/estancia/estancia-tasks-d.jpg<br>web/estancia/estancia-tasks-d-full.jpg<br>web/estancia/estancia-tasks-m.jpg<br>web/estancia/estancia-tasks-m-full.jpg | Pestaña Tareas: tareas del equipo agrupadas por persona, con vencidas y repetición. | - |
| estancia | estancia-tasks (diálogo/menú) | `/estancias/0190d000-0004-7000-8000-000000000001` | web/estancia/estancia-tasks--dialogo-nueva-tarea-d.jpg | Diálogo o menú abierto sobre estancia-tasks: nueva tarea. | - |
| estancia | eudr | `/estancias/0190d000-0004-7000-8000-000000000001/eudr` | web/estancia/eudr-d.jpg<br>web/estancia/eudr-d-full.jpg<br>web/estancia/eudr-m.jpg<br>web/estancia/eudr-m-full.jpg | Libre de deforestación (EUDR): análisis satelital indicativo, cobertura, lotes con posible pérdida de bosque y mapa. | - |
| estancia | pluviometros | `/estancias/0190d000-0004-7000-8000-000000000001/pluviometros` | web/estancia/pluviometros-d.jpg<br>web/estancia/pluviometros-d-full.jpg<br>web/estancia/pluviometros-m.jpg<br>web/estancia/pluviometros-m-full.jpg | Lluvia por pluviómetro frente al satélite (CHIRPS) y normal, por mes y campaña, con gráfico. | - |
| estancia | riesgo | `/estancias/0190d000-0004-7000-8000-000000000001/riesgo` | web/estancia/riesgo-d.jpg<br>web/estancia/riesgo-d-full.jpg<br>web/estancia/riesgo-m.jpg<br>web/estancia/riesgo-m-full.jpg | Riesgo climático: heladas y sequías por año, peor año, primera helada típica y lluvia mensual. | - |
| informes | informes-estancia | `/estancias/0190d000-0004-7000-8000-000000000001/informes` | web/informes/informes-estancia-d.jpg<br>web/informes/informes-estancia-m.jpg<br>web/informes/informes-estancia-m-full.jpg | Centro de informes: parte semanal, pluviómetros, cambios, informe para banco, auditoría, EUDR, enlace de solo lectura, resumen de campaña, riesgo y exportación completa, más envíos automáticos por email. | - |
| informes | parte | `/estancias/0190d000-0004-7000-8000-000000000001/parte` | web/informes/parte-d.jpg<br>web/informes/parte-d-full.jpg<br>web/informes/parte-m.jpg<br>web/informes/parte-m-full.jpg | Parte semanal: registros por tipo y por persona, lluvia, avisos y tareas hechas/vencidas; descarga en PDF. | - |
| interno | interno | `/interno` | web/interno/interno-d.jpg<br>web/interno/interno-m.jpg | Panel interno de administración de la plataforma (acceso restringido; con la cuenta demo no tiene permiso). | HTTP 403 GET /admin/metrics; console: Failed to load resource: the server responded with a status of 403 (Forbidden) |
| laboratorio | lab-advice | `/laboratorio/advice` | web/laboratorio/lab-advice-d.jpg<br>web/laboratorio/lab-advice-m.jpg | Laboratorio: Recomendación del agrónomo, vista previa con botón de ejemplo. | - |
| laboratorio | lab-animals | `/laboratorio/animals` | web/laboratorio/lab-animals-d.jpg<br>web/laboratorio/lab-animals-m.jpg | Laboratorio: Conteo de animales por dron, vista previa con botón de ejemplo. | - |
| laboratorio | lab-ask | `/laboratorio/ask` | web/laboratorio/lab-ask-d.jpg<br>web/laboratorio/lab-ask-m.jpg | Laboratorio: Preguntale al campo, vista previa con botón de ejemplo. | - |
| laboratorio | lab-hail | `/laboratorio/hail` | web/laboratorio/lab-hail-d.jpg<br>web/laboratorio/lab-hail-m.jpg | Laboratorio: Daño por granizo o viento, vista previa con botón de ejemplo. | - |
| laboratorio | lab-infra | `/laboratorio/infra` | web/laboratorio/lab-infra-d.jpg<br>web/laboratorio/lab-infra-m.jpg | Laboratorio: Alambrados, tajamares y caminos, vista previa con botón de ejemplo. | - |
| laboratorio | lab-rust | `/laboratorio/rust` | web/laboratorio/lab-rust-d.jpg<br>web/laboratorio/lab-rust-m.jpg | Laboratorio: Detección de roya desde el celular, vista previa con botón de ejemplo. | - |
| laboratorio | lab-stand | `/laboratorio/stand` | web/laboratorio/lab-stand-d.jpg<br>web/laboratorio/lab-stand-m.jpg | Laboratorio: Fallas de siembra por dron, vista previa con botón de ejemplo. | - |
| laboratorio | lab-summary | `/laboratorio/summary` | web/laboratorio/lab-summary-d.jpg<br>web/laboratorio/lab-summary-m.jpg | Laboratorio: Resumen semanal escrito automáticamente, vista previa con botón de ejemplo. | - |
| laboratorio | lab-weeds | `/laboratorio/weeds` | web/laboratorio/lab-weeds-d.jpg<br>web/laboratorio/lab-weeds-m.jpg | Laboratorio: Malezas por dron, vista previa con botón de ejemplo. | - |
| laboratorio | lab-yield | `/laboratorio/yield` | web/laboratorio/lab-yield-d.jpg<br>web/laboratorio/lab-yield-m.jpg | Laboratorio: Rinde estimado por lote, vista previa con botón de ejemplo. | - |
| laboratorio | laboratorio | `/laboratorio` | web/laboratorio/laboratorio-d.jpg<br>web/laboratorio/laboratorio-m.jpg<br>web/laboratorio/laboratorio-m-full.jpg | Laboratorio: funciones experimentales en desarrollo, con tarjetas de cada una. | - |
| publico | api-docs | `/api-docs` | web/publico/api-docs-d.jpg<br>web/publico/api-docs-d-full.jpg<br>web/publico/api-docs-m.jpg<br>web/publico/api-docs-m-full.jpg | Documentación pública de la API de solo lectura. | - |
| publico | compartido-token-invalido | `/compartido/token-de-prueba` | web/publico/compartido-token-invalido-d.jpg<br>web/publico/compartido-token-invalido-m.jpg | Enlace compartido inexistente o vencido (estado de error). | HTTP 404 GET /public/shared/token-de-prueba |
| publico | estado | `/estado` | web/publico/estado-d.jpg<br>web/publico/estado-m.jpg | Estado del servicio y de las fuentes de datos satelitales y climáticas. | - |
| publico | informe-lead-invalido | `/informe/0190d000-0000-7000-8000-000000000000/firma` | web/publico/informe-lead-invalido-d.jpg<br>web/publico/informe-lead-invalido-m.jpg | Informe de lead inexistente (estado de error). | HTTP 404 GET /public/leads/0190d000-0000-7000-8000-000000000000/firma |
| publico | ingresar | `/ingresar` | web/publico/ingresar-d.jpg<br>web/publico/ingresar-m.jpg | Ingreso por código enviado al email, con imagen satelital. | - |
| publico | ingresar-registro | `/ingresar?modo=registro` | web/publico/ingresar-registro-d.jpg<br>web/publico/ingresar-registro-m.jpg | Creación de cuenta: organización, nombre y email. | - |
| publico | privacidad | `/privacidad` | web/publico/privacidad-d.jpg<br>web/publico/privacidad-d-full.jpg<br>web/publico/privacidad-m.jpg<br>web/publico/privacidad-m-full.jpg | Política de privacidad. | - |
| publico | terminos | `/terminos` | web/publico/terminos-d.jpg<br>web/publico/terminos-d-full.jpg<br>web/publico/terminos-m.jpg<br>web/publico/terminos-m-full.jpg | Términos de uso. | - |
| sanidad | sanidad | `/sanidad` | web/sanidad/sanidad-d.jpg<br>web/sanidad/sanidad-m.jpg | Calendario sanitario del ganado (vacunas, baños, desparasitaciones) con estado vencido/hecho. | - |
| tareas | tareas | `/tareas` | web/tareas/tareas-d.jpg<br>web/tareas/tareas-d-full.jpg<br>web/tareas/tareas-m.jpg<br>web/tareas/tareas-m-full.jpg | Tareas del equipo con filtros por estado y persona, vencidas y alta de tarea. | - |
| tareas | tareas (diálogo/menú) | `/tareas` | web/tareas/tareas--dialogo-nueva-tarea-d.jpg<br>web/tareas/tareas--dialogo-nueva-tarea-m.jpg | Diálogo o menú abierto sobre tareas: nueva tarea. | - |

## App móvil

| Módulo | Pantalla | Ruta | Archivos | Qué muestra | Observaciones |
|---|---|---|---|---|---|
| cuenta | animales | `/animals` | app/cuenta/animales.jpg<br>app/cuenta/animales-full.jpg | Animales: búsqueda por caravana y lista. | - |
| cuenta | cuenta | `/account` | app/cuenta/cuenta.jpg<br>app/cuenta/cuenta-full.jpg | Cuenta y ajustes: avisos, tareas a las 7:00, solo lectura, unidades. | - |
| cuenta | emergencia | `/emergency` | app/cuenta/emergencia.jpg | SMS de emergencia con contactos. | - |
| cuenta | login | `/login` | app/cuenta/login.jpg | Ingreso: escanear QR, teléfono y PIN, email o ver la estancia de ejemplo. | - |
| cuenta | notificaciones | `/notifications` | app/cuenta/notificaciones.jpg<br>app/cuenta/notificaciones-full.jpg | Avisos y silencio: canales por tipo de aviso. | - |
| cuenta | sync | `/sync` | app/cuenta/sync.jpg | Sincronización y almacenamiento sin conexión. | - |
| gestion | gestion | `/office` | app/gestion/gestion.jpg<br>app/gestion/gestion-full.jpg | Gestión: tareas vencidas, avisos y accesos de Campo y Equipo. | - |
| historial | historial | `/history` | app/historial/historial.jpg<br>app/historial/historial-full.jpg | Historial de registros propios. | - |
| hoy | hoy | `/` | app/hoy/hoy.jpg<br>app/hoy/hoy-full.jpg | Hoy: saludo, pronóstico de 5 días, anotar lluvia, aviso activo y tareas del equipo. | - |
| laboratorio | lab-caravana | `/labs/caravana` | app/laboratorio/lab-caravana.jpg | Laboratorio: caravana, vista previa con botón de ejemplo. | - |
| laboratorio | lab-chinches | `/labs/chinches` | app/laboratorio/lab-chinches.jpg | Laboratorio: chinches, vista previa con botón de ejemplo. | - |
| laboratorio | lab-fenologia | `/labs/fenologia` | app/laboratorio/lab-fenologia.jpg | Laboratorio: fenologia, vista previa con botón de ejemplo. | - |
| laboratorio | lab-guarani | `/labs/guarani` | app/laboratorio/lab-guarani.jpg | Laboratorio: guarani, vista previa con botón de ejemplo. | - |
| laboratorio | lab-malezas | `/labs/malezas` | app/laboratorio/lab-malezas.jpg | Laboratorio: malezas, vista previa con botón de ejemplo. | - |
| laboratorio | lab-pasto | `/labs/pasto` | app/laboratorio/lab-pasto.jpg | Laboratorio: pasto, vista previa con botón de ejemplo. | - |
| laboratorio | lab-roya | `/labs/roya` | app/laboratorio/lab-roya.jpg | Laboratorio: roya, vista previa con botón de ejemplo. | - |
| laboratorio | lab-vaca | `/labs/vaca` | app/laboratorio/lab-vaca.jpg | Laboratorio: vaca, vista previa con botón de ejemplo. | - |
| laboratorio | lab-voz | `/labs/voz` | app/laboratorio/lab-voz.jpg | Laboratorio: voz, vista previa con botón de ejemplo. | - |
| mapa | mapa | `/map` | app/mapa/mapa.jpg | Mapa del campo con nombres de lotes y botón Anotar. En la exportación web el mapa no carga (ver notas). | console: Error: Worker failed to load. Check that the worker URL is correct.
    at Worker.<anonymous> (http://localhost:8160/_expo/static/js/web/map-956c2e65b1a616e7550 |
| mas | mas | `/more` | app/mas/mas.jpg<br>app/mas/mas-full.jpg | Más: accesos a laboratorio, cuenta y demás. | - |
| oficina-admin | admin | `/office/admin` | app/oficina-admin/admin.jpg<br>app/oficina-admin/admin-full.jpg | Administración: resumen y accesos. | - |
| oficina-admin | admin-cattle | `/office/admin/cattle` | app/oficina-admin/admin-cattle.jpg | Hacienda: compras y ventas. | - |
| oficina-admin | admin-finanzas-cash | `/office/admin/finance/cash` | app/oficina-admin/admin-finanzas-cash.jpg<br>app/oficina-admin/admin-finanzas-cash-full.jpg | Caja y bancos. | - |
| oficina-admin | admin-finanzas-costs | `/office/admin/finance/costs` | app/oficina-admin/admin-finanzas-costs.jpg<br>app/oficina-admin/admin-finanzas-costs-full.jpg | Libro de costos y ventas. | - |
| oficina-admin | admin-finanzas-results | `/office/admin/finance/results` | app/oficina-admin/admin-finanzas-results.jpg<br>app/oficina-admin/admin-finanzas-results-full.jpg | Resultados y márgenes. | - |
| oficina-admin | admin-fuel | `/office/admin/fuel` | app/oficina-admin/admin-fuel.jpg | Combustible por equipo. | - |
| oficina-admin | admin-grain | `/office/admin/grain` | app/oficina-admin/admin-grain.jpg | Venta de granos: contratos, entregas y liquidaciones. | - |
| oficina-admin | admin-machines | `/office/admin/machines` | app/oficina-admin/admin-machines.jpg | Maquinaria. | - |
| oficina-admin | admin-min-stock | `/office/admin/min-stock` | app/oficina-admin/admin-min-stock.jpg | Stock mínimo. | - |
| oficina-admin | admin-operacion-maintenance | `/office/admin/ops/maintenance` | app/oficina-admin/admin-operacion-maintenance.jpg | Mantenimiento. | - |
| oficina-admin | admin-operacion-orders | `/office/admin/ops/orders` | app/oficina-admin/admin-operacion-orders.jpg | Órdenes de trabajo. | - |
| oficina-admin | admin-operacion-staff | `/office/admin/ops/staff` | app/oficina-admin/admin-operacion-staff.jpg<br>app/oficina-admin/admin-operacion-staff-full.jpg | Personal y asistencia. | - |
| oficina-admin | admin-parties | `/office/admin/parties` | app/oficina-admin/admin-parties.jpg<br>app/oficina-admin/admin-parties-full.jpg | Proveedores y clientes. | - |
| oficina-admin | admin-purchase | `/office/admin/purchase?id=0190d000-002e-7000-8000-000000000001` | app/oficina-admin/admin-purchase.jpg | Detalle de una compra con recepción en depósito. | - |
| oficina-admin | admin-purchase-new | `/office/admin/purchase-new` | app/oficina-admin/admin-purchase-new.jpg<br>app/oficina-admin/admin-purchase-new-full.jpg | Formulario de nueva compra. | - |
| oficina-admin | admin-purchases | `/office/admin/purchases` | app/oficina-admin/admin-purchases.jpg<br>app/oficina-admin/admin-purchases-full.jpg | Compras. | - |
| oficina-admin | admin-stock | `/office/admin/stock` | app/oficina-admin/admin-stock.jpg<br>app/oficina-admin/admin-stock-full.jpg | Stock por depósito. | - |
| oficina-admin | admin-warehouses | `/office/admin/warehouses` | app/oficina-admin/admin-warehouses.jpg | Depósitos. | - |
| oficina-agro | agro | `/office/agro` | app/oficina-agro/agro.jpg | Agronomía: menú de herramientas. | - |
| oficina-agro | agro-buffer | `/office/agro/buffer` | app/oficina-agro/agro-buffer.jpg | Zonas de amortiguación. | - |
| oficina-agro | agro-deliveries | `/office/agro/deliveries` | app/oficina-agro/agro-deliveries.jpg<br>app/oficina-agro/agro-deliveries-full.jpg | Entregas a acopio. | - |
| oficina-agro | agro-soil | `/office/agro/soil` | app/oficina-agro/agro-soil.jpg<br>app/oficina-agro/agro-soil-full.jpg | Análisis de suelo. | - |
| oficina-agro | agro-sowing-plan | `/office/agro/sowing-plan` | app/oficina-agro/agro-sowing-plan.jpg | Plan de siembra. | - |
| oficina-agro | agro-sowing-window | `/office/agro/sowing-window` | app/oficina-agro/agro-sowing-window.jpg<br>app/oficina-agro/agro-sowing-window-full.jpg | Ventana de siembra. | - |
| oficina-agro | agro-spray | `/office/agro/spray` | app/oficina-agro/agro-spray.jpg | Ventanas para pulverizar (sin pronóstico por hora en el demo). | - |
| oficina-agro | agro-withdrawal | `/office/agro/withdrawal` | app/oficina-agro/agro-withdrawal.jpg | Carencia antes de cosechar. | - |
| oficina-hacienda | herd | `/office/herd` | app/oficina-hacienda/herd.jpg | Hacienda: menú de herramientas. | - |
| oficina-hacienda | herd-forage | `/office/herd/forage` | app/oficina-hacienda/herd-forage.jpg | Pasto. | - |
| oficina-hacienda | herd-heat | `/office/herd/heat` | app/oficina-hacienda/herd-heat.jpg | Estrés térmico (sin pronóstico por hora en el demo). | - |
| oficina-hacienda | herd-plan | `/office/herd/plan` | app/oficina-hacienda/herd-plan.jpg<br>app/oficina-hacienda/herd-plan-full.jpg | Plan reproductivo. | - |
| oficina-hacienda | herd-repro | `/office/herd/repro` | app/oficina-hacienda/herd-repro.jpg<br>app/oficina-hacienda/herd-repro-full.jpg | Reproducción. | - |
| oficina-hacienda | herd-rotation | `/office/herd/rotation` | app/oficina-hacienda/herd-rotation.jpg | Rotación de potreros. | - |
| oficina-hacienda | herd-stock | `/office/herd/stock` | app/oficina-hacienda/herd-stock.jpg<br>app/oficina-hacienda/herd-stock-full.jpg | Existencias y carga animal. | - |
| oficina-hacienda | herd-supplements | `/office/herd/supplements` | app/oficina-hacienda/herd-supplements.jpg | Suplementos. | - |
| oficina-hacienda | herd-theft | `/office/herd/theft` | app/oficina-hacienda/herd-theft.jpg | Abigeato. | - |
| oficina-hacienda | herd-weighings | `/office/herd/weighings` | app/oficina-hacienda/herd-weighings.jpg | Pesadas. | - |
| oficina-otros | alert-settings | `/office/alert-settings` | app/oficina-otros/alert-settings.jpg | Umbrales de avisos. | - |
| oficina-otros | alerts | `/office/alerts` | app/oficina-otros/alerts.jpg | Avisos. | - |
| oficina-otros | calendar | `/office/calendar` | app/oficina-otros/calendar.jpg<br>app/oficina-otros/calendar-full.jpg | Calendario de labores. | - |
| oficina-otros | changes | `/office/changes` | app/oficina-otros/changes.jpg | Cambios en el terreno. | - |
| oficina-otros | clients | `/office/clients` | app/oficina-otros/clients.jpg | Clientes. | - |
| oficina-otros | climate | `/office/climate` | app/oficina-otros/climate.jpg<br>app/oficina-otros/climate-full.jpg | Clima. | - |
| oficina-otros | compare | `/office/compare` | app/oficina-otros/compare.jpg | Comparar estancias. | - |
| oficina-otros | dashboard | `/office/dashboard` | app/oficina-otros/dashboard.jpg | Resumen de la semana. | - |
| oficina-otros | farms | `/office/farms` | app/oficina-otros/farms.jpg | Estancias. | - |
| oficina-otros | member-detalle | `/office/member/0190d000-0002-7000-8000-000000000002` | app/oficina-otros/member-detalle.jpg | Ficha de una persona del equipo. | - |
| oficina-otros | more-account | `/office/more-account` | app/oficina-otros/more-account.jpg<br>app/oficina-otros/more-account-full.jpg | Plan, calendario y ayuda. | - |
| oficina-otros | plots | `/office/plots` | app/oficina-otros/plots.jpg<br>app/oficina-otros/plots-full.jpg | Lotes. | - |
| oficina-otros | products | `/office/products` | app/oficina-otros/products.jpg<br>app/oficina-otros/products-full.jpg | Productos. | - |
| oficina-otros | rain-gauges | `/office/rain-gauges` | app/oficina-otros/rain-gauges.jpg<br>app/oficina-otros/rain-gauges-full.jpg | Pluviómetros. | - |
| oficina-otros | report | `/office/report` | app/oficina-otros/report.jpg<br>app/oficina-otros/report-full.jpg | Parte semanal. | - |
| oficina-otros | reports | `/office/reports` | app/oficina-otros/reports.jpg | Informes. | - |
| oficina-otros | review | `/office/review` | app/oficina-otros/review.jpg | Para revisar. | - |
| oficina-otros | risk | `/office/risk` | app/oficina-otros/risk.jpg<br>app/oficina-otros/risk-full.jpg | Riesgo climático. | - |
| oficina-otros | sanitary | `/office/sanitary` | app/oficina-otros/sanitary.jpg | Calendario sanitario. | - |
| oficina-otros | search | `/office/search` | app/oficina-otros/search.jpg | Buscar. | - |
| oficina-otros | seasons | `/office/seasons` | app/oficina-otros/seasons.jpg<br>app/oficina-otros/seasons-full.jpg | Campañas. | - |
| oficina-otros | share-links | `/office/share-links` | app/oficina-otros/share-links.jpg | Enlace de solo lectura. | - |
| oficina-otros | tasks | `/office/tasks` | app/oficina-otros/tasks.jpg<br>app/oficina-otros/tasks-full.jpg | Tareas del equipo. | - |
| oficina-otros | team | `/office/team` | app/oficina-otros/team.jpg | Equipo. | - |
| registro | anotar | `/annotate` | app/registro/anotar.jpg<br>app/registro/anotar-full.jpg | Anotar: elegir el lote donde estás. | - |
| registro | conteo-stock | `/stock-count` | app/registro/conteo-stock.jpg | Recuento de depósito: elegir depósito. | - |
| registro | escanear | `/scan` | app/registro/escanear.jpg | Escanear QR: pide permiso de cámara. | - |
| registro | escanear-poi | `/scan-poi` | app/registro/escanear-poi.jpg | Escanear punto de interés: pide permiso de cámara. | - |
| registro | ir-a | `/goto?lon=-55.9&lat=-27.16&name=Punto%20de%20prueba` | app/registro/ir-a.jpg | Ir a un punto con GPS y brújula (sin permiso de ubicación en la vista web). | - |
| registro | lote-detalle | `/plot/0190d000-0005-7000-8000-000000000001` | app/registro/lote-detalle.jpg<br>app/registro/lote-detalle-full.jpg | Detalle de lote: lluvia, vigor NDVI, curva de campaña y acciones. | - |
| registro | lote-dibujar | `/plot-draw?plotId=0190d000-0005-7000-8000-000000000001` | app/registro/lote-dibujar.jpg | Dibujar lote (editar forma): requiere la app del teléfono. | - |
| registro | lote-dibujar-nuevo | `/plot-draw` | app/registro/lote-dibujar-nuevo.jpg | Dibujar lote nuevo: requiere la app del teléfono. | - |
| registro | poi | `/poi` | app/registro/poi.jpg<br>app/registro/poi-full.jpg | Punto de interés: elegir tipo (pluviómetro, aguada, casa, corral...). | - |
| registro | recorrida | `/walk` | app/registro/recorrida.jpg | Grabar recorrido con GPS. | - |
| registro | registro-detalle | `/record/0190d000-000c-7000-8000-0000000000ae` | app/registro/registro-detalle.jpg | Detalle de un registro con ubicación, compartir por WhatsApp y comentarios. | - |
| registro | tarea-detalle | `/task/0190d000-000b-7000-8000-00000000000a` | app/registro/tarea-detalle.jpg | Tarea con lista de verificación y comentarios. | - |

## Cantidad de archivos por módulo (sin hojas)

- app/cuenta: 9
- app/gestion: 2
- app/historial: 2
- app/hoy: 2
- app/laboratorio: 9
- app/mapa: 1
- app/mas: 2
- app/oficina-admin: 27
- app/oficina-agro: 11
- app/oficina-hacienda: 13
- app/oficina-otros: 34
- app/registro: 15
- web/administracion: 111
- web/campo: 26
- web/cuenta: 12
- web/equipo: 6
- web/estancia: 71
- web/informes: 7
- web/interno: 2
- web/laboratorio: 23
- web/publico: 22
- web/sanidad: 2
- web/tareas: 6
