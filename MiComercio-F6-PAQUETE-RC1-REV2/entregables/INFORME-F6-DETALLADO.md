# Informe detallado de F6 RC2

Fecha de corte: 2026-09-08
Build: `6.0.0-f6-rc2`
Base congelada: F5 rev10, `5.0.0-f5-rc2`
Estado: `candidate-pending-gemini-secret-live-smoke-and-seven-day-pilot`

## Resultado alcanzado

F6 está implementado como candidato técnico. El sistema comercial incorpora el alta por invitación, un asistente de puesta en marcha reanudable, la licencia beta de siete días y el cierre de caja turno por turno. Además existe un panel interno de soporte separado y auditable.

El candidato conserva todas las funciones comerciales previas de F5 y las mejoras de producto ya incorporadas: búsquedas por producto y rubro, Movimientos de stock y el medio de pago unificado “Transferencia / QR”. RC2 agrega gestión real de empleados, carga de imágenes de productos y lectura asistida de facturas con foto, sin reemplazar ni recortar ninguna sección del sistema.

No se modificó el paquete F5 rev10 ni ningún archivo de `sources/`. El desarrollo F6 vive en artefactos, SQL, funciones y pruebas separados.

El conjunto operativo `supabase/f5` también se compara ahora de forma exacta contra el manifiesto aprobado de rev10. Se eliminó una copia reintroducida de `08_rollback_contract_fix.sql` que volvía a definir `_f5_merge_legacy_config`; aunque emitía el mismo contrato actual, su precedencia podía revertir silenciosamente una corrección futura de `01_authority_membership.sql`. El gate ancla el hash del manifiesto F5, deriva de él los siete nombres y hashes y contrasta cada SQL de las dos ubicaciones. Así también rechaza que ambas carpetas se modifiquen juntas.

## 1. Alta interna por invitación

- Soporte puede emitir, reenviar, regenerar y revocar invitaciones mediante acciones cerradas.
- La invitación dura exactamente 604800 segundos.
- El token se guarda y transmite protegido; el cliente no recibe hashes internos ni secretos.
- Preview responde de forma genérica si el enlace no existe, venció, fue usado o fue revocado. No revela el nombre del comercio.
- El consumo exige una identidad autenticada y usa una clave idempotente para que un reintento no duplique comercio, membresía o licencia.
- Las RPC privilegiadas permanecen detrás de Edge Functions y `service_role`; `anon` y `authenticated` no pueden ejecutarlas directamente.

## 2. Asistente reanudable para el dueño

El flujo tiene siete pasos canónicos:

1. identidad del comercio;
2. configuración básica;
3. caja;
4. producto inicial;
5. empleados, opcional;
6. clientes, opcional;
7. comprobación y activación.

Cada paso se confirma en servidor antes de avanzar. Si se corta Internet o se cierra el navegador, el dueño vuelve al último paso confirmado. El cliente no marca progreso por adelantado.

La comprobación final es una simulación sin efectos: valida que existan una caja y un producto activos, pero no crea ventas, movimientos de stock ni cierres. Sólo después de superar esa comprobación se activa la licencia y se habilita la entrada al sistema comercial.

## 3. Licencia beta

- Vigencia base: siete días exactos, medidos como 604800 segundos incluso si el período atraviesa un cambio horario.
- Estado efectivo evaluado por el servidor con prioridad `cancelada > vencida > pausada > activa`.
- El vencimiento se evalúa en lectura; no depende de un trabajo programado que reescriba la fila.
- Pausar no detiene el reloj.
- Extensión o compensación admite entre uno y siete días y comparte un saldo adicional máximo de 604800 segundos.
- Si una solicitud supera el saldo restante, se rechaza completa; nunca se recorta automáticamente.
- Una licencia pausada que ya venció no puede reactivarse sin nueva vigencia.
- `offlineValidUntil` nunca supera el vencimiento de licencia y se compone con el lease F5: ambos deben permitir operar.
- Todas las mutaciones usan lock, versión de estado, idempotencia y evento before/after.

## 4. Soporte interno

Se creó un panel aparte del POS con cinco bloques: Alta, Licencia, Dispositivos, Sincronización y Conciliaciones.

El operador de soporte es una autoridad interna distinta de dueño, administrador o empleado. El panel no puede editar ventas, stock, caja, cierres, fiado ni saldos. Sus once comandos permitidos son:

- reenviar, regenerar o revocar invitación;
- pausar, reactivar, extender o cancelar licencia;
- revocar dispositivo;
- reintentar sincronización;
- exportar diagnóstico;
- agregar nota de conciliación.

Toda mutación exige motivo. Los intentos permitidos y denegados dejan actor, correlación, motivo, resultado y before/after en una auditoría append-only protegida también contra `TRUNCATE`.

Los límites de frecuencia se aplican por las dimensiones correspondientes. Las Edge Functions reutilizan la resolución de IP corregida de F5 y traducen el límite SQL a HTTP 429 real con `Retry-After`.

## 5. Cierre de caja turno por turno

