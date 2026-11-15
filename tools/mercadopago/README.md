# Mercado Pago · laboratorio Docker

Vista de esta integración: **http://127.0.0.1:55382/beta/**.

Se parte de la última UX del chat Docker, preservada en ux-docker-continuacion: cb1c9fc y sus 67 archivos locales. El nuevo worktree administrado de este chat es `3e09/Sistema-para-comercios`. Las vistas anteriores y sus datos se conservan. No se publicaron cambios.

## Entrega unificada vigente — 15/11/2026

Continuar en `.worktrees/mercadopago-docker/` del repositorio principal. La vista 55382 se sirve desde esta carpeta, con la última UX de Docker y MP r3 combinadas. Edición `2026-11-15-docker-mp-r4`. El párrafo de origen anterior es histórico. Informe: `entregables/unificacion-2026-11-15/INFORME.md`.

## Uso

1. Mantener iniciado el Supabase local existente en Docker (puertos 55321/55322).
2. Ejecutar `tools/mercadopago/iniciar.ps1` desde este worktree. Arranca un proceso Node 24 oculto y conserva el almacén local entre reinicios.
3. Usar los mismos usuarios ficticios del laboratorio. En Vender → Transferencia / QR aparece el cobro manual, la consulta de transferencias y la generación del QR. Configuración → Mercado Pago administra las cuentas.

Desde la r2 local del 13/11, Vender muestra primero Cobrar y Cobrar con QR. Al tocar Cobrar aparecen las opciones para comprobar la transferencia o confirmar sin comprobar; la venta se registra al completar esa elección. QR inicia directamente su propio flujo. La vista del puerto 55382 vuelve a servirse desde el worktree administrado 3e09.

Desde la r3 local del 14/11, Configuración → Mercado Pago distingue el alta de la aplicación y la autorización de cuentas. Sin la aplicación configurada, muestra «Configurar aplicación en Mercado Pago», que abre el panel oficial Developers; iniciar sesión allí por sí solo no conecta una cuenta. Una vez configurada la aplicación, el dueño toca Conectar otra cuenta (el nombre es opcional) y se redirige a Mercado Pago para iniciar sesión y autorizar, regresando luego al sistema. MiComercio no pide la contraseña de Mercado Pago. La aplicación Developers se crea una sola vez para MiComercio; los comercios no deben crear aplicaciones propias para autorizar sus cuentas.

La app habitual no fabrica cobros ni cuentas de demostración. Sin configurar la aplicación del proveedor, el cobro manual funciona y la conexión aparece pendiente. Los QR y las transferencias de las pruebas de navegador pertenecen exclusivamente al proveedor simulado del arnés; no son cobrables.

## Activación real pendiente

El usuario confirmó el 12/11 que todavía no existe una aplicación Mercado Pago para MiComercio. Para probar operaciones reales hacen falta:

- Crear la aplicación para Código QR en Mercado Pago Developers y habilitar OAuth con PKCE. Solicitar únicamente los permisos que requieran la consulta de ingresos y la creación/cancelación de órdenes.
- Registrar una URL HTTPS estable que termine en `/api/mercadopago/callback`. El servidor de este laboratorio escucha solamente en loopback. Una dirección HTTP de loopback no sustituye el callback HTTPS registrado; no se configuró publicación ni túnel.
- Configurar privadamente `clientId`, `clientSecret` y `redirectUri` en `.mercadopago-local/config.json`; nunca en beta, fuentes, conversaciones, capturas ni commits. El servidor solo informa si la aplicación está configurada y nunca devuelve estos valores.
- Conectar cada cuenta mediante el botón de Configuración. Elegir su caja existente de Mercado Pago; si no tiene una, crearla durante el alta del proveedor. Una cuenta es principal y las demás se eligen al cobrar.
- Probar con cuentas de prueba del proveedor: ingreso desde Mercado Pago, ingreso desde un banco, importes repetidos, pago QR, cancelación y recuperación. Confirmar específicamente la cobertura real de transferencias directas a alias/CVU por la aplicación autorizada. La búsqueda genérica de pagos no demuestra esa cobertura por sí sola.

El conector usa OAuth Authorization Code + PKCE, búsqueda/consulta individual de Payments y Orders QR dinámico (`POST /v1/orders`, `GET /v1/orders/{id}`, `POST /v1/orders/{id}/cancel`). Esta entrega consulta el estado mientras está abierto el cobro y al recuperarlo; no instala webhooks públicos. Un token expirado exige reconectar la cuenta. No hay reembolsos automáticos ni manejo de dinero por devoluciones en esta integración.

## Datos y límites

Auth, autoridad F5, ventas, inventario y outbox conservan el Supabase Docker existente. El servidor local comprueba usuario, membresía activa, permisos efectivos y dispositivo/licencia vigentes antes de consultar o modificar cobros. El personal con `ventas_registrar` puede verificar; solo el dueño conecta y administra cuentas.

El registro de conexiones, intentos y verificaciones vive en SQLite privado, separado del esquema financiero existente. Tiene transacciones, exclusión por ingreso y por venta, referencias estables, auditoría y credenciales cifradas con AES-GCM. Su directorio y la clave de cifrado se excluyen de Git y del servidor HTTP. Deben conservarse juntos para recuperar las conexiones después de un reinicio; este almacén local no sustituye una estrategia de respaldo/despliegue para producción.

El navegador persiste el intento por usuario/comercio, sin credenciales. Vender permite recuperarlo tras una recarga. Un pago verificado conserva el cálculo e ítems originales, aunque cambie una promoción mientras se paga. Si falla el guardado, se reintenta la misma operación y se descuenta stock una sola vez. Pasar de QR a manual requiere consultar y confirmar la cancelación, o registrar el pago si ya se acreditó. Un resultado de red desconocido se conserva pendiente.

La verificación se asocia al ID legacy de la venta y se consulta desde el comprobante contra el registro del servidor; no se confía en una captura del cliente. Los métodos de pago existentes siguen siendo transferencia/QR para los reportes. La primera versión verifica cobros completos desde el modal de venta; los pagos divididos y Fiado conservan su flujo manual previo.

## Verificación reproducible

```powershell
node --test tests/*.test.cjs
node tests/browser-mercadopago.cjs
node tests/browser-mercadopago-conexion.cjs
$env:WIDTH='390'; node tests/browser-mercadopago.cjs
node tests/mercadopago-docker.cjs
node tools/verificar-integridad.cjs
```

El arnés de navegador usa fixtures sintéticos y bloquea red externa. La comprobación Docker autentica al dueño ficticio, verifica autoridad real y rechazo de dispositivo ajeno, y comprueba que las cantidades de ventas/pagos/movimientos/productos no cambian. No prueba cobros reales en Mercado Pago.

Dependencia local de QR: `qrcode-generator` 2.0.4, MIT; código y licencia incluidos en beta/vendor. No se envía la trama a generadores externos.

## Fuentes oficiales

- https://www.mercadopago.com.ar/developers/es/docs/security/oauth/creation
- https://www.mercadopago.com.ar/developers/es/docs/qr-code/payment-processing
- https://www.mercadopago.com.ar/developers/es/docs/qr-code/create-store-and-pos
- https://www.mercadopago.com.ar/developers/es/reference/online-payments/subscriptions/search-payments/get
- https://github.com/kazuhikoarase/qrcode-generator
