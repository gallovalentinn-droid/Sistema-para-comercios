# Configuración del lector de facturas con IA

Fecha de corte: 2026-09-12
Entorno: beta pública / Supabase QA `qrvdfqpxutymmlcplsal`
Build cliente: `6.0.0-f6-rc2`

Cada afirmación de este documento está respaldada por el código del paquete o por documentación oficial de Google vigente al corte. Lo que sólo consta como informe de la plataforma, y no puede reproducirse desde este paquete, está marcado como tal.

## 1. Flujo completo

1. La persona abre Productos y pulsa `Cargar factura`.
2. El selector del navegador ofrece únicamente JPEG, PNG, WebP, HEIC y HEIF de hasta 8 MB. El cliente valida tamaño y MIME antes de leer Base64 o invocar Supabase; el servidor repite la misma lista blanca como defensa en profundidad. Un formato incompatible o sin MIME se rechaza con un mensaje específico y no consume cupo.
3. El cliente convierte la imagen a Base64 y envía `comercioId`, `requestId`, `imageBase64` y `mediaType` a la Edge Function autenticada `leer-factura`.
4. La función aplica, en este orden: allowlist de origen, método, tamaño del cuerpo, contrato y formato de la entrada, presencia de configuración, sesión, y luego —en una única RPC— membresía del comercio, rol o permiso, licencia operable y reserva de cupo. Recién después llama a Google.
5. La llamada a Gemini se hace desde Supabase. La clave nunca llega al navegador.
6. La respuesta se reduce al contrato permitido y vuelve al cliente junto con los tokens reales informados por Gemini.
7. El sistema abre una pantalla de revisión. Hay **dos confirmaciones manuales y separadas**:
   - Al confirmar la revisión («Cargar a la factura») se crean los productos de las filas que la persona marcó como «+ Crear producto nuevo» y se llenan los renglones del remito en borrador.
   - El **stock se modifica recién al confirmar el remito**. Ningún dato leído por la IA cambia stock sin ese segundo paso.

## 2. Configuración, campo por campo

### Cliente público

- Función remota: `leer-factura`.
- Tamaño máximo previo al envío: 8 MB, medido sobre el archivo elegido.
- Selector: `accept="image/jpeg,image/png,image/webp,image/heic,image/heif"` con `capture="environment"`.
- MIME enviado: el que informa el navegador, normalizado a minúsculas. Si viene vacío o fuera de la lista, el cliente rechaza el archivo antes de leerlo o enviarlo; nunca lo etiqueta como JPEG por su cuenta.
- Identificador de comercio: el comercio autenticado actualmente seleccionado.
- `requestId`: UUID nuevo generado **en cada invocación**. No protege el reintento humano: si la persona vuelve a elegir la misma foto, el `requestId` es distinto y el intento consume un lugar nuevo del cupo. La idempotencia del servidor sólo actúa cuando se reenvía exactamente el mismo `requestId` —un reintento de transporte o una llamada externa—, no cuando la persona reintenta desde la pantalla.
- Registro local de consumo: `F6_IA_USAGE` en la consola, con entrada, salida, razonamiento, caché, herramientas y total. No incluye la imagen, el texto de la factura ni la clave.

### Edge Function de Supabase

