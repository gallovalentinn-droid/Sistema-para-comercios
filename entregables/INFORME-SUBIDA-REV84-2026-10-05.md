# REV84 — seguimiento de la subida lenta, 05/10/2026

## Verificado en código y localmente

El plazo de admisión empezaba al entrar al handler y envolvía la recepción del cuerpo. La reproducción previa de un envío de 12 segundos respondió 400 `DATOS_INVALIDOS` a los diez, antes de llamar al proveedor. Una prueba adicional mostró que una recepción completa podía dejar apenas 1 ms para verificar la sesión.

Se separó la recepción de la foto del inicio de los diez segundos compartidos por sesión, capacidad y reserva. Se conservan los 145 segundos totales desde el ingreso al handler y los 160 del cliente: la subida no tiene tiempo ilimitado ni se agregan 145 segundos después de recibirla. El presupuesto del proveedor sigue siendo el menor entre 135 segundos y el tiempo global restante menos cinco para cierre. Una subida larga puede dejar menos de 60 segundos al respaldo.

Si el envío vence, se cancela el stream y devuelve 408 `IA_TIEMPO_AGOTADO`, etapa `upload`. La pantalla explica que la foto no terminó de llegar; no acusa al JSON ni a Google/OpenAI. Los JSON malformados y límites de tamaño mantienen sus rechazos.

492/492 pruebas Node locales, cinco regresiones nuevas: imagen sintética de 5 MB con espera real de 12 segundos; presupuesto de sesión después de recibir; vencimiento/cancelación antes de reserva/IA; aviso correcto; los diez segundos siguen compartidos por sesión/capacidad. El proveedor y la base se simulan.

## Verificado en el entorno público

Consulta de solo lectura: `leer-factura` continúa ACTIVE, versión 23, JWT habilitado; su código desplegado corresponde a REV83 y no tiene el plazo de admisión nuevo. No se publicó esta corrección.

Se enviaron dos cuerpos de JSON deliberadamente inválido, sin foto de factura ni sesión de usuario: 14 bytes y 5.242.894 bytes. La transferencia lenta terminó en 12.499 ms y la respuesta llegó en 12.772 ms, HTTP 400 `DATOS_INVALIDOS`. La pequeña tardó 808 ms en total. El cuerpo inválido impide entrar a autenticación/reserva/proveedores; no se consume IA ni cupo, ni se toca stock.

El registro de la pequeña informa 698 ms de ejecución. Las consultas disponibles no devolvieron el registro de ejecución de la lenta: el tiempo total de red no permite distinguir cuánto ocurrió antes del arranque del handler. Esta prueba confirma una transferencia lenta real aceptada por REV83, pero **no confirma que Supabase entregue el cuerpo ya completo ni que REV84 sin corregir falle públicamente**.

Se preparó una función de diagnóstico separada: cuenta bytes y tiempos al empezar, al recibir el primer fragmento y al terminar, con límite de tamaño/plazo y vencimiento, sin guardar/loguear el cuerpo, sin base y sin IA. Publicarla agrega un endpoint temporal fuera del lector previsto; se solicitó autorización específica y sigue pendiente. Se desactiva al terminar.

La documentación de [límites de Supabase](https://supabase.com/docs/guides/functions/limits) establece un timeout de respuesta de 150 s; no ofrece una garantía de buffering del cuerpo. El lector conserva su margen de 145 s.

## Entrega y pendientes

ZIP actualizado separado del paquete del 04/10, con su propio índice de archivos y registro `VERIFICACION-ZIP-REV84-2026-10-05.json`. Los resultados de extracción se registran antes de entregarlo. No contiene credenciales, datos operativos ni imágenes de facturas.

Siguen pendientes la medición del inicio real en Supabase, publicar el lector corregido y repetir el caso público afectado. Las migraciones de memoria/cupo y las lecturas de IA pagas mantienen sus autorizaciones separadas.
