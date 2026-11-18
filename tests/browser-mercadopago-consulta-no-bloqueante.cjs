'use strict';
process.env.PW||='C:/Users/valen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
process.env.CHROME||='C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=require('node:assert/strict');const {openShadow,abrirTurno}=require('./browser-fixture/shadow.cjs');
async function main(){
 const width=Number(process.env.WIDTH)||1366,h=await openShadow({width,height:900}),p=h.page;let checks=0,cancels=0,manuals=0,release,queryReceived;
 const held=new Promise(r=>release=r);
 const queryStarted=new Promise(r=>queryReceived=r);
 await p.route(/\/(?:api|functions\/v1)\/mercadopago(?:\?.*)?$/,async route=>{
  const b=route.request().postDataJSON();
  if(b.action==='accounts')return route.fulfill({json:{configured:true,capabilities:{newPayments:true},accounts:[{id:'a',alias:'Local',primary:true,posId:'POS1'}]}});
  if(b.action==='qr-create')return route.fulfill({json:{attempt:{status:'created',qrData:'000201010212synthetic'}}});
  if(b.action==='qr-status'){checks++;queryReceived();await held;return route.fulfill({json:{attempt:{status:'created'},receipt:null}});}
  if(b.action==='qr-cancel'){cancels++;return route.fulfill({json:{attempt:{status:'canceled'},receipt:null}});}
  if(b.action==='manual'){manuals++;return route.fulfill({json:{ok:true}});}
  if(b.action==='sale-receipts')return route.fulfill({json:{receipts:[]}});
  throw Error(b.action);
 });
 try{
  await abrirTurno(p);await p.evaluate(()=>{vista='vender';db.config.manejaTurnos=false;db.productos=[{id:'p',nombre:'Prueba',precio:300,costo:100,stock:10,stockBase:10,unidad:'unidad'}];ticket=[];seleccionarProducto(db.productos[0]);pago='transferencia';abrirModalPago();});
  await p.waitForSelector('#mpCuenta option[value="a"]',{state:'attached'});await p.click('#mpGenerarQR');await p.click('#mpContinuarCobro');await p.waitForSelector('#mpQR svg');
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Automatic status query not received')),6000);queryStarted.then(()=>{clearTimeout(timer);resolve();},reject);});
  assert.equal(checks,1);assert.equal(await p.locator('#mpCobroManual').isDisabled(),false,'background query keeps cancellation available');
  if(await p.locator('#mpCobroManual').isVisible())await p.click('#mpCobroManual');await p.click('#mpManualConfirmar');assert.equal(cancels,0,'user action waits for outstanding status query');
  release();await p.waitForSelector('.ov:has-text("Confirmada manualmente")');
  assert.equal(cancels,1);assert.equal(manuals,1);assert.equal(await p.evaluate(()=>db.ventas.length),1);
  console.log(JSON.stringify({ok:true,width,backgroundControlsEnabled:true,queuedClickCompleted:true,oneSale:true}));
 }finally{release();await h.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
