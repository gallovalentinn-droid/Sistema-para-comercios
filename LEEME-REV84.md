# MiComercio REV84 — preparación local

Esta entrega incorpora L1–L9 del pedido revisado. GPT-6 Luna sigue como principal y Gemini 3.8 Flash como respaldo; HEIC/HEIF usan Gemini. Una fila discordante llega a revisión y bloquea la carga hasta corregirla o excluirla. Los packs requieren una decisión explícita sobre cómo contar stock. El costo incluye impuestos; los importes de fila se conservan en centavos y el costo unitario usa cuatro decimales.

Seguimiento del 05/10, segunda entrega: «X6» y «X40» también requieren esa elección; «X1U» conserva una unidad sin preguntar dos opciones equivalentes. Una fila sin producto se descarta expresamente con «No cargar esta fila»; no se omite automáticamente. El dueño o administrador ve en la revisión un aviso seguro si se usó Gemini por un fallo de OpenAI o si quedó pendiente registrar la lectura.

Decisión del usuario sobre el pie: los precios impresos ya incluyen impuestos. El neto sin impuestos y el IVA discriminados al pie son un desglose informativo y no se vuelven a sumar ni repartir. Un impuesto expresamente agregado a una fila sigue conservándose en su desglose; nunca se inventa un impuesto para hacer cuadrar importes. La decisión no implica que todos los proveedores del mercado facturen de esa manera: describe las facturas de este comercio y requiere revisar nuevas muestras.

La web y el caché son REV84. El paquete utiliza el servidor existente: no contiene una copia de sus datos ni instala una base nueva. No contiene claves, sesiones, fotos de facturas ni catálogos privados. Las claves permanecen en los secretos del servidor.

## Migraciones independientes, todavía sin aplicar públicamente

1. `REV84-LECTOR-MEMORIA.sql`: permite recordar pack/unidad/otra cantidad con el mismo proveedor, producto y presentación. Sin estas columnas se reconoce el producto, pero se pregunta en cada lectura.
2. `REV84-LECTOR-CUPO.sql`: añade reservas temporales y metadatos de intentos, sin guardar contenido de facturas. Dos lecturas concurrentes por comercio; seis llamadas cada cinco minutos y treinta por hora. La admisión reserva capacidad para principal y respaldo; el respaldo admitido no vuelve a pasar el límite. Reserva de tres minutos. El cupo mensual cuenta resultados confirmados; las reservas fallidas/vencidas no confirmadas se excluyen. Tres veces el cupo mensual genera un aviso, sin bloquear.

Cada SQL necesita autorización expresa por separado. La función detecta la migración de cupo en cada solicitud. Si únicamente falta su RPC de capacidades, usa las RPC REV83 y devuelve `iaQuotaMode:'legacy-rev83'`: conserva el consumo de reservas fallidas y no activa las nuevas ventanas ni concurrencia. Ningún otro fallo de base habilita esa compatibilidad.

## Respuestas y tiempos

Hay un solo pase al respaldo y ninguna repetición automática del mismo proveedor. Las fallas de acceso, saldo, modelo, 429 y salida incompleta de GPT permiten respaldo; negativa explícita, JSON roto y valores inválidos no. Los importes discordantes se revisan sin otra llamada.

Hasta 135 segundos de presupuesto de proveedores, 60 para el principal, con límite del servidor a 145 segundos desde el ingreso. La recepción completa de la foto y su validación ocurren antes de empezar los diez segundos compartidos de autenticación/capacidad/reserva. La subida sigue contando dentro de los 145 segundos totales; no se suma otra espera ilimitada. Si vence durante el envío, responde 408 con `IA_TIEMPO_AGOTADO`, etapa `upload`, y cancela la lectura del cuerpo sin reservar cupo. Se dejan cinco segundos para registro/cierre. El cliente espera hasta 160 segundos, incluyendo su transferencia. Una subida lenta reduce el tiempo disponible a los proveedores y puede dejar menos de 60 segundos al respaldo.

Antes de autenticar y de reservar se exige que queden al menos 80 segundos del plazo total: margen para 60 del principal, hasta diez de reserva, dos para iniciar el intento y cinco para cerrar. Si la subida/admisión consumió ese margen, devuelve el aviso de subida (408), sin reservar ni llamar a IA, incluso sin la migración de cupo. Una transferencia de 12 segundos sigue admitida; las de 100 y 141 se rechazan antes de reservar. El mínimo protege el tiempo del principal, no garantiza 60 segundos al respaldo después de cualquier subida.

Una factura válida se entrega aun si fallan registro o cierre. `iaAccountingStatus:'pending'` indica que no se pudo confirmar el registro. Un commit confirmado cuyo retorno se pierde conserva su consumo; no hay devolución ciega. En compatibilidad REV83 la reserva sigue consumida.

