# Revisión centrada en el costo del producto — REV85, 06/10/2026

Pedido: quitar «Impuesto de la fila» y «Subtotal impreso» de la revisión de facturas. Se eliminaron ambos campos y el desglose calculado de cada renglón. El importe por unidad aparece identificado como «Costo final». Las filas con diferencias conservan el aviso para revisar precio, cantidad y descuento; las filas sin un importe comparable requieren confirmación. Se puede excluir una fila y cargarla manualmente.

Los cálculos de impuestos, descuentos, reparto y centavos conservan su implementación. No se modificó ni desplegó el lector del servidor y no se ejecutaron migraciones. Las decisiones de stock, candidatos y memoria conservan sus controles.

Verificado en código: identidad REV85, edición 2026-10-06 y caché rev85 alineados; eliminación acotada a los controles de pantalla y sus eventos. Fuente: d79dba75ab66c311295eb2317285bc54209139a7.

Verificado localmente: 507/507 pruebas, integridad de 33 archivos y comprobación de secretos privados; revisión en navegador a 1366/390, doce casos r3 y seis casos de costos por ancho. La prueba de pantalla primero detectó los dos controles anteriores. La fixture sintética conserva 16 unidades a $15,125 con total exacto $242,00; también se cotejó la vista del ejemplo del usuario. Las capturas locales se conservan fuera de Git y de la publicación. La primera suite encontró siete comprobaciones de identidad que todavía esperaban REV84; se alinearon con REV85 y la suite completa pasó.

Verificado públicamente: [GitHub Pages 37407599021](https://github.com/gallovalentinn-droid/Sistema-para-comercios/actions/runs/37407599021) exitoso; HTML, SW y manifiesto idénticos a la fuente por SHA-256. El recorrido de revisión, los doce casos r3 y la vista del ejemplo pasaron a 1366/390: ambos controles ausentes y costos conservados. Capturas públicas conservadas solo localmente, sin incorporarlas a Git ni publicar los importes del ejemplo. Las pruebas de navegador usan datos y respuestas sintéticas con escrituras externas bloqueadas; no consumen IA ni stock. Los ZIP REV84 conservan sus datos históricos y no se modificaron.
