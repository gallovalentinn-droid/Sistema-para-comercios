const {test}=require('node:test');
const assert=require('node:assert/strict');
const {execFile}=require('node:child_process');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');

function migration(file){
  const source=readFileSync(join(__dirname,'..',file),'utf8');
  return source.replace(/^begin;\s*$/im,'').replace(/^commit;\s*$/im,'');
}

function projectionMigration(file){
  const definition=migration(file).match(/create or replace function private\.f5_colecciones_por_permisos\(p_permissions text\[\]\)[\s\S]*?\$function\$;/i);
  assert.ok(definition,`Falta la definición F5 en ${file}`);
  return definition[0];
}

function dockerSql(input){
  return new Promise((resolve,reject)=>{
    const child=execFile('docker',[
      'exec','-i','supabase_db_micomercio-prueba-local','psql','-X','-q','-tA',
      '-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'
    ],(error,stdout,stderr)=>error?reject(new Error(stderr||error.message)):resolve(stdout.trim()));
    child.stdin.end(input);
  });
}

const verifyProjection=`
DO $test$
DECLARE
  permiso text;
  campos jsonb;
BEGIN
  FOREACH permiso IN ARRAY ARRAY['ventas_registrar','productos_editar','reposicion_ver','vencimientos_ver'] LOOP
    campos := private.f5_colecciones_por_permisos(ARRAY[permiso]) #> '{productos,fields}';
    IF NOT COALESCE(campos ?& ARRAY['id','archivado_at','precios_por_peso'], false) THEN
      RAISE EXCEPTION 'F5 omitió campos de productos para %', permiso;
    END IF;
  END LOOP;
  IF private.f5_colecciones_por_permisos(ARRAY[]::text[]) ? 'productos' THEN
    RAISE EXCEPTION 'F5 agregó Productos para un perfil sin permiso de catálogo';
  END IF;
END
$test$;
`;

test('Docker instala REV109 por primera vez desde un esquema sin la función ni la columna de tamaños',
  {skip:process.env.PESO_SQL_TEST!=='true'},async()=>{
    const result=await dockerSql(`
BEGIN;
-- Reconstruir el contrato previo dentro de esta transacción, incluso si el
-- laboratorio conserva la implementación r11 o ya tiene aplicada REV109.
ALTER TABLE public.productos DROP CONSTRAINT IF EXISTS productos_precios_por_peso_check;
ALTER TABLE public.productos DROP COLUMN IF EXISTS precios_por_peso;
DROP FUNCTION IF EXISTS private.precios_por_peso_validos(jsonb);
${projectionMigration('REV57-MODOS-CAJA-CIGARRILLOS.sql')}
DROP FUNCTION IF EXISTS private.f5_colecciones_por_permisos_antes_precios_por_peso(text[]);
DO $test$
BEGIN
  IF to_regprocedure('private.f5_colecciones_por_permisos_rev30_base_peso(text[])') IS NOT NULL THEN
    DROP FUNCTION private.f5_colecciones_por_permisos_rev30(text[]);
    ALTER FUNCTION private.f5_colecciones_por_permisos_rev30_base_peso(text[])
      RENAME TO f5_colecciones_por_permisos_rev30;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_attribute WHERE attrelid='public.productos'::regclass
    AND attname='precios_por_peso' AND NOT attisdropped
  ) OR COALESCE((private.f5_colecciones_por_permisos(ARRAY['ventas_registrar'])
      #> '{productos,fields}') ? 'precios_por_peso', false) THEN
    RAISE EXCEPTION 'El esquema inicial ya tiene soporte de tamaños';
  END IF;
END
$test$;
CREATE TEMP TABLE fixture_primera_aplicacion (id uuid, comercio_id uuid) ON COMMIT DROP;
INSERT INTO fixture_primera_aplicacion VALUES (gen_random_uuid(),gen_random_uuid());
INSERT INTO public.comercios (id,nombre)
  SELECT comercio_id,'Prueba primera aplicación REV109' FROM fixture_primera_aplicacion;
INSERT INTO public.productos (id,comercio_id,nombre,unidad,costo,precio)
  SELECT id,comercio_id,'Helado previo a REV109','kg',11000,24000 FROM fixture_primera_aplicacion;
${migration('REV109-VENTA-POR-PESO.sql')}
${verifyProjection}
DO $test$
BEGIN
  IF (SELECT p.precios_por_peso FROM public.productos p
      JOIN fixture_primera_aplicacion f ON p.id=f.id) IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'La primera aplicación no inicializó el producto previo con una lista vacía';
  END IF;
END
$test$;
ROLLBACK;
SELECT 'ok';
`);
    assert.equal(result,'ok');
  });

