-- F6 — cupo mensual y autorización de lectura de facturas con IA.
-- La imagen nunca se persiste en Postgres. La reserva se registra en la tabla
-- V4 ya existente para no crear un segundo contador de consumo de IA.
-- La beta permite como máximo 100 lecturas por comercio y mes operativo.

alter table public.comercio_licencias
  add column if not exists limite_ia_mensual integer;

update public.comercio_licencias
   set limite_ia_mensual=100
 where limite_ia_mensual is null;

alter table public.comercio_licencias
  alter column limite_ia_mensual set default 100,
  alter column limite_ia_mensual set not null;

do $constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.comercio_licencias'::regclass
      and conname='comercio_licencias_limite_ia_mensual_check'
  ) then
    alter table public.comercio_licencias
      add constraint comercio_licencias_limite_ia_mensual_check
      check(limite_ia_mensual between 0 and 100);
  end if;
end
$constraint$;

do $guard$
begin
  if to_regclass('public.factura_ai_uso_v4') is null then
    raise exception 'F6_IA_USAGE_V4_TABLE_MISSING';
  end if;

  -- Una revisión previa de F6 creó este contador paralelo. Sólo se elimina si
  -- está vacío; si contiene datos, la migración falla para exigir conciliación.
  if to_regclass('private.f6_ia_lecturas') is not null then
    if exists(select 1 from private.f6_ia_lecturas) then
      raise exception 'F6_IA_PARALLEL_USAGE_TABLE_NOT_EMPTY';
    end if;
    drop table private.f6_ia_lecturas;
  end if;
end
$guard$;

create index if not exists factura_ai_uso_v4_user_idx
  on public.factura_ai_uso_v4(user_id);

alter table public.factura_ai_uso_v4 enable row level security;
revoke all on table public.factura_ai_uso_v4 from public,anon,authenticated,service_role;

comment on table public.factura_ai_uso_v4 is
  'Reservas de cupo de lectura IA por comercio; nunca almacena imágenes ni texto de facturas.';

-- La RPC legacy medía por usuario contra clientes_licencia y no por comercio
-- V4. Se conserva para trazabilidad, pero deja de ser una API invocable.
do $legacy$
begin
  if to_regprocedure('public.consumir_cupo_factura_ai()') is not null then
    execute 'revoke all on function public.consumir_cupo_factura_ai() from public,anon,authenticated,service_role';
  end if;
end
$legacy$;

create or replace function public.f6_service_reservar_lectura_factura(
  p_actor_user_id uuid,
  p_comercio_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_limit integer;
  v_date date;
  v_period_start date;
  v_period_end date;
  v_used integer;
  v_now timestamptz:=statement_timestamp();
begin
  if p_actor_user_id is null or p_comercio_id is null or p_request_id is null then
    raise exception 'F6_IA_INPUT_INVALID';
  end if;

  select licencia.limite_ia_mensual
    into v_limit
    from public.comercio_miembros miembro
    join public.comercio_licencias licencia on licencia.comercio_id=miembro.comercio_id
   where miembro.comercio_id=p_comercio_id
     and miembro.user_id=p_actor_user_id
     and miembro.activo
     and (
       miembro.rol in ('duenio','admin')
       or miembro.permisos->>'productos_editar'='true'
     );
  if not found then raise exception 'F6_IA_FORBIDDEN'; end if;
  if not private.licencia_activa(p_comercio_id) then raise exception 'F6_IA_LICENSE_INACTIVE'; end if;

  v_limit:=greatest(0,coalesce(v_limit,0));
  v_date:=private.business_date(p_comercio_id,v_now);
  v_period_start:=date_trunc('month',v_date)::date;
  v_period_end:=(v_period_start+interval '1 month')::date;

  perform pg_advisory_xact_lock(hashtextextended('f6-ia:'||p_comercio_id::text||':'||v_period_start::text,0));

  if exists (
    select 1 from public.factura_ai_uso_v4 lectura
     where lectura.comercio_id=p_comercio_id
       and lectura.user_id=p_actor_user_id
       and lectura.operation_id=p_request_id::text
  ) then
    select count(*)::integer into v_used
      from public.factura_ai_uso_v4 lectura
     where lectura.comercio_id=p_comercio_id
       and lectura.business_date>=v_period_start
       and lectura.business_date<v_period_end;
    return jsonb_build_object(
      'ok',true,'code','IA_CUPO_RESERVADO','replayed',true,
      'limite',v_limit,'usados',v_used,'restantes',greatest(0,v_limit-v_used),
      'business_date',v_date,'periodo_desde',v_period_start,'periodo_hasta',v_period_end
    );
  end if;

  select count(*)::integer into v_used
    from public.factura_ai_uso_v4 lectura
   where lectura.comercio_id=p_comercio_id
     and lectura.business_date>=v_period_start
     and lectura.business_date<v_period_end;
  if v_used>=v_limit then
    return jsonb_build_object(
      'ok',false,'code','LIMITE_IA_MENSUAL','replayed',false,
      'limite',v_limit,'usados',v_used,'restantes',0,
      'business_date',v_date,'periodo_desde',v_period_start,'periodo_hasta',v_period_end
    );
  end if;

  insert into public.factura_ai_uso_v4(comercio_id,user_id,operation_id,business_date,created_at)
  values(p_comercio_id,p_actor_user_id,p_request_id::text,v_date,v_now);
  v_used:=v_used+1;
  return jsonb_build_object(
    'ok',true,'code','IA_CUPO_RESERVADO','replayed',false,
    'limite',v_limit,'usados',v_used,'restantes',greatest(0,v_limit-v_used),
    'business_date',v_date,'periodo_desde',v_period_start,'periodo_hasta',v_period_end
  );
end
$function$;

revoke all on function public.f6_service_reservar_lectura_factura(uuid,uuid,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.f6_service_reservar_lectura_factura(uuid,uuid,uuid)
to service_role;
