# MiComercio — respuesta a la auditoría REV52 y cambios REV53

## Correcciones realizadas

1. **Promociones por cantidad (A1).** `REV53-PROMOCIONES-CANTIDAD.sql` permite `porcentaje = 0` sólo para una promoción de un producto con regla válida «llevá N, pagá M», de 2 a 99 unidades y con M menor que N. Los descuentos porcentuales comunes siguen exigiendo un valor mayor que 0 y no superior a 100. Un error de restricción se detiene para revisión en vez de agotar reintentos. Las operaciones que ya hayan llegado a *dead letter* requieren reintento desde el panel de sincronización después de aplicar la migración.
2. **Cierres entre dispositivos (A2).** Se corrigió la migración de Caja: si el cierre que conocía un dispositivo ya no es el último del servidor, la apertura conserva la referencia y registra una alerta de conciliación. Un error en los datos adicionales de apertura o traspaso deja una alerta en el registro correspondiente sin revertir la operación principal. El historial muestra esa condición y el próximo turno pide contar el efectivo, sin sugerir un saldo que no está confirmado.
3. **Consulta de apertura (M1).** La búsqueda del último cierre espera como máximo cinco segundos. Si falla, se puede abrir tras contar el efectivo; el sistema avisa si falta la actualización de la nube. Si la conexión cae después de mostrar un importe sugerido, exige conteo antes de abrir, salvo que la persona ya lo haya contado. Un cierre local todavía sin confirmar en la nube tampoco se ofrece como saldo confirmado.
4. **Claridad de Caja.** «Dejo plata» aparece primero, el cierre pregunta quién lo hizo y sincroniza ese nombre, el historial distingue «1 venta», las diferencias muestran centavos y la vista previa de precios llama «Recargo sobre costo» al cálculo que usa el costo como denominador.
5. **Permisos.** La migración ya no crea una segunda política de lectura para segmentos cuando la base tiene una vigente.

## Situación de los datos existentes

- Se verificó **en lectura** que la base pública aún exige `porcentaje > 0` y que las funciones de REV52 no están instaladas. Por eso la falla A1 sigue presente en la versión publicada hasta ejecutar la migración.
- En el comercio mencionado por la auditoría hay una sesión antigua abierta y seis cierres en estado `requiere_conciliacion`. No se cerró esa sesión ni se modificaron importes o registros reales. Estos cierres seguirán pidiendo un conteo manual; requieren una conciliación supervisada de su historial para recuperar una continuidad confirmada.
- No se modificó el criterio de explicar cualquier diferencia de apertura: conserva el registro explícito pedido para Caja. «Agregar plata» durante un turno sigue pendiente porque necesita un movimiento de ingreso y su sincronización.

## Orden para publicar desde la versión pública actual

1. Guardar un respaldo de la base.
2. Aplicar la **versión de este ZIP** de `REV52-CAJA-TRASPASO.sql` (reemplaza la que vino en el ZIP REV52).
3. Aplicar `REV53-PROMOCIONES-CANTIDAD.sql`.
4. Confirmar que existen `ultimo_traspaso_caja_v1`, las nuevas columnas de Caja y la restricción revisada de promociones.
5. Publicar juntos `beta/index.html` y `beta/sw.js` REV53. Actualizar ambos dispositivos y repetir un 2x1, un cierre y una apertura desde el otro dispositivo.
6. Revisar las operaciones de sincronización que ya estuvieran bloqueadas y conciliar, por separado, la sesión antigua del comercio afectado. Esa conciliación necesita comprobar los importes reales antes de escribir datos.

## Verificación

- **Código:** se contrastó la auditoría con el contrato de sincronización, las restricciones reales y el flujo de Caja. La identidad de build, el caché y el manifiesto se alinearon en REV53.
- **Local:** 217 pruebas automatizadas aprobadas antes del empaquetado; la expresión de la restricción se probó con consultas SQL de sólo lectura (2x1, 3x2 y 4x2 aceptados; 4x4, 0 % común y 101 % rechazados). La verificación final del ZIP figura en la entrega.
- **Entorno público:** se leyó el esquema y el estado agregado de cierres. REV53 no fue publicada ni se ejecutaron sus migraciones; no se verificó una operación real de REV53 en la beta pública.
