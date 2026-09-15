-- F6 — telemetría mínima y privada del lector de facturas.
-- Registra modelo, contadores de tokens y nombres de campos reconocidos.
-- Nunca persiste la imagen, textos, importes ni productos de la factura.

alter table public.factura_ai_uso_v4
  add column if not exists provider_model text,
  add column if not exists input_tokens integer,
  add column if not exists output_tokens integer,
  add column if not exists thought_tokens integer,
  add column if not exists cached_tokens integer,
  add column if not exists tool_use_tokens integer,
  add column if not exists total_tokens integer,
  add column if not exists recognized_fields text[],
  add column if not exists recognized_items integer,
  add column if not exists result_recorded_at timestamptz;

do $constraints$
declare
  v_column text;
  v_constraint text;
begin
  foreach v_column in array array[
    'input_tokens','output_tokens','thought_tokens','cached_tokens',
    'tool_use_tokens','total_tokens','recognized_items'
  ] loop
    v_constraint:='factura_ai_uso_v4_'||v_column||'_check';
    if not exists (
      select 1 from pg_constraint
       where conrelid='public.factura_ai_uso_v4'::regclass
         and conname=v_constraint
    ) then
      execute format(
        'alter table public.factura_ai_uso_v4 add constraint %I check (%I is null or %I between 0 and 10000000)',
        v_constraint,v_column,v_column
      );
    end if;
  end loop;

  if not exists (
    select 1 from pg_constraint
     where conrelid='public.factura_ai_uso_v4'::regclass
       and conname='factura_ai_uso_v4_telemetry_complete_check'
  ) then
    alter table public.factura_ai_uso_v4
      add constraint factura_ai_uso_v4_telemetry_complete_check check (
        (result_recorded_at is null and provider_model is null and input_tokens is null
          and output_tokens is null and thought_tokens is null and cached_tokens is null
          and tool_use_tokens is null and total_tokens is null and recognized_fields is null
          and recognized_items is null)
        or
        (result_recorded_at is not null and provider_model is not null and input_tokens is not null
          and output_tokens is not null and thought_tokens is not null and cached_tokens is not null
          and tool_use_tokens is not null and total_tokens is not null and recognized_fields is not null
          and recognized_items is not null)
      );
  end if;
end
$constraints$;

comment on column public.factura_ai_uso_v4.recognized_fields is
  'Sólo nombres de campos del contrato, nunca valores extraídos de la factura.';
comment on column public.factura_ai_uso_v4.result_recorded_at is
  'Instante en que el servidor confirmó la telemetría de una lectura completada.';

create or replace function public.f6_service_registrar_resultado_lectura_factura(
  p_actor_user_id uuid,
  p_comercio_id uuid,
  p_request_id uuid,
  p_model text,
  p_usage jsonb,
  p_recognized_fields text[],
  p_recognized_items integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
     or p_model is null or p_model<>'gemini-3.8-flash'
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
$function$;

revoke all on function public.f6_service_registrar_resultado_lectura_factura(uuid,uuid,uuid,text,jsonb,text[],integer)
from public,anon,authenticated,service_role;
grant execute on function public.f6_service_registrar_resultado_lectura_factura(uuid,uuid,uuid,text,jsonb,text[],integer)
to service_role;
