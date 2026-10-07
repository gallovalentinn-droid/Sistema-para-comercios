-- REV84: autorización independiente de REV84-LECTOR-MEMORIA.sql.
-- Metadatos únicamente. Conserva filas y RPC REV83 para una reversión conservadora.
begin;
alter table public.factura_ai_uso_v4
 add column if not exists rev84_state text,
 add column if not exists rev84_expires_at timestamptz,
 add column if not exists rev84_pending_calls integer not null default 0,
 add column if not exists rev84_max_attempts integer,
 add column if not exists rev84_finished_at timestamptz;
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='public.factura_ai_uso_v4'::regclass and conname='factura_ai_rev84_state_check') then
  alter table public.factura_ai_uso_v4 add constraint factura_ai_rev84_state_check check(
   (rev84_state is null or rev84_state in ('reservada','resultado','fallida')) and
   rev84_pending_calls between 0 and 2 and
   (rev84_max_attempts is null or rev84_max_attempts between 1 and 2) and
   (rev84_state is null or (rev84_max_attempts is not null and rev84_pending_calls<=rev84_max_attempts)) and
   (rev84_state is distinct from 'reservada' or rev84_expires_at is not null));
 end if;
end$$;
create index if not exists factura_ai_rev84_leases_idx on public.factura_ai_uso_v4(comercio_id,rev84_expires_at) where rev84_state='reservada';
create table if not exists private.factura_ai_intentos_rev84(
 id bigint generated always as identity primary key,
 comercio_id uuid not null references public.comercios(id),user_id uuid not null,
 operation_id uuid not null,provider text not null check(provider in ('openai','gemini')),
 attempt integer not null check(attempt between 1 and 2),started_at timestamptz not null default statement_timestamp(),
 unique(comercio_id,user_id,operation_id,attempt)
);
create index if not exists factura_ai_intentos_rev84_window_idx on private.factura_ai_intentos_rev84(comercio_id,started_at);
alter table private.factura_ai_intentos_rev84 enable row level security;
revoke all on private.factura_ai_intentos_rev84 from public,anon,authenticated;
revoke all on sequence private.factura_ai_intentos_rev84_id_seq from public,anon,authenticated;

create or replace function private.f6_lector_authority_rev84(p_actor uuid,p_comercio uuid) returns integer
language plpgsql security definer set search_path='' as $$declare n integer;begin
 if p_actor is null or p_comercio is null then raise exception 'F6_IA_INPUT_INVALID';end if;
 select l.limite_ia_mensual into n from public.comercio_miembros m join public.comercio_licencias l on l.comercio_id=m.comercio_id
 where m.comercio_id=p_comercio and m.user_id=p_actor and m.activo and (m.rol in ('duenio','admin') or m.permisos->>'productos_editar'='true');
 if not found then raise exception 'F6_IA_FORBIDDEN';end if;
 if not private.licencia_activa(p_comercio) then raise exception 'F6_IA_LICENSE_INACTIVE';end if;
 return greatest(0,coalesce(n,0));
end$$;
revoke all on function private.f6_lector_authority_rev84(uuid,uuid) from public,anon,authenticated;

