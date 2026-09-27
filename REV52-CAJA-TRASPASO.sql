-- REV52/53: transferencias entre cierres y apertura de caja.
-- Aplicar en Supabase antes de servir beta/index.html REV53.
-- No modifica importes ni estados de cierres anteriores: sus columnas nuevas quedan NULL.

begin;

alter table public.cierres_caja
  add column if not exists retiro_general numeric,
  add column if not exists retiro_cigarros numeric,
  add column if not exists queda_general numeric,
  add column if not exists queda_cigarros numeric,
  add column if not exists rev52_meta_alerta text,
  add column if not exists responsable_nombre text;

alter table public.caja_sesion_segmentos
  add column if not exists apertura_cierre_id uuid,
  add column if not exists apertura_esperado_general numeric,
  add column if not exists apertura_esperado_cigarros numeric,
  add column if not exists apertura_contado_general numeric,
  add column if not exists apertura_contado_cigarros numeric,
  add column if not exists apertura_diferencia_general numeric,
  add column if not exists apertura_diferencia_cigarros numeric,
  add column if not exists apertura_motivo text,
  add column if not exists apertura_cierre_servidor_id uuid,
  add column if not exists apertura_requiere_revision boolean,
  add column if not exists rev52_meta_alerta text;

grant select on public.caja_sesion_segmentos to authenticated;

create or replace function private._rev52_guardar_traspaso(
  p_comercio_id uuid, p_payload jsonb, p_result jsonb
) returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_cierre public.cierres_caja%rowtype;
  v_retiro_g numeric; v_retiro_c numeric; v_queda_g numeric; v_queda_c numeric;
begin
  if not (p_payload ? 'retiro_general' or p_payload ? 'queda_general') then return; end if;
  if p_result->>'estado' = 'pendiente_de_decision' then return; end if;
  if p_result->>'cierre_id' is distinct from p_payload->>'id' then
    raise exception 'REV52_CIERRE_ID_DISTINTO';
  end if;
  if not (p_payload ?& array['retiro_general','retiro_cigarros','queda_general','queda_cigarros']) then
    raise exception 'REV52_TRASPASO_INCOMPLETO';
  end if;
  v_retiro_g := (p_payload->>'retiro_general')::numeric;
  v_retiro_c := (p_payload->>'retiro_cigarros')::numeric;
  v_queda_g := (p_payload->>'queda_general')::numeric;
  v_queda_c := (p_payload->>'queda_cigarros')::numeric;
  if v_retiro_g is null or v_retiro_c is null or v_queda_g is null or v_queda_c is null or
     least(v_retiro_g,v_retiro_c,v_queda_g,v_queda_c) < 0 then
    raise exception 'REV52_TRASPASO_INVALIDO';
  end if;
  select * into v_cierre from public.cierres_caja
   where id=(p_result->>'cierre_id')::uuid and comercio_id=p_comercio_id for update;
  if not found then raise exception 'REV52_CIERRE_NO_ENCONTRADO'; end if;
  if v_cierre.caja_sesion_id is distinct from (p_payload->>'caja_sesion_id')::uuid or
     (v_cierre.session_segment_id is not null and
      v_cierre.session_segment_id is distinct from (p_payload->>'session_segment_id')::uuid) then
    raise exception 'REV52_SEGMENTO_DISTINTO';
  end if;
  if round(v_retiro_g+v_queda_g,2) <> round(v_cierre.contado_general,2) or
     round(v_retiro_c+v_queda_c,2) <> round(v_cierre.contado_cigarros,2) then
    raise exception 'REV52_TRASPASO_NO_COINCIDE_CON_CONTEO';
  end if;
  if v_cierre.queda_general is not null then
    if (v_cierre.retiro_general,v_cierre.retiro_cigarros,v_cierre.queda_general,v_cierre.queda_cigarros)
       is distinct from (v_retiro_g,v_retiro_c,v_queda_g,v_queda_c) then
      raise exception 'REV52_TRASPASO_YA_REGISTRADO';
    end if;
    return;
  end if;
  update public.cierres_caja set retiro_general=v_retiro_g,retiro_cigarros=v_retiro_c,
    queda_general=v_queda_g,queda_cigarros=v_queda_c where id=v_cierre.id;
end;
$function$;

create or replace function private._rev52_guardar_apertura(
  p_comercio_id uuid, p_payload jsonb, p_result jsonb
) returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_segment uuid; v_general numeric; v_cigarros numeric;
  v_esperado_g numeric; v_esperado_c numeric;
  v_ultimo_cierre uuid;
