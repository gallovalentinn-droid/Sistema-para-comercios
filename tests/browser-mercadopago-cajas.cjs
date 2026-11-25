'use strict';
process.env.PW||='C:/Users/valen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
process.env.CHROME||='C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=require('node:assert/strict');
const {openShadow}=require('./browser-fixture/shadow.cjs');
async function main(){
 const width=Number(process.env.WIDTH)||1366,h=await openShadow({cobroConectado:true,width,height:900}),p=h.page;let posId='',saved=0;
 await p.route(/\/(?:api|functions\/v1)\/mercadopago(?:\?.*)?$/,async route=>{
  const b=route.request().postDataJSON();
  if(b.action==='accounts')return route.fulfill({json:{configured:true,accounts:[{id:'a',alias:'Local',primary:true,posId}]}});
  if(b.action==='positions')return route.fulfill({json:{positions:[{id:'@pos:123',name:'Caja creada en Mercado Pago'}]}});
  if(b.action==='set-position'){assert.equal(b.posId,'@pos:123');saved++;posId='MCsynthetic123';return route.fulfill({json:{ok:true}});}
  throw Error('Unexpected action '+b.action);
 });
 try{
  await p.evaluate(()=>{vista='config';render();});await p.waitForSelector('[data-mp-caja]');
  await p.click('[data-mp-caja]');await p.waitForSelector('#mpCajaQR');
  assert.match(await p.locator('#mpCajaQR').innerText(),/Caja creada en Mercado Pago/);
  await p.click('#mpGuardarCaja');await p.waitForFunction(()=>document.querySelector('#mpCuentasLista')?.textContent.includes('QR configurado'));
  assert.equal(saved,1);assert.equal(await p.locator('#mpCajaQR').count(),0);
  assert.deepEqual(h.errors.filter(x=>x.startsWith('pageerror:')),[]);
  console.log(JSON.stringify({ok:true,width,public:!!process.env.PUBLIC_URL,selectExistingBox:true,provider:'synthetic',realWrites:0}));
 }finally{await h.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
