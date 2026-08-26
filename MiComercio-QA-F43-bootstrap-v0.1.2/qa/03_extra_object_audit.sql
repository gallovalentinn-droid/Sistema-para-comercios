-- Mi Comercio — audit de relaciones public esperadas v0.1
-- READ ONLY.
-- Reporta faltantes y extras respecto de la foto estructural vigente de producción.

with expected(name) as (
  values
    ('ajustes_fiado'),('app_schema_meta'),('backups_kiosco'),('caja_sesiones'),('cajas'),
    ('cierre_ajustes'),('cierre_egresos'),('cierre_pagos_fiado'),('cierre_ventas'),('cierres_caja'),
    ('clientes'),('clientes_licencia'),('combo_items'),('combos'),('comercio_configuracion'),
    ('comercio_dispositivos'),('comercio_licencias'),('comercio_miembros'),('comercios'),
    ('datos_kiosco'),('egreso_reversiones'),('egresos'),('factura_ai_uso'),('factura_ai_uso_v4'),
    ('fiado_aplicaciones'),('fiado_cargos'),('metricas_comercio_diarias'),('migracion_f42_pruebas'),
    ('migracion_f4_eventos'),('migraciones_f4'),('movimientos_stock'),('operaciones_procesadas'),
    ('pagos_fiado'),('productos'),('promociones'),('shadow_verificaciones_v4'),
    ('v_fiado_cargos_abiertos'),('v_saldo_clientes'),('v_stock_actual'),('v_ventas_estado'),
    ('venta_anulaciones'),('venta_item_componentes'),('venta_items'),('venta_pagos'),('ventas')
),
actual as (
  select c.relname as name
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p','v','m')
)
select 'MISSING' as difference, e.name
from expected e left join actual a using(name)
where a.name is null
union all
select 'EXTRA' as difference, a.name
from actual a left join expected e using(name)
where e.name is null
order by difference,name;