- Proyecto: `qrvdfqpxutymmlcplsal`.
- Función desplegada: `leer-factura`.
- Versión desplegada al corte: 13, activa y con JWT obligatorio a nivel de plataforma. **Informado por Supabase; no reproducible únicamente desde este paquete.** Con independencia de ese ajuste, la función exige sesión en su propio código y responde `SESION_REQUERIDA` sin token.
- SHA-256 remoto informado por Supabase: `587ae23045e4331dde5a8faf7489d44d9bc069137f55d9adb5934414947e3a4f`. Es el hash del bundle de plataforma y no se deriva directamente de un único archivo. La correspondencia de fuentes se verificó recuperando con la API de administración los tres archivos desplegados (`leer-factura/index.ts`, `_shared/f5-auth-core.mjs` y `_shared/f6-invoice-reader.mjs`) y comparándolos con el paquete después de normalizar CRLF/LF: los tres coinciden. El hash local de `index.ts` es `6129fd0573fef45659993fe32fd49b8e1ac1c0d7e18bf050edf9bc95b7cd3cb3`.
- Límite del cuerpo HTTP: 12 MB, controlado por `content-length` y también durante la lectura del stream. Da margen al crecimiento de Base64 —8 MB decodificados son unos 10,7 MB codificados— sin permitir cuerpos arbitrariamente grandes.
- Límite de la imagen decodificada: 8 MB, calculado desde la longitud del Base64 sin decodificar la imagen.
- Timeout hacia Google: 25 segundos, con `AbortController`.
- Orígenes permitidos: se leen de `F6_ALLOWED_ORIGINS`. Una solicitud **sin** cabecera `Origin` no atraviesa este control —es el comportamiento normal de CORS, y por eso el origen no es una frontera de autorización: la autorización real la dan el JWT y la RPC—. Si la variable queda vacía, toda solicitud de navegador recibe 403 mientras las que no son de navegador siguen sujetas a JWT y autorización. Al corte, el digest publicado por Supabase coincide exactamente con `https://micomercio.ar`; la allowlist no contiene `null`.
- Secreto de proveedor: `GEMINI_API_KEY`. Este documento registra solamente el nombre; el valor no está en GitHub, HTML, evidencia ni ZIP.
- Autorización: dueño y administrador; empleado únicamente si su membresía activa tiene `permisos.productos_editar = true`. La RPC evalúa esa regla en línea, con una definición propia equivalente a la autoridad efectiva de F5 —no puede reusar `private.f5_permisos_efectivos`, que resuelve `auth.uid()`, porque la reserva corre como `service_role` con el actor pasado por parámetro—. Una regresión local verifica que `productos_editar` siga existiendo en `private.f5_catalogo_permisos()` y que la reserva F6 use esa misma clave.
- Licencia: debe estar operable en el servidor (`private.licencia_activa`).
- Logs de proveedor: sólo estado HTTP, categoría, tipo de contenido y cantidad de bytes. Los errores de procesamiento registran nombre y un mensaje acotado a 200 caracteres. No se registra el cuerpo de error, prompt, clave o imagen.

### Tabla de errores

| Situación | HTTP | Código al cliente |
|---|---|---|
| Origen fuera de la allowlist | 403 | `ORIGEN_NO_PERMITIDO` (se responde sin cabeceras CORS, así que un navegador ve un error de red y no llega a leer el código) |
| Método distinto de POST | 405 | `METODO_NO_PERMITIDO` |
| Cuerpo o contrato inválido, MIME fuera de la lista, Base64 inválido | 400 | `DATOS_INVALIDOS` |
| Cuerpo o imagen fuera de límite | 413 | `IMAGEN_DEMASIADO_GRANDE` |
| Falta configuración o secreto | 503 | `IA_NO_CONFIGURADA` (antes de reservar cupo) |
| Sin token / token inválido | 401 | `SESION_REQUERIDA` / `SESION_INVALIDA` |
| Sin rol ni permiso | 403 | `SIN_PERMISO` |
| Licencia no operable | 403 | `LICENCIA_NO_OPERABLE` |
| Cupo mensual agotado | 429 | `LIMITE_IA_MENSUAL`, con `limite` y `usados` |
| Google responde 429 | 429 | `IA_AGOTADA_TEMPORALMENTE` |
| Google responde 400 o 422 | 422 | `FACTURA_NO_RECONOCIDA` |
| Otro error de Google | 503 | `IA_NO_DISPONIBLE` |
| Timeout de 25 s | 504 | `IA_TIEMPO_AGOTADO` |
| Respuesta incompleta o fuera de contrato | 422 | `FACTURA_NO_RECONOCIDA` |

El código que recibe el cliente se decide por el status HTTP de Google. La categoría que se escribe en el log (`QUOTA_EXCEEDED`, `API_KEY_INVALID`, `INVALID_ARGUMENT`, etc.) se decide por separado, con una clasificación por texto del error, y prioriza cuota sobre facturación. Los dos mecanismos son independientes: un 429 cuyo cuerpo no mencione cuota se registra con otra categoría y el cliente igual recibe `IA_AGOTADA_TEMPORALMENTE`.

### Solicitud a Gemini

- Endpoint: `https://generativelanguage.googleapis.com/v1beta/interactions`.
- Modelo: `gemini-3.8-flash`.
- Persistencia pedida al proveedor: `store: false`.
- Entrada 1: instrucciones en español para extraer únicamente datos visibles y no inventar valores.
- Entrada 2: imagen Base64 con el MIME informado por el cliente.
- Formato de respuesta: texto con MIME `application/json` y esquema estructurado.
- Campos de cabecera: `proveedor`, `nroComprobante`, `total`, `items`.
- Campos por renglón: `producto`, `cantidad`, `unidadesPorBulto`, `precioUnit`, `descuento`.
- Máximo de salida: 8192 tokens. Es un tope autoimpuesto, muy por debajo del límite del modelo, que Google documenta en 65.536. Tiene una consecuencia práctica: con 8192 tokens el tope de 200 renglones del validador es en la práctica inalcanzable, y una factura muy larga se corta por tokens antes que por renglones. El JSON truncado no parsea y la lectura se pierde completa, con el cupo ya consumido.
- Nivel de razonamiento: `low`. La documentación del modelo indica que `minimal` no está soportado y devuelve error; QA lo confirmó.
- Esquema enviado al proveedor: deliberadamente liviano, 483 bytes serializados (539 con el bloque `response_format` completo). Los límites finos se aplican después en código local porque la variante más profunda fue rechazada por Google con `INVALID_ARGUMENT` durante QA.

