# Mercado Pago público

Fuente de servidor para la beta; no cambia tablas de ventas, stock, Caja o F5.

## Instalación

1. Aplicar `supabase/migrations/20261115184112_mercadopago_publico.sql`.
2. Desplegar `mercadopago` y `mercadopago-callback`, incluyendo ambos módulos `../_shared/mp-*.mjs`. El callback debe tener `verify_jwt=false`: el proveedor no lleva JWT. La API siempre valida JWT con Auth getUser, membresía activa y `f5_chequear_autoridad` antes de usar la RPC privilegiada. La configuración del gateway no sustituye esos controles.
3. Registrar en la aplicación Mercado Pago esta URL exacta: `https://qrvdfqpxutymmlcplsal.supabase.co/functions/v1/mercadopago-callback`. Activar PKCE y permisos de lectura/escritura/offline access. El retorno del navegador es fijo: `https://micomercio.ar/beta/?mercadopago=conectado` o `mercadopago=error`.
4. Configurar privadamente los Secrets; nunca poner valores en el chat, archivos versionados, argumentos del shell o logs.

| Variable | Contrato |
| --- | --- |
| `MP_CLIENT_ID` | Identificador público de la aplicación, como texto. |
| `MP_CLIENT_SECRET` | Secreto de la misma aplicación. Solo servidor. |
| `MP_TOKEN_ENCRYPTION_KEY` | Exactamente 32 bytes aleatorios criptográficos, codificados en base64 estándar: 44 caracteres y un `=` final. Clave AES-256-GCM dedicada, nunca service role. Generar y trasladar privadamente al panel sin imprimirla ni guardarla en el repositorio. Conservarla en un gestor seguro: perderla impide recuperar tokens existentes. |
| `MP_TRANSFER_VERIFICATION_ENABLED` | Solo el literal `true` habilita buscar y asociar transferencias nuevas. Dejar ausente o `false` hasta verificar cobertura del proveedor con una cuenta autorizada. |
| `MP_NEW_PAYMENTS_ENABLED` | El literal `false` impide iniciar QR y verificaciones nuevas. Ausente conserva nuevos cobros habilitados si el backend está configurado. No impide reconciliar/cancelar intentos existentes ni recuperar recibos. |

Supabase suministra `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` al servidor. No consultar ni copiar sus valores. Sin los secretos MP completos y una clave válida, `accounts.configured` es `false`; se siguen mostrando únicamente metadatos públicos de conexiones y se pueden recuperar recibos persistidos. `accounts.capabilities` informa `transferVerification` y `newPayments`. Un empleado con `ventas_registrar` puede cobrar; solo el dueño administra cuentas y cajas.

## Persistencia y recuperación

La RPC `public.mp_publico_store(text,jsonb)` solo admite `service_role`. Las cinco tablas están en `mp_private`, con RLS y acceso directo revocado. El servidor es la frontera de autorización; no invocar el puente desde el cliente. La única lectura privilegiada previa a Auth es consumir atómicamente el hash de un state OAuth aleatorio; después el callback revalida el contexto original antes y después de llamar al proveedor.

Un lease de venta con propietario/CAS de 90 segundos protege todas las mutaciones entre workers. Las transacciones duran una llamada RPC y no incluyen fetch al proveedor. Referencia externa aleatoria, cuenta, importe, fingerprint, POS e idempotency key quedan durables. Un intento preparado antiguo con POS vacío puede completarlo antes del primer envío. Después de iniciar la creación no cambia el cuerpo congelado.

`qr-status` sobre una venta inexistente devuelve `COBRO_NO_EXISTE` y no crea una order. `qr-cancel` sobre una solicitud que nunca llegó guarda una cancelación durable con su snapshot; una creación demorada ve esa cancelación y no llama al proveedor. Un intento ya enviado y ambiguo conserva su estado `creating`; se recupera con la misma clave idempotente y solo pasa a manual tras cancelación/expiración confirmada. Después de 23 horas no se reintenta una creación desconocida sin ID: requiere conciliación, evitando confiar en una ventana de idempotencia posiblemente vencida.

