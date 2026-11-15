'use strict';
// Solo lectura de negocio. Tokens y contraseñas ficticias se usan en memoria, nunca se imprimen.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const localDir=path.join(process.env.USERPROFILE,'.codex','.chatgpt-projects','g-p-6a8b192b818c8191ad9447dd21800d7c','github','Sistema-para-comercios','.worktrees','entorno-docker','entorno-local');
const url='http://127.0.0.1:55382';
async function main(){
 const local=JSON.parse(fs.readFileSync(path.join(localDir,'generado/local.json'))),cred=JSON.parse(fs.readFileSync(path.join(localDir,'.credenciales-prueba.json')));
 assert.equal(local.apiUrl,'http://127.0.0.1:55321');
 const inspect=JSON.parse(execFileSync('docker',['inspect','supabase_db_micomercio-prueba-local'],{encoding:'utf8'}))[0];assert.deepEqual(inspect.NetworkSettings.Ports['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'55322'}]);
 const counts=()=>execFileSync('docker',['exec','supabase_db_micomercio-prueba-local','psql','-X','-U','postgres','-d','postgres','-qAt','-c',"select json_build_array((select count(*) from public.ventas),(select count(*) from public.venta_pagos),(select count(*) from public.movimientos_stock),(select count(*) from public.productos))"],{encoding:'utf8'}).trim();
 const before=counts();
 const login=await fetch(local.apiUrl+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:local.publishableKey,'content-type':'application/json'},body:JSON.stringify({email:cred.duenio.email,password:cred.duenio.password})});assert.equal(login.status,200,'Auth de Docker');const session=await login.json();
 const headers={apikey:local.publishableKey,authorization:'Bearer '+session.access_token};
 const rows=await (await fetch(local.apiUrl+'/rest/v1/comercio_dispositivos?select=id,comercio_id&user_id=eq.'+session.user.id+'&revoked_at=is.null&limit=1',{headers})).json();assert.ok(rows.length,'Dispositivo ficticio ya registrado');
 const request=async data=>fetch(url+'/api/mercadopago',{method:'POST',headers:{authorization:headers.authorization,'content-type':'application/json'},body:JSON.stringify({commerceId:rows[0].comercio_id,deviceId:rows[0].id,...data})});
 const accounts=await request({action:'accounts'});assert.equal(accounts.status,200,'Autoridad F5 real');assert.deepEqual(await accounts.json(),{configured:false,accounts:[]});
 assert.equal((await request({action:'accounts',deviceId:'00000000-0000-4000-8000-000000000000'})).status,403,'Dispositivo ajeno rechazado');
 const html=await (await fetch(url+'/beta/')).text(),edition=fs.readFileSync(path.join(__dirname,'../beta/index.html'),'utf8').match(/packageEdition:'([^']+)'/)[1];assert.ok(html.includes(edition));assert.ok(html.includes('mercadopago.js'));assert.ok(!html.includes('qrvdfqpxutymmlcplsal'));
 assert.equal((await fetch(url+'/.mercadopago-local/payments.sqlite')).status,404);assert.equal(counts(),before,'Ventas, pagos, movimientos y productos intactos');
 console.log(JSON.stringify({pass:true,authDocker:true,authorityF5:true,applicationConfigured:false,businessRowsUnchanged:true,url}));
}
main().catch(e=>{console.error(e instanceof assert.AssertionError?e.message:'Fallo de la comprobación Docker. No se muestran respuestas ni credenciales.');process.exitCode=1;});