- Una caja puede abrir, cerrar y volver a abrir otro turno el mismo día.
- Cada sesión o segmento tiene su propio cierre, fondo inicial, efectivo contado y diferencia.
- Un segundo cierre de la misma sesión o segmento se rechaza localmente y también por la unicidad del servidor.
- Cerrar un turno limpia sólo la sesión activa; conserva lease, autoridad y cierres previos.
- Los turnos vacíos también se pueden cerrar.
- Un segmento provisional queda aislado de otras sesiones y conserva su necesidad de conciliación.
- Resumen lista los cierres individuales y muestra un “Total del día” sólo informativo. Ese total suma ventas y cantidades, pero deliberadamente no mezcla fondos ni diferencias.

## 6. Gate previo al piloto

El SQL de gate devuelve por separado seis comprobaciones y sólo informa `ready=true` si todas pasan:

1. build observado `6.0.0-f6-rc2`;
2. comercio en `v4_only`;
3. baseline F2–F5 reproducible;
4. precondición de PIN corregida y verificada;
5. más de un cierre independiente en el mismo día;
6. cierre provisional conservado para conciliación.

Los dos flags externos —baseline y PIN— son deliberadamente explícitos: el SQL no puede inventar evidencia que pertenece a una ejecución externa.

## 7. Empleados e imágenes de productos

- Configuración separa `Empleados` del `Bloqueo de mostrador` local.
- Dueños y administradores pueden crear empleados con usuario, clave inicial y diez permisos canónicos; el valor inicial habilita únicamente ventas.
- Los cambios de permisos y estado reutilizan `f5_actualizar_miembro`, por lo que incrementan la versión de autoridad y conservan la auditoría F5.
- La lista de gestión incluye accesos suspendidos, de modo que pueden reactivarse sin intervención manual en la base.
- Las fotos usan la ruta canónica `<comercio_id>/<producto_id>.jpg` y ya no pertenecen a la cuenta que realizó la carga.
- Cualquier miembro activo puede leerlas. Insertar, reemplazar o borrar exige licencia operable y el permiso efectivo `productos_editar`; `upsert` está cubierto por políticas SELECT, INSERT y UPDATE.

## 8. Lector de facturas con IA

- El navegador envía solamente la foto elegida, el comercio y una clave idempotente a la Edge Function autenticada `leer-factura`.
- La clave de Gemini vive únicamente como secret `GEMINI_API_KEY`; no se incorpora al HTML, al repositorio ni al ZIP.
- Se usa `gemini-3.8-flash` con salida JSON estructurada y `store:false`.
- Se aceptan JPEG, PNG, WebP, HEIC y HEIF hasta 8 MB; el servidor vuelve a validar tamaño, Base64 y tipo.
- La imagen no se guarda en Postgres. Sólo se registra una reserva de cupo sin contenido de la factura en la tabla canónica V4 `factura_ai_uso_v4`; no existe un contador F6 paralelo.
- El límite diario ya definido por la licencia se aplica de forma atómica por comercio y día operativo; en la beta es 30.
- Dueño y administrador pueden usarlo. Un empleado también puede si tiene `productos_editar`; la autorización se repite en servidor.
- La salida se sanea por tipo, rango y longitud. Ningún dato modifica stock automáticamente: siempre se abre la revisión humana antes de confirmar.

## 9. Evidencia ejecutada

- 16 suites locales descubiertas automáticamente.
- 118 pruebas ejecutadas: 118 aprobadas y 0 fallidas.
- Identidad JSON/HTML comparada por ejecución aislada del bloque del navegador.
- Pruebas de sintaxis del artefacto HTML y de las funciones TypeScript disponibles con Node.
- Ocho suites SQL F6 y ocho F5 ejecutadas en PostgreSQL QA: 16/16 PASS dentro de transacciones descartables.
- La suite de `06_pilot_gate.sql` se volvió a ejecutar en esta etapa: PASS y `ROLLBACK` confirmado sin fixtures persistentes.
- No se declara una reproducción integral de las 16 suites SQL desde una base vacía.

## 10. Qué falta

Falta la activación y la fase operativa de QA, no más funcionalidad de diseño:

- guardar `GEMINI_API_KEY` como secret de QA, desplegar `leer-factura` y realizar un smoke con una factura no sensible;
- ejecutar el piloto de siete días y decidir aprobación o repetición;

Producción queda fuera de alcance. La migración conjunta F5+F6 se prepara únicamente después de que el piloto termine aprobado.

## 11. Archivos principales

- `entregables/MiComercio-F6-PRUEBA.html`: sistema comercial F6.
- `entregables/MiComercio-Soporte-F6.html`: panel de soporte.
- `supabase/f6/01_foundation.sql` a `10_invoice_reader.sql`: migraciones F6.
- `supabase/functions/f6-invitations/index.ts`, `f6-support/index.ts` y `leer-factura/index.ts`: fronteras HTTP.
- `entregables/BUILD-IDENTITY-F6.json`: identidad normativa.
- `entregables/QA-F6-EVIDENCIA.md`: evidencia técnica detallada.
- `entregables/SQL-REPRODUCIBILIDAD-F6.md`: alcance real de las pruebas SQL.
- `entregables/PILOTO-F6-7-DIAS.md`: bitácora a completar cuando los gates previos estén aprobados.
