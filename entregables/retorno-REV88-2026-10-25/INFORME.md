# Retorno a REV88 — 25/10/2026

Pedido: volver a la versión anterior a tamaños para priorizar el diagnóstico de la caja de cigarrillos. El cambio de tamaños se retomará después.

## Fuente y preservación

- Aplicación restaurada desde REV88 `4d1e43f5eef9a1b7224885bb5c541952a8b3ffd8`.
- HTML SHA-256: `2f2e33bebac5b11aaf70a0cefbb776e22b9c270adb969afeabf01d8801accb50`.
- SW SHA-256: `77abb0fd6c0c02b0089a8b2ac026ec4f51d703804c6773ea4bd47f6563a4fc16`.
- Identidad REV88 edición 2026-10-07; caché `micomercio-beta-6.0.0-f6-rc2-rev88`.
- REV92 preservada en `codex/respaldo-rev92-tamanos`, punta `0417d087fd22521478806e894790baa2e62ae2b7`; implementación `89060ee324673e60edfa13e8d1e98ac1dfb78536`.
- Se conserva el historial Git. No se ejecutan migraciones ni cambios de funciones, usuarios, licencias o datos de negocio. Tampoco se borra el almacenamiento local ni la outbox. REV88 sigue admitiendo los combos existentes.

## Verificación local

- Suite general: 521/521, cero fallos/omitidas.
- Integridad: 33 archivos correctos, sin secretos privados detectados.
- Caja en navegador a 1366/390: seis escenarios y tres cierres por ancho; límites de turno, arqueo obsoleto y persistencia comprobados con backend simulado.
- Lector en navegador a 1366/390: revisión aprobada, cero escrituras de stock.
- Archivos de aplicación y manifiesto iguales a la base REV88.

## Diagnóstico de cigarrillos

La apertura de paquetes, según aclaración del usuario, no mueve dinero. `abrirAtados` en REV88 registra conversión de stock, sin ventas ni egresos. Un ensayo con funciones reales extraídas y dependencias simuladas confirmó esa conducta. No reproduce por sí solo el desvío informado. El plan privado para Claude pide conciliar un turno real en solo lectura, identificar los registros que originan la diferencia y agregar una regresión antes de corregir. No se implementó el arreglo ni se modificaron registros históricos. No se publica el caso privado del comercio en este informe.

## Publicación

El usuario confirmó expresamente «si publica rev 88 ahora». Retorno publicado en `origin/main`: `026ca81e72878c9e183c59843a264dc43287da97`, sin reescribir historial. Respaldo REV92 enviado a `origin/codex/respaldo-rev92-tamanos` antes del retorno.

Verificación pública el 25/10/2026 a las 12:48:36 de Argentina (15:48:36 UTC): HTML, SW y manifiesto respondieron HTTP 200 y coincidieron exactamente por SHA-256 con la fuente restaurada. Manifiesto SHA-256: `3dbfd0123455ba7610afb4ec2e3f74188ca9f1a3ee437639a5f038240a48fccd`.

Caja pública aprobada a 1366/390: seis escenarios y tres cierres por ancho; lector público aprobado en ambos anchos, sin escrituras de stock. Se usaron datos sintéticos y backend simulado con escrituras externas bloqueadas: no representa una conciliación de datos reales ni un drenaje autenticado entre dispositivos. La incidencia de cigarrillos sigue en etapa de diagnóstico.

El usuario pidió recibir el archivo privado del plan para pasárselo personalmente a Claude. Codex no lo envió por la aplicación de Claude.

Una pestaña ya abierta en REV92 no mostrará el aviso de una versión menor: ese detector solo compara revisiones crecientes. Para cargar REV88 hay que finalizar cualquier venta, confirmar guardado local y recargar con conexión. No borrar datos, cookies ni IndexedDB.

## Reanudación posterior

Integrar los cambios necesarios de tamaños sobre la base con cigarrillos corregida y volver a verificar caja, stock, anulación y sincronización. No reemplazar la corrección futura con el snapshot completo de REV92. El candidato P0 congelado permanece intacto y su ejecución sigue requiriendo su propio cierre y autorización.
