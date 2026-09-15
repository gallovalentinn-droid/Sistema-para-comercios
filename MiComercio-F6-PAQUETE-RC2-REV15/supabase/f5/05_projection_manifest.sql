-- F5.5 — manifiesto normativo de proyección y cobertura fail-closed.

create or replace function private.f5_projection_merge(
  p_collections jsonb,
  p_name text,
  p_fields text[],
  p_scope text default 'comercio'
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $function$
declare
  v_old jsonb := coalesce(p_collections->p_name,'{}'::jsonb);
  v_fields jsonb;
  v_scope text;
begin
  select coalesce(jsonb_agg(field order by field),'[]'::jsonb)
    into v_fields
  from (
    select distinct value as field
    from jsonb_array_elements_text(coalesce(v_old->'fields','[]'::jsonb))
    union
    select distinct unnest(p_fields)
  ) fields;
  v_scope:=case
    when v_old->>'scope'='comercio' or p_scope='comercio' then 'comercio'
    when v_old->>'scope'='device' or p_scope='device' then 'device'
    else p_scope
  end;
  return jsonb_set(
    coalesce(p_collections,'{}'::jsonb),array[p_name],
    jsonb_build_object('fields',v_fields,'scope',v_scope),true
  );
end;
$function$;

create or replace function private.f5_colecciones_por_permisos(p_permissions text[])
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $function$
declare
  v_permissions text[] := coalesce(p_permissions,array[]::text[]);
  v_collections jsonb := '{}'::jsonb;
begin
  if not (v_permissions <@ private.f5_catalogo_permisos()) then
    raise exception 'F5_PROJECTION_PERMISSION_UNKNOWN';
  end if;

  -- Configuración que no contiene autoridad ni secretos legacy.
  -- whatsapp_dueno y dias_aviso_vence son canónicas del cliente (f3PayloadConfig las
  -- sube) y no estaban en ningún perfil: un dispositivo nuevo nunca las recibía.
  v_collections:=private.f5_projection_merge(v_collections,'comercio_configuracion',array[
    'comercio_id','modulo_fiado','modulo_vencimientos','modulo_cigarros',
    'whatsapp_dueno','dias_aviso_vence','updated_at'
  ]);

  if 'ventas_registrar'=any(v_permissions) then
    v_collections:=private.f5_projection_merge(v_collections,'productos',array[
      'id','comercio_id','legacy_id','ean','nombre','rubro','costo','precio','stock_base',
      'unidad','origen_id','por_atado','vence','foto_path','updated_at_device','updated_at_server','deleted_at'
    ]);
    v_collections:=private.f5_projection_merge(v_collections,'combos',array[
      'id','comercio_id','legacy_id','nombre','precio','activo','updated_at_device','updated_at_server','deleted_at'
    ]);
    v_collections:=private.f5_projection_merge(v_collections,'combo_items',array[
      'combo_id','producto_id','cantidad'
    ],'parents');
    v_collections:=private.f5_projection_merge(v_collections,'promociones',array[
      'id','comercio_id','legacy_id','tipo','producto_id','objetivo_texto','porcentaje','desde','hasta','activa',
      'updated_at_device','updated_at_server','deleted_at'
    ]);
    -- Reconstrucción exacta de stock: sin nota, actor, lease ni metadata ajena.
    v_collections:=private.f5_projection_merge(v_collections,'movimientos_stock',array[
      'id','comercio_id','producto_id','cantidad','tipo','occurred_at_device','received_at_server'
    ]);
    -- Sólo ventas del dispositivo para continuidad POS offline.
    v_collections:=private.f5_projection_merge(v_collections,'ventas',array[
      'id','comercio_id','legacy_id','device_id','caja_sesion_id','session_segment_id','ticket_seq','ticket_ref',
      'occurred_at_device','received_at_server','subtotal','descuento_manual','descuento_detalle','promo_auto',
      'promo_auto_detalle','promo_pago','promo_pago_detalle','total','forma','recibido','vuelto','monto_fiado',
      'plazo_fiado_dias','vence_fiado'
    ],'device');
    v_collections:=private.f5_projection_merge(v_collections,'venta_items',array[
      'id','venta_id','legacy_line_id','tipo','producto_id','combo_id','nombre_snapshot','rubro_snapshot',
      'cantidad','precio_unitario','costo_unitario','promo_pct','bruto','neto'
    ],'parents');
    v_collections:=private.f5_projection_merge(v_collections,'venta_item_componentes',array[
      'venta_item_id','producto_id','nombre_snapshot','cantidad_por_combo','costo_unitario_snapshot'
    ],'parents');
    v_collections:=private.f5_projection_merge(v_collections,'venta_pagos',array[
      'id','venta_id','forma','monto'
    ],'parents');
  end if;

  if 'reposicion_ver'=any(v_permissions) then
    v_collections:=private.f5_projection_merge(v_collections,'productos',array[
      'id','comercio_id','legacy_id','nombre','rubro','proveedor','costo','precio','stock_base',
      'stock_min','stock_deseado','unidad','updated_at_server','deleted_at'
    ]);
    v_collections:=private.f5_projection_merge(v_collections,'movimientos_stock',array[
      'id','comercio_id','producto_id','cantidad','tipo','occurred_at_device','received_at_server'
    ]);
  end if;

  if 'vencimientos_ver'=any(v_permissions) then
    v_collections:=private.f5_projection_merge(v_collections,'productos',array[
      'id','comercio_id','legacy_id','nombre','rubro','vence','updated_at_server','deleted_at'
    ]);
  end if;

  if 'productos_editar'=any(v_permissions) then
    v_collections:=private.f5_projection_merge(v_collections,'productos',array[
      'id','comercio_id','legacy_id','ean','nombre','rubro','proveedor','costo','precio','stock_base',
      'stock_min','stock_deseado','unidad','origen_id','por_atado','vence','foto_path',
      'updated_at_device','updated_at_server','deleted_at'
    ]);
  end if;
  if 'combos_editar'=any(v_permissions) then
    v_collections:=private.f5_projection_merge(v_collections,'combos',array[
      'id','comercio_id','legacy_id','nombre','precio','activo','updated_at_device','updated_at_server','deleted_at'
    ]);
    v_collections:=private.f5_projection_merge(v_collections,'combo_items',array['combo_id','producto_id','cantidad'],'parents');
  end if;
  if 'promociones_editar'=any(v_permissions) then
    v_collections:=private.f5_projection_merge(v_collections,'promociones',array[
      'id','comercio_id','legacy_id','tipo','producto_id','objetivo_texto','porcentaje','desde','hasta','activa',
      'updated_at_device','updated_at_server','deleted_at'
    ]);
  end if;

  if 'fiado_operar'=any(v_permissions) then
    v_collections:=private.f5_projection_merge(v_collections,'clientes',array[
      'id','comercio_id','legacy_id','nombre','telefono','saldo_base','alta_at_device','updated_at_device','updated_at_server','deleted_at'
    ]);
    v_collections:=private.f5_projection_merge(v_collections,'pagos_fiado',array[
      'id','comercio_id','legacy_id','cliente_id','caja_sesion_id','device_id','monto','forma','nota',
      'occurred_at_device','received_at_server','session_segment_id'
    ]);
    v_collections:=private.f5_projection_merge(v_collections,'ajustes_fiado',array[
      'id','comercio_id','legacy_id','cliente_id','caja_sesion_id','device_id','tipo','monto_delta','motivo',
      'fecha_origen_device','occurred_at_device','received_at_server','plazo_fiado_dias','vence_fecha','metadata'
    ]);
    v_collections:=private.f5_projection_merge(v_collections,'comercio_configuracion',array[
      'dias_plazo_fiado','recargo_fiado_pct'
    ]);
  end if;

  if 'caja_operar'=any(v_permissions) or 'movimientos_ver'=any(v_permissions) or 'resumen_ver'=any(v_permissions) then
    v_collections:=private.f5_projection_merge(v_collections,'ventas',array[
      'id','comercio_id','legacy_id','device_id','caja_sesion_id','session_segment_id','ticket_seq','ticket_ref','cliente_id',
      'occurred_at_device','received_at_server','subtotal','descuento_manual','descuento_detalle','promo_auto',
      'promo_auto_detalle','promo_pago','promo_pago_detalle','total','forma','recibido','vuelto','monto_fiado',
      'plazo_fiado_dias','vence_fiado'
    ]);
    v_collections:=private.f5_projection_merge(v_collections,'venta_anulaciones',array[
      'id','comercio_id','venta_id','motivo','occurred_at_device','received_at_server'
    ]);
    v_collections:=private.f5_projection_merge(v_collections,'venta_items',array[
      'id','venta_id','legacy_line_id','tipo','producto_id','combo_id','nombre_snapshot','rubro_snapshot',
      'cantidad','precio_unitario','costo_unitario','promo_pct','bruto','neto'
    ],'parents');
    v_collections:=private.f5_projection_merge(v_collections,'venta_item_componentes',array[
      'venta_item_id','producto_id','nombre_snapshot','cantidad_por_combo','costo_unitario_snapshot'
    ],'parents');
    v_collections:=private.f5_projection_merge(v_collections,'venta_pagos',array['id','venta_id','forma','monto'],'parents');
    v_collections:=private.f5_projection_merge(v_collections,'movimientos_stock',array[
      'id','comercio_id','legacy_id','producto_id','caja_sesion_id','device_id','tipo','cantidad','motivo','origen_tipo',
      'origen_id','occurred_at_device','received_at_server','session_segment_id'
    ]);
  end if;

  if 'caja_operar'=any(v_permissions) or 'resumen_ver'=any(v_permissions) then
    v_collections:=private.f5_projection_merge(v_collections,'egresos',array[
      'id','comercio_id','legacy_id','caja_sesion_id','device_id','monto','forma','caja_fisica','motivo','nota',
      'occurred_at_device','received_at_server','session_segment_id'
    ]);
    v_collections:=private.f5_projection_merge(v_collections,'egreso_reversiones',array[
      'id','comercio_id','egreso_id','device_id','occurred_at_device','received_at_server'
    ]);
    v_collections:=private.f5_projection_merge(v_collections,'cierres_caja',array[
      'id','comercio_id','legacy_id','caja_sesion_id','session_segment_id','cant_ventas','total_ventas','por_forma',
      'cig_total','esperado_general','contado_general','diferencia_general','esperado_cigarros','contado_cigarros',
      'diferencia_cigarros','egresos_general','egresos_cigarros','costo_ventas','nota','estado','closed_at_device','closed_at_server'
    ]);
    v_collections:=private.f5_projection_merge(v_collections,'caja_sesiones',array[
      'id','comercio_id','device_id','opened_at_device','closed_at_device','estado'
    ],'parents');
    v_collections:=private.f5_projection_merge(v_collections,'cierre_ventas',array['cierre_id','venta_id'],'parents');
    v_collections:=private.f5_projection_merge(v_collections,'cierre_pagos_fiado',array['cierre_id','pago_id'],'parents');
    v_collections:=private.f5_projection_merge(v_collections,'cierre_egresos',array['cierre_id','egreso_id'],'parents');
    v_collections:=private.f5_projection_merge(v_collections,'cierre_ajustes',array[
      'id','comercio_id','cierre_id','tipo','operacion_tipo','operacion_id','monto','motivo','metadata','estado','created_at','resuelto_at'
    ]);
    v_collections:=private.f5_projection_merge(v_collections,'comercio_configuracion',array[
      'fondo_caja','fondo_caja_cigarros','motivos_egreso_extra'
    ]);
  end if;

  return v_collections;
end;
$function$;

create or replace function private.f5_derivar_manifiesto_proyeccion(
  p_comercio_id uuid,
  p_device_id uuid,
  p_contract_version text,
  p_permission_version bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_member public.comercio_miembros%rowtype;
  v_permissions text[];
  v_collections jsonb;
  v_basis jsonb;
  v_hash text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_contract_version<>'f5-projection-v1' then raise exception 'F5_PROJECTION_CONTRACT_UNSUPPORTED'; end if;

  select * into v_member
  from public.comercio_miembros cm
  where cm.comercio_id=p_comercio_id and cm.user_id=v_uid and cm.activo;
  if not found then raise exception 'COMERCIO_FORBIDDEN'; end if;
  if v_member.permission_version<>p_permission_version then
    raise exception 'F5_PERMISSION_VERSION_STALE';
  end if;
  if not exists (
    select 1 from public.comercio_dispositivos cd
    where cd.id=p_device_id and cd.comercio_id=p_comercio_id
      and cd.user_id=v_uid and cd.revoked_at is null
  ) then raise exception 'F5_DEVICE_FORBIDDEN'; end if;

  v_permissions:=case when v_member.rol in ('duenio','admin')
    then private.f5_catalogo_permisos()
    else coalesce(array(
      select key from jsonb_each(v_member.permisos)
      where value='true'::jsonb order by key
    ),array[]::text[]) end;
  v_collections:=private.f5_colecciones_por_permisos(v_permissions);
  v_basis:=jsonb_build_object(
    'version',1,'contract_version',p_contract_version,
    'comercio_id',p_comercio_id,'device_id',p_device_id,
    'role',v_member.rol,'permission_version',v_member.permission_version,
    'permissions',to_jsonb(v_permissions),'collections',v_collections
  );
  v_hash:=md5(v_basis::text);
  return v_basis||jsonb_build_object('id','f5p-'||substr(v_hash,1,16),'hash','md5:'||v_hash);
end;
$function$;

create or replace function public.f5_obtener_proyeccion(
  p_comercio_id uuid,
  p_device_id uuid,
  p_contract_version text,
  p_permission_version bigint
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select jsonb_build_object(
    'manifest',private.f5_derivar_manifiesto_proyeccion(
      p_comercio_id,p_device_id,p_contract_version,p_permission_version
    ),
    'server_time',clock_timestamp()
  );
$function$;

create or replace function private.f5_validar_cobertura_proyeccion(
  p_comercio_id uuid,
  p_device_id uuid,
  p_contract_version text,
  p_permission_version bigint,
  p_manifest jsonb,
  p_compared jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_expected jsonb;
  v_expected_count integer;
  v_declared_count integer;
  v_compared_count integer;
  v_total_catalog integer;
begin
  v_expected:=private.f5_derivar_manifiesto_proyeccion(
    p_comercio_id,p_device_id,p_contract_version,p_permission_version
  );
  select count(*) into v_expected_count from jsonb_object_keys(v_expected->'collections');
  select count(*) into v_total_catalog
  from jsonb_object_keys(
    private.f5_colecciones_por_permisos(private.f5_catalogo_permisos())
  );
  select count(*) into v_declared_count from jsonb_object_keys(coalesce(p_manifest->'collections','{}'::jsonb));
  select count(*) into v_compared_count from jsonb_object_keys(coalesce(p_compared,'{}'::jsonb));
  if p_manifest is distinct from v_expected
     or p_compared is distinct from v_expected->'collections' then
    raise exception 'F34_COVERAGE_FAILURE'
      using detail=jsonb_build_object(
        'expected',v_expected_count,'declared',v_declared_count,'compared',v_compared_count
      )::text;
  end if;
  return jsonb_build_object(
    'status','PASS','manifest_id',v_expected->>'id','manifest_hash',v_expected->>'hash',
    'expected',v_expected_count,'declared',v_declared_count,'compared',v_compared_count,
    'authorized_omissions',greatest(0,v_total_catalog-v_expected_count),'missing',0
  );
end;
$function$;

create or replace function public.f5_validar_cobertura_proyeccion(
  p_comercio_id uuid,
  p_device_id uuid,
  p_contract_version text,
  p_permission_version bigint,
  p_manifest jsonb,
  p_compared jsonb
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select private.f5_validar_cobertura_proyeccion(
    p_comercio_id,p_device_id,p_contract_version,p_permission_version,p_manifest,p_compared
  );
$function$;

revoke all on function private.f5_projection_merge(jsonb,text,text[],text) from public,anon,authenticated,service_role;
revoke all on function private.f5_colecciones_por_permisos(text[]) from public,anon,authenticated,service_role;
revoke all on function private.f5_derivar_manifiesto_proyeccion(uuid,uuid,text,bigint) from public,anon,authenticated,service_role;
revoke all on function private.f5_validar_cobertura_proyeccion(uuid,uuid,text,bigint,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.f5_obtener_proyeccion(uuid,uuid,text,bigint) from public,anon,authenticated,service_role;
revoke all on function public.f5_validar_cobertura_proyeccion(uuid,uuid,text,bigint,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.f5_derivar_manifiesto_proyeccion(uuid,uuid,text,bigint) to authenticated;
grant execute on function private.f5_validar_cobertura_proyeccion(uuid,uuid,text,bigint,jsonb,jsonb) to authenticated;
grant execute on function public.f5_obtener_proyeccion(uuid,uuid,text,bigint) to authenticated;
grant execute on function public.f5_validar_cobertura_proyeccion(uuid,uuid,text,bigint,jsonb,jsonb) to authenticated;
