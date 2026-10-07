# MiComercio — correcciones REV78 (01/10/2026)

Base: paquete REV77 recibido, SHA-256 `20fcc00feb8d4d3d18dea250e86569e6f9134a977113fa275ecf9a5612716a8e`.

Alcance: corregir R77-01, R77-02 y R77-03 de la revisión. Paquete preparado localmente para integrar después. No se publicó ni se modificó Supabase. La fuente canónica del repositorio sigue en el commit `fbace22`; esta entrega es una copia aislada de REV77 con las correcciones.

## R77-01 — productos distintos por una letra

Las aproximaciones de una letra siguen sirviendo para sugerir opciones, pero no pueden producir una elección automática. PAPAS CLASICAS18GR no elige Pipas Clasicas, PAPAS GIGANTES50GR no elige Pipas Gigantes, y PIPAS TRIO 200GR no elige Pepas Trío. Una descripción expandida por la IA tampoco puede convertir esas aproximaciones en «Coincide».

Las coincidencias exactas y los controles de presentación se conservan. PHILLP MORRIS sigue mostrando Philip Morris entre las opciones. FUSION2 DE 10 y FUSION2 DE 20 mantienen el resultado seguro cuando corresponde.

## R77-02 — deuda, pagos a cuenta y cantidad cero

El cálculo usa centavos y distingue deuda incluida en el ticket de pagos que ya fueron descontados de su total. Para obtener el total de mercadería, resta deuda y agrega esos pagos. Un ticket de $8.000 con mercadería de $10.000 y pago a cuenta de $2.000 ahora compara contra $10.000.

El módulo del servidor agrega `pagosACuenta` al esquema, instrucciones de lectura y respuesta validada. Si falta el campo, vale cero; el cliente conserva el respaldo por renglones. Se aclara que son pagos ya descontados del total visible, y que no constituyen descuentos del costo.

Un mismo importe informado en un renglón y en `saldoAnterior` o `pagosACuenta` no se cuenta dos veces. Las contradicciones entre importes, etiquetas con signo ambiguo y un resultado negativo conservan el total impreso y muestran una advertencia para corregirlo manualmente en el siguiente paso. Una cantidad cero no se convierte en uno.

La revisión independiente detectó además que poner una fila financiera en cero podía dejar activa su copia separada. Se conserva el importe original de esa fila para anular también la copia que coincide, sin borrar ajustes cuya relación no pueda establecerse.

## R77-03 — corrección manual de una fila

Al elegir un producto para un renglón inicialmente clasificado como no mercadería, la fila deja de tratarse como ajuste financiero. El aviso se actualiza inmediatamente y el total del siguiente formulario se recalcula. Si esa misma fila también aparecía como saldo separado, se reconcilia su copia.

«Entrega Azucar Ledesma» por $1.000, elegida manualmente como Azucar, más Yerba por $2.000 ahora carga dos productos y conserva el total de $3.000. Al quitar la selección, se recupera la clasificación inicial.

## Verificación

- **En código:** cambios en `beta/index.html` y `supabase/functions/_shared/f6-invoice-reader.mjs`; identidad HTML, caché y manifiesto alineados en REV78. Sin cambios de SQL ni de migración. Revisión independiente de los tres fallos y de la corrección adicional.
- **Localmente en Windows:** 358/358 pruebas, incluidas 12 regresiones nuevas; los errores fueron reproducidos antes de corregirlos. Navegador Chromium: nueve escenarios financieros, tres identidades aproximadas, carga y confirmación con stock, y sin errores de página. También pasan el recorrido de 14 pasos de REV77, el resumen de REV76 y la navegación de REV54 sin duplicar productos.
- **Catálogo autorizado de 721 productos:** 47/50 y 41/45 automáticos correctos, ninguno incorrecto; 23/23 contraejemplos sin elección automática errónea. Mutaciones de números y unidades: 6.298 variantes, cero elecciones automáticas incorrectas según ese oráculo. Esta prueba no cubre todas las diferencias de palabras.
- **Factura Mi Barrio por texto:** conserva 3/8 automáticos y el correcto entre las opciones en los otros cinco, sin opciones ajenas. De $462.000 impresos menos $189.850 de deuda resulta $272.150 de mercadería. Esto no equivale a una lectura nueva de la foto contra Gemini.
- **Entorno público:** REV78 no se publicó ni se probó allí. Quedan pendientes Gemini real, facturas nuevas y dos dispositivos. No se ejecutaron pruebas SQL nuevas porque no se modificó SQL.

## Repetir las pruebas

Desde la raíz del paquete, con Node disponible:

```text
node --test tests/*.test.cjs
node tools/verificar-integridad.cjs
```

Para navegador, configurar `PW` con la ruta de Playwright y `CHROME` con la ruta de Chrome, luego ejecutar:

```text
node entregables/pruebas-navegador-REV78/correcciones.cjs
```

Los evaluadores de `entregables/evaluacion-emparejador-REV77/` leen el HTML actual del paquete, aunque sus etiquetas históricas siguen diciendo REV77. El catálogo privado usado para verificar no se incorpora a esta entrega.

## Pendientes para la integración

La revisión también había identificado dos problemas heredados que quedan fuera de estos tres arreglos: reparto del descuento global sobre deuda cuando la IA la devuelve dentro de `items`, y el botón «Ver en Caja» sin acción cuando no hay ventas. Siguen pendientes.

Los cambios solicitados de permisos de Compras para empleados, ocultarles el historial de cierres, WhatsApp con totales de cigarrillos por Efectivo/Transferencia o QR/Tarjeta/Fiado, y comparación de stock por turno se integrarán después.

Antes de publicar, comparar el backend del paquete con las funciones realmente desplegadas e integrar conjuntamente el cliente y el módulo actualizado de `leer-factura`. No volver a ejecutar migraciones históricas del paquete por el solo hecho de estar incluidas. Los documentos de revisiones anteriores permanecen como antecedentes, no como instrucciones para desplegar esta entrega.
