# Mercado Pago público para MiComercio

## Objetivo

Conservar la UX Docker integrada en REV96 y permitir que cada dueño conecte sus cuentas mediante OAuth. Mantener dos funciones: cobrar con QR dinámico y comprobar transferencias recibidas con respaldo del proveedor. No pedir al comerciante crear una aplicación propia: la aplicación de MiComercio ya fue creada por su administrador. No se ha aclarado la mención aislada «cobrar con IA»; se conserva el alcance original de QR, sin agregar inteligencia artificial a pagos.

## Estado verificado el 15/11/2026

- Web publicada REV96, commit 64e49aa232cd6f8182e9d57111375e37c0b9d091.
- Conector local Node/SQLite en tools/mercadopago; el cliente llama /api/mercadopago, inexistente en GitHub Pages.
- Proyecto Supabase qrvdfqpxutymmlcplsal activo; sin función ni tablas Mercado Pago. Existe f5_chequear_autoridad(p_comercio_id uuid,p_device_id uuid).
- Aplicación Mercado Pago registrada, ID público 2383552865605665. El usuario confirmó configurar PKCE y permisos read/write/offline access. No se recibieron ni leyeron credenciales.
- El conector local no implementa renovación automática; no basta copiarlo al servidor.

## Alternativas

1. **Supabase Edge Functions + Postgres privado (recomendada).** Reutiliza el backend conectado, HTTPS y autenticación existentes. Requiere adaptar SQLite y bloqueos de proceso a transacciones durables de Postgres, además de renovar tokens.
2. **Node en hosting externo con almacenamiento persistente.** Reutiliza más código local, pero requiere elegir/contratar hosting, HTTPS, respaldo, supervisión y configurar credenciales de un servicio adicional. No hay tal destino autorizado/configurado en esta sesión.

El usuario aprobó Supabase y la ejecución el 15/11/2026. Solicitó además un informe final.

## Flujo del usuario

Configuración → Mercado Pago → Conectar cuenta → página oficial para iniciar sesión y autorizar → retorno a MiComercio con confirmación de cuenta conectada. La contraseña de Mercado Pago nunca pasa por MiComercio. Solo el dueño administra conexiones; el personal con ventas_registrar puede cobrar/verificar según autoridad F5. Las cuentas muestran nombre, principal y caja QR; no muestran tokens ni secretos. Los empleados no deben ver instrucciones de alta Developers.

Vender conserva la secuencia de Docker: Cobrar permite comprobar transferencia o confirmar manualmente; QR crea el cobro específico. Pagos mixtos y Fiado mantienen el mecanismo manual actual. No se registra venta/stock hasta completar el flujo correspondiente. Una confirmación manual debe distinguirse de un pago verificado.

## Arquitectura propuesta

