'use strict';
process.env.PW||='C:/Users/valen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
process.env.CHROME||='C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=require('node:assert/strict');const {openShadow,abrirTurno}=require('./browser-fixture/shadow.cjs');
async function main(){
 const width=Number(process.env.WIDTH)||1366,h=await openShadow({width,height:900}),p=h.page;let checks=0,release,receipt=null;
 const hold=new Promise(r=>release=r);
 await p.route(/\/(?:api|functions\/v1)\/mercadopago(?:\?.*)?$/,async route=>{
  const b=route.request().postDataJSON();
  if(b.action==='accounts')return route.fulfill({json:{configured:true,capabilities:{newPayments:true},accounts:[{id:'a',alias:'Local',primary:true,posId:'POS1'}]}});
  if(b.action==='qr-create'){await hold;return route.fulfill({json:{attempt:{status:'created',qrData:'000201010212synthetic'}}});}
  if(b.action==='qr-status'){
   checks++;if(checks===1)return route.fulfill({status:409,json:{code:'COBRO_OCUPADO'}});
   receipt={saleId:b.saleId,paymentId:'synthetic',accountId:'a',amountCents:450000,kind:'qr',verifiedAt:new Date().toISOString()};return route.fulfill({json:{attempt:{status:'verified'},receipt}});
  }
  if(b.action==='sale-receipts')return route.fulfill({json:{receipts:receipt?[receipt]:[]}});
  throw Error(b.action);
 });
 try{
  await abrirTurno(p);await p.evaluate(()=>{vista='vender';db.config.manejaTurnos=false;db.productos=[{id:'p',nombre:'Prueba',precio:4500,costo:1000,stock:10,stockBase:10,unidad:'unidad'}];ticket=[];seleccionarProducto(db.productos[0]);pago='transferencia';abrirModalPago();});
  await p.waitForSelector('#mpCuenta option[value="a"]',{state:'attached'});await p.click('#mpGenerarQR');await p.click('#mpContinuarCobro');
  if(!process.env.POLL_ONLY){await p.waitForSelector('#mpQR[aria-busy="true"]',{timeout:2500});
  assert.match(await p.locator('#mpQR').innerText(),/Generando QR/);assert.equal(await p.locator('#mpGenerarQR').isDisabled(),true);}
  release();await p.waitForSelector('#mpQR svg');if(!process.env.POLL_ONLY)assert.equal(await p.locator('#mpQR').getAttribute('aria-busy'),'false');
  assert.match(await p.locator('#mpAyudaQR').innerText(),/cuenta distinta/);
  assert.match(await p.locator('#mpAyudaQR').innerText(),/panel abierto.*cerrarlo se cancela/i);
  await p.waitForSelector('.ov:has-text("QR verificado")',{timeout:22000});
  assert.ok(checks>=2);assert.equal(await p.evaluate(()=>db.ventas.length),1);assert.equal(await p.evaluate(()=>mpLeerPendiente()),null);
  console.log(JSON.stringify({ok:true,width,generating:true,automaticRetryAfter409:true,verifiedSaleOnce:true}));
 }catch(e){console.error(JSON.stringify({checks,errors:h.errors,state:await p.locator('#mpEstado').allTextContents(),pending:await p.evaluate(()=>mpLeerPendiente()?.stage),sales:await p.evaluate(()=>db.ventas.length)}));throw e;}finally{release();await h.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
