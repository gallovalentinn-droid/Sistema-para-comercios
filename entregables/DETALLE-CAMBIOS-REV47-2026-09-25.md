# MiComercio — revisión de la auditoría REV46 y cambios de REV47

Fecha: 25/09/2026

## Evaluación de la auditoría

Comprobé que el ZIP auditado es el REV46 entregado: su SHA-256 coincide con el consignado en la auditoría. Los seis hallazgos de REV45 siguen corregidos y las pruebas locales de REV46 volvieron a pasar. La auditoría REV46 no presenta un nuevo defecto funcional de severidad media o alta; sí señala una posibilidad residual en la migración histórica del fondo de caja que decidí corregir por su impacto en el arqueo.

## Cambios de REV47

1. **Fondo de caja ante un reloj atrasado.** La migración histórica de REV41 sólo puede poner en cero el fondo heredado si el cierre anterior tiene una fecha de recepción **confirmada por el servidor y anterior a REV40**. La fecha local por sí sola ya no alcanza para modificar dinero. Si el cierre todavía no tiene confirmación del servidor, el fondo se conserva. Se mantiene la recuperación del caso histórico confirmado.
2. **Texto del cierre.** La confirmación ahora dice «1 venta» en singular y «N ventas» en plural.
3. **Identidad alineada.** El HTML, la caché del service worker, el manifiesto de integridad y las pruebas declaran REV47.

## Observaciones de la auditoría que no cambié

- **Red lenta:** el límite de 8 segundos evita que una conexión colgada demore todo el arranque. Si se cumple ese límite, se muestran los datos locales y la sincronización continúa después. Es el comportamiento offline previsto; conviene medirlo con una red lenta real antes de modificarlo.
- **Fondo reservado en el dispositivo:** se guarda localmente hasta abrir la próxima sesión de esa caja. Cambiarlo para transferirlo entre dispositivos exige definir quién tiene autoridad sobre el efectivo físico compartido; no conviene inferir esa regla de la auditoría.
- **Precio $0:** el editor permite confirmarlo de forma explícita; una factura leída automáticamente exige precio positivo para evitar altas accidentales a $0. Mantengo esa protección.
- **Pendientes de Auth, backend e IA:** la auditoría los enumera fuera del ZIP. No se modificaron servicios ni datos de producción en esta revisión.

## Verificación

- **Código:** revisé la fecha confirmada del cierre en el mapeo V4 (`closed_at_server`) y el uso de esa fecha en la migración del fondo.
- **Local:** 183 de 183 pruebas aprobadas; sintaxis del cliente válida; integridad correcta de 14 archivos; sin errores de formato en el diff. La nueva prueba reproduce el reloj atrasado y comprueba que no se borra el fondo manual. También se conservó la prueba del cierre histórico anterior a REV40.
- **Entorno público:** REV47 no se publicó ni se probó en la beta pública. No se consultaron ni cambiaron datos reales de comercios.

El ZIP contiene el sistema completo, las pruebas, las dependencias locales, las migraciones existentes y los informes de cambios hasta REV47.
