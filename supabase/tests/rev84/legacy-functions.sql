CREATE OR REPLACE FUNCTION public.f6_service_registrar_resultado_lectura_factura(p_actor_user_id uuid, p_comercio_id uuid, p_request_id uuid, p_model text, p_usage jsonb, p_recognized_fields text[], p_recognized_items integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_row record;
  v_input integer;
  v_output integer;
  v_thought integer;
  v_cached integer;
  v_tool_use integer;
  v_total integer;
  v_allowed constant text[]:=array['proveedor','nroComprobante','total','descuentoGlobal','items'];
begin
  if p_actor_user_id is null or p_comercio_id is null or p_request_id is null
     or p_model is null or p_model not in ('gemini-3.8-flash','gpt-6-luna')
     or p_usage is null or jsonb_typeof(p_usage)<>'object'
     or array(select key from jsonb_object_keys(p_usage) as item(key) order by key)
        <> array['cachedTokens','inputTokens','outputTokens','thoughtTokens','toolUseTokens','totalTokens']
     or p_recognized_fields is null
     or p_recognized_items is null or p_recognized_items not between 0 and 200
     or exists(select 1 from unnest(p_recognized_fields) field where field is null or not (field=any(v_allowed)))
     or cardinality(p_recognized_fields)<>cardinality(array(select distinct field from unnest(p_recognized_fields) field)) then
    raise exception 'F6_IA_TELEMETRY_INPUT_INVALID';
  end if;

  if exists (
    select 1 from jsonb_each(p_usage) item
     where jsonb_typeof(item.value)<>'number' or item.value::text !~ '^[0-9]+$'
        or (item.value::text)::numeric>10000000
  ) then
    raise exception 'F6_IA_TELEMETRY_INPUT_INVALID';
  end if;

  v_input:=(p_usage->>'inputTokens')::integer;
  v_output:=(p_usage->>'outputTokens')::integer;
  v_thought:=(p_usage->>'thoughtTokens')::integer;
  v_cached:=(p_usage->>'cachedTokens')::integer;
  v_tool_use:=(p_usage->>'toolUseTokens')::integer;
  v_total:=(p_usage->>'totalTokens')::integer;

  select lectura.id,lectura.provider_model,lectura.input_tokens,lectura.output_tokens,
         lectura.thought_tokens,lectura.cached_tokens,lectura.tool_use_tokens,
         lectura.total_tokens,lectura.recognized_fields,lectura.recognized_items,
         lectura.result_recorded_at
    into v_row
    from public.factura_ai_uso_v4 lectura
   where lectura.comercio_id=p_comercio_id
     and lectura.user_id=p_actor_user_id
     and lectura.operation_id=p_request_id::text
   for update;
  if not found then raise exception 'F6_IA_RESERVATION_NOT_FOUND'; end if;

  if v_row.result_recorded_at is null then
    update public.factura_ai_uso_v4
       set provider_model=p_model,input_tokens=v_input,output_tokens=v_output,
           thought_tokens=v_thought,cached_tokens=v_cached,tool_use_tokens=v_tool_use,
           total_tokens=v_total,recognized_fields=p_recognized_fields,
           recognized_items=p_recognized_items,result_recorded_at=statement_timestamp()
     where id=v_row.id;
    return jsonb_build_object('ok',true,'code','IA_TELEMETRIA_REGISTRADA','replayed',false);
  end if;

  if v_row.provider_model=p_model and v_row.input_tokens=v_input and v_row.output_tokens=v_output
     and v_row.thought_tokens=v_thought and v_row.cached_tokens=v_cached
     and v_row.tool_use_tokens=v_tool_use and v_row.total_tokens=v_total
     and v_row.recognized_fields=p_recognized_fields and v_row.recognized_items=p_recognized_items then
    return jsonb_build_object('ok',true,'code','IA_TELEMETRIA_REGISTRADA','replayed',true);
  end if;
  raise exception 'F6_IA_TELEMETRY_CONFLICT';
end
$function$
;
CREATE OR REPLACE FUNCTION public.f6_service_reservar_lectura_factura(p_actor_user_id uuid, p_comercio_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;
