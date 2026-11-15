'use strict';
process.env.PW||='C:/Users/valen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
process.env.CHROME||='C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=require('node:assert/strict');
const {openShadow}=require('./browser-fixture/shadow.cjs');
async function main(){
 const h=await openShadow({width:Number(process.env.WIDTH)||1366,height:900}),p=h.page;
 let configured=false,expired=false,starts=0,alias;
 await p.route('**/api/mercadopago',async route=>{
  const b=route.request().postDataJSON();
  if(b.action==='accounts')return route.fulfill({json:{configured,accounts:[]}});
  if(b.action==='oauth-start'){
   starts++;alias=b.alias;
   if(expired)return route.fulfill({status:409,json:{code:'APLICACION_NO_CONFIGURADA'}});
   return route.fulfill({json:{url:'https://auth.mercadopago.com/authorization?client_id=synthetic&state=synthetic'}});
  }
  throw new Error('Solicitud inesperada: '+b.action);
 });
 const config=async()=>{await p.evaluate(()=>{document.querySelectorAll('.ov').forEach(e=>e.remove());vista='config';render();});await p.waitForSelector('#mpCuentasEstado:not(:has-text("Consultando"))');};
 try{
  await config();
  assert.equal(await p.locator('#mpConectar').isVisible(),false,'sin aplicación no se promete conectar una cuenta');
  assert.equal(await p.locator('#mpCuentaNombre').isVisible(),false);
  assert.equal(await p.locator('#mpPrepararConexion').isVisible(),true);
  assert.equal(await p.locator('#mpPrepararConexion').getAttribute('href'),'https://www.mercadopago.com.ar/developers/panel/app');
  assert.equal(starts,0);
  configured=true;await config();
  assert.equal(await p.locator('#mpConectar').isVisible(),true);
  assert.equal(await p.locator('#mpPrepararConexion').isVisible(),false);
  expired=true;await p.click('#mpConectar');
  await p.waitForSelector('#mpPrepararConexion:visible');
  assert.equal(await p.locator('#mpConectar').isVisible(),false,'si el servidor pierde configuración, vuelve al alta explícita');
  assert.match(await p.locator('#mpCuentasEstado').innerText(),/MiComercio/);
  expired=false;await config();
  await p.route('https://auth.mercadopago.com/**',r=>r.fulfill({contentType:'text/html',body:'<h1>Autorización simulada</h1>'}));
  await p.click('#mpConectar');
  await p.waitForURL('https://auth.mercadopago.com/authorization?client_id=synthetic&state=synthetic');
  assert.equal(alias,'Mercado Pago','el nombre opcional no bloquea abrir la autorización');
  console.log(JSON.stringify({pass:true,width:Number(process.env.WIDTH)||1366,missingApplication:true,configurationLost:true,oauthNavigation:true}));
 }finally{await h.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
