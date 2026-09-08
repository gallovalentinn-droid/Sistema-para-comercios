# Reproducibilidad SQL de F6

Fecha de corte: 2026-09-08
Proyecto usado para las pruebas incrementales: Supabase QA `qrvdfqpxutymmlcplsal`
PostgreSQL observado: 17.6.1

## Alcance exacto

F6 contiene nueve migraciones y siete suites SQL propias:

| Orden | Migración | Suite |
|---:|---|---|
| 1 | `supabase/f6/01_foundation.sql` | `supabase/tests/f6_schema.test.sql` |
| 2 | `supabase/f6/02_invitations_provisioning.sql` | `supabase/tests/f6_invitations.test.sql` |
| 3 | `supabase/f6/03_onboarding.sql` | `supabase/tests/f6_onboarding.test.sql` |
| 4 | `supabase/f6/04_licenses.sql` | `supabase/tests/f6_licenses.test.sql` |
| 5 | `supabase/f6/05_support.sql` | `supabase/tests/f6_support.test.sql` |
| 6 | `supabase/f6/06_pilot_gate.sql` | `supabase/tests/f6_pilot_gate.test.sql` |
| 7 | `supabase/f6/07_employee_management.sql` | `supabase/tests/f6_employees_images.test.sql` |
| 8 | `supabase/f6/08_product_images.sql` | `supabase/tests/f6_employees_images.test.sql` |
| 9 | `supabase/f6/09_commerce_login_codes.sql` | `supabase/tests/f6_employees_images.test.sql` |

Cada incremento fue probado sobre el baseline real de QA dentro de una transacción descartable. El 2026-09-08, después de aplicar `07`, `08` y `09`, se ejecutaron las siete suites F6 y las ocho suites F5, cada una en una transacción descartable independiente: 15/15 suites PASS. Después de cada `ROLLBACK` no quedaron fixtures F5/F6 persistentes. La suite de soporte se corrigió para contar sólo sus cuatro fixtures, porque QA ya contiene un operador real persistente.

Esto acredita el delta F6 y la regresión F5 acumulada sobre el baseline persistente de QA. Todavía no acredita una instalación completa desde una base vacía porque el paquete no reconstruye el esquema histórico F2–F4.

## Baseline requerido

Las migraciones F6 consumen objetos creados por F2, F3, F4 y F5. Para reproducirlas hace falta un proyecto que ya contenga, como mínimo:

- `public.comercios`, `comercio_configuracion`, `comercio_miembros`, `comercio_licencias` y `cajas`;
- contratos de licencia F3.3;
- flujo de preparación y `v4_only` F3.4/F4;
- membresías, autoridad, leases, sesiones, segmentos, cierres, outbox y proyección F5 rev10;
- PostgreSQL 15 o superior.

El paquete incluye las migraciones y suites F5 disponibles, pero no reconstruye por sí solo todo el esquema histórico F2–F4. Un fallo por objetos base ausentes no debe presentarse como un fallo de lógica F6.

## Forma segura de reproducción

1. Usar un proyecto QA aislado o una rama de base de datos; nunca producción.
2. Confirmar PostgreSQL 15+.
3. Ejecutar el preflight de datos y exigir cero incompatibilidades.
4. Abrir una transacción.
5. Aplicar `01` a `08` en orden.
6. Ejecutar las siete suites F6.
7. Terminar con `ROLLBACK` mientras se valida el candidato.
8. Comprobar que no quedaron tablas, funciones o fixtures creados por la prueba.

Para la validación acumulada deben ejecutarse además las ocho suites F5. El resultado esperado contractual es 15 suites, pero sólo debe escribirse “15/15 PASS” después de medir esa corrida concreta.

## Concurrencia pendiente

Las suites verifican locks, unicidad, idempotencia y límites dentro de las transacciones. Aun así, antes del piloto faltan dos pruebas con conexiones realmente simultáneas:

- dos consumidores del mismo token de invitación;
- dos extensiones sobre la misma licencia intentando agotar el saldo adicional.

La evidencia secuencial no sustituye esas carreras.

## Estado persistente

Las seis migraciones F6 fueron aplicadas persistentemente el 2026-09-05 al proyecto QA `qrvdfqpxutymmlcplsal`, en el orden `01` a `06`, con versiones `20260905182341` a `20260905182519`. También se desplegaron `f6-invitations` versión 1 y `f6-support` versión 1, ambas en estado `ACTIVE`.

El 2026-09-07 se aplicaron persistentemente `f6_employee_management_qa`, `f6_product_images_qa` y la corrección `f6_employee_management_security_qa`. La última conserva el control privilegiado en `private` y deja el RPC público como `security invoker`, evitando exponer una nueva función `security definer` directamente en el API público.

Los secrets explícitos de allowlist y pepper quedaron configurados y el smoke test desde `Origin: null` pasó. El primer operador interno también quedó designado y el acceso autenticado al panel fue comprobado contra la Edge Function QA.

Después del despliegue inicial se aplicó `f6_rc1_05_support_null_name_fix_qa`, que corrige el fallback de nombre del bootstrap cuando Auth no contiene `name` ni `full_name`. La prueba de regresión falló primero con SQLSTATE `23502`, pasó después de la migración y luego se repitieron las 14 suites F5/F6 con resultado 14/14 PASS.

La aplicación todavía no está habilitada para el piloto: faltan los gates F5, el recorrido funcional completo y las pruebas concurrentes. Producción no fue modificada.

## Límite de seguridad conocido en el baseline

El asesor de seguridad del proyecto QA seguía informando cinco tablas privadas F5 sin RLS habilitado:

- `private.f5_membresia_eventos`;
- `private.f5_login_comercios`;
- `private.f5_login_identidades`;
- `private.f5_login_intentos`;
- `private.f5_autoridad_eventos`.

Sus grants públicos están revocados, pero el hallazgo es previo a F6 y debe resolverse o aceptarse expresamente antes de producción. No se lo presenta como corregido por este paquete.