Una solicitud repetida activa recibe 202 `LECTURA_EN_CURSO`; terminada, fallida, vencida o legada recibe 409 `LECTURA_NO_RECUPERABLE`. El servidor no guarda la respuesta. La web conserva una respuesta recibida mientras está abierta la pantalla y permite volver a revisar sin llamar otra vez. Reintentar una lectura fallida es una acción manual, genera otro identificador y puede consumir otra llamada. Una doble acción en curso genera un solo envío.

Solo los tres sectores se codifican en JPEG calidad 0,9. El original conserva exactamente sus bytes y formato. La precisión de JPEG aún requiere comparación autorizada: el ahorro de tamaño no demuestra calidad de lectura.

## Pruebas reproducibles

- Con Node: `node --test tests/*.test.cjs` y `node tools/verificar-integridad.cjs`. En PowerShell se pueden expandir los archivos con `Get-ChildItem` y pasarlos a Node. La regresión de subida usa una imagen sintética de 5 MB y una espera real de 12 segundos, sin proveedores externos.
- Navegador: `tests/browser-lector-revision-rev84.cjs`, `tests/browser-lector-reintento-rev84.cjs`, `tests/browser-lector-compatibilidad-rev84.cjs`, `tests/browser-lector-costos-rev84.cjs` y `tests/browser-lector-subida-rev84.cjs`; requieren Playwright (`PW`) y Chrome (`CHROME`). Toda IA y escritura externa se simula. `TEST_WIDTH=390` ejecuta los costos en ancho móvil. `INVOICE_IMAGE` permite verificar una foto local sin enviarla a proveedores.
- Seguimiento de auditoría: `tests/browser-lector-auditoria-rev84.cjs` comprueba packs sin sufijo, descarte explícito, pack de una unidad y aviso administrativo a 1366 y 390 px.
- SQL: `node tests/sql-lector-rev84.cjs --cupo`, con PostgreSQL portátil (`REV84_PG_BIN`) y módulo `pg` (`REV84_PG_MODULE`). Usa solo localhost y crea/elimina una base temporal propia. La fixture no se ejecuta en producción. En Windows se verificó PostgreSQL 18.4 con `pg` 8.16.3. El ZIP no incluye el runtime temporal.

## Publicación y reversión

La publicación pública y las lecturas reales no forman parte de los resultados locales. Ventana prevista: primera disponible de 00:30–01:00, Argentina, después de pruebas y autorizaciones. Antes de publicar, comprobar versión real de función, esquema, JWT, permisos y ausencia de lecturas activas; conservar copias exactas de función/web/SW/manifiesto. Si hay actividad, aplazar y acordar otra ventana.

Aplicar únicamente los SQL autorizados. Desplegar función primero y web/SW/manifiesto inmediatamente después, registrando las dos horas. El cliente REV83 no conoce 426 y muestra un aviso genérico; no consume una llamada en ese rechazo. Una pestaña anterior necesita actualizar mediante «Hay una versión nueva». Verificar hashes y build públicos desde que se activa la función. Si la web compatible no está disponible en cinco minutos, restaurar las copias previas de función y web y comprobar su estado público.

La reversión conserva la migración de cupo y todos sus registros: no elimina columnas, filas ni devuelve cupos automáticamente. En la fixture real local con cupo cinco, histórico + éxito + fallo + vencimiento + reserva activa: REV84 cuenta dos usadas, una reservada y dos disponibles; REV83 cuenta cinco usadas y ninguna disponible. Sin reserva activa REV84 deja tres disponibles, REV83 sigue dejando cero. Volver a REV84 restaura su cálculo sin perder registros. Comparar ambos cómputos antes/después sin reservar para medir; avisar a administración de la posible reducción conservadora. Si la reversión aumenta disponibilidad, detener el despliegue y resolver la incompatibilidad. Cualquier compensación necesita autorización independiente.

Antes del cierre público, repetir el caso afectado con una lectura autenticada autorizada sin confirmar compra ni modificar stock. Comparativa pendiente: cuatro lecturas locales intercaladas PNG/JPEG/PNG/JPEG y una pública. Consumen proveedor y la pública puede consumir cupo mensual. Cuatro lecturas de una foto son evidencia orientativa, no validación general.

La segunda entrega se identifica con el sufijo `2026-10-05-r2`. Dentro del ZIP, `entregables/VERIFICACION-ZIP-REV84-2026-10-05-r2.json` registra las pruebas de fuente y sus hashes críticos; `INDICE-ARCHIVOS-REV84.json` indexa cada archivo. El SHA-256 del ZIP final se entrega por separado en `HASH-ZIP-REV84-2026-10-05-r2.json`, porque incluir dentro del archivo su propio hash haría una referencia circular. El informe vigente es `entregables/INFORME-AUDITORIA-REV84-2026-10-05-r2.md`; los informes anteriores conservan resultados históricos.
