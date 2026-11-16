# Corrección de selección de cajas Mercado Pago — 16/11/2026

El usuario creó su caja en Mercado Pago pero MiComercio seguía pidiendo crear una. El conector consultaba el recurso anterior `/pos`, leía `results` y descartaba cajas sin `external_id`.

Se utiliza la búsqueda actual `/v2/pos`, su colección `data` y páginas de 30. Las cajas existentes sin identificador externo se muestran por su ID de Mercado Pago. Al guardar la elección del dueño, se asigna un identificador estable mediante PATCH solo del campo `external_id`, se vuelve a consultar y se guarda la selección. Los identificadores existentes se conservan; las cajas ajenas o inactivas se rechazan. Si se pierde la respuesta de preparación, el mismo formulario puede reintentarse sin repetir la modificación.

Verificado en código: revisión independiente final sin defectos importantes pendientes. La revisión detectó un fallo de reintento que se reprodujo con una prueba fallida y se corrigió antes del despliegue. No cambia el cliente, la identidad REV97 ni el service worker; la corrección corresponde al servidor.

Verificado localmente: 675/675 pruebas completas, sin omisiones ni fallos; pruebas de contrato para búsqueda, paginación, preparación, conservación de IDs, exclusión de cajas ajenas/inactivas y recuperación tras respuesta perdida. La suite completa incluye SQL sintético en una base aislada de Docker; ver `mercadopago-publico-2026-11-15/cajas-node-final.txt`.

Verificado en la beta pública: recorrido de selección y guardado a 1366 y 390 píxeles con sesión y respuestas del proveedor simuladas y escrituras reales bloqueadas. Esto verifica la compatibilidad de la interfaz publicada, pero no acredita que la caja real del usuario ya haya sido seleccionada.

Pendiente: volver a abrir «Elegir caja QR», elegir la caja real y guardarla. No se inició ningún cobro real ni se verificó la cobertura de transferencias directas.

Referencias oficiales consultadas:

- [Buscar cajas](https://www.mercadopago.com.ar/developers/es/reference/in-person-payments/qr-code/pos/search-pos/get).
- [Actualizar caja](https://www.mercadopago.com.ar/developers/es/reference/in-person-payments/qr-code/pos/update-pos/patch).

Despliegue comprobado: mercadopago y mercadopago-callback v4 ACTIVE; todos los archivos remotos coinciden con la fuente probada. HTTP: CORS 204, solicitud sin sesión 401, callback sin estado válido 303 a la ruta fija de error. Sin cambios de esquema, secretos ni datos operativos.