create or replace function public.f6_service_capacidades_lector_factura_rev84(p_actor_user_id uuid,p_comercio_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$declare lim integer;used integer;held integer;d date;t timestamptz:=statement_timestamp();begin
 lim:=private.f6_lector_authority_rev84(p_actor_user_id,p_comercio_id);d:=date_trunc('month',private.business_date(p_comercio_id,t))::date;
 select count(*) filter(where rev84_state is null or rev84_state='resultado' or result_recorded_at is not null),
 count(*) filter(where rev84_state='reservada' and result_recorded_at is null and rev84_expires_at>t)
 into used,held from public.factura_ai_uso_v4 where comercio_id=p_comercio_id and business_date>=d and business_date<d+interval '1 month';
 return jsonb_build_object('contract','f6-reader-quota-rev84','limite',lim,'usados',used,'reservados',held,'disponibles',greatest(0,lim-used-held));
end$$;

create or replace function public.f6_service_reservar_lectura_factura_rev84(p_actor_user_id uuid,p_comercio_id uuid,p_request_id uuid,p_max_attempts integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare lim integer;d date;t timestamptz:=statement_timestamp();r record;counts jsonb;concurrent integer;
 pending integer;actual integer;cap integer;window_seconds integer;retry integer;release_time timestamptz;monthly_calls integer;
begin
 lim:=private.f6_lector_authority_rev84(p_actor_user_id,p_comercio_id);
 if p_request_id is null or p_max_attempts is null or p_max_attempts not between 1 and 2 then raise exception 'F6_IA_INPUT_INVALID';end if;
 d:=date_trunc('month',private.business_date(p_comercio_id,t))::date;
 -- Commerce lock spans month boundaries. Second lock serializes with the unchanged REV83 RPC.
 perform pg_advisory_xact_lock(hashtextextended('f6-ia-rev84:'||p_comercio_id::text,0));
 perform pg_advisory_xact_lock(hashtextextended('f6-ia:'||p_comercio_id::text||':'||d::text,0));
 select * into r from public.factura_ai_uso_v4 where comercio_id=p_comercio_id and user_id=p_actor_user_id and operation_id=p_request_id::text;
 if found then
  return jsonb_build_object('ok',false,'replayed',true,'code',case when r.rev84_state='reservada' and r.result_recorded_at is null and r.rev84_expires_at>t then 'LECTURA_EN_CURSO' else 'LECTURA_NO_RECUPERABLE' end,'retryAfterSeconds',5);
 end if;
 counts:=public.f6_service_capacidades_lector_factura_rev84(p_actor_user_id,p_comercio_id);
 if (counts->>'disponibles')::integer<1 then return counts||jsonb_build_object('ok',false,'code','LIMITE_IA_MENSUAL');end if;
 select count(*),coalesce(sum(rev84_pending_calls),0),min(rev84_expires_at) into concurrent,pending,release_time
 from public.factura_ai_uso_v4 where comercio_id=p_comercio_id and rev84_state='reservada' and rev84_expires_at>t and result_recorded_at is null;
 if concurrent>=2 then return jsonb_build_object('ok',false,'code','IA_LECTURAS_EN_CURSO','retryAfterSeconds',greatest(1,ceil(extract(epoch from release_time-t))::int));end if;
 foreach window_seconds in array array[300,3600] loop
  cap:=case when window_seconds=300 then 6 else 30 end;
  select count(*) into actual from private.factura_ai_intentos_rev84 where comercio_id=p_comercio_id and started_at>t-make_interval(secs=>window_seconds);
  if actual+pending+p_max_attempts>cap then
   -- Earliest time at which enough blocking calls/leases have expired, including weighted slots.
   select expires into release_time from (
    select expires,sum(weight) over(order by expires rows unbounded preceding) removed from (
     select started_at+make_interval(secs=>window_seconds) expires,1 weight from private.factura_ai_intentos_rev84 where comercio_id=p_comercio_id and started_at>t-make_interval(secs=>window_seconds)
     union all select rev84_expires_at,rev84_pending_calls from public.factura_ai_uso_v4 where comercio_id=p_comercio_id and rev84_state='reservada' and rev84_expires_at>t and result_recorded_at is null and rev84_pending_calls>0
    )events
   )removal where removed>=actual+pending+p_max_attempts-cap order by expires limit 1;
   retry:=greatest(1,ceil(extract(epoch from release_time-t))::int);
   return jsonb_build_object('ok',false,'code','IA_LIMITE_FRECUENCIA','retryAfterSeconds',retry);
  end if;
 end loop;
 insert into public.factura_ai_uso_v4(comercio_id,user_id,operation_id,business_date,created_at,rev84_state,rev84_expires_at,rev84_pending_calls,rev84_max_attempts)
 values(p_comercio_id,p_actor_user_id,p_request_id::text,private.business_date(p_comercio_id,t),t,'reservada',t+interval '3 minutes',p_max_attempts,p_max_attempts);
 select count(*) into monthly_calls from private.factura_ai_intentos_rev84 where comercio_id=p_comercio_id and private.business_date(p_comercio_id,started_at)>=d and private.business_date(p_comercio_id,started_at)<d+interval '1 month';
 return counts||jsonb_build_object('ok',true,'replayed',false,'monthlyCallsWarning',monthly_calls>=3::bigint*lim);
end$$;

create or replace function public.f6_service_iniciar_intento_lectura_factura_rev84(p_actor_user_id uuid,p_comercio_id uuid,p_request_id uuid,p_provider text,p_attempt integer) returns jsonb
language plpgsql security definer set search_path='' as $$declare r record;begin
 perform private.f6_lector_authority_rev84(p_actor_user_id,p_comercio_id);
 if p_request_id is null or p_provider is null or p_provider not in ('openai','gemini') or p_attempt is null then raise exception 'F6_IA_INPUT_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('f6-ia-rev84:'||p_comercio_id::text,0));
 select * into r from public.factura_ai_uso_v4 where comercio_id=p_comercio_id and user_id=p_actor_user_id and operation_id=p_request_id::text for update;
 if not found or r.rev84_state is distinct from 'reservada' or r.rev84_expires_at<=statement_timestamp() or r.result_recorded_at is not null or r.rev84_pending_calls<1 then raise exception 'F6_IA_RESERVATION_NOT_ACTIVE';end if;
 if p_attempt<>r.rev84_max_attempts-r.rev84_pending_calls+1 then raise exception 'F6_IA_ATTEMPT_ORDER_INVALID';end if;
 -- Admitted capacity already includes the backup: never re-check global rate here.
 insert into private.factura_ai_intentos_rev84(comercio_id,user_id,operation_id,provider,attempt) values(p_comercio_id,p_actor_user_id,p_request_id,p_provider,p_attempt);
 update public.factura_ai_uso_v4 set rev84_pending_calls=rev84_pending_calls-1 where id=r.id;
 return jsonb_build_object('ok',true);
end$$;

create or replace function public.f6_service_finalizar_lectura_factura_rev84(p_actor_user_id uuid,p_comercio_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$declare r record;begin
 perform private.f6_lector_authority_rev84(p_actor_user_id,p_comercio_id);
 if p_request_id is null then raise exception 'F6_IA_INPUT_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('f6-ia-rev84:'||p_comercio_id::text,0));
 select * into r from public.factura_ai_uso_v4 where comercio_id=p_comercio_id and user_id=p_actor_user_id and operation_id=p_request_id::text for update;
 if not found or r.rev84_state is null then raise exception 'F6_IA_RESERVATION_NOT_FOUND';end if;
 update public.factura_ai_uso_v4 set rev84_state=case when result_recorded_at is not null then 'resultado' else 'fallida' end,rev84_pending_calls=0,rev84_finished_at=coalesce(rev84_finished_at,statement_timestamp()) where id=r.id;
 return jsonb_build_object('ok',true,'confirmed',r.result_recorded_at is not null);
end$$;

create or replace function public.f6_service_registrar_resultado_lectura_factura_rev84(p_actor_user_id uuid,p_comercio_id uuid,p_request_id uuid,p_model text,p_usage jsonb,p_recognized_fields text[],p_recognized_items integer) returns jsonb
language plpgsql security definer set search_path='' as $$declare r record;result jsonb;begin
 perform private.f6_lector_authority_rev84(p_actor_user_id,p_comercio_id);
 if p_request_id is null then raise exception 'F6_IA_INPUT_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('f6-ia-rev84:'||p_comercio_id::text,0));
 select * into r from public.factura_ai_uso_v4 where comercio_id=p_comercio_id and user_id=p_actor_user_id and operation_id=p_request_id::text for update;
 if not found or r.rev84_state is null or (r.result_recorded_at is null and (r.rev84_state<>'reservada' or r.rev84_expires_at<=statement_timestamp())) then raise exception 'F6_IA_RESERVATION_NOT_ACTIVE';end if;
 result:=public.f6_service_registrar_resultado_lectura_factura(p_actor_user_id,p_comercio_id,p_request_id,p_model,p_usage,p_recognized_fields,p_recognized_items);
 update public.factura_ai_uso_v4 set rev84_state='resultado',rev84_pending_calls=0,rev84_finished_at=coalesce(rev84_finished_at,statement_timestamp()) where id=r.id;
 return result;
end$$;
revoke all on function public.f6_service_capacidades_lector_factura_rev84(uuid,uuid),public.f6_service_reservar_lectura_factura_rev84(uuid,uuid,uuid,integer),public.f6_service_iniciar_intento_lectura_factura_rev84(uuid,uuid,uuid,text,integer),public.f6_service_finalizar_lectura_factura_rev84(uuid,uuid,uuid),public.f6_service_registrar_resultado_lectura_factura_rev84(uuid,uuid,uuid,text,jsonb,text[],integer) from public,anon,authenticated;
grant execute on function public.f6_service_capacidades_lector_factura_rev84(uuid,uuid),public.f6_service_reservar_lectura_factura_rev84(uuid,uuid,uuid,integer),public.f6_service_iniciar_intento_lectura_factura_rev84(uuid,uuid,uuid,text,integer),public.f6_service_finalizar_lectura_factura_rev84(uuid,uuid,uuid),public.f6_service_registrar_resultado_lectura_factura_rev84(uuid,uuid,uuid,text,jsonb,text[],integer) to service_role;
notify pgrst,'reload schema';
commit;
