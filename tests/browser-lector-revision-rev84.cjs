process.env.PW||='C:/Users/valen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
process.env.CHROME||='C:/Program Files/Google/Chrome/Application/chrome.exe';
const {openShadow}=require('./browser-fixture/shadow.cjs'),assert=require('node:assert/strict');
(async()=>{for(const width of [1366,390]){
 const h=await openShadow({width,publicUrl:process.env.PUBLIC_BETA||null});try{const p=h.page;
 await p.evaluate(()=>{
  window.__before=JSON.stringify(db.productos);db.productos.push({id:'rev84p',nombre:'Pañales X8U',costo:1,precio:10,stock:0});window.__before=JSON.stringify(db.productos);
  abrirRevisionFactura({proveedor:'Prueba',total:242,items:[{producto:'Pañales X8U',cantidad:2,precioUnit:100,unidadesPorBulto:1,descuento:0,descuentoFila:0,descuentoGlobalAsignado:0,impuestoFila:42,subtotal:242,packDetectado:8,revisionImporte:{status:'ok'}}]});
 });
 assert.equal(await p.locator('[data-rev-impuesto],[data-rev-subtotal]').count(),0);
 assert.doesNotMatch(await p.locator('#revTabla tbody').innerText(),/Impuesto de la fila|Subtotal impreso|Calculado:|diferencia:/i);
 assert.equal(await p.locator('#okRev').isDisabled(),true);
 await p.evaluate(()=>document.querySelector('#okRev').onclick());assert.equal(await p.evaluate(()=>remito.length),0);
 await p.selectOption('[data-rev-prod="0"]','rev84p');
 await p.click('[data-rev-stock="0:8"]');assert.equal(await p.locator('#okRev').isEnabled(),true);
 await p.fill('[data-rev-costo="0"]','101');await p.locator('[data-rev-costo="0"]').dispatchEvent('change');assert.equal(await p.locator('#okRev').isDisabled(),true);
 await p.fill('[data-rev-costo="0"]','100');await p.locator('[data-rev-costo="0"]').dispatchEvent('change');
 assert.equal(await p.locator('#okRev').isEnabled(),true);
 assert.match(await p.locator('[data-label="Se carga"]').innerText(),/15,125/);
 await p.evaluate(()=>{revisionFactura[0].subtotal=null;revisionFactura[0].importeConfirmado=false;pintarRevision(document.querySelector('.ov'));});assert.equal(await p.locator('#okRev').isDisabled(),true);
 for(const [attr,newValue,oldValue] of [['cant','3','2'],['costo','101','100'],['dto','1','0']]){
  await p.check('[data-rev-confirmar="0"]');assert.equal(await p.locator('#okRev').isEnabled(),true);
  await p.fill(`[data-rev-${attr}="0"]`,newValue);await p.locator(`[data-rev-${attr}="0"]`).dispatchEvent('change');assert.equal(await p.locator('#okRev').isDisabled(),true);
  await p.fill(`[data-rev-${attr}="0"]`,oldValue);await p.locator(`[data-rev-${attr}="0"]`).dispatchEvent('change');
 }
 await p.check('[data-rev-confirmar="0"]');
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await p.click('#okRev');const line=await p.evaluate(()=>remito[0]);assert.equal(line.cant,16);assert.equal(Number(line.costoU),15.125);assert.equal(line.totalL,'242.00');
 assert.equal(await p.evaluate(()=>costoLinea(remito[0],db.productos.find(p=>p.id==='rev84p'))*16),242);
 assert.equal(await p.evaluate(()=>JSON.stringify(db.productos)===window.__before),true);
 assert.equal(h.errors.filter(e=>e.startsWith('pageerror:')).length,0);
 console.log(JSON.stringify({width,reviewPassed:true,stockWrites:0}));
 }finally{await h.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
