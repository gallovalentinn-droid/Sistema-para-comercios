'use strict';
// Real UI + Auth + PostgreSQL RPCs. Only an isolated NEW QA tenant is written.
// Secrets are read only into this process, never printed or saved in the repository.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {chromium}=require(process.env.PW||'playwright');
const ROOT=path.resolve(__dirname,'..');
const CONTAINER='supabase_db_micomercio-prueba-local';
const DEFAULT_CONFIG=path.join(process.env.USERPROFILE||process.env.HOME,'.codex','.chatgpt-projects',
  'g-p-6a8b192b818c8191ad9447dd21800d7c','github','Sistema-para-comercios','.worktrees','entorno-docker','entorno-local','generado','local.json');
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
function sql(text){return execFileSync('docker',['exec','-i',CONTAINER,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-qAt'],{input:text,encoding:'utf8',maxBuffer:8*1024*1024}).trim();}
function verifyLocal(){
  const [inspection]=JSON.parse(execFileSync('docker',['inspect',CONTAINER],{encoding:'utf8'}));
  assert.deepEqual(inspection.NetworkSettings.Ports['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'55322'}]);
  const config=JSON.parse(fs.readFileSync(process.env.MC_LOCAL_CONFIG||DEFAULT_CONFIG,'utf8'));
  assert.equal(config.apiUrl,'http://127.0.0.1:55321');
  assert.ok(config.secretKey&&config.publishableKey,'Local API keys unavailable');
  return config;
}
async function localAuth(config,email,password){
  const created=await fetch(config.apiUrl+'/auth/v1/admin/users',{method:'POST',headers:{
    apikey:config.secretKey,authorization:'Bearer '+config.secretKey,'content-type':'application/json'},
    body:JSON.stringify({email,password,email_confirm:true,user_metadata:{nombre:'QA fiado aislado'}})});
  if(!created.ok)throw new Error('Local fixture Auth creation failed: HTTP '+created.status);
  const user=await created.json();
  const login=await fetch(config.apiUrl+'/auth/v1/token?grant_type=password',{method:'POST',
    headers:{apikey:config.publishableKey,'content-type':'application/json'},body:JSON.stringify({email,password})});
  if(!login.ok)throw new Error('Local fixture real sign-in failed: HTTP '+login.status);
  const session=await login.json();assert.equal(session.user.id,user.id);
  return session;
}
async function serve(config){
  const server=http.createServer((req,res)=>{
    const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);
    const filename=path.resolve(ROOT,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
    if(!filename.startsWith(ROOT+path.sep)||!fs.existsSync(filename)){res.writeHead(404);res.end();return;}
    const ext=path.extname(filename),types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'};
    let data=fs.readFileSync(filename);
    if(filename.endsWith(path.sep+'sw.js'))data=Buffer.from("self.addEventListener('activate',()=>self.registration.unregister());");
    if(ext==='.html')data=Buffer.from(data.toString('utf8').replaceAll('https://qrvdfqpxutymmlcplsal.supabase.co',config.apiUrl)
      .replace(/(const SUPABASE_ANON_KEY\s*=\s*)'[^']*'/,(_,prefix)=>prefix+q(config.publishableKey)));
    res.writeHead(200,{'content-type':types[ext]||'application/octet-stream','cache-control':'no-store'});res.end(data);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return server;
}
function seed(f,owner,db){
  const old=new Date(Date.now()-40*86400000).toISOString(),now=new Date().toISOString();
  sql(`begin;
    insert into public.comercios(id,nombre) values(${q(f.shop)},${q('QA fiado correccion '+f.shop)});
    insert into public.comercio_miembros(comercio_id,user_id,rol,activo) values(${q(f.shop)},${q(owner)},'duenio',true);
    insert into public.comercio_licencias(comercio_id,activo,plan,estado_administrativo,valid_from,valid_until)
      values(${q(f.shop)},true,'beta','activa',now()-interval '1 day',now()+interval '30 days');
    insert into public.clientes_licencia(id,email,nombre_kiosco,activo) values(${q(owner)},${q(f.email)},'QA fiado aislado',true);
    insert into public.cajas(id,comercio_id,codigo,nombre) values(${q(f.cash)},${q(f.shop)},'QA-FIADO','Caja QA aislada');
    insert into public.comercio_dispositivos(id,comercio_id,user_id,caja_id,nombre)
      values(${q(f.device)},${q(f.shop)},${q(owner)},${q(f.cash)},'Dispositivo QA aislado');
    insert into public.caja_sesiones(id,comercio_id,caja_id,device_id,abierta_por,opened_at_device,business_date,estado)
      values(${q(f.root)},${q(f.shop)},${q(f.cash)},${q(f.device)},${q(owner)},now()-interval '1 hour',current_date,'abierta');
    insert into public.caja_sesion_segmentos(segment_id,comercio_id,root_session_id,opened_at_device)
      values(${q(f.segment)},${q(f.shop)},${q(f.root)},now()-interval '1 hour');
    insert into public.clientes(id,comercio_id,legacy_id,nombre,saldo_base,alta_at_device)
      values(${q(f.customer)},${q(f.shop)},${q(f.customerLocal)},'Cliente QA correccion',500,${q(old)});
    insert into public.fiado_cargos(id,comercio_id,cliente_id,origen_tipo,monto,fecha_origen_device,business_date,vence_fecha,recargable)
      values(${q(f.charge)},${q(f.shop)},${q(f.customer)},'saldo_base',500,${q(old)},current_date-40,current_date-10,true);
    insert into public.pagos_fiado(id,comercio_id,legacy_id,cliente_id,caja_sesion_id,device_id,monto,forma,nota,occurred_at_device,business_date,session_segment_id)
      values(${q(f.payment)},${q(f.shop)},${q(f.paymentLocal)},${q(f.customer)},${q(f.root)},${q(f.device)},100,'efectivo','QA original preservado',${q(now)},current_date,${q(f.segment)});
    insert into public.fiado_aplicaciones(comercio_id,cliente_id,credito_tipo,credito_id,cargo_id,monto)
      values(${q(f.shop)},${q(f.customer)},'pago',${q(f.payment)},${q(f.charge)},100);
    insert into public.datos_kiosco(id,db,revision) values(${q(owner)},${q(JSON.stringify(db))}::jsonb,1);
    commit;`);
}
async function assertServer(f,owner,stage){
  const r=JSON.parse(sql(`select jsonb_build_object(
    'original',(select to_jsonb(p) from public.pagos_fiado p where id=${q(f.payment)}),
    'balance',(select sum(c.monto-coalesce((select sum(a.monto) from public.fiado_aplicaciones a where a.cargo_id=c.id),0))
      from public.fiado_cargos c where c.comercio_id=${q(f.shop)}),
    'expense',(select sum(monto) from public.egresos where comercio_id=${q(f.shop)}),
    'payments',(select sum(monto) from public.pagos_fiado where comercio_id=${q(f.shop)}),
    'audit_count',(select count(*) from private.fiado_correcciones_v1 where comercio_id=${q(f.shop)}),
    'original_apps',(select sum(monto) from public.fiado_aplicaciones where credito_id=${q(f.payment)}),
    'legacy',(select jsonb_build_object('revision',revision,'db',db) from public.datos_kiosco where id=${q(owner)}));`));
  assert.equal(r.original.monto,100);assert.equal(r.original.forma,'efectivo');assert.equal(r.original.nota,'QA original preservado');
  assert.equal(r.original_apps,100);assert.equal(r.balance,stage===1?440:500);
  assert.equal(r.expense,stage===1?100:160);assert.equal(r.payments,160);
  assert.equal(r.audit_count,stage);assert.equal(r.legacy.revision,stage+2);
  assert.equal(r.legacy.db.clientes[0].saldo,stage===1?440:500);
  assert.equal(r.legacy.db.clientes[0].saldoBase,500);
  assert.equal(r.legacy.db.qaPreservar,'valor ajeno intacto');
  return r;
}
async function main(){
  const config=verifyLocal(),f=Object.fromEntries(['shop','cash','device','root','segment','customer','payment','charge'].map(k=>[k,crypto.randomUUID()]));
  f.customerLocal='qa-cliente-'+f.customer;f.paymentLocal='qa-pago-'+f.payment;f.email='qa-fiado-'+f.shop+'@prueba.local';
  const session=await localAuth(config,f.email,crypto.randomBytes(24).toString('base64url'));
  const server=await serve(config),origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,...(process.env.CHROME?{executablePath:process.env.CHROME}:{})});
  const context=await browser.newContext({viewport:{width:1366,height:1050},locale:'es-AR',timezoneId:'America/Buenos_Aires',serviceWorkers:'block'});
  const errors=[],external=[],rpcRequests=[];
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin===origin||url.origin===config.apiUrl)return route.continue();
    external.push(url.origin);return route.abort();
  });
  const page=await context.newPage();page.setDefaultTimeout(20000);
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
  page.on('request',r=>{if(r.url().includes('/rest/v1/rpc/'))rpcRequests.push(new URL(r.url()).pathname.split('/').pop());});
  try{
    await page.goto(origin+'/beta/');await page.waitForFunction(()=>typeof formCorregirPagoFiado==='function'&&document.querySelector('#loginEmail'));
    const initial=await page.evaluate(f=>{
      const b=VACIA(),now=new Date().toISOString(),old=new Date(Date.now()-40*86400000).toISOString();
      b.config.nombre='QA fiado aislado';b.config.manejaTurnos=true;b.config.ultBackup=now;b.qaPreservar='valor ajeno intacto';
      b.clientes=[{id:f.customerLocal,_v4id:f.customer,nombre:'Cliente QA correccion',saldoBase:500,saldo:400,alta:old,tel:''}];
      b.pagos=[{id:f.paymentLocal,_v4id:f.payment,clienteId:f.customerLocal,monto:100,forma:'efectivo',nota:'QA original preservado',fecha:now,
        _v4cajaSesionId:f.root,_v4sessionSegmentId:f.segment,_v4deviceId:f.device}];return b;
    },f);
    seed(f,session.user.id,initial);
    if(process.env.PROVISIONAL==='true')sql(`update public.caja_sesiones set estado='requiere_conciliacion',provisional=true where id=${q(f.root)};`);
    await page.evaluate(async({f,session,initial})=>{
      // Real JWT installed into the real Supabase client; no RPC or persistence mocks.
      const auth=await sb.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token});
      if(auth.error)throw new Error('Real local session failed');sesion=auth.data.session;
      clearTimeout(tGuardar);tGuardar=null;clearTimeout(f3Timer);f3Timer=null;
      if(typeof f32DetenerPull==='function')f32DetenerPull();
      f3Estado=f3EstadoInicial();f3Estado.comercioId=f.shop;f3Estado.deviceUuid=f.device;f3Estado.cajaId=f.cash;
      f3Estado.cajaCodigo='QA-FIADO';f3Estado.modo='shadow';f3Estado.rol='duenio';f3Estado.contextoCargado=true;f3ContextoServidorVerificado=true;
      f3Estado.session={id:f.root,rootSessionId:f.root,sessionSegmentId:f.segment,cajaId:f.cash,deviceId:f.device,
        estado:'abierta',openedAtDevice:new Date(Date.now()-3600000).toISOString(),fondoGeneral:0,fondoCigarros:0};
      f5ReemplazarEstado({...f5EstadoInicial(),membership:{comercio_id:f.shop,user_id:session.user.id,rol:'duenio',permission_version:1,permisos:{}}});
      localStorage.setItem(F3_SHADOW_KEY,'1');db=migrarFormaDb(initial);recalcularDerivados(db);
      snapshotLocal=deepCopy(db);ultimaNubeDb=deepCopy(db);revisionNube=1;cambioLocalSeq=0;
      pendienteSubir=false;enLinea=true;sincronizando=false;f3Procesando=false;f32Procesando=false;interfazProtegida=false;
      const puts=SYNC_COLECCIONES.flatMap(coleccion=>(db[coleccion]||[]).map(valor=>({coleccion,valor})));
      await f32PersistirDatoEntrante({puts});await f32PersistirFinalizacion();
      document.querySelector('#loginWrap').hidden=true;document.querySelector('#appWrap').hidden=false;
      const startup=document.querySelector('#startupLoading');if(startup)startup.hidden=true;
      vista='fiado';fiadoFiltro='saldo';render();
    },{f,session,initial});
    const before=await page.evaluate(()=>({saldo:db.clientes[0].saldo,cash:calcularTotalesTurno({desde:'',ventasTodas:[],pagos:db.pagos,egresos:db.egresos}).cobEfectivo}));
    assert.deepEqual(before,{saldo:400,cash:100});
    await page.locator(`[data-fiado-cliente="${f.customerLocal}"] [data-cta]`).click();
    await page.locator(`[data-corregir-pago="${f.paymentLocal}"]`).click();
    await page.fill('#cf_monto','60');await page.selectOption('#cf_forma','qr');await page.fill('#cf_motivo','QA error de monto y medio');
    await page.waitForFunction(()=>!document.querySelector('#cf_confirmar')?.disabled);
    let perderRespuesta=true;
    await context.route('**/rest/v1/rpc/corregir_pago_fiado_v1',async route=>{
      assert.equal(new URL(route.request().url()).origin,config.apiUrl);
      if(perderRespuesta){perderRespuesta=false;const respuesta=await route.fetch();assert.equal(respuesta.ok(),true);return route.abort('failed');}
      return route.continue();
    });
    await page.click('#cf_confirmar');
    await page.waitForFunction(()=>!!document.querySelector('#cf_error')?.textContent&&!fiadoCorreccionActiva);
    assert.equal(await page.evaluate(()=>fiadoHayCorreccionPendiente()),true,'un resultado desconocido conserva su barrera');
    await page.evaluate(()=>sessionStorage.clear());
    assert.equal(await page.evaluate(()=>fiadoHayCorreccionPendiente()),true,'la referencia sobrevive al fin de la sesión de pestaña');
    assert.equal(await page.evaluate(()=>db.clientes[0].saldo),400,'no se afirma un saldo sin recibir la respuesta');
    await page.locator('#ov [data-cerrar]').last().click();
    await page.locator(`[data-fiado-cliente="${f.customerLocal}"] [data-pago]`).click();assert.equal(await page.locator('#okP').count(),0,'no se acepta otro cobro sobre un saldo viejo');
    sql(`update public.datos_kiosco set db=jsonb_set(db,'{config,diasPlazoFiado}','60'::jsonb),revision=revision+1 where id=${q(session.user.id)};`);
    await page.click('#fiadoRecuperarCorreccion');await page.waitForFunction(()=>!document.querySelector('#cf_confirmar')?.disabled);await page.click('#cf_confirmar');
    await page.waitForFunction(()=>!document.querySelector('#cf_confirmar')||!!document.querySelector('#cf_error')?.textContent,{},{timeout:45000});
    assert.equal(await page.locator('#cf_error').count(),0,'Correction failed: '+await page.locator('#cf_error').allTextContents());
    const first=await page.evaluate(async()=>{
      await esperarPersistenciaLocal();return {db:deepCopy(db),revision:revisionNube,seq:cambioLocalSeq,pending:pendienteSubir,
        outbox:(await f3LeerOutbox()).length,lock:fiadoCorreccionActiva,
        totals:calcularTotalesTurno({desde:'',ventasTodas:[],pagos:db.pagos,egresos:db.egresos})};
    });
    assert.equal(first.db.clientes[0].saldo,440);assert.equal(first.revision,3);assert.equal(first.db.config.diasPlazoFiado,60);assert.equal(first.pending,false);assert.equal(first.outbox,0);assert.equal(first.lock,false);
    assert.equal(await page.evaluate(()=>fiadoHayCorreccionPendiente()),false);
    const estadoCanonico=JSON.parse(sql(`select estado_cuenta from private.fiado_correcciones_v1 where comercio_id=${q(f.shop)} order by created_at desc limit 1;`));
    const vencidosLocales=await page.evaluate(()=>ledgerFiadoCliente(db.clientes[0]).map(c=>({vence:c.vence,restante:c.restante})).sort((a,b)=>a.vence.localeCompare(b.vence)));
    assert.deepEqual(vencidosLocales,estadoCanonico.cargos_abiertos.map(c=>({vence:c.vence_fecha,restante:c.restante})).sort((a,b)=>a.vence.localeCompare(b.vence)),'los vencimientos coinciden con SQL');
    const original=first.db.pagos.find(p=>p.id===f.paymentLocal),replacement=first.db.pagos.find(p=>p.id!==f.paymentLocal);
    assert.equal(original.monto,100);assert.equal(original.correccionPago.accion,'corregir');assert.equal(replacement.monto,60);assert.equal(replacement.forma,'qr');
    assert.equal(first.db.ajustesFiado.reduce((n,a)=>n+a.monto,0),100);assert.equal(first.db.egresos.reduce((n,e)=>n+e.monto,0),100);
    assert.equal(first.totals.cobEfectivo-first.totals.egrGeneral,0);assert.equal(first.totals.cobEfectivo-first.totals.egrGeneral-before.cash,-100);
    await assertServer(f,session.user.id,1);
    await page.locator(`[data-corregir-pago="${replacement.id}"]`).click();
    await page.selectOption('#cf_accion','anular');await page.fill('#cf_motivo','QA anular sustituto');
    await page.waitForFunction(()=>!document.querySelector('#cf_confirmar')?.disabled);await page.click('#cf_confirmar');
    await page.waitForFunction(()=>!document.querySelector('#cf_confirmar')||!!document.querySelector('#cf_error')?.textContent,{},{timeout:45000});
    assert.equal(await page.locator('#cf_error').count(),0,'Cancellation failed: '+await page.locator('#cf_error').allTextContents());
    const final=await page.evaluate(async()=>{
      await esperarPersistenciaLocal();const d=await abrirIdb(),tx=d.transaction(['pagos','ajustesFiado','egresos','clientes'],'readonly');
      const [pagos,ajustes,egresos,clientes]=await Promise.all(['pagos','ajustesFiado','egresos','clientes'].map(k=>idbReq(tx.objectStore(k).getAll())));
      return {saldo:db.clientes[0].saldo,revision:revisionNube,pagos,ajustes,egresos,clientes,seq:cambioLocalSeq,pending:pendienteSubir,lock:fiadoCorreccionActiva};
    });
    assert.equal(final.saldo,500);assert.equal(final.revision,4);assert.equal(final.pagos.length,2);assert.equal(final.ajustes.reduce((n,a)=>n+a.monto,0),160);
    assert.equal(final.egresos.reduce((n,e)=>n+e.monto,0),160);assert.equal(final.clientes[0].saldo,500);assert.equal(final.pending,false);assert.equal(final.lock,false);
    await assertServer(f,session.user.id,2);
    assert.equal(rpcRequests.filter(n=>n==='corregir_pago_fiado_v1').length,3);
    assert.deepEqual(external.filter(origin=>origin!=='https://fonts.googleapis.com'&&origin!=='https://fonts.gstatic.com'),[]);
    assert.deepEqual(errors,[]);
    if(process.env.UX_OUTPUT_DIR){fs.mkdirSync(process.env.UX_OUTPUT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.UX_OUTPUT_DIR,'fiado-correccion-docker.png'),fullPage:true});}
    console.log(JSON.stringify({ok:true,backend:'Docker local',tenantQA:f.shop,ownerQA:session.user.id,
      correction:{original:100,replacement:60,medio:'qr',saldo:440,cashDelta:-100},cancellation:{saldo:500},
      realRPCs:3,operaciones:2,reintentoIdempotente:true,barreraResultadoDesconocido:true,configRemotaPreservada:true,legacyRevision:4,indexedDB:true,fixtures:'Tenant QA aislado conservado; no se eliminaron datos existentes'}));
  }catch(e){e.message+=' [tenant QA aislado '+f.shop+']';throw e;}
  finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