Un primer rechazo de creación documentado y definitivo (400/404 con código permitido) queda `rejected` y admite cancelación local y luego manual. Timeout, 5xx, respuesta inválida, 4xx desconocido o rechazo posterior a una creación ambigua permanecen pendientes. No hay reembolsos ni descartes automáticos.

La renovación adquiere CAS durable por cuenta. Cada respuesta válida guarda juntos access y refresh token nuevos cifrados. Un fallo ambiguo o un worker muerto durante refresh exige reconectar; nunca vuelve a utilizar el refresh token antiguo. Una reconexión invalida el propietario anterior, evitando que su respuesta atrasada sobrescriba las credenciales nuevas.

El sistema acredita solo pagos cuyo receptor, moneda, importe y estado coinciden. Un recibo es único por cuenta/pago y por comercio/venta. Recuperar un recibo no vuelve a cobrar ni registra ventas/stock: el cliente conserva su guardado idempotente existente. Buscar Payments no demuestra cobertura universal de transferencias de bancos/alias/CVU.

## Pruebas locales

`node --test tests/mercadopago-publico.test.cjs` ejecuta validación, Auth, cifrado, transporte y errores con proveedor sintético.

La suite `tests/mercadopago-publico-sql.test.cjs` requiere `MP_SQL_TEST=true`, Docker y una base vacía llamada exactamente `mp_publico_test_20261115` en `supabase_db_micomercio-prueba-local`. Crear esa base separada, aplicar ahí la migración y después ejecutar `node --test tests/*.test.cjs`. La suite trunca únicamente tablas `mp_private` dentro de esa base sintética fija. Nunca apuntarla a la base comercial ni a producción. Las pruebas del proveedor son simuladas y no mueven dinero.

Comprobar compilación con `deno check supabase/functions/mercadopago/index.ts supabase/functions/mercadopago-callback/index.ts`. Reaplicar la migración no borra datos ni recibos.

## Reversión

Establecer privadamente `MP_NEW_PAYMENTS_ENABLED=false` y `MP_TRANSFER_VERIFICATION_ENABLED=false`. Conservar el cliente con transporte público `/functions/v1/mercadopago`, autenticación y protocolo de pendientes compatibles, además de las funciones, tablas y clave de cifrado para recuperar/cancelar pendientes y recibos históricos. No restaurar ciegamente REV96: su ruta `/api/mercadopago` no existe en GitHub Pages. Una versión de reversión debe conservar ese transporte y recuperación; solo retirar el cliente compatible después de comprobar la ausencia de pendientes o proveer acceso equivalente. No borrar cuentas ni claves ni retirar secretos para apagar cobros: eso también impediría reconciliar pendientes. Verificar con un pendiente sintético que se puede consultar, cancelar y finalizar manualmente después de pausar. Procedimiento común: `tools/mercadopago/PUBLICO.md`.

## Contratos oficiales consultados el 2026-11-15

- [OAuth y PKCE](https://www.mercadopago.com.ar/developers/es/docs/security/oauth/creation).
- [Refresh token y rotación](https://www.mercadopago.com.ar/developers/es/docs/security/oauth/renewal).
- [Crear Orders QR y rechazos documentados](https://www.mercadopago.com.ar/developers/es/reference/in-person-payments/qr-code/orders/create-order/post).
- [Procesamiento QR, consulta y cancelación](https://www.mercadopago.com.ar/developers/es/docs/qr-code/payment-processing).
- [Estados QR de order y transacción](https://www.mercadopago.com.ar/developers/es/docs/qr-code/resources/status-order-transaction): order `processed/processed`, transacción `processed/accredited`.
- [Idempotencia y migración a Orders](https://www.mercadopago.com.ar/developers/es/docs/qr-code/resources/migrate-dynamic-qr-model-to-orders?scope=prod).
- [Supabase: Auth en Edge Functions](https://supabase.com/docs/guides/functions/auth).
- [Supabase: seguridad de la Data API](https://supabase.com/docs/guides/api/securing-your-api).
