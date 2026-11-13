-- REV95: admite un tercer intento por lectura (principal, respaldo y un reintento del respaldo).
-- La reserva inicial NO cambia: sigue admitiendo una o dos plazas, de modo que una lectura en curso nunca retiene
-- capacidad para un reintento que quizá no ocurra. La plaza extra se pide recién al necesitarla, con la RPC nueva,
-- bajo el mismo candado y los mismos topes (6 llamadas en 5 minutos, 30 en una hora). Sin cambios de cupo ni permisos.
-- Idempotente. La función sigue funcionando sin esta migración: simplemente no reintenta.
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

create or replace function public.f6_service_ampliar_intento_lectura_factura_rev95(p_actor_user_id uuid,p_comercio_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r record;t timestamptz:=statement_timestamp();pending integer;actual integer;cap integer;window_seconds integer;
begin
 perform private.f6_lector_authority_rev84(p_actor_user_id,p_comercio_id);
 if p_request_id is null then raise exception 'F6_IA_INPUT_INVALID';end if;
 -- Mismo candado que la reserva y el inicio de intento: la decisión es atómica frente a otras lecturas del comercio.
 perform pg_advisory_xact_lock(hashtextextended('f6-ia-rev84:'||p_comercio_id::text,0));
 select * into r from public.factura_ai_uso_v4 where comercio_id=p_comercio_id and user_id=p_actor_user_id and operation_id=p_request_id::text for update;
 if not found or r.rev84_state is distinct from 'reservada' or r.rev84_expires_at<=t or r.result_recorded_at is not null then raise exception 'F6_IA_RESERVATION_NOT_ACTIVE';end if;
 -- Solo después de usar todas las plazas admitidas, y una única vez por lectura.
 if r.rev84_pending_calls<>0 or r.rev84_max_attempts>=3 or (select count(*) from private.factura_ai_intentos_rev84 where comercio_id=p_comercio_id and user_id=p_actor_user_id and operation_id=p_request_id)<>r.rev84_max_attempts then
  return jsonb_build_object('ok',false,'code','IA_REINTENTO_NO_DISPONIBLE');
 end if;
 -- Las plazas ya admitidas de otras lecturas en curso se respetan: cuentan antes que esta plaza extra.
 select coalesce(sum(rev84_pending_calls),0) into pending from public.factura_ai_uso_v4
  where comercio_id=p_comercio_id and rev84_state='reservada' and rev84_expires_at>t and result_recorded_at is null;
 foreach window_seconds in array array[300,3600] loop
  cap:=case when window_seconds=300 then 6 else 30 end;
  select count(*) into actual from private.factura_ai_intentos_rev84 where comercio_id=p_comercio_id and started_at>t-make_interval(secs=>window_seconds);
  if actual+pending+1>cap then return jsonb_build_object('ok',false,'code','IA_LIMITE_FRECUENCIA');end if;
 end loop;
 update public.factura_ai_uso_v4 set rev84_max_attempts=rev84_max_attempts+1,rev84_pending_calls=1 where id=r.id;
 return jsonb_build_object('ok',true);
end$$;
revoke all on function public.f6_service_ampliar_intento_lectura_factura_rev95(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.f6_service_ampliar_intento_lectura_factura_rev95(uuid,uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
