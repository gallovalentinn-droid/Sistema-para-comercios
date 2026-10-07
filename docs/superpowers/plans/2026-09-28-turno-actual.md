# Turno actual — plan de implementación

> **Para ejecutar:** aplicar el plan por etapas en esta sesión y verificar cada etapa.

**Objetivo:** mostrar el estado de caja del turno con una cuenta entendible, adaptada a los tres modos, los medios de pago y los movimientos recientes.

**Arquitectura:** mantener `calcularTotalesTurno` y el cierre como fuentes contables. Crear funciones de presentación puras para desglosar efectivo y ordenar movimientos, y reemplazar solo la vista de turno. Conservar las tablas completas para consultar operaciones anteriores.

**Archivos:** `beta/index.html`, `beta/sw.js`, `integrity-manifest.json`, pruebas de Caja e identidad en `tests/`.

**Riesgos a comprobar:** caja única que separa cigarrillos solo al cerrar; dos cajas físicas; ventas con pago mixto o electrónico; cobros de fiado que entran en caja sin ser ventas del turno; gastos no efectivos; cero ventas con fondo inicial; saldos negativos; movimientos empatados en horario.

## Etapa 1 — Datos para la vista

- [ ] Escribir pruebas que fallen para la cuenta de cada modo y la separación entre gastos y retiros.
- [ ] Escribir pruebas que fallen para la conciliación de medios de pago y el orden de movimientos.
- [ ] Implementar funciones de presentación sin alterar los importes del cierre.
- [ ] Ejecutar las pruebas nuevas hasta que pasen.

## Etapa 2 — Interfaz

- [ ] Mostrar estado, responsable, antigüedad, acciones como botones y una o dos tarjetas de efectivo según el modo.
- [ ] Mostrar todos los medios de pago, los últimos cinco movimientos y acceso a la lista completa.
- [ ] Adaptar el diseño a móvil; conservar accesibilidad y las acciones existentes.
- [ ] Comprobar la vista con datos sintéticos en navegador, en los tres modos.

## Etapa 3 — Entrega

- [ ] Alinear la identidad de build, el service worker, el manifiesto y las pruebas de versión.
- [ ] Ejecutar toda la batería local, sintaxis e integridad.
- [ ] Comprobar la beta pública para el escenario afectado si se publica, e informar por separado código, local y público.
