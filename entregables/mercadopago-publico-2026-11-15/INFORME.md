# Informe — Mercado Pago público en MiComercio

Fecha: 15/11/2026 (Argentina). Pedido y diseño aprobados por el usuario. Fuente inicial de código web: `800e2b0076d791c935c276311b8b75f0ab105bdd`, sobre REV96 `64e49aa232cd6f8182e9d57111375e37c0b9d091`.

## Resultado

Se implementó el servidor público que faltaba para que la web pueda conectar cuentas Mercado Pago mediante autorización oficial, consultar sus cajas y operar los flujos QR y de verificación preparados. La interfaz conserva el comportamiento Docker y las correcciones del lector. El cobro manual sigue disponible y se identifica como manual.

La autorización real de una cuenta ya fue completada por el usuario y confirmada mediante auditoría y almacenamiento cifrado en el servidor. Un QR acreditado real y la cobertura de transferencias directas siguen pendientes; no se consideran probados por las simulaciones. La consulta/verificación de transferencias permanece deshabilitada por defecto hasta validar esa cobertura.

## Cambios realizados

- La web pública llama a Supabase; Docker mantiene su conector local. JWT, comercio y dispositivo se validan con Auth, membresía activa y autoridad F5.
- Solo el dueño administra conexiones. Cada dueño autoriza su cuenta en Mercado Pago, sin entregar su contraseña a MiComercio. Puede mantener varias cuentas, elegir principal, elegir caja QR, desconectar y reconectar.
- OAuth utiliza PKCE S256 y un desafío de un uso que vence a los diez minutos. El callback vuelve a una dirección fija y revalida la autoridad antes y después de consultar al proveedor. El resultado abre Configuración y confirma la cuenta contra el servidor.
- Las autorizaciones se cifran con AES-GCM y una clave dedicada. La renovación de tokens está serializada; un resultado ambiguo de renovación exige reconexión y no reutiliza un refresh token que pudo consumirse.
- Intentos, recibos, desafíos OAuth y auditoría se guardan separados en PostgreSQL. Bloqueos durables, propietarios de lease y restricciones únicas evitan reutilizar un ingreso en dos ventas o que una respuesta atrasada sobrescriba al worker actual.
- El QR conserva monto, caja, referencia e idempotencia; una recarga, timeout o guardado fallido recupera el mismo intento. No se permite pasar a manual mientras pueda existir un QR cobrado sin resolver. Cancelar una solicitud que nunca llegó deja una marca durable que detiene creaciones demoradas.
- Se conservó la recuperación de intentos cancelados/vencidos y recibos aun cuando se desconecta la cuenta, sin reutilizar credenciales ni iniciar nuevos cobros.
- La función de consulta de transferencias coteja receptor, moneda, importe y acreditación; una captura o respuesta del navegador no acredita un pago. Su capacidad está cerrada hasta verificar ingresos reales disponibles para la aplicación autorizada.
- Se agregó una pausa de nuevos cobros que conserva la recuperación de pendientes y el cobro manual.

## Despliegue y seguridad verificados

Proyecto Supabase: `qrvdfqpxutymmlcplsal`.

| Elemento | Evidencia |
| --- | --- |
| Migración | `mercadopago_publico`, versión remota `20261115232440`; fuente `supabase/migrations/20261115184112_mercadopago_publico.sql` |
| Datos privados | Cinco tablas en `mp_private`, todas con RLS y sin acceso directo anon/authenticated |
| Puente interno | `mp_publico_store(text,jsonb)`: ejecución anon=false, authenticated=false, service_role=true; search_path fijo |
| API | `mercadopago` ACTIVE v3, JWT requerido y autorización adicional en cuerpo |
| Callback | `mercadopago-callback` ACTIVE v3, público exclusivamente para validar desafío OAuth y autoridad original |
| Fuentes remotas | Los tres archivos de cada función descargados y cotejados con las fuentes probadas |
| Pruebas HTTP públicas | OPTIONS permitido 204; POST sin sesión 401; origen ajeno 403; callback inválido 303 hacia error fijo sin información sensible |

El usuario confirmó cargar `MP_CLIENT_ID`, `MP_CLIENT_SECRET` y `MP_TOKEN_ENCRYPTION_KEY` directamente en Supabase Secrets. No se recibieron ni leyeron sus valores. La clave de cifrado se generó únicamente en memoria y se copió al portapapeles, sin imprimir ni guardar en archivos; después se limpió el portapapeles actual sin leerlo. El usuario confirmó guardar callback y PKCE. Luego el usuario completó la autorización real: el servidor confirmó una cuenta activa, una autorización cifrada y un evento connected, con cero intentos de cobro y cero recibos en esa comprobación.

La migración no modifica tablas financieras, autoridad F5 ni el lector. La fuente remota de `leer-factura` mantiene la huella previa `9ea66fafb5bd1b69e46a0d8876f09ead5a59b0902a324dd3fb30928a1abfa9bc`; su versión observada inicialmente tras configurar Secrets fue 35; se cotejó la huella de fuente, no se asumió que el número de versión quedara fijo. No se desplegó esa función en esta tarea.

