'use strict';
process.env.PW||='C:/Users/valen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
process.env.CHROME||='C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=require('node:assert/strict');const {openShadow,abrirTurno}=require('./browser-fixture/shadow.cjs');
async function main(){
 const width=Number(process.env.WIDTH)||1366,h=await openShadow({width,height:900}),p=h.page;let checks=0,creates=0;
 await p.route(/\/(?:api|functions\/v1)\/mercadopago(?:\?.*)?$/,async route=>{
  const b=route.request().postDataJSON();
  if(b.action==='accounts')return route.fulfill({status:503,json:{code:'CONEXION_NO_DISPONIBLE'}});
  if(b.action==='qr-create'){creates++;throw Error('Recovery must never create another order');}
  if(b.action==='qr-status'){checks++;return route.fulfill({json:{attempt:{status:'created',qrData:'000201010212synthetic'},receipt:null}});}
  throw Error(b.action);
 });
 try{
  await abrirTurno(p);await p.evaluate(async()=>{vista='vender';db.config.manejaTurnos=false;db.productos=[{id:'p',nombre:'Prueba',precio:4500,costo:1000,stock:10,stockBase:10,unidad:'unidad'}];ticket=[];seleccionarProducto(db.productos[0]);pago='transferencia';const pending=await mpPreparar('a');pending.stage='qr';mpGuardarPendiente(pending);render();});
  const before=await p.evaluate(()=>mpLeerPendiente().saleId);await p.click('#mpRecuperarCobro');
  await p.waitForFunction(()=>document.querySelector('#mpQR svg'),null,{timeout:5000});
  assert.ok(checks>=1,'recovers QR even when account list fails');assert.equal(creates,0);assert.equal(await p.evaluate(()=>mpLeerPendiente().saleId),before);assert.equal(await p.locator('#mpIniciarCobro').isVisible(),false);
  await p.evaluate(()=>{cerrarModal();const pending=mpLeerPendiente();pending.stage='claiming';mpGuardarPendiente(pending);vista='vender';render();});checks=0;
  await p.click('#mpRecuperarCobro');await p.waitForTimeout(500);
  assert.equal(checks,0,'transfer claim must not become a QR status query');assert.equal(await p.evaluate(()=>mpLeerPendiente().stage),'claiming');
  console.log(JSON.stringify({ok:true,width,recoveryWithoutAccountList:true,sameAttempt:true,newOrders:creates}));
 }finally{await h.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
