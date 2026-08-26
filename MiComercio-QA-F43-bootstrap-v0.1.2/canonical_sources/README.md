# Artefactos SQL canónicos requeridos — servidor

El checker exige los instaladores SQL que deben estar materializados en `qa-f43`
antes de reconstruir el sandbox.

## Obligatorios por nombre exacto

- `supabase-setup.sql`
- `supabase-v4-schema-final.sql`
- `01_F2_PRIVILEGIOS_HARDENING.sql`
- `supabase-v4-f3-contracts.sql`
- `supabase-v4-f3.3-contracts.sql`
- `supabase-v4-f3.4-contracts.sql`
- `supabase-v4-f4.1-control-plane.sql`
- `supabase-v4-f4.2-zero-start.sql`

## F3.2

F3.2 Slice A/B **no es una migración de base**.
No colocar un pseudo-SQL F3.2 ni ejecutarlo en SQL Editor.

El baseline cliente F3.2 se registra por separado en:

`../client_baseline/F32_CLIENT_BASELINE.txt`

## Verify / QA que conviene materializar también

- `supabase-v4-verify.sql`
- verify de F3.3
- verify/preflight F3.4
- verify/control-plane F4.1
- verify F4.2
- Gate F4.2 v1.4
- SPEC COV-1 v0.2

## Importante

Este directorio no contiene copias inventadas de instaladores faltantes.
La fuente de verdad debe ser el archivo canónico ya aprobado, no SQL reconstruido "a ojo"
desde el estado actual de una base.
