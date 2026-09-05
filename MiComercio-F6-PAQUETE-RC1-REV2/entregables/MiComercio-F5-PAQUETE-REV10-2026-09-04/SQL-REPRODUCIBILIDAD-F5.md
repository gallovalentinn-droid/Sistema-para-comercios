# Reproducibilidad SQL de F5

## Qué se ejecutó

Las ocho suites SQL se ejecutaron el 4 de septiembre de 2026 contra Supabase QA `qrvdfqpxutymmlcplsal`. Para cada suite se abrió una transacción, se aplicaron en orden `supabase/f5/01_*.sql` a `07_*.sql`, se ejecutó la suite correspondiente y se terminó con `ROLLBACK`.

Este resultado comprueba el delta F5 sobre el esquema QA real. No es una reproducción desde una base vacía.

## Esquema base requerido

El paquete F5 no contiene las migraciones históricas F2, F3 y F4. Para reproducir las suites hace falta un proyecto o rama que ya incluya, como mínimo:

- el replay V3/F2 registrado en QA desde `qa_replay_00_legacy_v3` hasta `qa_replay_02_f2_privilege_hardening`;
- los contratos F3.1, F3.3 y F3.4;
- F4.1, F4.2/F4.2.3 y F4.3 hasta `f43_fix7_commerce_wide_legacy_fence`;
- PostgreSQL 15 o superior.

Sin ese baseline las suites deben fallar por objetos previos ausentes; no se debe interpretar ese fallo como un resultado F5.

## Estado persistente de QA

Antes de rev10, QA registraba estas seis migraciones F5, que habían quedado superadas por las correcciones posteriores:

1. `f5_task6_offline_streams_qa`
2. `f5_task6_offline_operations_qa`
3. `f5_task11_security_compatibility_qa`
4. `f5_task11_security_hardening_qa`
5. `f5_task8_projection_manifest_qa`
6. `f5_rollback_contract_10_6_fix_qa`

Rev10 reaplicó los siete SQL actuales en una migración trazable:

- `f5_rev10_candidate_sync_qa` — versión `20260904183240`.

Después de aplicarla se verificó que la RPC privilegiada rechaza del allowlist `pin_hash` y `permisos_empleado`, y que el constructor de proyección incluye `whatsapp_dueno` y `dias_aviso_vence`.

También se redeplegaron las funciones que comparten la resolución de IP:

- `f5-login`, versión 3, `verify_jwt=false` porque implementa el intercambio de credenciales y su autenticación propia.
- `f5-members`, versión 4, `verify_jwt=true`.

Producción no recibió ninguno de estos cambios.

## Límite de la evidencia

Un tercero puede reproducir el 8/8 sobre el QA conectado o sobre una rama que conserve el baseline enumerado. Este ZIP, por sí solo, no crea una base F2–F4 desde cero. La evidencia y el informe no deben describirlo como un paquete SQL autónomo.
