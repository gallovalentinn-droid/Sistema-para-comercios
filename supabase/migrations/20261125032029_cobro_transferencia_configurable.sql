-- Preferencia del comercio: transferencia manual o verificación con Mercado Pago.
-- La aplicación sigue recuperando cobros pendientes aunque se desactive la opción.
begin;
do $guard$
begin
  if to_regprocedure('private._f5_actualizar_config_privilegiada(uuid,jsonb)') is null
     or to_regprocedure('private.f5_colecciones_por_permisos_rev30_base_peso(text[])') is null then
    raise exception 'Aplicar las migraciones de configuración F5 antes de esta migración';
  end if;
end $guard$;
alter table public.comercio_configuracion add column if not exists verificar_cobros_mp boolean not null default false;
create or replace function private._f5_actualizar_config_privilegiada(p_comercio_id uuid, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := (select auth.uid());
  v_row public.comercio_configuracion%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_comercio_id is null then raise exception 'F5_COMERCIO_REQUERIDO'; end if;
  if not private.f5_config_keys_validas(
    p_patch,
    array['modulo_fiado','modulo_vencimientos','modulo_cigarros',
          'separa_cigarrillos_al_cierre','whatsapp_dueno','verificar_cobros_mp']::text[]
  ) then raise exception 'F5_CONFIG_KEYS_INVALIDAS'; end if;
  if not private.tiene_rol(p_comercio_id,array['duenio','admin']) then raise exception 'ROLE_REQUIRED'; end if;
  if not private.licencia_activa(p_comercio_id) then raise exception 'LICENSE_INACTIVE'; end if;

  if p_patch ? 'whatsapp_dueno' and
     (jsonb_typeof(p_patch->'whatsapp_dueno') <> 'string' or length(p_patch->>'whatsapp_dueno') > 40)
     then raise exception 'F5_WHATSAPP_INVALIDO'; end if;
  if (p_patch ? 'modulo_fiado' and jsonb_typeof(p_patch->'modulo_fiado') <> 'boolean') or
     (p_patch ? 'modulo_vencimientos' and jsonb_typeof(p_patch->'modulo_vencimientos') <> 'boolean') or
     (p_patch ? 'modulo_cigarros' and jsonb_typeof(p_patch->'modulo_cigarros') <> 'boolean') or
     (p_patch ? 'separa_cigarrillos_al_cierre' and jsonb_typeof(p_patch->'separa_cigarrillos_al_cierre') <> 'boolean') or
     (p_patch ? 'verificar_cobros_mp' and jsonb_typeof(p_patch->'verificar_cobros_mp') <> 'boolean')
     then raise exception 'F5_MODULO_INVALIDO'; end if;

  perform pg_advisory_xact_lock(hashtext(p_comercio_id::text));
  insert into public.comercio_configuracion(comercio_id)
  values(p_comercio_id)
  on conflict (comercio_id) do nothing;

  update public.comercio_configuracion cfg
     set modulo_fiado = case when p_patch ? 'modulo_fiado' then (p_patch->>'modulo_fiado')::boolean else cfg.modulo_fiado end,
         modulo_vencimientos = case when p_patch ? 'modulo_vencimientos' then (p_patch->>'modulo_vencimientos')::boolean else cfg.modulo_vencimientos end,
         modulo_cigarros = case when p_patch ? 'modulo_cigarros' then (p_patch->>'modulo_cigarros')::boolean else cfg.modulo_cigarros end,
         separa_cigarrillos_al_cierre = case
           when p_patch ? 'separa_cigarrillos_al_cierre' then (p_patch->>'separa_cigarrillos_al_cierre')::boolean
           when p_patch ? 'modulo_cigarros' and (p_patch->>'modulo_cigarros')::boolean then false
           else cfg.separa_cigarrillos_al_cierre end,
         whatsapp_dueno = case when p_patch ? 'whatsapp_dueno' then p_patch->>'whatsapp_dueno' else cfg.whatsapp_dueno end,
         verificar_cobros_mp = case when p_patch ? 'verificar_cobros_mp' then (p_patch->>'verificar_cobros_mp')::boolean else cfg.verificar_cobros_mp end,
         updated_at = now()
   where cfg.comercio_id = p_comercio_id
   returning * into v_row;

  return jsonb_build_object('ok',true,'comercio_id',v_row.comercio_id,'updated_at',v_row.updated_at);
end;
$function$;
-- Se extiende la base ya usada por las migraciones históricas para conservar
-- tanto precios_por_peso como esta preferencia al recrear la capa exterior.
do $wrap$
begin
  if to_regprocedure('private.f5_colecciones_por_permisos_rev30_base_peso_base_cobro(text[])') is null then
    alter function private.f5_colecciones_por_permisos_rev30_base_peso(text[]) rename to f5_colecciones_por_permisos_rev30_base_peso_base_cobro;
  end if;
end $wrap$;
create or replace function private.f5_colecciones_por_permisos_rev30_base_peso(p_permissions text[])
returns jsonb language plpgsql immutable set search_path = '' as $projection$
declare v_colecciones jsonb := private.f5_colecciones_por_permisos_rev30_base_peso_base_cobro(p_permissions);
begin
  if v_colecciones ? 'comercio_configuracion' then
    v_colecciones := private.f5_projection_merge(v_colecciones,'comercio_configuracion',array['verificar_cobros_mp']);
  end if;
  return v_colecciones;
end $projection$;
revoke all on function private.f5_colecciones_por_permisos_rev30_base_peso(text[]) from public,anon,authenticated,service_role;
notify pgrst, 'reload schema';
commit;
