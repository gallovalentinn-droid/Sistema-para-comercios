-- REV38: respaldos V4 por comercio. Aplicar antes de publicar beta/index.html REV38.
-- No modifica ni elimina los respaldos históricos de backups_kiosco.
BEGIN;

CREATE TABLE IF NOT EXISTS public.backups_comercio_v4 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercios(id) ON DELETE CASCADE,
  fecha timestamptz NOT NULL DEFAULT now(),
  db jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS backups_comercio_v4_comercio_fecha_idx
  ON public.backups_comercio_v4 (comercio_id, fecha DESC);

ALTER TABLE public.backups_comercio_v4 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.backups_comercio_v4 FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.backups_comercio_v4 TO authenticated;

DROP POLICY IF EXISTS backups_comercio_v4_select ON public.backups_comercio_v4;
CREATE POLICY backups_comercio_v4_select ON public.backups_comercio_v4
  FOR SELECT TO authenticated
  USING (private.tiene_rol(comercio_id, ARRAY['duenio','admin']::text[]));

DROP POLICY IF EXISTS backups_comercio_v4_insert ON public.backups_comercio_v4;
CREATE POLICY backups_comercio_v4_insert ON public.backups_comercio_v4
  FOR INSERT TO authenticated
  WITH CHECK (private.tiene_rol(comercio_id, ARRAY['duenio','admin']::text[]));

DROP POLICY IF EXISTS backups_comercio_v4_delete ON public.backups_comercio_v4;
CREATE POLICY backups_comercio_v4_delete ON public.backups_comercio_v4
  FOR DELETE TO authenticated
  USING (private.tiene_rol(comercio_id, ARRAY['duenio','admin']::text[]));

COMMIT;
