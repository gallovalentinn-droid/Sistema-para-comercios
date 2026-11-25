const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFile}=require('node:child_process');
const migration=()=>fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261125032029_cobro_transferencia_configurable.sql'),'utf8').replace(/^begin;\s*$/im,'').replace(/^commit;\s*$/im,'');
function sql(input){return new Promise((resolve,reject)=>{const c=execFile('docker',['exec','-i','supabase_db_micomercio-prueba-local','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],(e,out,err)=>e?reject(Error(err||e.message)):resolve(out.trim()));c.stdin.end(input);});}
test('Docker sincroniza la preferencia de cobro y solo dueño/admin con licencia pueden cambiarla',{skip:process.env.MP_SQL_TEST!=='true'},async()=>{
  const result=await sql(`BEGIN;
CREATE TEMP TABLE acl_cobro AS SELECT proowner,proacl FROM pg_proc WHERE oid='private._f5_actualizar_config_privilegiada(uuid,jsonb)'::regprocedure;
${migration()}
${migration()}
${fs.readFileSync(path.join(__dirname,'../REV109-VENTA-POR-PESO.sql'),'utf8').match(/create or replace function private\.f5_colecciones_por_permisos_rev30\(p_permissions text\[\]\)[\s\S]*?\$\$;/i)[0]}
DO $verify$
BEGIN
 IF NOT coalesce((private.f5_colecciones_por_permisos(ARRAY['ventas_registrar'])#>'{comercio_configuracion,fields}')?'verificar_cobros_mp',false) THEN RAISE EXCEPTION 'Falta la preferencia en la proyección del vendedor'; END IF;
 IF EXISTS(SELECT 1 FROM acl_cobro a,pg_proc p WHERE p.oid='private._f5_actualizar_config_privilegiada(uuid,jsonb)'::regprocedure AND (p.proowner IS DISTINCT FROM a.proowner OR p.proacl IS DISTINCT FROM a.proacl)) THEN RAISE EXCEPTION 'Cambio de dueño/permisos'; END IF;
 IF has_function_privilege('anon','public.f5_actualizar_config_privilegiada(uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Anon ganó privilegios'; END IF;
END $verify$;
CREATE TEMP TABLE fixture_cobro AS SELECT gen_random_uuid() AS comercio,gen_random_uuid() AS duenio,gen_random_uuid() AS empleado;
INSERT INTO auth.users(id) SELECT duenio FROM fixture_cobro UNION ALL SELECT empleado FROM fixture_cobro;
INSERT INTO public.comercios(id,nombre) SELECT comercio,'Prueba preferencia de cobro' FROM fixture_cobro;
INSERT INTO public.comercio_licencias(comercio_id,activo,estado_administrativo,valid_from,valid_until) SELECT comercio,true,'activa',now(),now()+interval '1 day' FROM fixture_cobro ON CONFLICT(comercio_id) DO UPDATE SET activo=true,estado_administrativo='activa',valid_until=now()+interval '1 day';
INSERT INTO public.comercio_miembros(comercio_id,user_id,rol) SELECT comercio,duenio,'duenio' FROM fixture_cobro UNION ALL SELECT comercio,empleado,'empleado' FROM fixture_cobro;
GRANT SELECT ON fixture_cobro TO authenticated;
SET LOCAL ROLE authenticated;
DO $test$
DECLARE f record;valor boolean;
BEGIN
 SELECT * INTO f FROM fixture_cobro;
 PERFORM set_config('request.jwt.claim.sub',f.duenio::text,true);
 PERFORM public.f5_actualizar_config_privilegiada(f.comercio,'{"verificar_cobros_mp":true}');
 FOR valor IN SELECT x FROM unnest(ARRAY[true,false]) x LOOP
  PERFORM public.f5_actualizar_config_privilegiada(f.comercio,jsonb_build_object('verificar_cobros_mp',valor));
  IF (SELECT verificar_cobros_mp FROM public.comercio_configuracion WHERE comercio_id=f.comercio) IS DISTINCT FROM valor THEN RAISE EXCEPTION 'No persistió %',valor; END IF;
 END LOOP;
 BEGIN PERFORM public.f5_actualizar_config_privilegiada(f.comercio,'{"verificar_cobros_mp":"true"}');RAISE EXCEPTION 'Aceptó texto';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'F5_MODULO_INVALIDO' THEN RAISE; END IF;END;
 PERFORM set_config('request.jwt.claim.sub',f.empleado::text,true);
 BEGIN PERFORM public.f5_actualizar_config_privilegiada(f.comercio,'{"verificar_cobros_mp":true}');RAISE EXCEPTION 'Empleado cambió la preferencia';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'ROLE_REQUIRED' THEN RAISE; END IF;END;
 PERFORM set_config('request.jwt.claim.sub','',true);
 BEGIN PERFORM public.f5_actualizar_config_privilegiada(f.comercio,'{"verificar_cobros_mp":true}');RAISE EXCEPTION 'Aceptó sesión ausente';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'AUTH_REQUIRED' THEN RAISE; END IF;END;
END $test$;
RESET ROLE;
ROLLBACK;
SELECT 'ok';`);
  assert.equal(result,'ok');
});
