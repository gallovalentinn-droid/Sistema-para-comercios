-- Mi Comercio — required contracts pre-COV-1 v0.1
-- READ ONLY.

with expected(kind,phase,object_name,blocking) as (
  values
    ('table','V3','datos_kiosco',true),
    ('table','V3','backups_kiosco',true),
    ('function','V3','guardar_datos_kiosco',true),

    ('table','F2','app_schema_meta',true),
    ('table','F2','comercios',true),
    ('table','F2','comercio_miembros',true),
    ('table','F2','comercio_licencias',true),
    ('table','F2','cajas',true),
    ('table','F2','caja_sesiones',true),
    ('table','F2','productos',true),
    ('table','F2','clientes',true),
    ('table','F2','ventas',true),
    ('table','F2','movimientos_stock',true),
    ('table','F2','operaciones_procesadas',true),
    ('function','F2','obtener_licencia_v4',true),
    ('function','F2','registrar_dispositivo_v4',true),
    ('function','F2','abrir_sesion_caja_v4',true),
    ('function','F2','registrar_venta_v4',true),
    ('function','F2','registrar_pago_fiado_v4',true),
    ('function','F2','registrar_ajuste_fiado_v4',true),
    ('function','F2','registrar_egreso_v4',true),
    ('function','F2','registrar_movimiento_stock_v4',true),
    ('function','F2','cerrar_sesion_caja_v4',true),

    ('table','F3.1','egreso_reversiones',true),
    ('function','F3.1','anular_venta_v4',true),
    ('function','F3.1','reversar_egreso_v4',true),

    ('function','F3.3','cerrar_sesion_caja_excepcion_v4',true),

    ('table','F3.4','shadow_verificaciones_v4',true),
    ('function','F3.4','registrar_verificacion_shadow_v4',true),
    ('function','F3.4','preflight_cutover_f34',true),

    ('table','F4.1','migraciones_f4',true),
    ('table','F4.1','migracion_f4_eventos',true),
    ('function','F4.1','registrar_snapshot_migracion_f4',true),
    ('function','F4.1','estado_migracion_f4',true),

    ('table','F4.2','migracion_f42_pruebas',true),
    ('function','F4.2','estado_bootstrap_f42',true),
    ('function','F4.2','habilitar_bootstrap_candidato_f42',true),
    ('function','F4.2','registrar_prueba_bootstrap_f42',true)
),
status as (
  select e.*,
    case
      when kind='table' then exists (
        select 1 from information_schema.tables t
        where t.table_schema='public' and t.table_name=e.object_name
      )
      else exists (
        select 1
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname=e.object_name
      )
    end as present
  from expected e
)
select *,
       case when present then 'OK' else 'MISSING_BLOCKER' end as status
from status
order by
  case phase when 'V3' then 1 when 'F2' then 2 when 'F3.1' then 3
             when 'F3.3' then 4 when 'F3.4' then 5 when 'F4.1' then 6
             when 'F4.2' then 7 else 99 end,
  kind, object_name;

-- Resultado agregado.
with expected(kind,object_name) as (
  values
    ('table','datos_kiosco'),('table','backups_kiosco'),('function','guardar_datos_kiosco'),
    ('table','app_schema_meta'),('table','comercios'),('table','comercio_miembros'),
    ('table','comercio_licencias'),('table','cajas'),('table','caja_sesiones'),
    ('table','productos'),('table','clientes'),('table','ventas'),('table','movimientos_stock'),
    ('table','operaciones_procesadas'),('function','obtener_licencia_v4'),
    ('function','registrar_dispositivo_v4'),('function','abrir_sesion_caja_v4'),
    ('function','registrar_venta_v4'),('function','registrar_pago_fiado_v4'),
    ('function','registrar_ajuste_fiado_v4'),('function','registrar_egreso_v4'),
    ('function','registrar_movimiento_stock_v4'),('function','cerrar_sesion_caja_v4'),
    ('table','egreso_reversiones'),('function','anular_venta_v4'),('function','reversar_egreso_v4'),
    ('function','cerrar_sesion_caja_excepcion_v4'),
    ('table','shadow_verificaciones_v4'),('function','registrar_verificacion_shadow_v4'),
    ('function','preflight_cutover_f34'),
    ('table','migraciones_f4'),('table','migracion_f4_eventos'),
    ('function','registrar_snapshot_migracion_f4'),('function','estado_migracion_f4'),
    ('table','migracion_f42_pruebas'),('function','estado_bootstrap_f42'),
    ('function','habilitar_bootstrap_candidato_f42'),('function','registrar_prueba_bootstrap_f42')
),
s as (
  select e.*,
    case when kind='table'
      then exists(select 1 from information_schema.tables t
                  where t.table_schema='public' and t.table_name=e.object_name)
      else exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname=e.object_name)
    end present
  from expected e
)
select count(*) as required,
       count(*) filter(where present) as present,
       count(*) filter(where not present) as missing,
       bool_and(present) as pass_required_contracts
from s;
