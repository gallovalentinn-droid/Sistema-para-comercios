-- F5.6 — follow-up idempotente para entornos que recibieron la primera revisión
-- de 06_security_compatibility.sql.

alter table public.app_schema_meta enable row level security;
revoke all on table public.app_schema_meta from public,anon,authenticated,service_role;

drop policy if exists app_schema_meta_authenticated_read on public.app_schema_meta;
create policy app_schema_meta_authenticated_read
on public.app_schema_meta
for select
to authenticated
using (singleton);

grant select(schema_version,payload_version,updated_at) on public.app_schema_meta to authenticated;

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

create index if not exists caja_sesion_segmentos_root_session_idx
  on public.caja_sesion_segmentos(root_session_id);
