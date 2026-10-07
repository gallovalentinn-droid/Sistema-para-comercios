-- REV31: archivado de catálogo y preferencias de caja por turnos.
-- Aplicar antes de publicar beta/index.html REV31.
alter table public.productos
  add column if not exists archivado_at timestamptz,
  add column if not exists archivado_por text,
  add column if not exists archivo_historial jsonb not null default '[]'::jsonb;

alter table public.comercio_configuracion
  add column if not exists maneja_turnos boolean not null default false,
  add column if not exists aviso_turno_horas integer not null default 8;

alter table public.comercio_configuracion
  drop constraint if exists comercio_configuracion_aviso_turno_horas_check;
alter table public.comercio_configuracion
  add constraint comercio_configuracion_aviso_turno_horas_check
  check (aviso_turno_horas between 1 and 72);

create or replace function public.f31_actualizar_preferencias_turno(
  p_comercio_id uuid,
  p_maneja_turnos boolean,
  p_aviso_horas integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actualizado timestamptz;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_comercio_id is null then raise exception 'COMERCIO_REQUIRED'; end if;
  if not private.tiene_rol(p_comercio_id, array['duenio','admin']) then
    raise exception 'ROLE_REQUIRED';
  end if;
  if not private.licencia_activa(p_comercio_id) and not exists (
    select 1 from private.f6_onboarding
    where comercio_id = p_comercio_id and completed_at is null
  ) then
    raise exception 'LICENSE_INACTIVE';
  end if;
  if p_maneja_turnos is null or p_aviso_horas is null or p_aviso_horas not between 1 and 72 then
    raise exception 'PREFERENCIAS_TURNO_INVALIDAS';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_comercio_id::text));
  insert into public.comercio_configuracion(comercio_id)
  values (p_comercio_id)
  on conflict (comercio_id) do nothing;
  update public.comercio_configuracion
     set maneja_turnos = p_maneja_turnos,
         aviso_turno_horas = p_aviso_horas,
         updated_at = now()
   where comercio_id = p_comercio_id
   returning updated_at into v_actualizado;
  return jsonb_build_object('ok', true, 'updated_at', v_actualizado);
end;
$function$;

revoke all on function public.f31_actualizar_preferencias_turno(uuid,boolean,integer) from public, anon, authenticated;
grant execute on function public.f31_actualizar_preferencias_turno(uuid,boolean,integer) to authenticated;

-- El manifiesto F5 limita las columnas que puede descargar cada dispositivo.
-- Extendemos el contrato existente sin reescribir sus reglas de permisos.
do $migration$
begin
  if to_regprocedure('private.f5_colecciones_por_permisos_rev30(text[])') is null then
    execute 'alter function private.f5_colecciones_por_permisos(text[]) rename to f5_colecciones_por_permisos_rev30';
  end if;
end;
$migration$;

create or replace function private.f5_colecciones_por_permisos(p_permissions text[])
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_collections jsonb;
begin
  v_collections := private.f5_colecciones_por_permisos_rev30(p_permissions);
  if v_collections ? 'productos' then
    v_collections := private.f5_projection_merge(v_collections, 'productos',
      array['archivado_at','archivado_por','archivo_historial']);
  end if;
  v_collections := private.f5_projection_merge(v_collections, 'comercio_configuracion',
    array['maneja_turnos','aviso_turno_horas']);
  return v_collections;
end;
$function$;

-- Conservar el alcance del contrato anterior: la función privada original
-- sólo era ejecutable por el rol de mantenimiento, no por el cliente.
revoke all on function private.f5_colecciones_por_permisos(text[]) from public, anon, authenticated;
