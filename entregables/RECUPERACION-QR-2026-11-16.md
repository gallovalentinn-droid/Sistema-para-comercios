# Recuperación del cobro pendiente — 16/11/2026

El usuario informó que «Recuperar cobro pendiente» abría la pantalla de cobro pero no hacía nada. Se reprodujo una causa concreta: la consulta del QR esperaba la carga de cuentas y, si esa solicitud fallaba, nunca comenzaba.

Se consulta inmediatamente el intento QR original, usando su cuenta y referencia guardadas, sin esperar el listado de cuentas ni generar otra orden. Las transferencias pendientes conservan su modalidad; la recuperación de QR no las convierte en nuevos QR. Una prueba del fallo anterior agotó el plazo sin consultar; la prueba final consulta el mismo intento con el listado de cuentas respondiendo 503 y verifica cero órdenes nuevas.

Se agregó diagnóstico del servidor limitado a `MP_PUBLIC_ERROR`, una acción de una lista cerrada y un código permitido. No registra credenciales, códigos OAuth, importes, cuentas, órdenes, cuerpo de solicitudes/respuestas ni mensajes crudos del proveedor o SQL. Una prueba comprueba que un error privado se sustituye por un código genérico antes de registrarlo y responderlo.

Verificado en código: revisión independiente final aprobada. Cliente REV99, edición 2026-11-16-mp-recuperar-r1, caché rev99-r1. No cambian las validaciones de acreditación, importes, destinatario ni las reglas de idempotencia.

Diagnóstico público previo, solo lectura: un intento `created`, ningún recibo; se observaron rechazos HTTP 409, pero su causa precisa todavía no estaba registrada. No se considera verificado el pago real informado por el usuario, ni resuelto el rechazo desde MODO. Tampoco se inició otro cobro, confirmó manualmente o reembolsó el pago.

Pendiente: consultar nuevamente el intento real con el diagnóstico activo y comprobar la causa del rechazo. Esta corrección elimina la dependencia del listado de cuentas; por sí sola no demuestra cuál fue el resultado del pago en Mercado Pago.
