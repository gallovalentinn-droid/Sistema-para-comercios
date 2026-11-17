'use strict';
process.env.PW||='C:/Users/valen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
process.env.CHROME||='C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {openShadow,abrirTurno}=require('./browser-fixture/shadow.cjs');
async function main(){
 const width=Number(process.env.WIDTH||process.argv[2])||1366,h=await openShadow({width,height:900}),p=h.page;
 let accounts=[],qrPaid=false,cancelFail=false,claims=0,mode='normal';const linked=new Map();
 const receipt={saleId:'',paymentId:'123',accountId:'a',amountCents:450000,kind:'transfer',verifiedAt:new Date().toISOString()};
 await p.route(/\/(?:api|functions\/v1)\/mercadopago(?:\?.*)?$/,async route=>{const b=route.request().postDataJSON();let data={};
  if(b.action==='accounts')data={configured:accounts.length>0,capabilities:{transferVerification:true,newPayments:true},accounts};
  if(b.action==='transfer-start')data={attempt:{createdAt:new Date().toISOString()}};
  if(b.action==='receipts')data={receipts:[{id:'123',amountCents:450000,matches:true,eligible:true,date:new Date().toISOString(),payer:'Cliente de prueba',used:false},{id:'124',amountCents:250000,matches:false,eligible:true,date:new Date().toISOString(),payer:'Otra persona',used:false}]};
  if(b.action==='claim'){claims++;await new Promise(r=>setTimeout(r,100));data={receipt:{...receipt,saleId:b.saleId}};linked.set(b.saleId,data.receipt);}
  if(b.action==='qr-create')data={attempt:{id:'qr1',status:'created',qrData:'000201010212-micomercio-test'}};
  if(b.action==='qr-status'){data={attempt:{id:'qr1',status:qrPaid?'verified':'created'},receipt:qrPaid?{...receipt,saleId:b.saleId,kind:'qr'}:null};if(data.receipt)linked.set(b.saleId,data.receipt);}
  if(b.action==='qr-cancel'){if(cancelFail)return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({code:'CONEXION_NO_DISPONIBLE'})});data={attempt:{id:'qr1',status:'canceled'},receipt:null};}
  if(b.action==='sale-receipts')data={receipts:(b.saleIds||[]).map(id=>linked.get(id)).filter(Boolean)};
  if(mode==='auth-change'&&b.action==='receipts'){await p.evaluate(()=>sesion={...sesion,user:{...sesion.user,id:'otra-cuenta'}});}
  await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 const photo=async name=>{if(process.env.UX_OUTPUT_DIR){fs.mkdirSync(process.env.UX_OUTPUT_DIR,{recursive:true});await p.screenshot({path:path.join(process.env.UX_OUTPUT_DIR,width+'-'+name+'.png'),fullPage:true});}};
 async function sale(){await p.evaluate(async()=>{document.querySelectorAll('.ov').forEach(e=>e.remove());vista='vender';db.config.manejaTurnos=false;db.productos=[{id:'p-mp',nombre:'Producto de prueba',precio:4500,costo:1000,stock:20,stockBase:20,unidad:'unidad',rubro:'Almacén'}];ticket=[];seleccionarProducto(db.productos[0]);pago='transferencia';abrirModalPago();});await p.waitForSelector('#mpIniciarCobro',{timeout:3000});assert.equal(await p.locator('#mpBuscar').isVisible(),false,'comprobar se ofrece después de Cobrar');assert.equal(await p.locator('#mpCobroManual').isVisible(),false);assert.equal(await p.locator('#mpGenerarQR').isVisible(),true,'QR se ofrece desde el primer paso');}
 try{
  await abrirTurno(p);await sale();await p.waitForSelector('#mpEstado:has-text("conectar")');await photo('inicio-cobro');await photo('sin-conexion');
  await p.click('#mpIniciarCobro');assert.equal(await p.evaluate(()=>db.ventas.length),0,'el primer paso permite elegir cómo comprobar antes de registrar');await p.click('#mpVolverCobro');assert.equal(await p.locator('#mpIniciarCobro').isVisible(),true);await p.click('#mpIniciarCobro');if(await p.locator('#mpCobroManual').isVisible())await p.click('#mpCobroManual');await p.click('#mpManualConfirmar');await p.waitForSelector('.ov:has-text("registrada")');assert.match(await p.locator('.ov').innerText(),/Confirmada manualmente/);assert.equal(await p.evaluate(()=>db.ventas.length),1);
  accounts=[{id:'a',alias:'Local',primary:true,posId:'POS1'},{id:'b',alias:'Dueño',primary:false,posId:'POS2'}];
  await sale();await p.waitForSelector('#mpCuenta option[value="b"]',{state:'attached'});assert.equal(await p.inputValue('#mpCuenta'),'a');await p.click('#mpIniciarCobro');await p.click('#mpBuscar');await p.waitForSelector('[data-mp-ingreso="123"]');assert.equal(await p.locator('[data-mp-ingreso="124"]').count(),0);await photo('transferencias');
  await p.click('[data-mp-ingreso="123"]');assert.equal(claims,0);await p.locator('#mpConfirmarIngreso').dblclick().catch(()=>{});await p.waitForSelector('.ov:has-text("Transferencia verificada")');assert.equal(claims,1);assert.equal(await p.evaluate(()=>db.ventas.length),2);
  await sale();await p.waitForSelector('#mpCuenta option[value="a"]',{state:'attached'});await p.click('#mpGenerarQR');await p.waitForSelector('#mpQR svg');assert.equal(await p.evaluate(()=>db.ventas.length),2);await photo('qr-pendiente');
  assert.equal(await p.evaluate(()=>{cerrarModal();vista='caja';render();document.querySelector('#cerrarCaja').onclick();return document.body.innerText.includes('Terminá el cobro pendiente de Mercado Pago antes de cerrar la caja.');}),true,'el turno conserva el cobro pendiente');
  await p.evaluate(()=>{vista='vender';render();mpRestaurarPendiente();});await p.waitForSelector('#mpCuenta option[value="a"]',{state:'attached'});
  cancelFail=true;if(await p.locator('#mpCobroManual').isVisible())await p.click('#mpCobroManual');await p.click('#mpManualConfirmar');await p.waitForSelector('#mpEstado:has-text("recuperar")');assert.equal(await p.evaluate(()=>db.ventas.length),2);
  assert.equal(await p.evaluate(()=>cerrarVenta('efectivo')),false,'el cobro directo no saltea un QR pendiente');
  cancelFail=false;if(await p.locator('#mpCobroManual').isVisible())await p.click('#mpCobroManual');await p.click('#mpManualConfirmar');await p.waitForSelector('.ov:has-text("registrada")');assert.equal(await p.evaluate(()=>db.ventas.length),3);
  await sale();await p.waitForSelector('#mpCuenta option[value="a"]',{state:'attached'});await p.click('#mpGenerarQR');await p.waitForSelector('#mpQR svg');qrPaid=true;await p.click('#mpActualizarQR');await p.waitForSelector('.ov:has-text("QR verificado")');assert.equal(await p.evaluate(()=>db.ventas.length),4);await photo('qr-verificado');
  qrPaid=false;await sale();await p.waitForSelector('#mpCuenta option[value="a"]',{state:'attached'});await p.click('#mpGenerarQR');await p.waitForSelector('#mpQR svg');
  const saved=await p.evaluate(()=>({user:sesion,commerce:f3Estado.comercioId,device:f3Estado.deviceUuid,lease:f5Estado(),data:db,session:f3Estado.session,pending:mpLeerPendiente()}));
  await p.reload();await p.evaluate(async s=>{window.__f43ok=1;sesion=s.user;f3Estado.comercioId=s.commerce;f3Estado.deviceUuid=s.device;f3Estado.session=s.session;f3Estado.modo='shadow';f5ReemplazarEstado(s.lease);db=s.data;assertWritable=()=>({ok:true,causas:[]});enLinea=false;f6AsegurarProteccionDispositivo=async()=>{interfazProtegida=false;};await mostrarApp();ticket=[];pago='efectivo';vista='vender';render();},saved);
  assert.equal(await p.evaluate(()=>mpLeerPendiente().saleId),saved.pending.saleId,'el intento sobrevive una recarga real');
  await p.click('#mpRecuperarCobro',{timeout:3000});assert.equal(await p.evaluate(()=>ticket[0].precio),4500);await p.waitForSelector('#mpCuenta option[value="a"]',{state:'attached'});qrPaid=true;await p.click('#mpActualizarQR');await p.waitForSelector('.ov:has-text("QR verificado")');assert.equal(await p.evaluate(()=>db.ventas.length),5,'la recuperación registra una sola venta');
  await p.evaluate(()=>{document.querySelectorAll('.ov').forEach(e=>e.remove());vista='config';render();});await p.waitForSelector('#mpConfiguracion');await photo('configuracion');
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'sin desborde horizontal');
  assert.equal(h.errors.filter(x=>x.startsWith('pageerror')).length,0,JSON.stringify(h.errors));console.log(JSON.stringify({width,pass:true,sales:5,claims,reloadRecovery:true}));
 }finally{await h.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