### Validación de la respuesta

- Se exige `status: "completed"` y se toma el último texto no vacío de un paso `model_output`.
- Máximo: 200 renglones. Excederlo **invalida la lectura completa**; no se recorta.
- Proveedor: texto de hasta 160 caracteres.
- Comprobante: texto de hasta 80 caracteres.
- Producto: texto no vacío de hasta 200 caracteres.
- Total: número finito, entre 0 y 1.000.000.000.000.
- Cantidad: número finito, entre 0 y 1.000.000.
- Precio unitario y descuento: números finitos, entre 0 y 1.000.000.000.
- Unidades por bulto: entero entre 1 y 1.000.000.
- El objeto de salida se reconstruye campo por campo, así que cualquier campo que no forme parte del contrato se descarta.

## 3. Cupo propio de MiComercio

- Límite: 100 intentos por comercio y mes operativo, definido por `private.business_date` del comercio.
- El límite es por comercio, no por persona ni por dispositivo: el conteo del período sólo filtra por `comercio_id`.
- El 100 no es sólo una regla de producto: la columna `comercio_licencias.limite_ia_mensual` tiene una restricción `check (limite_ia_mensual between 0 and 100)`. Bajarlo es un `UPDATE` —0 deshabilita el lector para ese comercio—, pero **subirlo por encima de 100 requiere una migración**, no un cambio de datos. Es una decisión a prever antes de ofrecer un plan pago.
- La reserva es atómica: se serializa con un `pg_advisory_xact_lock` por comercio y período, y se realiza antes de llamar a Google.
- **Todo intento que pasa validación y autorización consume cupo**, incluso si nunca llega a Google: un error de red desde Supabase, un timeout a los 25 segundos, una foto ilegible o una respuesta que el validador rechaza. La reserva se compromete antes del pedido y no existe ninguna ruta que la libere. Es deliberado: evita eludir el límite mediante reintentos. No consumen cupo, en cambio, los intentos rechazados antes de la reserva: formato o contrato inválido, tamaño excedido, falta de sesión, falta de permiso, licencia no operable o configuración ausente.
- El mismo `requestId` es idempotente por comercio, persona y solicitud. Como el cliente genera un UUID nuevo en cada invocación, esta protección no cubre el reintento desde la pantalla: sólo el reenvío externo del mismo identificador.
- Al cierre de esta evidencia, la tabla canónica registra 11/100 intentos del mes para el comercio piloto, y ninguna lectura completada —los once corresponden a pruebas técnicas controladas cuyo smoke terminó en 429 de Google—. Se conservan para dejar una medición honesta, y significa que el piloto arranca con el 11% del cupo mensual ya comprometido. Lectura tomada de la base de QA; no reproducible desde este paquete.

Además del techo de esquema de 100, Google aplica sus propios límites del nivel gratuito, medidos en solicitudes por minuto, tokens de entrada por minuto y solicitudes por día, **por proyecto y no por clave de API**. Google no publica las cifras del nivel gratuito: hay que consultarlas en AI Studio para este proyecto.

## 4. Tokens por llamada

La función devuelve exactamente los contadores que entrega Gemini:

- `inputTokens` (`total_input_tokens`): prompt más representación procesada de la imagen.
- `outputTokens` (`total_output_tokens`): JSON de la factura.
- `thoughtTokens` (`total_thought_tokens`): razonamiento interno facturable o medido por el modelo.
- `cachedTokens` (`total_cached_tokens`): parte de la entrada servida desde caché.
- `toolUseTokens` (`total_tool_use_tokens`): uso de herramientas del modelo, normalmente cero en este flujo.
- `totalTokens` (`total_tokens`): total informado por Google.

Cualquier contador ausente o no entero se normaliza a cero, tanto en la función como en el cliente.

No existe un número fijo por factura: cambia con resolución, tamaño, nitidez, cantidad de renglones y razonamiento. No se inventa una estimación. El smoke integral posterior a la corrección del esquema todavía no produjo una lectura completada porque el proyecto gratuito alcanzó el límite de Google; por eso aún no hay una fila real y defendible de tokens de una factura completa. La aplicación y la Edge Function ya están preparadas para registrar esos seis valores en el primer intento completado.

## 5. Costo y privacidad del plan elegido

