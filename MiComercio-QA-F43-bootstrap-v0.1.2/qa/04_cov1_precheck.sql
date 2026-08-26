-- Mi Comercio — COV-1 precheck v0.1
-- READ ONLY. NO ES EL RUNNER COV-1.
-- Sólo confirma que el backend posee la superficie necesaria para implementar el gate.

with coverage(case_id, capability, required_function, required_relation) as (
  values
    ('COV-CONFIG','configuración',null::text,'comercio_configuracion'),
    ('COV-PRODUCT','producto',null,'productos'),
    ('COV-CLIENT','cliente',null,'clientes'),
    ('COV-SALE','venta','registrar_venta_v4','ventas'),
    ('COV-STOCK','movimiento stock','registrar_movimiento_stock_v4','movimientos_stock'),
    ('COV-CREDIT-PAY','pago fiado','registrar_pago_fiado_v4','pagos_fiado'),
    ('COV-CREDIT-ADJ','ajuste fiado','registrar_ajuste_fiado_v4','ajustes_fiado'),
    ('COV-EXPENSE','egreso','registrar_egreso_v4','egresos'),
    ('COV-EXPENSE-REV','reversión egreso','reversar_egreso_v4','egreso_reversiones'),
    ('COV-SALE-CANCEL','anulación venta','anular_venta_v4','venta_anulaciones'),
    ('COV-CLOSE','cierre normal','cerrar_sesion_caja_v4','cierres_caja'),
    ('COV-CLOSE-EX','cierre excepción','cerrar_sesion_caja_excepcion_v4','cierres_caja'),
    ('COV-COMBO','combo',null,'combos'),
    ('COV-PROMO','promoción',null,'promociones')
),
s as (
  select c.*,
    case when required_function is null then true else exists(
      select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=c.required_function
    ) end as function_present,
    case when required_relation is null then true else exists(
      select 1 from pg_class r join pg_namespace n on n.oid=r.relnamespace
      where n.nspname='public' and r.relname=c.required_relation
        and r.relkind in ('r','p','v','m')
    ) end as relation_present
  from coverage c
)
select *,
       function_present and relation_present as backend_surface_ready
from s
order by case_id;

-- COV-1 no se aprueba por este query.
-- Reglas normativas:
-- 1) cobertura por capability/tipo, no por N agregado;
-- 2) N/A_RELEASE sólo si quedó fuera del release ANTES de la corrida;
-- 3) COV-CLOSE-EX requiere fault injection QA determinista y scoped;
-- 4) COV-1 NO corre en producción.