test('Docker aplica la migración de tamaños y mantiene F5 con las definiciones de REV31 y REV57',
  {skip:process.env.PESO_SQL_TEST!=='true'},async()=>{
    const pesos=migration('REV109-VENTA-POR-PESO.sql');
    const casos=await dockerSql(`
BEGIN;
CREATE TEMP TABLE fixture_peso (id uuid, comercio_id uuid, legacy_id uuid) ON COMMIT DROP;
INSERT INTO fixture_peso VALUES (gen_random_uuid(),gen_random_uuid(),gen_random_uuid());
INSERT INTO public.comercios (id,nombre) SELECT comercio_id,'Prueba SQL tamaños' FROM fixture_peso;
INSERT INTO public.productos (id,comercio_id,nombre,unidad,costo,precio)
  SELECT id,comercio_id,'Helado de prueba','kg',11000,24000 FROM fixture_peso;
${pesos}
ALTER TABLE public.productos DROP CONSTRAINT productos_precios_por_peso_check;
INSERT INTO public.productos (id,comercio_id,nombre,unidad,costo,precio,precios_por_peso)
  SELECT legacy_id,comercio_id,'Helado de prueba','kg',11000,24000,
    '[{"gramos":250,"precio":8000},{"gramos":500,"precio":14000,"nombre":"Helado de prueba ¼ kg"}]'
  FROM fixture_peso;
${pesos}
${pesos}
DO $test$
DECLARE
  producto uuid := (SELECT id FROM fixture_peso);
  porcion jsonb := '{"gramos":250,"nombre":"Cuarto","precio":8000,"costoEnvase":300}';
  invalido jsonb;
  restriccion text;
BEGIN
  IF (SELECT precios_por_peso FROM public.productos WHERE id=producto) IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'El catálogo anterior perdió el valor por defecto';
  END IF;
  IF (SELECT precios_por_peso FROM public.productos WHERE id=(SELECT legacy_id FROM fixture_peso))
     IS DISTINCT FROM '[{"gramos":250,"precio":8000,"nombre":"Helado de prueba ¼ kg (2)"},
       {"gramos":500,"precio":14000,"nombre":"Helado de prueba ¼ kg"}]'::jsonb THEN
    RAISE EXCEPTION 'La migración cambió los importes o no completó el nombre sin duplicarlo';
  END IF;
  UPDATE public.productos SET precios_por_peso=jsonb_build_array(porcion) WHERE id=producto;
  IF (SELECT precios_por_peso FROM public.productos WHERE id=producto) IS DISTINCT FROM jsonb_build_array(porcion) THEN
    RAISE EXCEPTION 'El catálogo no conserva precio, peso, nombre y envase';
  END IF;
  FOR invalido IN SELECT unnest(ARRAY[
    porcion,
    jsonb_build_array(porcion,porcion || '{"nombre":"Cuarto alternativo"}'::jsonb),
    jsonb_build_array(porcion,porcion || '{"gramos":500,"nombre":" cuarto "}'::jsonb),
    jsonb_build_array(porcion || '{"precio":0}'::jsonb),
    jsonb_build_array(porcion - 'nombre'),
    jsonb_build_array(porcion || '{"costoEnvase":-1}'::jsonb)
  ]) LOOP
    BEGIN
      UPDATE public.productos SET precios_por_peso=invalido WHERE id=producto;
      RAISE EXCEPTION 'La restricción aceptó un tamaño inválido';
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS restriccion=CONSTRAINT_NAME;
      IF restriccion <> 'productos_precios_por_peso_check' THEN RAISE; END IF;
    END;
  END LOOP;
  BEGIN
    UPDATE public.productos SET unidad='unidad' WHERE id=producto;
    RAISE EXCEPTION 'Un producto por unidad conservó tamaños';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS restriccion=CONSTRAINT_NAME;
    IF restriccion <> 'productos_precios_por_peso_check' THEN RAISE; END IF;
  END;
  UPDATE public.productos SET unidad='unidad', precios_por_peso='[]' WHERE id=producto;
END
$test$;
${verifyProjection}
SAVEPOINT antes_rev31;
${projectionMigration('REV31-MIGRACION.sql')}
${verifyProjection}
ROLLBACK TO antes_rev31;
${projectionMigration('REV57-MODOS-CAJA-CIGARRILLOS.sql')}
${verifyProjection}
ROLLBACK;
SELECT 'ok';
`);
    assert.equal(casos,'ok');
  });
