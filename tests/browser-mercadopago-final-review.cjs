'use strict';
process.env.PW||='C:/Users/valen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
process.env.CHROME||='C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=require('node:assert/strict');const {openShadow,abrirTurno}=require('./browser-fixture/shadow.cjs');
async function main(){const width=Number(process.env.WIDTH)||1366,h=await openShadow({width,height:900}),p=h.page;let paused=true,disconnected=false,terminal='canceled',manuals=0;const requests=[];
 await p.route('**/functions/v1/mercadopago',async r=>{const b=r.request().postDataJSON();requests.push(b);let data;
  if(b.action==='accounts')data={configured:true,capabilities:{transferVerification:true,newPayments:!disconnected},accounts:disconnected?[]:[{id:'a',alias:'Local',primary:true,posId:'POS1'}]};
  else if(b.action==='qr-create'&&paused)return r.fulfill({status:409,json:{code:'COBROS_NO_HABILITADOS'}});
  else if(['qr-status','qr-cancel'].includes(b.action))data={attempt:{status:terminal},receipt:null};
  else if(b.action==='manual'){manuals++;data={ok:true};}
  else throw Error('Unexpected MP action '+b.action);
  return r.fulfill({json:data});
 });
 try{await abrirTurno(p);await p.evaluate(()=>{mpPublico=()=>true;});
 const sale=async()=>{await p.evaluate(()=>{document.querySelectorAll('.ov').forEach(e=>e.remove());vista='vender';db.config.manejaTurnos=false;db.productos=[{id:'p-mp',nombre:'Prueba',precio:4500,costo:1000,stock:20,stockBase:20,unidad:'unidad'}];ticket=[];seleccionarProducto(db.productos[0]);pago='transferencia';abrirModalPago();});await p.waitForSelector('#mpEstado:not(:has-text("Consultando"))');};
 await sale();await p.click('#mpGenerarQR');await p.waitForFunction(()=>!mpOperacionOcupada);assert.match(await p.locator('#mpEstado').innerText(),/pausados.*manualmente/,'server pause after enabled accounts must explain pause and manual recovery');assert.ok(await p.evaluate(()=>mpLeerPendiente()),'HTTP pause preserves snapshot');assert.equal(await p.evaluate(()=>db.ventas.length),0);
 // Rollback procedure: keep this public transport, pause new payments, recover pending.
 disconnected=true;await p.click('#mpCobroManual');await p.waitForSelector('.ov:has-text("registrada")');assert.equal(await p.evaluate(()=>db.ventas.length),1);assert.equal(manuals,1);assert.equal(await p.evaluate(()=>mpLeerPendiente()),null);
 for(const status of ['canceled','expired']){terminal=status;await sale();await p.evaluate(async()=>{const snapshot=mpSnapshot(),fingerprint=await mpFingerprint(snapshot);mpGuardarPendiente({saleId:uid(),accountId:'a',fingerprint,amount:'4500.00',snapshot,stage:'qr',scope:mpScope()});});
  const saved=await p.evaluate(()=>({user:sesion,commerce:f3Estado.comercioId,device:f3Estado.deviceUuid,lease:f5Estado(),data:db,session:f3Estado.session,pending:mpLeerPendiente()}));
  await p.reload();await p.evaluate(async s=>{window.__f43ok=1;sesion=s.user;f3Estado.comercioId=s.commerce;f3Estado.deviceUuid=s.device;f3Estado.session=s.session;f3Estado.modo='shadow';f5ReemplazarEstado(s.lease);db=s.data;assertWritable=()=>({ok:true,causas:[]});enLinea=false;f6AsegurarProteccionDispositivo=async()=>{interfazProtegida=false;};mpPublico=()=>true;await mostrarApp();ticket=[];pago='efectivo';vista='vender';render();},saved);
  await p.click('#mpRecuperarCobro');await p.waitForFunction(s=>mpLeerPendiente()?.stage===s,status);assert.equal(await p.inputValue('#mpCuenta'),'','disconnected account is absent but saved accountId remains');await p.click('#mpCobroManual');await p.waitForSelector('.ov:has-text("registrada")');assert.equal(await p.evaluate(()=>mpLeerPendiente()),null);
 }
 assert.equal(await p.evaluate(()=>db.ventas.length),3);assert.equal(manuals,3);assert.equal(requests.filter(b=>b.action==='qr-create').length,1,'recovery never creates a new provider payment');assert.ok(requests.filter(b=>['qr-cancel','qr-status','manual'].includes(b.action)).every(b=>b.accountId==='a'));assert.deepEqual(h.errors.filter(x=>x.startsWith('pageerror:')),[]);console.log(JSON.stringify({ok:true,width,serverPause:true,rollbackPublicTransport:true,disconnectedTerminalReload:true,sales:3}));
 }finally{await h.close();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
