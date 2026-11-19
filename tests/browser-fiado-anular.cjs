'use strict';
process.env.PW||='C:/Users/valen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
process.env.CHROME||='C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=require('node:assert/strict');
const {openShadow,abrirTurno}=require('./browser-fixture/shadow.cjs');
(async()=>{
 const width=Number(process.env.WIDTH)||1366,h=await openShadow({width,height:1000,rol:'empleado',permisos:['fiado_operar','caja_operar']}),p=h.page;
 try{
  await abrirTurno(p);
  await p.evaluate(async()=>{
   await esperarPersistenciaLocal();f3Estado.modo='v4_only';pendienteSubir=false;enLinea=true;
   const from=sb.from;sb.from=name=>name==='caja_sesiones'?{select(){return this},eq(){return this},maybeSingle:async()=>({data:{id:f3Estado.session.id},error:null})}:from(name);
   db.clientes=[{id:'ana',_v4id:'00000000-0000-4000-8000-000000000001',nombre:'Ana',saldoBase:500}];
   db.ventas=[];db.egresos=[];db.ajustesFiado=[];db.pagos=[{id:'p1',_v4id:'00000000-0000-4000-8000-000000000002',clienteId:'ana',monto:100,forma:'efectivo',fecha:new Date().toISOString()}];
   recalcularDerivados(db);window.__annuls=[];
   window.__rpcStub={fiado_capacidades_v1:async()=>({data:{anular:true,corregir:false},error:null}),corregir_pago_fiado_v1:async args=>{
    window.__annuls.push(args);
    return {data:{ok:true,legacy:{revision:1,puts:[
     {coleccion:'pagos',valor:{...db.pagos[0],correccionPago:{accion:'anular',motivo:args.p_payload.motivo,created_at:new Date().toISOString()}}},
     {coleccion:'ajustesFiado',valor:{id:'comp1',clienteId:'ana',monto:100,fecha:new Date().toISOString(),motivo:'Anulación de cobro'}},
     {coleccion:'egresos',valor:{id:'e1',monto:100,forma:'efectivo',fecha:new Date().toISOString(),motivo:'Compensación de pago fiado'}}
    ]}},error:null};
   }};
   verCuenta('ana');
  });
  assert.equal(await p.locator('[data-anular-pago="p1"]').count(),1,'acceso directo a anular');
  await p.click('[data-anular-pago="p1"]');
  await p.waitForFunction(()=>document.querySelector('#cf_estado')?.textContent.includes('disponible'));
  assert.equal(await p.inputValue('#cf_accion'),'anular');
  assert.equal(await p.locator('#cf_campos').isVisible(),false);
  assert.equal(await p.locator('#cf_confirmar').isDisabled(),true);
  await p.fill('#cf_motivo','Pago cargado por error');
  await p.waitForFunction(()=>!document.querySelector('#cf_confirmar').disabled);
  assert.match(await p.locator('#cf_confirmar').innerText(),/Confirmar anulación/);
  // Cancelar no modifica ni envía nada.
  await p.locator('#ov [data-cerrar]').first().click();
  assert.equal(await p.evaluate(()=>__annuls.length),0);
  await p.evaluate(()=>verCuenta('ana'));await p.click('[data-anular-pago="p1"]');
  await p.fill('#cf_motivo','Pago cargado por error');await p.waitForFunction(()=>!document.querySelector('#cf_confirmar').disabled);
  await p.locator('#cf_confirmar').dblclick();
  await p.waitForFunction(()=>__annuls.length===1&&!document.querySelector('#cf_confirmar'));
  const r=await p.evaluate(()=>({n:__annuls.length,payload:__annuls[0].p_payload,saldo:db.clientes[0].saldo,pagos:db.pagos.length,original:db.pagos[0].monto}));
  assert.equal(r.n,1);assert.equal(r.payload.accion,'anular');assert.equal(r.payload.monto,0);assert.equal(r.saldo,500);assert.equal(r.pagos,1);assert.equal(r.original,100);
  assert.equal(await p.locator('[data-anular-pago="p1"]').count(),0);
  assert.match(await p.locator('#ov').innerText(),/Anulado/);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  console.log(JSON.stringify({pass:true,width,employee:true,direct:true,reason:true,cancelNoEffect:true,oneRequest:true,balance:500}));
 }finally{await h.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
