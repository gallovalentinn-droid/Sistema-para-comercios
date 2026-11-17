# Transferencia automática sin dependencia del remitente

Diseño indicado y aprobado por el usuario en su propuesta: QR y Transferencia sin recomendar ninguno; consulta automática, candidato único propuesto, confirmación humana; múltiples candidatos requieren elección por hora del comprobante; alternativa manual explícita. Nombre opcional, solo desde la respuesta normal de pagos. Se retira el camino de reportes.

## Enfoque elegido

Reutilizar receipts, transfer-start, claim, el cierre seguro y la exclusión/idempotencia existentes. No asociar ni registrar una venta durante consultas. Un candidato único propone su ID; la confirmación reconsulta antes del claim y, si cambia la lista o aparece ambigüedad, exige revisar/seleccionar. Ninguna recomendación visual de QR.

Alternativas descartadas por el usuario: mantener selección obligatoria de una lista para todo cobro; identificación dependiente de los reportes. No introducir reconocimiento de comprobantes ni CUIT/banco como identificación.

## Estados

- Espera: “Esperando la transferencia…”; consulta automática con controles disponibles.
- Uno: “Llegó $X a las HH:mm:ss ✓”, nombre opcional; botón Confirmar venta, sin elegir fila.
- Varios: horarios exactos/importe y elección explícita; comparar comprobante. Nunca elegir automáticamente entre varios.
- Consulta recortada o fallida: no proponer un candidato como único; permitir reintento/manual.
- El candidato usado/desaparecido o una cuenta/ticket/sesión distinta invalida la confirmación. La respuesta tardía no afecta otro cobro.
- Manual: confirmación inline ya existente, sin reclamo automático.

## Ventana y seguridad

Para este flujo los ingresos deben acreditarse desde el inicio del cobro hasta treinta minutos después. Se elimina la tolerancia anterior de dos minutos para impedir proponer pagos anteriores. La misma regla se aplica en el servidor público y Docker. Importes en centavos, receptor y ARS, acreditación, exclusión de órdenes QR/reembolsos y uso único no se relajan.

No se puede inferir inequívocamente qué cliente pagó solo por importe/hora; la propuesta única siempre requiere confirmación humana.

## Retiro de reportes

Eliminar solicitudes, descargas, parser, caché y enriquecimiento por reportes del producto. No borrar ni modificar la configuración ni reportes ya existentes en Mercado Pago. Para clientes REV105 todavía abiertos, income-senders responde vacío/pending:false sin red de reportes hasta su actualización; la preparación de reportes deja de admitirse. Las pruebas específicas del código retirado se sustituyen por regresiones de ausencia de llamadas y compatibilidad.

## Implementación y validación

Mantener JavaScript/HTML y los servidores actuales. Build/SW/manifiesto REV106 alineados. Pruebas de estados, carreras, ambigüedad, recorte, errores, cierre/manual y seguridad financiera; suite Node completa con Docker; navegador1366/390 y recorridos públicos simulados. Ninguna venta o transferencia ficticia en producción.
