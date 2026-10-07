process.env.PW||='C:/Users/valen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
process.env.CHROME||='C:/Program Files/Google/Chrome/Application/chrome.exe';
const test=require('node:test'),assert=require('node:assert/strict'),{openShadow}=require('./browser-fixture/shadow.cjs');
async function setup(existing=[]){const h=await openShadow({width:Number(process.env.TEST_WIDTH)||1366});try{await h.page.evaluate(existing=>{
 db.productos.push({id:'costp',nombre:'Pañales X8U',costo:1,precio:10,stock:0});remito=existing.map(l=>({...l,prodId:'costp',precio:''}));
 abrirRevisionFactura({proveedor:'Prueba',total:242,items:[{producto:'Pañales X8U',cantidad:2,precioUnit:100,descuento:0,descuentoFila:0,descuentoGlobalAsignado:0,impuestoFila:42,subtotal:242,packDetectado:8,revisionImporte:{status:'ok'},unidadesPorBulto:8}]});
 },existing);await h.page.selectOption('[data-rev-prod="0"]','costp');await h.page.locator('[data-rev-presentacion="0"] summary').click();await h.page.click('[data-rev-stock="0:8"]');await h.page.click('#okRev');return h;}catch(e){await h.close();throw e}}
test('REV84 edición de cantidad conserva costo de tres decimales hasta la operación',async()=>{
 const h=await setup();try{const p=h.page;assert.equal(await p.locator('[data-rcostou="0"]').inputValue(),'15,125');await p.locator('[data-rcostou="0"]').dispatchEvent('change');await p.click('[data-ra="0"]');const value=await p.evaluate(()=>({cost:costoLinea(remito[0],db.productos.find(p=>p.id==='costp')),total:remito[0].totalL}));assert.equal(value.cost,15.125);assert.equal(value.total,'257.13');
 await p.evaluate(()=>{window.__operation=[];movimiento=(id,type,qty,reason,other,extra)=>__operation.push({id,type,qty,extra});guardar=()=>{};render=()=>{}});await p.click('#okIng');const operation=await p.evaluate(()=>__operation[0]);assert.equal(operation.qty,17);assert.equal(operation.extra.costoNuevo,15.125);
 }finally{await h.close()}
});
for(const [name,line,units,total] of [['bultos',{cant:2,porBulto:8,costoU:'100',totalL:'200.00',descuento:0},32,442],['descuento neto',{cant:1,porBulto:1,costoU:'100',totalL:'100.00',descuento:10},17,332]])test(`REV84 fusión conserva ${name} sin multiplicar ni descontar dos veces`,async()=>{
 const h=await setup([line]);try{const value=await h.page.evaluate(()=>({units:unidadesLinea(remito[0]),total:costoLinea(remito[0],db.productos.find(p=>p.id==='costp'))*unidadesLinea(remito[0])}));assert.equal(value.units,units);assert.ok(Math.abs(value.total-total)<1e-8);}finally{await h.close()}
});
test('REV84 mantiene renglón sin costo sin inventarle un importe al fusionar',async()=>{
 const h=await setup([{cant:1,porBulto:1,costoU:'',totalL:'',descuento:0}]);try{const lines=await h.page.evaluate(()=>remito);assert.equal(lines.length,2);assert.equal(lines[0].costoU,'');assert.equal(lines[1].cant,16);}finally{await h.close()}
});
test('REV84 descuento general se redistribuye al corregir y avisa memoria no guardada',async()=>{
 const h=await openShadow({width:Number(process.env.TEST_WIDTH)||1366});try{const p=h.page;
 await p.evaluate(()=>{db.productos.push({id:'gp',nombre:'Producto A',costo:1,precio:5,stock:0},{id:'gq',nombre:'Producto B',costo:1,precio:5,stock:0});abrirRevisionFactura({proveedor:'Prueba',total:10,descuentoGlobal:100,items:[{producto:'Producto A',cantidad:1,precioUnit:100,unidadesPorBulto:1,descuento:50,descuentoFila:0,descuentoGlobalAsignado:50,impuestoFila:0,subtotal:10,revisionImporte:{status:'mismatch'}},{producto:'Producto B',cantidad:1,precioUnit:100,unidadesPorBulto:1,descuento:50,descuentoFila:0,descuentoGlobalAsignado:50,impuestoFila:0,subtotal:100,revisionImporte:{status:'ok'}}]},{memoria:{filas:{},decisionAvailable:false}})});
 assert.match(await p.locator('#ov').innerText(),/No se pudo recordar.*stock/);await p.selectOption('[data-rev-prod="0"]','gp');await p.selectOption('[data-rev-prod="1"]','gq');assert.equal(await p.locator('#okRev').isDisabled(),true);
 await p.fill('[data-rev-costo="0"]','10');await p.locator('[data-rev-costo="0"]').dispatchEvent('change');assert.equal(await p.locator('#okRev').isEnabled(),true);
 await p.fill('#rev84DescuentoGeneral','120');await p.locator('#rev84DescuentoGeneral').dispatchEvent('change');assert.equal(await p.locator('#okRev').isDisabled(),true);
 await p.fill('#rev84DescuentoGeneral','100');await p.locator('#rev84DescuentoGeneral').dispatchEvent('change');await p.click('#okRev');assert.equal(await p.evaluate(()=>remito.reduce((s,l)=>s+l.rev84Importe.centavos,0)),1000);
 }finally{await h.close()}
});
test('REV84 presentación ambigua pregunta y permite confirmar otra cantidad',async()=>{
 const h=await openShadow({width:Number(process.env.TEST_WIDTH)||1366});try{const p=h.page;await p.evaluate(()=>{db.productos.push({id:'amb',nombre:'Producto X8U X12U',costo:1,precio:5,stock:0});abrirRevisionFactura({proveedor:'Prueba',total:200,items:[{producto:'Producto X8U X12U',cantidad:2,precioUnit:100,unidadesPorBulto:12,descuento:0,subtotal:200,impuestoFila:0,packDetectado:null,packAmbiguo:true,revisionImporte:{status:'ok'}}]})});await p.selectOption('[data-rev-prod="0"]','amb');assert.equal(await p.locator('#okRev').isDisabled(),true);
 await p.fill('[data-rev-bulto="0"]','8');await p.locator('[data-rev-bulto="0"]').dispatchEvent('change');await p.click('[data-rev-manual="0"]');assert.equal(await p.locator('#okRev').isEnabled(),true);await p.click('#okRev');assert.equal(await p.evaluate(()=>remito[0].cant),16);
 }finally{await h.close()}
});