- Nueva función mercadopago para solicitudes autenticadas, con JWT validado por Auth, membresía y autoridad F5 vigentes. Sin autoridad derivada de campos editables del cliente.
- Función separada mercadopago-callback, pública solo para recibir el retorno OAuth. Esta función no permite operaciones de cobro y valida state de un uso, vencimiento y contexto original; rechaza callbacks repetidos, manipulados o cancelados.
- URL de retorno prevista: https://qrvdfqpxutymmlcplsal.supabase.co/functions/v1/mercadopago-callback. Es una propuesta, aún no existe; no registrarla como funcional antes del despliegue.
- Tras el callback, redirección fija a https://micomercio.ar/beta/ con estado no sensible. Nunca parámetros con tokens, credenciales o mensajes crudos del proveedor. La pantalla recupera la lista desde el servidor.
- Datos separados de las tablas financieras existentes: conexiones, desafíos OAuth, intentos de cobro, asociaciones exclusivas de pagos y auditoría mínima. Tablas privadas con RLS y sin acceso directo anon/authenticated; funciones internas con ejecución restringida y search_path fijo. La autoridad del usuario se comprueba antes de cualquier acceso privilegiado.
- Tokens y verificadores cifrados con clave dedicada guardada en Secrets; jamás usar la service-role como clave de cifrado. Secretos MP_CLIENT_ID, MP_CLIENT_SECRET y MP_TOKEN_ENCRYPTION_KEY en el backend. No se ponen credenciales en SQL versionado, navegador, repositorio, logs o conversación. Una clave generada de cifrado nunca se imprime.
- Renovación de tokens serializada por cuenta, con actualización durable y protección frente a renovación concurrente; errores de autenticación exigen reconexión. Verificar expiración real del proveedor.
- Persistencia y exclusión por comercio/venta y cuenta/pago en Postgres; un bloqueo en memoria no es suficiente entre invocaciones Edge. Estados durables y compare-and-swap o transacciones ante carreras; evitar transacción DB abierta durante una llamada externa. Referencias e idempotencia estables para reintentar el mismo QR tras timeout/recarga.
- No hay reembolsos automáticos. Un resultado de red desconocido permanece pendiente y consultable. Un QR pendiente debe resolverse o cancelarse con confirmación del proveedor antes de pasar a manual o cerrar turno.
- La verificación coteja identidad del receptor, moneda, importe, estado acreditado y asociación exclusiva. Importe/fingerprint originales quedan congelados; una respuesta del cliente nunca acredita un pago.
- La consulta de transferencias se habilita únicamente después de demostrar con la cuenta autorizada qué tipos de ingresos directos (Mercado Pago y bancos) devuelve la API. No afirmar cobertura universal de alias/CVU con la búsqueda genérica de Payments. Si el producto no proporciona esa cobertura, explicar el límite y conservar manual; cualquier ampliación será decisión posterior.
- CORS limitado a los orígenes de MiComercio; respuestas sin caché; tamaño/plazo de solicitudes acotados; rechazar acciones/IDs desconocidos y nunca devolver errores crudos del proveedor/SQL.

## Activación y entrega

1. Preparar e implementar contra la fuente pública más reciente; conservar lector REV95 y UX REV96. Dejar diseño, migración reproducible, funciones, pruebas y operación en el mismo candidato.
2. Ejecutar primero pruebas locales con proveedor simulado y PostgreSQL Docker separado/fixtures, sin tocar ventas reales ni credenciales del usuario. Revisión independiente de permisos, callbacks y carreras.
3. Desplegar migración y funciones aisladas de MP, con reversión de web y deshabilitación del inicio de nuevos cobros. No eliminar conexiones/pagos al revertir; conservar las claves necesarias para recuperar registros.
4. Registrar en Developers la URL de retorno verificada y configurar secretos desde el panel privado del backend. El usuario acepta términos y completa verificaciones de cuenta personalmente. Nunca pedirle pegar secretos en el chat.
5. Autorizar una cuenta y verificar QR/transferencias primero en el entorno de pruebas del proveedor; las pruebas con dinero real requieren importe, cuentas y aprobación concretos antes de mover dinero.
6. Publicar cliente con endpoint real; incrementar revisión HTML/SW/manifiesto juntos. No publicar un botón de conexión funcional antes de tener el backend operativo.

## Criterios de aceptación

- Conectar y reconectar cuentas, elegir principal/caja, desconectar y volver de OAuth sin filtración de secretos.
- Sin sesión, membresía ajena, usuario suspendido, empleado sin permiso o dispositivo revocado: rechazo.
- State vencido, reutilizado, manipulado y callback cancelado: rechazo seguro, sin cuenta creada.
- Doble QR/timeout/reintento/recarga/guardado fallido y cierre pendiente no duplican venta, stock ni cobro. Un pago no puede acreditar dos ventas ni cruzar comercios.
- Transferencia con destinatario, importe, moneda o acreditación incorrectos no se acepta.
- Dos renovaciones, dos verificaciones y dos cambios de principal concurrentes conservan exclusión y estado coherente.
- Suite local completa, SQL transaccional/concurrente y navegador 1366/390; repetir escenarios públicos con escrituras bloqueadas y proveedor simulado. Separar evidencia de código, local y pública; no llamar a pruebas simuladas cobros reales.

## Fuera de alcance

Lector IA, pagos divididos automáticos, Fiado automático, devoluciones automáticas, almacenar datos de tarjeta y modificar historiales financieros. Webhooks pueden añadirse si hacen falta para los escenarios elegidos, con firma/autenticidad verificada; no sustituir consulta al proveedor por confianza en el cuerpo recibido.
