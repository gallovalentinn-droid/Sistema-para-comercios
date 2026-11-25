-- Permitir Cuarto y Milkshake del mismo peso; los nombres siguen siendo únicos.
-- CREATE OR REPLACE conserva dueño y permisos de la función existente.
begin;

do $guard$
begin
  if to_regprocedure('private.precios_por_peso_validos(jsonb)') is null then
    raise exception 'Aplicar REV109-VENTA-POR-PESO antes de esta migración' using errcode='55000';
  end if;
end;
$guard$;

create or replace function private.precios_por_peso_validos(p_precios jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item jsonb;
  v_gramos numeric;
  v_precio numeric;
  v_envase numeric;
  v_nombre text;
  v_nombres text[] := '{}';
begin
  if jsonb_typeof(p_precios) is distinct from 'array' then return false; end if;
  for v_item in select value from jsonb_array_elements(p_precios) loop
    if jsonb_typeof(v_item->'gramos') is distinct from 'number'
       or jsonb_typeof(v_item->'precio') is distinct from 'number' then
      return false;
    end if;
    v_gramos := (v_item->>'gramos')::numeric;
    v_precio := (v_item->>'precio')::numeric;
    if v_gramos not between 1 and 999999 or v_gramos <> trunc(v_gramos)
       or v_precio <= 0 or v_precio >= 1000000000000 or v_precio <> round(v_precio, 2)
       or v_precio * 1000 >= v_gramos * 1000000000000 then
      return false;
    end if;
    if jsonb_typeof(v_item->'nombre') is distinct from 'string' then return false; end if;
    v_nombre := lower(btrim(v_item->>'nombre'));
    if length(v_nombre) not between 1 and 120 or v_nombre = any(v_nombres) then return false; end if;
    v_nombres := array_append(v_nombres, v_nombre);
    if v_item ? 'costoEnvase' then
      if jsonb_typeof(v_item->'costoEnvase') is distinct from 'number' then return false; end if;
      v_envase := (v_item->>'costoEnvase')::numeric;
      if v_envase < 0 or v_envase <> round(v_envase, 2)
         or v_envase * 1000 >= v_gramos * 1000000000000 then return false; end if;
    end if;
  end loop;
  return true;
end;
$$;

commit;
