# Configuración del lector de facturas con IA

Fecha de corte: 2026-09-12  
Entorno: beta pública / Supabase QA `qrvdfqpxutymmlcplsal`  
Build cliente: `6.0.0-f6-rc2`

## 1. Flujo completo

1. La persona abre Productos y pulsa `Cargar factura`.
2. El navegador acepta una imagen JPEG, PNG, WebP, HEIC o HEIF de hasta 8 MB.
3. El cliente convierte la imagen a Base64 y envía `comercioId`,`requestId`, `imageBase64` y `mediaType` a la Edge Function autenticada `leer-factura`.
4. La función verifica origen, sesión, tamaño, formato, comercio, licencia, rol o permiso y cupo antes de llamar a Google.
5. La llamada a Gemini se hace desde Supabase. La clave nunca llega al navegador.
6. La respuesta se reduce al contrato permitido y vuelve al cliente junto con los tokens reales informados por Gemini.
7. El sistema abre una pantalla de revisión. Nada cambia en productos o stock hasta que la persona confirma manualmente.

## 2. Configuración, campo por campo

### Cliente público

- Función remota: `leer-factura`.
- Tamaño máximo previo al envío: 8 MB.
- Identificador de comercio: el comercio autenticado actualmente seleccionado.
- `requestId`: UUID nuevo por intento, usado para que un reintento idéntico no consuma dos veces el cupo interno.
- Registro local de consumo: `F6_IA_USAGE` en la consola, con entrada, salida, razonamiento, caché, herramientas y total. No incluye la imagen, el texto de la factura ni la clave.

### Edge Function de Supabase

- Proyecto: `qrvdfqpxutymmlcplsal`.
- Función desplegada: `leer-factura`.
- Versión desplegada al corte: 12, activa y con JWT obligatorio.
- Límite del cuerpo HTTP: 12 MB. Da margen al crecimiento de Base64 sin permitir cuerpos arbitrariamente grandes.
- Límite de la imagen decodificada: 8 MB.
- Timeout hacia Google: 25 segundos.
- Orígenes permitidos: se leen de `F6_ALLOWED_ORIGINS`.
- Secreto de proveedor: `GEMINI_API_KEY`. Este documento registra solamente el nombre; el valor no está en GitHub, HTML, evidencia ni ZIP.
- Autorización: dueño y administrador; empleado únicamente si su autoridad efectiva incluye `productos_editar`.
- Licencia: debe estar operable en el servidor.
- Errores 429 de Google: se clasifican como `QUOTA_EXCEEDED` y el cliente recibe `IA_AGOTADA_TEMPORALMENTE`.
- Logs de proveedor: sólo estado HTTP, categoría, tipo y cantidad de bytes. No se registra el cuerpo de error, prompt, clave o imagen.

### Solicitud a Gemini

- Endpoint: `https://generativelanguage.googleapis.com/v1beta/interactions`.
- Modelo: `gemini-3.8-flash`.
- Persistencia pedida al proveedor: `store: false`.
- Entrada 1: instrucciones en español para extraer únicamente datos visibles y no inventar valores.
- Entrada 2: imagen Base64 con su MIME real.
- Formato de respuesta: texto con MIME `application/json` y esquema estructurado.
- Campos de cabecera: `proveedor`, `nroComprobante`, `total`, `items`.
- Campos por renglón: `producto`, `cantidad`, `unidadesPorBulto`, `precioUnit`, `descuento`.
- Máximo de salida: 8192 tokens.
- Nivel de razonamiento: `low`.
- Esquema enviado al proveedor: deliberadamente liviano, menor a 800 bytes. Los límites finos se aplican después en código local porque la variante más profunda fue rechazada por Google con `INVALID_ARGUMENT` durante QA.

### Validación de la respuesta

