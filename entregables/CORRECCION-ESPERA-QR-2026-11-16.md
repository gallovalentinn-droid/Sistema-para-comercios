# Seguimiento de generación y confirmación QR — 16/11/2026

El usuario informó que pudo pagar escaneando el QR desde Mercado Pago, pero MiComercio no lo confirmó, que la espera era lenta y que MODO no pudo escanearlo.

Diagnóstico confirmado en código: la consulta automática se programaba una vez y solo volvía a programarse tras una respuesta correcta. Un fallo transitorio detenía la comprobación. Se reprodujo con una respuesta 409 y se corrigió para seguir consultando el mismo intento pendiente cada tres segundos después de terminar cada consulta, sin superponer solicitudes ni generar nuevos cobros. La consulta se detiene al resolver el pendiente, salir del panel o cambiar usuario/comercio.

La interfaz muestra inmediatamente un indicador animado «Generando QR», bloquea acciones duplicadas y anuncia «Pago confirmado» únicamente después de validar el recibo y el importe. Si falla guardar la venta, conserva el pago confirmado y la recuperación pendiente. Las validaciones de orden, monto y destinatario siguen vigentes. Algunos rechazos específicos de la consulta ahora muestran su categoría para diagnosticar el intento real.

Verificado en código: revisión independiente sin hallazgos accionables. Web REV98, edición 2026-11-16-mp-qr-r1 y caché rev98-r1 alineadas. Sin cambios SQL, claves, cuentas ni servidor del proveedor.

Verificado localmente: 675/675 pruebas Node con SQL sintético aislado en Docker, sin fallos ni omisiones. Recorridos a 1366/390: generación demorada, fallo inicial 409, detección automática posterior y una sola venta; cinco ventas de regresión por ancho con cancelación y recuperación tras recarga; pausa de cobros y recuperación terminal tras desconexión. Las pruebas iniciales fallaron por ausencia del indicador y por consultas detenidas. Una fixture de recibos se corrigió para reflejar la consulta posterior del recibo. Las expectativas de revisión y los finales de línea se alinearon antes de repetir la suite completa.

Entorno público, diagnóstico de solo lectura: una orden creada, con QR y sin recibo verificado en el momento de la consulta. Esto no confirma el estado actual del pago en Mercado Pago ni demuestra que el corte de consultas sea su única causa. No se aprobaron pagos manualmente, no se generó otro cobro y no se hicieron reembolsos.

MODO: la [ayuda oficial de MODO](https://www.modo.com.ar/ayuda/preguntas-frecuentes) informa compatibilidad con QR de Mercado Pago. No hay evidencia suficiente para atribuir el rechazo de este QR a una causa concreta. Se solicitó el mensaje exacto de MODO; no se cambió arbitrariamente el modo dinámico ni se declaró interoperabilidad probada.

Pendientes: recuperar y consultar el intento real, obtener su resultado específico y verificar MODO con el mensaje de rechazo. La lentitud del servidor/proveedor no se considera resuelta por el indicador ni por reducir la espera entre consultas.
