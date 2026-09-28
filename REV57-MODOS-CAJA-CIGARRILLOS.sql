-- REV57: tercer modo de caja, un solo arqueo con separación explícita de cigarrillos.
-- Mantiene sin cambios los cierres anteriores y el booleano modulo_cigarros existente.
begin;

alter table public.comercio_configuracion
  add column if not exists separa_cigarrillos_al_cierre boolean not null default false;

alter table public.comercio_configuracion
  add constraint comercio_configuracion_rev57_modo_caja_check
  check (not (modulo_cigarros and separa_cigarrillos_al_cierre));

alter table public.cierres_caja
  drop constraint cierres_caja_rev56_modelo_check,
  drop constraint cierres_caja_rev56_apartado_check;

alter table public.cierres_caja
  add constraint cierres_caja_rev57_modelo_check
    check (modelo_caja is null or modelo_caja in ('unica','unica_separa_cigarrillos','separada')),
  add constraint cierres_caja_rev57_apartado_check
    check (apartado_cigarrillos is null or
      (apartado_cigarrillos >= 0 and
       (modelo_caja in ('unica','unica_separa_cigarrillos') or apartado_cigarrillos = 0) and
       retiro_general is not null and apartado_cigarrillos <= retiro_general)),
  add constraint cierres_caja_rev57_apartado_explicito_check
    check (modelo_caja is distinct from 'unica_separa_cigarrillos' or apartado_cigarrillos is not null);

create or replace function private._rev56_guardar_modelo_caja(
  p_comercio_id uuid, p_payload jsonb, p_result jsonb
) returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_modelo text;
  v_apartado numeric;
  v_retiro numeric;
begin
  if not (p_payload ? 'modelo_caja') then return; end if;
  if p_result->>'estado' = 'pendiente_de_decision' then return; end if;
  v_modelo := p_payload->>'modelo_caja';
  v_apartado := coalesce((p_payload->>'apartado_cigarrillos')::numeric,0);
  v_retiro := (p_payload->>'retiro_general')::numeric;
  if v_modelo is null or v_modelo not in ('unica','unica_separa_cigarrillos','separada') or
     v_retiro is null or v_retiro < 0 or v_apartado < 0 or v_apartado > v_retiro or
     (v_modelo = 'unica_separa_cigarrillos' and jsonb_typeof(p_payload->'apartado_cigarrillos') is distinct from 'number') or
     (v_modelo = 'separada' and v_apartado <> 0) or
     (v_modelo in ('unica','unica_separa_cigarrillos') and
       (coalesce((p_payload->>'esperado_cigarros')::numeric,0) <> 0 or
        coalesce((p_payload->>'contado_cigarros')::numeric,0) <> 0 or
        coalesce((p_payload->>'diferencia_cigarros')::numeric,0) <> 0 or
        coalesce((p_payload->>'egresos_cigarros')::numeric,0) <> 0)) then
    raise exception 'REV57_MODELO_O_APARTADO_INVALIDO';
  end if;
  update public.cierres_caja
     set modelo_caja=v_modelo,apartado_cigarrillos=v_apartado
   where id::text=p_result->>'cierre_id' and comercio_id=p_comercio_id
     and (modelo_caja is null or
       (modelo_caja,apartado_cigarrillos) is not distinct from (v_modelo,v_apartado));
  if not found then raise exception 'REV57_CIERRE_NO_ENCONTRADO_O_DISTINTO'; end if;
end;
$function$;
revoke all on function private._rev56_guardar_modelo_caja(uuid,jsonb,jsonb) from public,anon,authenticated;

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
          'separa_cigarrillos_al_cierre','whatsapp_dueno']::text[]
  ) then raise exception 'F5_CONFIG_KEYS_INVALIDAS'; end if;
  if not private.tiene_rol(p_comercio_id,array['duenio','admin']) then raise exception 'ROLE_REQUIRED'; end if;
  if not private.licencia_activa(p_comercio_id) then raise exception 'LICENSE_INACTIVE'; end if;

  if p_patch ? 'whatsapp_dueno' and
     (jsonb_typeof(p_patch->'whatsapp_dueno') <> 'string' or length(p_patch->>'whatsapp_dueno') > 40)
     then raise exception 'F5_WHATSAPP_INVALIDO'; end if;
  if (p_patch ? 'modulo_fiado' and jsonb_typeof(p_patch->'modulo_fiado') <> 'boolean') or
     (p_patch ? 'modulo_vencimientos' and jsonb_typeof(p_patch->'modulo_vencimientos') <> 'boolean') or
     (p_patch ? 'modulo_cigarros' and jsonb_typeof(p_patch->'modulo_cigarros') <> 'boolean') or
     (p_patch ? 'separa_cigarrillos_al_cierre' and jsonb_typeof(p_patch->'separa_cigarrillos_al_cierre') <> 'boolean')
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
         updated_at = now()
   where cfg.comercio_id = p_comercio_id
   returning * into v_row;

  return jsonb_build_object('ok',true,'comercio_id',v_row.comercio_id,'updated_at',v_row.updated_at);
end;
$function$;
revoke all on function private._f5_actualizar_config_privilegiada(uuid,jsonb) from public,anon,authenticated;

create or replace function private.f5_colecciones_por_permisos(p_permissions text[])
returns jsonb language plpgsql immutable set search_path = '' as $function$
declare
  v_collections jsonb;
begin
  v_collections := private.f5_colecciones_por_permisos_rev30(p_permissions);
  if v_collections ? 'productos' then
    v_collections := private.f5_projection_merge(v_collections, 'productos',
      array['archivado_at','archivado_por','archivo_historial']);
  end if;
  v_collections := private.f5_projection_merge(v_collections, 'comercio_configuracion',
    array['maneja_turnos','aviso_turno_horas','separa_cigarrillos_al_cierre']);
  return v_collections;
end;
$function$;
revoke all on function private.f5_colecciones_por_permisos(text[]) from public,anon,authenticated;

commit;
