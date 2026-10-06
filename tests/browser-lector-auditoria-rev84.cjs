process.env.PW||='C:/Users/valen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
process.env.CHROME||='C:/Program Files/Google/Chrome/Application/chrome.exe';
const {openShadow}=require('./browser-fixture/shadow.cjs'),assert=require('node:assert/strict');
(async()=>{for(const width of [1366,390]){
 const h=await openShadow({width});try{const p=h.page;
 await p.evaluate(()=>{
  db.productos.push({id:'auditp',nombre:'GASEOSA COCA COLA 2.25L X6',costo:1,precio:10,stock:0});
  abrirRevisionFactura({proveedor:'Prueba',total:18121,iaFallbackUsed:true,iaFallbackDiagnostic:{providerCategory:'API_KEY_INVALID',providerStatus:401},items:[
   {producto:'GASEOSA COCA COLA 2.25L X6',cantidad:2,precioUnit:9000,unidadesPorBulto:6,descuento:0,subtotal:18000,impuestoFila:0,packDetectado:6,revisionImporte:{status:'ok'}},
   {producto:'Producto desconocido',cantidad:1,precioUnit:121,unidadesPorBulto:1,descuento:0,subtotal:121,impuestoFila:0,packDetectado:null,revisionImporte:{status:'ok'}}]});
 });
 assert.equal(await p.locator('#okRev').isDisabled(),true);
 assert.match(await p.locator('[data-label="Se carga"]').first().innerText(),/2.*unidades/s);
 assert.match(await p.locator('[data-rev-admin]').innerText(),/Gemini/);
 await p.selectOption('[data-rev-prod="0"]','auditp');await p.click('[data-rev-stock="0:6"]');
 assert.equal(await p.locator('#okRev').isDisabled(),true);
 await p.getByRole('button',{name:'No cargar esta fila',exact:true}).click();
 assert.equal(await p.locator('#okRev').isEnabled(),true);
 await p.click('#okRev');assert.deepEqual(await p.evaluate(()=>remito.map(r=>({cant:r.cant,costo:r.costoU,total:r.totalL}))),[{cant:12,costo:1500,total:'18000.00'}]);
 await p.evaluate(()=>abrirRevisionFactura({proveedor:'Prueba',total:121,items:[{producto:'Unidad X1U',cantidad:1,precioUnit:121,unidadesPorBulto:1,descuento:0,subtotal:121,impuestoFila:0,packDetectado:1,revisionImporte:{status:'ok'}}]}));
 await p.selectOption('[data-rev-prod="0"]','auditp');assert.equal(await p.locator('[data-rev-stock]').count(),0);assert.equal(await p.locator('#okRev').isEnabled(),true);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.equal(h.errors.filter(e=>e.startsWith('pageerror:')).length,0);
 console.log(JSON.stringify({width,barePack:true,explicitDiscard:true,singlePack:true,adminFallback:true}));
 }finally{await h.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
