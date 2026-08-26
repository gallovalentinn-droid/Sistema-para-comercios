# Mi Comercio — QA F4.3 bootstrap v0.1.2

## Objetivo

Preparar `qa-f43` para reconstruir un Supabase de laboratorio desde artefactos canónicos,
demostrar paridad estructural con el backend vigente y recién después ejecutar COV-1.

Este paquete **NO habilita F4.3** y **NO modifica producción**.

## Targets protegidos

- PRODUCCIÓN — SOLO REFERENCIA / NO EJECUTAR TEST DESTRUCTIVO:
  `Sistema Para Comercios` — `zzpmdiivewmvhiszmdzh`
- SANDBOX CANDIDATO:
  `gallovalentinn-droid's Project` — `qrvdfqpxutymmlcplsal`

## Estado actual del sandbox

FAIL de paridad al 2026-08-26.

Diferencias de alto nivel frente a producción:

| Componente | Producción | Sandbox | Igual |
|---|---:|---:|---|
| relaciones | 45 | 44 | NO |
| columnas | 497 | 496 | NO |
| funciones | 65 | 56 | NO |
| policies | 51 | 47 | NO |
| índices | 109 | 106 | NO |
| constraints | 253 | 241 | NO |
| vistas | 4 | 4 | SÍ |
| grants anon/authenticated/public | 80 | 114 | NO |

Diferencias funcionales ya detectadas:

- faltan `anular_venta_v4`;
- falta `reversar_egreso_v4`;
- falta `cerrar_sesion_caja_excepcion_v4`;
- faltan objetos legacy/V4 que existen en el backend vigente;
- sobran `comentarios`, `gestion`, `gestion_log`, `saldos`;
- existen grants/policies ajenos al contrato canónico.

## Orden canónico de reconstrucción del servidor

1. `supabase-setup.sql` — legacy V3 / CAS.
2. `supabase-v4-schema-final.sql` — F2 consolidado.
3. `01_F2_PRIVILEGIOS_HARDENING.sql`.
4. `supabase-v4-f3-contracts.sql` — F3.1.
5. `supabase-v4-f3.3-contracts.sql` — F3.3.
6. `supabase-v4-f3.4-contracts.sql` — F3.4.
7. `supabase-v4-f4.1-control-plane.sql` — F4.1.
8. `supabase-v4-f4.2-zero-start.sql` — F4.2.

Ejecutar el verify correspondiente después de cada fase.

### F3.2 no es una migración de base

F3.2 Slice A/B pertenece al baseline del cliente y a la lógica de pull/sincronización.
Debe conservarse como referencia de compatibilidad, pero **NO se ejecuta en SQL Editor**
y **NO forma parte del rebuild del schema**.

Registrar los artefactos cliente F3.2 vigentes en:

`client_baseline/F32_CLIENT_BASELINE.txt`

**NO instalar F4.2.3 / `modulo_cigarros` en esta reconstrucción.**

## Regla F2

Para una instalación limpia se usa `supabase-v4-schema-final.sql`.
Los históricos `supabase-v4-fixes*.sql` son material de auditoría y **no deben aplicarse
encima del schema final**, porque las correcciones ya están consolidadas.

## Flujo de uso

1. Copiar este paquete al branch `qa-f43`.
2. Colocar los 8 instaladores SQL canónicos exactos dentro de `canonical_sources/`.
3. Registrar el baseline cliente F3.2 en `client_baseline/F32_CLIENT_BASELINE.txt`.
4. Ejecutar `python scripts/check_canonical_files.py canonical_sources`.
5. Si el checker devuelve `READY_FOR_SANDBOX_REBUILD=false`, no resetear nada.
6. Con los 8 SQL presentes, reconstruir el sandbox.
7. Ejecutar `qa/01_parity_fingerprint.sql` en el sandbox.
8. Exigir que **todos** los hashes/counts coincidan con `EXPECTED_PROD_FINGERPRINT.json`.
9. Ejecutar `qa/02_required_contracts.sql`.
10. Ejecutar `qa/03_extra_object_audit.sql`.
11. Recién con PARIDAD PASS, preparar/ejecutar COV-1.
12. Después: multi-tenant/RLS → rollback F4.3 → regresión → candidatear F4.3.

## Seguridad

Todos los SQL incluidos en `qa/` son **read-only** (`SELECT`/CTE).
Este paquete no contiene un reset destructivo automático a propósito.

`rebuild/RESET_NOT_INCLUDED.md` explica por qué: no se debe borrar el sandbox hasta que
los nueve tramos canónicos estén físicamente presentes y verificados.

## Release cliente actual a preservar

Cliente F4.2 RC1.2:
`MiComercio-F42-RC12-DEVICE-B-FIXED.html`

SHA-256:
`25fb82470255878346f332fd153ac2087bf825b08e367a71fed3741f03a5de3d`

No editar ese archivo y seguir llamándolo RC1.2: cualquier cambio produce un artefacto nuevo.


## Convención de IDs COV-1

La fuente normativa es `COVERAGE_CONTRACT.md v0.2`.
El precheck usa exactamente los mismos `scenario_id`, incluyendo:

- `COV-CREDIT-PAY`
- `COV-CREDIT-ADJ`
- `COV-SALE-CANCEL`

No introducir alias alternativos en runner ni audit.


## Patch v0.1.2

Se corrige la clasificación de F3.2:

- F3.2 Slice A/B = baseline cliente.
- No es una migración SQL del servidor.
- El rebuild de Supabase requiere 8 tramos SQL: V3, F2, hardening, F3.1, F3.3, F3.4, F4.1 y F4.2.
- El checker ya no bloquea el rebuild por ausencia de un supuesto SQL F3.2.
