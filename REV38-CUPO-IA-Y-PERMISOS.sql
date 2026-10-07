-- REV38: cerrar la RPC heredada que consume cupo de IA sin leer una factura.
-- Aplicar junto con REV38-RESPALDOS-COMERCIO.sql antes de publicar REV38.
-- El lector vigente usa public.f6_service_reservar_lectura_factura con service_role.
BEGIN;

REVOKE EXECUTE ON FUNCTION public.consumir_cupo_factura_ai_v4(text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private._consumir_cupo_factura_ai_v4(text, uuid)
  FROM PUBLIC, anon, authenticated;

-- La función de disparador no necesita EXECUTE para los clientes de la API.
REVOKE EXECUTE ON FUNCTION public.registrar_usuario_micomercio()
  FROM PUBLIC, anon, authenticated;

-- TRUNCATE no consulta las políticas RLS. Los clientes no lo necesitan.
REVOKE TRUNCATE ON TABLE
  public.backups_kiosco,
  public.clientes_licencia,
  public.datos_kiosco
  FROM PUBLIC, anon, authenticated;

DO $rev38$
BEGIN
  IF has_function_privilege('authenticated',
       'public.consumir_cupo_factura_ai_v4(text, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'private._consumir_cupo_factura_ai_v4(text, uuid)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.registrar_usuario_micomercio()', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.registrar_usuario_micomercio()', 'EXECUTE')
     OR has_table_privilege('authenticated', 'public.backups_kiosco', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.clientes_licencia', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.datos_kiosco', 'TRUNCATE')
  THEN
    RAISE EXCEPTION 'REV38_PERMISOS_INSEGUROS';
  END IF;
END;
$rev38$;

COMMIT;
