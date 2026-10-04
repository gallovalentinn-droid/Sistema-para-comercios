// Real portable PostgreSQL, localhost only, no production credentials or data.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),scratch=path.join(root,'.superpowers/sdd/2026-10-03-lector-facturas-rev84');
const bin=process.env.REV84_PG_BIN||path.join(scratch,'db-runtime/node_modules/@embedded-postgres/windows-x64/native/bin');
const {Client}=require(process.env.REV84_PG_MODULE||path.join(scratch,'db-runtime/node_modules/pg'));
const data=path.join(scratch,'pgdata'),log=path.join(scratch,'postgres.log'),port=55484;
const exe=name=>path.join(bin,name+(process.platform==='win32'?'.exe':''));
const cmd=(name,args)=>cp.execFileSync(exe(name),args,{windowsHide:true,stdio:'ignore'});
const queryClient=async database=>{const c=new Client({host:'127.0.0.1',port,user:'postgres',database});await c.connect();return c};
const sql=file=>fs.readFileSync(path.join(root,file),'utf8');
(async()=>{
 let c,admin,database,started=false;
 try{
  if(!fs.existsSync(path.join(data,'PG_VERSION')))cmd('initdb',['-D',data,'-U','postgres','-A','trust','--encoding=UTF8','--locale=C']);
  cmd('pg_ctl',['start','-D',data,'-l',log,'-o',`-h 127.0.0.1 -p ${port}`,'-w']);started=true;
  admin=await queryClient('postgres');database='rev84_'+crypto.randomBytes(6).toString('hex');await admin.query(`create database ${database}`);c=await queryClient(database);
  await c.query(sql('supabase/tests/rev84/fixture.sql'));await c.query(sql('supabase/tests/rev84/legacy-functions.sql'));
  await c.query(sql('REV71-ALIAS-FACTURA.sql'));
  await c.query(sql('REV84-LECTOR-MEMORIA.sql'));await c.query(sql('REV84-LECTOR-MEMORIA.sql'));await c.query(sql('supabase/tests/rev84/lector-memoria.sql'));
  console.log('MEMORIA SQL: idempotencia, legacy, guardado y RLS aprobados');
  if(process.argv.includes('--cupo')){
   const definition=await c.query("select oid::regprocedure::text signature,pg_get_functiondef(oid) definition from pg_proc where proname in ('f6_service_reservar_lectura_factura','f6_service_registrar_resultado_lectura_factura') order by proname");
   await c.query(sql('REV84-LECTOR-CUPO.sql'));await c.query(sql('REV84-LECTOR-CUPO.sql'));await c.query(sql('supabase/tests/rev84/lector-cupo.sql'));
   require('node:assert/strict').deepEqual((await c.query("select oid::regprocedure::text signature,pg_get_functiondef(oid) definition from pg_proc where proname in ('f6_service_reservar_lectura_factura','f6_service_registrar_resultado_lectura_factura') order by proname")).rows,definition.rows,'legacy RPC definitions unchanged');
   await require('./sql-lector-cupo-concurrency.cjs')({queryClient,database,c});console.log('CUPO SQL: controles y concurrencia aprobados');
  }
 }finally{
  if(c)await c.end();if(admin){if(database)await admin.query(`drop database ${database}`);await admin.end();}
  if(started)cmd('pg_ctl',['stop','-D',data,'-m','fast','-w']);
 }
})().catch(e=>{console.error(e.message);process.exitCode=1});
