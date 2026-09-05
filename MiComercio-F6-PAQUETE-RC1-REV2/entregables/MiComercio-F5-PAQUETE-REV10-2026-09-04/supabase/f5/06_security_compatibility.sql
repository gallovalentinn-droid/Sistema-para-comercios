-- F5.6 — compatibilidad: roster completo, ticket_ref distribuido y schema meta mínimo.

create or replace function private.f5_ticket_ref(
  p_caja_codigo text,
  p_ticket_seq bigint,
  p_venta_id uuid
)
returns text
language sql
immutable
strict
set search_path = ''
as $function$
  select upper(trim(p_caja_codigo))||'-'||lpad(p_ticket_seq::text,6,'0')||'-'||
         upper(substr(replace(p_venta_id::text,'-',''),1,8));
$function$;

-- La función de venta ya existe desde F5.4. Reemplazamos únicamente la expresión
-- del ticket y abortamos si el cuerpo instalado no coincide con la versión esperada.
do $f5_ticket_upgrade$
declare
  v_def text;
  v_old constant text := 'v_ticket_ref:=v_codigo||''-''||lpad(v_ticket_seq::text,6,''0'');';
  v_new constant text := 'v_ticket_ref:=private.f5_ticket_ref(v_codigo,v_ticket_seq,v_venta_id);';
begin
  select pg_get_functiondef('private._f5_registrar_venta_offline(text,uuid,jsonb)'::regprocedure)
    into v_def;
  if position(v_old in v_def)=0 then
    raise exception 'F5_TICKET_REF_PREFLIGHT_FAILED'
      using hint='Revisar la versión de private._f5_registrar_venta_offline antes de modificarla.';
  end if;
  execute replace(v_def,v_old,v_new);
end
$f5_ticket_upgrade$;

create or replace function private._f5_service_listar_miembros(
  p_actor_user_id uuid,
  p_comercio_id uuid,
  p_after_created_at timestamptz default null,
  p_after_user_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit,50),1),100);
  v_items jsonb;
  v_total bigint;
  v_last jsonb;
begin
  if not exists (
    select 1 from public.comercio_miembros cm
    where cm.comercio_id=p_comercio_id and cm.user_id=p_actor_user_id
      and cm.activo and cm.rol in ('duenio','admin')
  ) then raise exception 'ROLE_REQUIRED'; end if;
  if (p_after_created_at is null)<>(p_after_user_id is null) then
    raise exception 'F5_ROSTER_CURSOR_INVALIDO';
  end if;

  select count(*) into v_total
  from public.comercio_miembros cm
  where cm.comercio_id=p_comercio_id and cm.activo;

  select coalesce(jsonb_agg(to_jsonb(page) order by page.created_at,page.user_id),'[]'::jsonb)
    into v_items
  from (
    select cm.user_id,li.usuario_normalizado as usuario,cm.nombre_mostrado,
           cm.rol,cm.permisos,cm.permission_version,cm.activo,cm.created_at
    from public.comercio_miembros cm
    left join private.f5_login_identidades li
      on li.comercio_id=cm.comercio_id and li.user_id=cm.user_id
    where cm.comercio_id=p_comercio_id and cm.activo
      and (p_after_created_at is null or (cm.created_at,cm.user_id)>(p_after_created_at,p_after_user_id))
    order by cm.created_at,cm.user_id
    limit v_limit
  ) page;

  if jsonb_array_length(v_items)=v_limit then
    v_last:=v_items->(jsonb_array_length(v_items)-1);
  end if;
  return jsonb_build_object(
    'items',v_items,'total',v_total,
    'next_cursor',case when v_last is null then null else jsonb_build_object(
      'created_at',v_last->>'created_at','user_id',v_last->>'user_id'
    ) end
  );
end;
$function$;

create or replace function public.f5_service_listar_miembros(
  p_actor_user_id uuid,
  p_comercio_id uuid,
  p_after_created_at timestamptz default null,
  p_after_user_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select private._f5_service_listar_miembros(
    p_actor_user_id,p_comercio_id,p_after_created_at,p_after_user_id,p_limit
  );
$function$;

revoke all on function private.f5_ticket_ref(text,bigint,uuid) from public,anon,authenticated,service_role;
revoke all on function private._f5_service_listar_miembros(uuid,uuid,timestamptz,uuid,integer) from public,anon,authenticated,service_role;
revoke all on function public.f5_service_listar_miembros(uuid,uuid,timestamptz,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function private._f5_service_listar_miembros(uuid,uuid,timestamptz,uuid,integer) to service_role;
grant execute on function public.f5_service_listar_miembros(uuid,uuid,timestamptz,uuid,integer) to service_role;

alter table public.app_schema_meta enable row level security;
revoke all on table public.app_schema_meta from public,anon,authenticated,service_role;

drop policy if exists app_schema_meta_authenticated_read on public.app_schema_meta;
create policy app_schema_meta_authenticated_read
on public.app_schema_meta
for select
to authenticated
using (singleton);

grant select(schema_version,payload_version,updated_at) on public.app_schema_meta to authenticated;

create index if not exists caja_sesion_segmentos_root_session_idx
  on public.caja_sesion_segmentos(root_session_id);

create or replace function public.f5_schema_meta()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select jsonb_build_object(
    'schema_version',m.schema_version,
    'payload_version',m.payload_version,
    'updated_at',m.updated_at
  )
  from public.app_schema_meta m
  limit 1;
$function$;

revoke all on function public.f5_schema_meta() from public,anon,authenticated,service_role;
grant execute on function public.f5_schema_meta() to authenticated;

comment on function public.f5_schema_meta() is
  'Lectura autenticada mínima de compatibilidad; sólo proyecta tres columnas autorizadas.';
