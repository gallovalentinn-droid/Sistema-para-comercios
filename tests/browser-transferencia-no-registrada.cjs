'use strict';
process.env.PW||='C:/Users/valen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
process.env.CHROME||='C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=require('node:assert/strict');
const {openShadow,abrirTurno}=require('./browser-fixture/shadow.cjs');
(async()=>{const width=Number(process.env.WIDTH)||1366,h=await openShadow({width,height:900}),p=h.page;
try{
 await abrirTurno(p);
 await p.evaluate(()=>{db.config.verificarCobrosMP=false;db.productos=[{id:'p',nombre:'Producto de prueba',precio:100,costo:50,stock:10,unidad:'unidad'}];vista='vender';ticket=[];render();window.__turnoOriginal=estadoTurnoRev31;});
 for(const causa of ['turno','archivo']){
  await p.evaluate(causa=>{cerrarModal();ticket=[];db.productos[0].archivadoAt=null;estadoTurnoRev31=window.__turnoOriginal;seleccionarProducto(db.productos[0]);pago='efectivo';abrirModalPago();if(causa==='turno')estadoTurnoRev31=()=>({requiereApertura:true});else db.productos[0].archivadoAt=new Date().toISOString();},causa);
  await p.locator('[data-p="transferencia"]').click();assert.equal(await p.evaluate(()=>db.ventas.length),0);
  await p.click('#cobrarElec');await p.waitForFunction(()=>!mpOperacionOcupada);
  assert.deepEqual(await p.evaluate(()=>({pendiente:mpLeerPendiente(),bloquea:mpBloqueaCobro(),ventas:db.ventas.length,stock:db.productos[0].stock})),{pendiente:null,bloquea:false,ventas:0,stock:10});
  await p.evaluate(()=>{estadoTurnoRev31=window.__turnoOriginal;db.productos[0].archivadoAt=null;});
  await p.locator('[data-p="tarjeta"]').click();assert.equal(await p.locator('#cobrarElec').isEnabled(),true);
 }
 await p.evaluate(async()=>{cerrarModal();const snapshot=mpSnapshot();mpGuardarPendiente({saleId:'manual-vieja',snapshot,fingerprint:await mpFingerprint(snapshot),amount:'100.00',stage:'manual',manualDirecto:true,scope:mpScope()});confirmarCancelacionVenta();});
 await p.waitForFunction(()=>!mpLeerPendiente());
 assert.deepEqual(await p.evaluate(()=>({ventas:db.ventas.length,stock:db.productos[0].stock,ticket:ticket.length})),{ventas:0,stock:10,ticket:0});
 assert.deepEqual(h.errors.filter(x=>x.startsWith('pageerror')),[]);
 console.log(JSON.stringify({width,pass:true,turnoCerrado:true,archivado:true,cancelacionSinVenta:true}));
}finally{await h.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
