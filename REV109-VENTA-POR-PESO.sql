begin;

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
  v_pesos numeric[] := '{}';
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
       or v_gramos = any(v_pesos)
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
    v_pesos := array_append(v_pesos, v_gramos);
  end loop;
  return true;
end;
$$;

revoke all on function private.precios_por_peso_validos(jsonb) from public, anon;
grant execute on function private.precios_por_peso_validos(jsonb) to authenticated, service_role;

alter table public.productos
  add column if not exists precios_por_peso jsonb not null default '[]'::jsonb;

alter table public.productos drop constraint if exists productos_precios_por_peso_check;

-- Conservar los nombres de caja de las presentaciones que r11 guardó sin nombre.
do $$
declare
  v_producto record;
  v_item record;
  v_tamanos jsonb;
  v_nombres text[];
  v_medida text;
  v_sufijo text;
  v_nombre text;
  v_indice integer;
begin
  for v_producto in
    select id, nombre, precios_por_peso from public.productos p
    where exists (
      select 1 from jsonb_array_elements(p.precios_por_peso) item where not (item ? 'nombre')
    )
  loop
    v_tamanos := v_producto.precios_por_peso;
    select array(select lower(btrim(item->>'nombre'))
      from jsonb_array_elements(v_tamanos) item where item ? 'nombre') into v_nombres;
    for v_item in
      select value, ordinality from jsonb_array_elements(v_tamanos) with ordinality
      where not (value ? 'nombre')
    loop
      v_medida := case v_item.value->>'gramos'
        when '125' then '⅛ kg' when '250' then '¼ kg' when '500' then '½ kg'
        when '750' then '¾ kg' when '1000' then '1 kg' else (v_item.value->>'gramos') || ' g'
      end;
      v_indice := 1;
      v_sufijo := ' ' || v_medida;
      v_nombre := left(btrim(v_producto.nombre), 120-length(v_sufijo)) || v_sufijo;
      while lower(btrim(v_nombre)) = any(v_nombres) loop
        v_indice := v_indice + 1;
        v_sufijo := ' ' || v_medida || ' (' || v_indice || ')';
        v_nombre := left(btrim(v_producto.nombre), 120-length(v_sufijo)) || v_sufijo;
      end loop;
      v_nombres := array_append(v_nombres, lower(btrim(v_nombre)));
      v_tamanos := jsonb_set(v_tamanos, array[(v_item.ordinality-1)::text,'nombre'], to_jsonb(v_nombre));
    end loop;
    update public.productos set precios_por_peso=v_tamanos where id=v_producto.id;
  end loop;
end;
$$;

alter table public.productos add constraint productos_precios_por_peso_check check (
  (unidad = 'kg' or precios_por_peso = '[]'::jsonb)
  and private.precios_por_peso_validos(precios_por_peso)
);

-- REV31 y REV57 llaman a la misma base. Extenderla conserva los tamaños
-- incluso cuando esas migraciones vuelvan a definir la función exterior.
do $$
begin
  if to_regprocedure('private.f5_colecciones_por_permisos_rev30_base_peso(text[])') is null then
    alter function private.f5_colecciones_por_permisos_rev30(text[])
      rename to f5_colecciones_por_permisos_rev30_base_peso;
  end if;
end;
$$;

create or replace function private.f5_colecciones_por_permisos_rev30(p_permissions text[])
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_colecciones jsonb := private.f5_colecciones_por_permisos_rev30_base_peso(p_permissions);
begin
  if v_colecciones ? 'productos' then
    v_colecciones := private.f5_projection_merge(v_colecciones, 'productos', array['precios_por_peso']);
  end if;
  return v_colecciones;
end;
$$;

revoke all on function private.f5_colecciones_por_permisos_rev30(text[]) from public, anon, authenticated, service_role;

do $$
begin
  if not coalesce((private.f5_colecciones_por_permisos(array['ventas_registrar'])
      #> '{productos,fields}') ? 'precios_por_peso', false)
     or not coalesce((private.f5_colecciones_por_permisos(array['productos_editar'])
      #> '{productos,fields}') ? 'precios_por_peso', false)
     or private.f5_colecciones_por_permisos(array[]::text[]) ? 'productos' then
    raise exception 'F5_PRECIOS_POR_PESO_PROYECCION_INVALIDA';
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