Se compararon los avisos de seguridad: cinco INFO nuevos por RLS sin políticas en el almacén privado, consistente con el acceso cliente revocado; los WARN anteriores permanecen. No se crearon políticas cliente para silenciar esos avisos. [Explicación del aviso RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Pruebas y revisiones

**Verificado en código:** revisión de diseño, cliente, backend y conjunto. Se corrigieron los siguientes hallazgos: retorno OAuth sin abrir Configuración; caja vacía congelada; rechazo definitivo que atrapaba el cobro; estado de orden confundido con estado de transacción; recuperación tras desconectar cuenta; documentación de reversión. También se corrigió el mensaje de pausa del servidor. Durante el alta real, Mercado Pago rechazó parámetros; en la captura el Client ID aparecía enmascarado. Se indicó corregir únicamente el ID público y el usuario logró conectar. Se agregó una validación de formato numérico antes de generar desafíos OAuth, con regresión RED/GREEN y relectura aprobada. Nunca se leyó el Secret para diagnosticarlo. Las dos funciones se redesplegaron como v3, sin nueva migración ni cambios en HTML/SW. Relecturas acotadas sin hallazgos abiertos.

Para QR se contrastó el contrato oficial: la orden pagada está processed/processed, mientras su transacción está processed/accredited. Se corrigió la implementación y los fixtures que ocultaban esa diferencia. [Estados oficiales de órdenes y transacciones](https://www.mercadopago.com.ar/developers/es/docs/qr-code/resources/status-order-transaction).

**Verificado localmente:**

- Base anterior: 631/631 Node.
- Suite final con `MP_SQL_TEST=true`: **671/671**, cero fallos, canceladas u omitidas. Incluye PostgreSQL real en la DB sintética `mp_publico_test_20261115` de Docker, sin usar la base comercial.
- Ola final focal: **34/34**, con registros RED/GREEN de defectos reproducidos.
- Integridad: **46/46** archivos, también cotejados contra los bytes del commit de publicación.
- Cliente: transporte HTTPS/local, cambio de sesión, permisos, capacidades, conexión OAuth simulada y recuperación de cinco ventas sintéticas tras recarga.
- Ola final: 16 ejecuciones de ocho módulos de navegador en 1366/390, más dos del nuevo escenario de pausa y recuperación (18/18). Además, recorridos previos de Caja ciega/pendiente y MP en ambos anchos.
- Compilación Deno de los wrappers y compilación de despliegue aprobadas.

**Verificado públicamente:** migración, ACL/RLS, funciones ACTIVE v3, fuentes remotas y pruebas HTTP indicadas arriba. GitHub Pages ejecución 43775038560 terminó success para REV97 (800e2b0). Cinco archivos públicos —HTML, SW, JS MP, biblioteca QR y manifiesto— se cotejaron por bytes con el commit. Se aprobaron 16 ejecuciones de ocho recorridos en 1366/390 sobre la web pública: MP público, recuperación/pausa, capacidades, conexión, cobros, Caja ciega, cierre pendiente y selectores. Sesión y proveedor sintéticos, red externa de escritura bloqueada; no se acreditan pagos reales por estos recorridos. La conexión OAuth real se acredita por la acción del usuario, la captura del panel y la comprobación agregada del servidor.

## Operación y reversión

Instrucciones: `tools/mercadopago/PUBLICO.md` y `supabase/functions/mercadopago/README.md`.

- `MP_TRANSFER_VERIFICATION_ENABLED` permanece sin activar hasta demostrar la cobertura de transferencias del proveedor.
- `MP_NEW_PAYMENTS_ENABLED=false` pausa nuevas operaciones conservando pendientes. No retirar secretos ni borrar datos como mecanismo de apagado.
- Conservar la clave de cifrado y las funciones. No volver a REV96 sin conservar un cliente compatible con el transporte público, porque impediría recuperar pendientes.
- Si la creación de un QR sigue siendo desconocida cerca del límite de retención de idempotencia del proveedor, se detiene la recreación y requiere conciliación; no se confirma manualmente a ciegas.
- No hay reembolsos automáticos. Pagos mixtos y Fiado conservan el flujo manual. Esta entrega consulta mientras está abierto el cobro y al recuperarlo; no instala webhooks públicos.

## Pendientes de aceptación real

1. **Completado:** abrir la beta como dueño y conectar una cuenta mediante la página oficial; la cuenta ya aparece conectada y su autorización está cifrada.
2. **Pendiente:** crear un local/caja en Mercado Pago, porque la lista elegible quedó vacía; después volver a Elegir caja QR y asociarla. El usuario fue guiado a Configuración → Negocio → Locales. Si una caja creada en la web no tiene identificador externo, puede requerir preparación adicional para la API; no se asegura que cualquier QR impreso sea elegible automáticamente.
3. Probar con cuentas del entorno de pruebas del proveedor un QR acreditado, cancelación, timeout y recuperación.
4. Comprobar qué ingresos directos desde Mercado Pago y bancos puede consultar la aplicación OAuth. Activar verificación de transferencias únicamente después de esa aceptación.

El agente no inició pagos ni movimientos de dinero reales. La comprobación del servidor después de la conexión encontró cero intentos y cero recibos de cobro. Las operaciones con dinero real requieren cuentas e importe expresamente autorizados.

## Evidencia reproducible

En esta carpeta: `node-final.txt`, `final-fix-red.txt`, `final-fix-green.txt`, `final-fix-migration.txt`, `final-fix-browser-*`, `smoke-publico.json`, `hashes-publicos.json` y `browser-publico-resumen.json`. Los informes de revisión se conservan en `.superpowers/sdd/2026-11-15-mercadopago-publico/` del workspace original. No incluyen secretos.
