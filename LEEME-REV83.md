# MiComercio — sistema REV83

La beta incorpora GPT-6 Luna como lector principal para JPEG, PNG y WebP. Gemini 3.8 Flash queda como respaldo frente a caídas, problemas de conexión, tiempo agotado o límites temporales identificados. HEIC y HEIF conservan el lector Gemini.

Una lectura reserva el cupo del comercio una sola vez. Puede ejecutar hasta dos llamadas secuenciales dentro de 90 segundos, con hasta 60 segundos para GPT si hay respaldo disponible. Saldo agotado, autorización inválida, errores de formato y datos incoherentes requieren revisión; no disparan otra llamada. Cada proveedor cobra las solicitudes que procese.

La misma foto se acompaña de tres sectores superpuestos y ampliados para mejorar la lectura de tablas. Se mantienen las descripciones impresas, códigos, cantidades, packs, precios y descuentos. La revisión de productos sigue siendo obligatoria antes de cargar la compra.

## Archivos y configuración

- `beta/`: aplicación y recursos públicos actuales.
- `clientes/`: portal de clientes.
- `supabase/functions/`: funciones y módulos del servidor, incluido el lector doble.
- Archivos SQL de revisión: actualizaciones de la base existente; `REV83-LECTOR-DOBLE.sql` amplía los modelos aceptados por la telemetría F6.
- `tests/`: pruebas locales y arneses de navegador.
- `integrity-manifest.json`, `verificar.ps1` y `verificar.sh`: comprobación de integridad.

Configurar **OPENAI_API_KEY** y **GEMINI_API_KEY** exclusivamente en los secretos de Supabase, junto con la configuración Supabase existente y **F6_ALLOWED_ORIGINS**. No colocar claves en HTML, repositorio ni archivos públicos. Sin OPENAI_API_KEY, el lector sigue utilizando Gemini. La clave OpenAI creada para la prueba tiene un plazo de 30 días; su renovación se hace en la configuración privada.

El paquete no contiene claves, sesiones, contraseñas, copias de datos de comercios ni fotografías privadas. Usa el servidor existente del sistema; no es una copia de la base de producción ni un instalador de una instancia nueva de Supabase.

## Comprobación

Con Node instalado: `node --test --test-concurrency=1 tests/*.test.cjs` y `node tools/verificar-integridad.cjs`. En PowerShell, expandir los nombres: `$pruebas = Get-ChildItem tests -Filter '*.test.cjs' | ForEach-Object FullName; node --test --test-concurrency=1 @pruebas`.

El arnés `tests/browser-lector-proveedores-rev83.cjs` usa Playwright y Chrome; se pueden indicar las rutas con PW y CHROME. Simula respuestas y bloquea escrituras al servidor. Para comprobar fotos propias, INVOICE_IMAGE puede indicar una ruta local; no llama a la IA.

Las pruebas reales previas con la foto de referencia verificaron 38 renglones. Es una muestra; sigue siendo necesario revisar cada factura, y el total de una página incompleta no se inventa.