- Plan elegido: nivel gratuito de Gemini.
- Costo actual de entrada y salida para `gemini-3.8-flash` en el nivel gratuito: USD 0.
- Si el proyecto pasa a pago, la tarifa publicada hasta el 31 de diciembre de 2026 es USD 0,75 por millón de tokens de entrada y USD 3,75 por millón de tokens de salida, incluyendo razonamiento. Google publica USD 1,50 y USD 7,50 respectivamente desde el 1 de enero de 2027.
- En el nivel gratuito, Google indica que el contenido puede usarse para mejorar sus productos. En pago indica que no. `store:false` evita guardar la interacción como recurso recuperable, pero no convierte el nivel gratuito en un contrato de no entrenamiento.
- Por esa razón, durante QA se usa únicamente una factura sintética sin datos personales. Antes de usar facturas reales de terceros se debe revisar y aceptar esta condición o migrar al nivel pago.

Fuentes oficiales vigentes al corte, verificadas el 2026-09-12:

- Modelo: https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash
- Formato estructurado: https://ai.google.dev/gemini-api/docs/structured-output
- Interactions API: https://ai.google.dev/api/interactions-api
- Precios y uso de datos: https://ai.google.dev/gemini-api/docs/pricing
- Límites: https://ai.google.dev/gemini-api/docs/rate-limits

## 6. Resultado de QA al corte

- La clave funciona, el endpoint funciona, el modelo acepta texto, imagen y un esquema liviano.
- El esquema original, más profundo, fue aislado como la causa del HTTP 400 y fue reemplazado por el contrato liviano con validación estricta posterior.
- La versión 14 quedó activa sin probes temporales, con mensajes de procesamiento acotados a 200 caracteres; una regresión impide reintroducir los marcadores usados durante el diagnóstico. La versión subió al reemplazar el secret, pero el paquete de código remoto conservó el mismo SHA-256 de la versión 13.
- El intento integral llegó a Google y recibió HTTP 429 `QUOTA_EXCEEDED` del nivel gratuito. El log seguro registró categoría, 459 bytes y `application/json`, sin cuerpo, prompt, imagen ni clave.
- La carga de stock no fue confirmada y no se modificaron productos durante la prueba.
- La revisión 9 normaliza una sola vez el MIME aceptado y envía ese valor normalizado al servidor; eliminó el fallback JPEG que ya no era alcanzable.
- La revisión 9 incorpora un detector compartido por Windows y Linux para las dos familias de credenciales Gemini conocidas por el proyecto. El detector informa únicamente el archivo afectado y nunca imprime el valor encontrado.
- Integridad del paquete REV9 verificada el 2026-09-12: 116 hashes correctos, manifiesto coincidente con el contenido exacto, 128/128 pruebas locales, 16 suites SQL inventariadas, 10 migraciones F6 y cero secretos de alto riesgo. La ejecución SQL acumulada permanece documentada por separado porque requiere el baseline real de QA.

Pendiente al corte:

- Repetir un único smoke cuando Google reponga la cuota y anexar los tokens reales y los campos reconocidos.
- Observar durante el piloto facturas extensas: el tope de salida de 8192 tokens puede truncar una respuesta antes del límite local de 200 renglones.

Rotación de credencial completada el 2026-09-12:

- Se creó una clave nueva vinculada a la cuenta de servicio del lector y restringida exclusivamente a Gemini API.
- `GEMINI_API_KEY` se reemplazó en Supabase. El digest y la fecha de actualización cambiaron; el valor no se registró en este documento, Git, logs ni paquetes.
- La credencial anterior fue revocada después de verificar la sustitución. Google Cloud muestra únicamente la nueva clave entre las credenciales activas.
- La revisión del panel previo a la rotación mostró errores 400/429 y un máximo visible de 16 errores en el período consultado. Varias gráficas no cargaron y no hubo desglose atribuible por solicitud, por lo que no se afirma ni se descarta uso de terceros.

## 7. Dependencias de baseline del lector

Las migraciones del lector consumen objetos que este paquete no reconstruye. Además del baseline general de `SQL-REPRODUCIBILIDAD-F6.md`, la reserva de cupo requiere:

- `public.factura_ai_uso_v4`, la tabla canónica de consumo heredada de V4. La migración falla con `F6_IA_USAGE_V4_TABLE_MISSING` si no existe.
- `private.business_date(uuid, timestamptz)`, que define el mes operativo del comercio. No está definida en este paquete.
- `private.licencia_activa(uuid)`, definida en `supabase/f6/04_licenses.sql`.
- `public.comercio_miembros` y `public.comercio_licencias`.

Un fallo por cualquiera de estos objetos ausentes no debe presentarse como un fallo de lógica del lector.
