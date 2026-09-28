-- REV56: un solo arqueo físico con apartado informativo dentro del retiro.
-- Los cierres anteriores conservan sus dos importes y su significado original.
begin;

alter table public.cierres_caja
  add column if not exists modelo_caja text,
  add column if not exists apartado_cigarrillos numeric;

alter table public.cierres_caja
  add constraint cierres_caja_rev56_modelo_check
  check (modelo_caja is null or modelo_caja in ('unica','separada'));

alter table public.cierres_caja
  add constraint cierres_caja_rev56_apartado_check
  check (apartado_cigarrillos is null or
    (apartado_cigarrillos >= 0 and
     (modelo_caja = 'unica' or apartado_cigarrillos = 0) and
     retiro_general is not null and apartado_cigarrillos <= retiro_general));

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
  if v_modelo is null or v_modelo not in ('unica','separada') or v_retiro is null or v_retiro < 0 or
     v_apartado < 0 or v_apartado > v_retiro or
     (v_modelo = 'separada' and v_apartado <> 0) or
     (v_modelo = 'unica' and
       (coalesce((p_payload->>'esperado_cigarros')::numeric,0) <> 0 or
        coalesce((p_payload->>'contado_cigarros')::numeric,0) <> 0 or
        coalesce((p_payload->>'diferencia_cigarros')::numeric,0) <> 0 or
        coalesce((p_payload->>'egresos_cigarros')::numeric,0) <> 0)) then
    raise exception 'REV56_MODELO_O_APARTADO_INVALIDO';
  end if;
  update public.cierres_caja
     set modelo_caja=v_modelo,apartado_cigarrillos=v_apartado
   where id::text=p_result->>'cierre_id' and comercio_id=p_comercio_id
     and (modelo_caja is null or
       (modelo_caja,apartado_cigarrillos) is not distinct from (v_modelo,v_apartado));
  if not found then raise exception 'REV56_CIERRE_NO_ENCONTRADO_O_DISTINTO'; end if;
end;
$function$;
revoke all on function private._rev56_guardar_modelo_caja(uuid,jsonb,jsonb) from public,anon,authenticated;

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
  if p_payload ? 'modelo_caja' then
    -- Un cierre nuevo debe guardar también su traspaso y modelo. Ante una
    -- inconsistencia se revierte la operación completa para poder reintentar.
    perform private._rev52_guardar_traspaso(p_comercio_id,p_payload,v_result);
    perform private._rev56_guardar_modelo_caja(p_comercio_id,p_payload,v_result);
    update public.cierres_caja set responsable_nombre=nullif(left(trim(p_payload->>'responsable_nombre'),120),'')
      where id::text=v_result->>'cierre_id' and comercio_id=p_comercio_id;
  else
  begin
    perform private._rev52_guardar_traspaso(p_comercio_id,p_payload,v_result);
    update public.cierres_caja set responsable_nombre=nullif(left(trim(p_payload->>'responsable_nombre'),120),'')
      where id::text=v_result->>'cierre_id' and comercio_id=p_comercio_id;
  exception when others then
    update public.cierres_caja set rev52_meta_alerta=left(SQLSTATE || ':' || SQLERRM,300)
      where id::text=v_result->>'cierre_id' and comercio_id=p_comercio_id;
  end;
  end if;
  return v_result;
end;
$function$;

commit;