begin
  if not (p_payload ? 'apertura_diferencia_general') then return; end if;
  if p_result->>'estado' = 'pendiente_de_decision' then return; end if;
  v_segment := (p_result->>'session_segment_id')::uuid;
  if v_segment is null or v_segment is distinct from (p_payload->>'session_segment_id')::uuid then
    raise exception 'REV52_APERTURA_SEGMENTO_DISTINTO';
  end if;
  v_general := (p_payload->>'fondo_general')::numeric;
  v_cigarros := (p_payload->>'fondo_cigarros')::numeric;
  v_esperado_g := (p_payload->>'apertura_esperado_general')::numeric;
  v_esperado_c := (p_payload->>'apertura_esperado_cigarros')::numeric;
  select c.id into v_ultimo_cierre from public.cierres_caja c
    join public.caja_sesiones s on s.id=c.caja_sesion_id and s.comercio_id=c.comercio_id
   where c.comercio_id=p_comercio_id and s.caja_id=(p_payload->>'caja_id')::uuid
   order by c.closed_at_server desc,c.id desc limit 1;
  -- Otra caja pudo cerrarse mientras este dispositivo estaba sin conexión.
  -- El desacuerdo queda marcado para revisión sin perder la apertura ni las ventas.
  if v_general is null or v_cigarros is null or least(v_general,v_cigarros) < 0 or
     (v_esperado_g is null) <> (v_esperado_c is null) then
    raise exception 'REV52_APERTURA_INVALIDA';
  end if;
  if v_esperado_g is not null and
    (round(v_general-v_esperado_g,2) <> round((p_payload->>'apertura_diferencia_general')::numeric,2) or
     round(v_cigarros-v_esperado_c,2) <> round((p_payload->>'apertura_diferencia_cigarros')::numeric,2) or
     (abs(v_general-v_esperado_g)>0.009 or abs(v_cigarros-v_esperado_c)>0.009) and
     nullif(trim(p_payload->>'apertura_motivo'),'') is null) then
    raise exception 'REV52_DIFERENCIA_APERTURA_INVALIDA';
  end if;
  update public.caja_sesion_segmentos set
    apertura_cierre_id=nullif(p_payload->>'apertura_cierre_id','')::uuid,
    apertura_esperado_general=v_esperado_g,apertura_esperado_cigarros=v_esperado_c,
    apertura_contado_general=v_general,apertura_contado_cigarros=v_cigarros,
    apertura_diferencia_general=(p_payload->>'apertura_diferencia_general')::numeric,
    apertura_diferencia_cigarros=(p_payload->>'apertura_diferencia_cigarros')::numeric,
    apertura_motivo=coalesce(p_payload->>'apertura_motivo',''),
    apertura_cierre_servidor_id=v_ultimo_cierre,
    apertura_requiere_revision=v_ultimo_cierre is distinct from nullif(p_payload->>'apertura_cierre_id','')::uuid,
    rev52_meta_alerta=case when v_ultimo_cierre is distinct from nullif(p_payload->>'apertura_cierre_id','')::uuid
      then 'ULTIMO_CIERRE_CAMBIO_REVISAR_CAJA' else null end
   where segment_id=v_segment and comercio_id=p_comercio_id
     and (apertura_contado_general is null or
          (apertura_contado_general,apertura_contado_cigarros,apertura_cierre_id)
          is not distinct from (v_general,v_cigarros,nullif(p_payload->>'apertura_cierre_id','')::uuid));
  if not found then raise exception 'REV52_APERTURA_NO_ENCONTRADA_O_DISTINTA'; end if;
end;
$function$;

revoke all on function private._rev52_guardar_traspaso(uuid,jsonb,jsonb) from public,anon,authenticated;
revoke all on function private._rev52_guardar_apertura(uuid,jsonb,jsonb) from public,anon,authenticated;

create or replace function public.cerrar_sesion_caja_v4(
  p_operation_id text,p_comercio_id uuid,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_result jsonb;
begin
  if p_payload ? 'lease_id' then
    v_result := private._f5_cerrar_sesion_offline(p_operation_id,p_comercio_id,p_payload);
  else
    v_result := private._cerrar_sesion_caja_v4(p_operation_id,p_comercio_id,p_payload);
  end if;
  begin
    perform private._rev52_guardar_traspaso(p_comercio_id,p_payload,v_result);
    update public.cierres_caja set responsable_nombre=nullif(left(trim(p_payload->>'responsable_nombre'),120),'')
      where id::text=v_result->>'cierre_id' and comercio_id=p_comercio_id;
  exception when others then
    update public.cierres_caja set rev52_meta_alerta=left(SQLSTATE || ':' || SQLERRM,300)
      where id::text=v_result->>'cierre_id' and comercio_id=p_comercio_id;
  end;
  return v_result;
end;
$function$;

create or replace function public.abrir_sesion_caja_v4(
  p_operation_id text,p_comercio_id uuid,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_result jsonb;
begin
  v_result := private._f5_abrir_sesion_offline(p_operation_id,p_comercio_id,p_payload);
  begin
    perform private._rev52_guardar_apertura(p_comercio_id,p_payload,v_result);
  exception when others then
    update public.caja_sesion_segmentos set rev52_meta_alerta=left(SQLSTATE || ':' || SQLERRM,300),
      apertura_requiere_revision=true
      where segment_id::text=v_result->>'session_segment_id' and comercio_id=p_comercio_id;
  end;
  return v_result;
end;
$function$;

create or replace function public.ultimo_traspaso_caja_v1(
  p_comercio_id uuid,p_caja_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_result jsonb;
begin
  if not private.es_miembro(p_comercio_id) then raise exception 'COMERCIO_NO_AUTORIZADO'; end if;
  if not exists(select 1 from public.cajas where id=p_caja_id and comercio_id=p_comercio_id) then
    raise exception 'CAJA_NO_AUTORIZADA';
  end if;
  select jsonb_build_object('id',c.id,'closed_at_server',c.closed_at_server,
    'contado_general',c.contado_general,'contado_cigarros',c.contado_cigarros,
    'retiro_general',c.retiro_general,'retiro_cigarros',c.retiro_cigarros,
    'queda_general',c.queda_general,'queda_cigarros',c.queda_cigarros,
    'rev52_meta_alerta',c.rev52_meta_alerta,'estado',c.estado)
    into v_result
    from public.cierres_caja c join public.caja_sesiones s
      on s.id=c.caja_sesion_id and s.comercio_id=c.comercio_id
   where c.comercio_id=p_comercio_id and s.caja_id=p_caja_id
   order by c.closed_at_server desc,c.id desc limit 1;
  return v_result;
end;
$function$;

revoke all on function public.ultimo_traspaso_caja_v1(uuid,uuid) from public,anon;
grant execute on function public.ultimo_traspaso_caja_v1(uuid,uuid) to authenticated;

commit;