- Máximo: 200 renglones.
- Proveedor: texto de hasta 160 caracteres.
- Comprobante: texto de hasta 80 caracteres.
- Producto: texto no vacío de hasta 200 caracteres.
- Total y precios: números finitos, no negativos y acotados.
- Unidades por bulto: entero entre 1 y 1.000.000.
- Se descartan campos que no forman parte del contrato.

## 3. Cupo propio de MiComercio

- Límite: 100 intentos por comercio y mes operativo.
- El límite es por comercio, no por persona ni por dispositivo.
- La reserva es atómica en PostgreSQL y se realiza antes de llamar a Google.
- Los intentos que llegan al proveedor consumen cupo aunque la foto sea ilegible o Google falle. Esto evita eludir el límite mediante reintentos.
- El mismo `requestId` es idempotente.
- Al cierre de esta evidencia, el comercio piloto consumió 11/100 intentos del mes. Fueron pruebas técnicas controladas; no se borraron para conservar una medición honesta.

Este cupo de 100 es una regla del producto. Google aplica además sus propios límites gratuitos por proyecto, modelo, minuto, tokens por minuto y día.

## 4. Tokens por llamada

La función devuelve exactamente los contadores que entrega Gemini:

- `inputTokens`: prompt más representación procesada de la imagen.
- `outputTokens`: JSON de la factura.
- `thoughtTokens`: razonamiento interno facturable o medido por el modelo.
- `cachedTokens`: parte de la entrada servida desde caché.
- `toolUseTokens`: uso de herramientas del modelo, normalmente cero en este flujo.
- `totalTokens`: total informado por Google.

No existe un número fijo por factura: cambia con resolución, tamaño, nitidez, cantidad de renglones y razonamiento. No se inventa una estimación. El smoke integral posterior a la corrección del esquema todavía no produjo una lectura completada porque el proyecto gratuito alcanzó el límite de Google; por eso aún no hay una fila real y defendible de tokens de una factura completa. La aplicación y la Edge Function ya están preparadas para registrar esos seis valores en el primer intento completado.

## 5. Costo y privacidad del plan elegido

- Plan elegido: nivel gratuito de Gemini.
- Costo actual de entrada y salida para `gemini-3.8-flash` en el nivel gratuito: USD 0.
- Si el proyecto pasa a pago, la tarifa publicada hasta el 31 de diciembre de 2026 es USD 0,75 por millón de tokens de entrada y USD 3,75 por millón de tokens de salida, incluyendo razonamiento. Google publica USD 1,50 y USD 7,50 respectivamente desde el 1 de enero de 2027.
- En el nivel gratuito, Google indica que el contenido puede usarse para mejorar sus productos. En pago indica que no. `store:false` evita guardar la interacción como recurso recuperable, pero no convierte el nivel gratuito en un contrato de no entrenamiento.
- Por esa razón, durante QA se usa únicamente una factura sintética sin datos personales. Antes de usar facturas reales de terceros se debe revisar y aceptar esta condición o migrar al nivel pago.

Fuentes oficiales vigentes al corte:

- Modelo: https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash
- Formato estructurado: https://ai.google.dev/gemini-api/docs/structured-output
- Interactions API: https://ai.google.dev/api/interactions-api
- Precios y uso de datos: https://ai.google.dev/gemini-api/docs/pricing
- Límites: https://ai.google.dev/gemini-api/docs/rate-limits

## 6. Resultado de QA al corte

- La clave funciona, el endpoint funciona, el modelo acepta texto, imagen y un esquema liviano.
- El esquema original, más profundo, fue aislado como la causa del HTTP 400 y fue reemplazado por el contrato liviano con validación estricta posterior.
- La versión 12 quedó desplegada sin probes temporales.
- El intento integral llegó a Google y recibió HTTP 429 `QUOTA_EXCEEDED` del nivel gratuito.
- La carga de stock no fue confirmada y no se modificaron productos durante la prueba.
- Pendiente: repetir un único smoke cuando Google reponga la cuota y anexar aquí los tokens reales y los campos reconocidos.
