-- REV95: admite un tercer intento por lectura (principal, respaldo y un reintento del respaldo).
-- No cambia los límites de frecuencia (6 llamadas en 5 minutos, 30 en una hora), el cupo mensual ni los permisos:
-- la tercera plaza cuenta contra esos mismos límites y la función la pide solo si entra.
-- Idempotente. La función que usa tres intentos sigue funcionando con dos si esta migración no está aplicada.
-- Reversión: solo es posible volver a un máximo de 2 mientras no existan filas con 3 intentos.
begin;
alter table public.factura_ai_uso_v4 drop constraint if exists factura_ai_rev84_state_check;
alter table public.factura_ai_uso_v4 add constraint factura_ai_rev84_state_check check(
 (rev84_state is null or rev84_state in ('reservada','resultado','fallida')) and
 rev84_pending_calls between 0 and 3 and
 (rev84_max_attempts is null or rev84_max_attempts between 1 and 3) and
 (rev84_state is null or (rev84_max_attempts is not null and rev84_pending_calls<=rev84_max_attempts)) and
 (rev84_state is distinct from 'reservada' or rev84_expires_at is not null));
alter table private.factura_ai_intentos_rev84 drop constraint if exists factura_ai_intentos_rev84_attempt_check;
alter table private.factura_ai_intentos_rev84 add constraint factura_ai_intentos_rev84_attempt_check check(attempt between 1 and 3);
do $rev95$
declare
  v_definition text;
  v_old constant text := 'p_max_attempts not between 1 and 2';
  v_new constant text := 'p_max_attempts not between 1 and 3';
begin
  select pg_get_functiondef('public.f6_service_reservar_lectura_factura_rev84(uuid,uuid,uuid,integer)'::regprocedure)
    into v_definition;
  if position(v_new in v_definition)=0 then
    if position(v_old in v_definition)=0 then
      raise exception 'REV95_RESERVATION_CONTRACT_UNEXPECTED';
    end if;
    execute replace(v_definition,v_old,v_new);
  end if;
end
$rev95$;
notify pgrst,'reload schema';
commit;
