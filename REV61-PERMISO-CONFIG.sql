-- REV61: complemento idempotente de REV57-MODOS-CAJA-CIGARRILLOS.sql.
-- La función pública f5_actualizar_config_privilegiada se ejecuta con los
-- privilegios del usuario y llama a esta función privada. REV57 revocó su
-- EXECUTE; ese permiso fue repuesto en producción el 2026-09-28 y aquí queda
-- versionado para instalar desde el repositorio.
begin;
grant execute on function private._f5_actualizar_config_privilegiada(uuid,jsonb) to authenticated;
commit;
