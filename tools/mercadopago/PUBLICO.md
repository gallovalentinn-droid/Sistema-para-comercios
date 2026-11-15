# Conector Mercado Pago público

## Arquitectura

GitHub Pages sirve la web. Supabase aloja mercadopago (JWT + Auth + membresía + F5) y mercadopago-callback (público, solo OAuth state single-use). Persistencia aislada mp_private con RLS, sin permisos cliente y RPC mp_publico_store service_role-only. No copiar el SQLite del laboratorio.

## Configuración privada

En el proyecto Supabase, Edge Functions → Secrets:

- MP_CLIENT_ID: ID público de la aplicación del sistema.
- MP_CLIENT_SECRET: Client Secret de esa aplicación, nunca el Access Token del dueño.
- MP_TOKEN_ENCRYPTION_KEY: 32 bytes aleatorios en base64. La herramienta copiar-clave-cifrado.ps1 genera en memoria y copia al portapapeles sin imprimir ni guardar. No ejecutarla para reemplazar una clave existente con cuentas conectadas: se perdería la capacidad de descifrar sus autorizaciones sin una rotación planificada.
- MP_TRANSFER_VERIFICATION_ENABLED: dejar sin definir o false hasta comprobar cobertura real de los ingresos del proveedor con cuenta autorizada. No activar por ver datos sintéticos.
- MP_NEW_PAYMENTS_ENABLED: false pausa nuevos cobros conservando recuperación de pendientes. Normalmente sin definir (habilitado una vez configurado).

Registrar en Developers, con PKCE S256 y permisos read/write/offline access, la URL exacta:
https://qrvdfqpxutymmlcplsal.supabase.co/functions/v1/mercadopago-callback

Solo registrar como operativa después de verificar su despliegue. El retorno final al navegador es fijo https://micomercio.ar/beta/?mercadopago=conectado o estado de error no sensible. Nunca poner tokens en esa URL.

## Activación

1. Migración supabase/migrations/20261115184112_mercadopago_publico.sql, luego funciones nuevas con sus dependencias _shared/mp-*.mjs. mercadopago exige JWT; callback valida state y autoridad original.
2. Configurar secretos privadamente; no pegarlos en SQL, conversación, comandos versionados o archivos de entrega.
3. Registrar callback en Mercado Pago; entrar a MiComercio como dueño → Configuración → Mercado Pago → Conectar cuenta. Autorización en página oficial. Elegir caja QR existente.
4. Probar proveedor con cuentas de prueba. Las pruebas con dinero real necesitan aprobación previa de cuentas e importe. La autorización por sí sola no demuestra QR acreditado ni cobertura de transferencias directas a alias/CVU.

## Recuperación

Tokens vencidos se renuevan serializadamente; un resultado ambiguo de renovación exige reconectar. Intentos QR conservan referencias e idempotencia, incluso tras timeout. Un rechazo inicial definitivo documentado permite cancelar sin orden; un resultado ambiguo permanece pendiente hasta consultar y confirmar cancelación o acreditación. No se crean reembolsos automáticos.

## Reversión

Pausar nuevas operaciones con MP_NEW_PAYMENTS_ENABLED=false. Conservar las funciones y secretos para resolver pendientes. No borrar mp_private ni la clave de cifrado. Mantener el cliente que consulta pendientes; volver ciegamente a REV96 rompería el transporte público. El cambio no modifica leer-factura ni sus migraciones.

## Verificación

node --test tests/*.test.cjs (para incluir PostgreSQL sintético: MP_SQL_TEST=true; ver tests/mercadopago-publico-sql.test.cjs). La suite SQL usa únicamente mp_publico_test_20261115 en Docker y nunca la DB pública.
Navegador browser-mercadopago-publico, capacidades, conexion y browser-mercadopago, 1366 y 390. Provider/Auth simulados para regresión; no afirmar cobros reales.
