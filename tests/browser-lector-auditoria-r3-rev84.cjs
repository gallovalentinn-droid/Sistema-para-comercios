process.env.PW||='C:/Users/valen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
process.env.CHROME||='C:/Program Files/Google/Chrome/Application/chrome.exe';
const {openShadow}=require('./browser-fixture/shadow.cjs'),assert=require('node:assert/strict');
const cases={
 async selection(p){
  const init=()=>{
   db.productos.push({id:'r3p',nombre:'Coca Cola 2.25L',costo:0,stock:0});
   abrirRevisionFactura({proveedor:'R3',total:18000,items:[{producto:'Texto desconocido',cantidad:2,precioUnit:9000,unidadesPorBulto:6,subtotal:18000,impuestoFila:0,revisionImporte:{status:'ok'},packDetectado:null}]});
   revisionFactura[0].porBulto=6;revisionFactura[0].candidatos=[{id:'r3p',nombre:'Coca Cola 2.25L'}];pintarRevision(document.querySelector('.ov'));
  };
  await p.evaluate(init);await p.selectOption('[data-rev-prod="0"]','r3p');
  const dropdown=await p.evaluate(()=>({bulto:revisionFactura[0].porBulto,pendiente:rev84EstadoRevision(revisionFactura[0]).pending}));
  assert.deepEqual(dropdown,{bulto:6,pendiente:true});
  await p.evaluate(init);await p.click('[data-rev-cand="0:0"]');
  assert.deepEqual(await p.evaluate(()=>({bulto:revisionFactura[0].porBulto,pendiente:rev84EstadoRevision(revisionFactura[0]).pending})),dropdown);
 },
 async labels(p){
  await p.evaluate(()=>abrirRevisionFactura({proveedor:'R3',items:[{producto:'Sin coincidencia alguna',cantidad:1,precioUnit:10,unidadesPorBulto:1,subtotal:10,revisionImporte:{status:'ok'}}]}));
  assert.equal(await p.locator('#revTabla .pill').first().innerText(),'Sin coincidencia');
  await p.evaluate(()=>{revisionFactura[0].candidatos=[{id:'pan',nombre:'Pan'}];pintarRevision(document.querySelector('.ov'));});
  assert.equal(await p.locator('#revTabla .pill').first().innerText(),'Elegí cuál es');
  await p.getByRole('button',{name:'No cargar esta fila',exact:true}).click();assert.equal(await p.locator('#okRev').isEnabled(),true);
 },
 async models(p){
  for(const [texto,n] of [['COCA COLA 2.25X6',6],['GAS.MANAOS COLA 2,25LTX6',6],['ALFAJOR GUAYMALLEN (X40)',40],['Producto sin pack',6]]){
   await p.evaluate(({texto,n})=>{
    db.productos=[{id:'r3p',nombre:texto,costo:0,stock:0}];remito=[];
    abrirRevisionFactura({proveedor:'R3',total:18000,items:[{producto:texto,cantidad:2,precioUnit:9000,unidadesPorBulto:n,subtotal:18000,impuestoFila:0,revisionImporte:{status:'ok'},packDetectado:null}]});
   },{texto,n});
   assert.equal(await p.locator('#okRev').isDisabled(),true,texto);
   assert.match(await p.locator('[data-label="Se carga"]').innerText(),/^Por confirmar/,texto);
   await p.selectOption('[data-rev-prod="0"]','r3p');await p.click(`[data-rev-stock="0:${n}"]`);assert.equal(await p.locator('#okRev').isEnabled(),true);
   await p.click('#okRev');assert.deepEqual(await p.evaluate(()=>remito.map(r=>({cant:r.cant,total:r.totalL}))),[{cant:2*n,total:'18000.00'}]);
  }
 },
 async changeAfterDecision(p){
  await p.evaluate(()=>{
   db.productos=[{id:'r3p',nombre:'Producto',costo:0,stock:0},{id:'r3q',nombre:'Otro producto',costo:0,stock:0}];
   abrirRevisionFactura({proveedor:'R3',total:18000,items:[{producto:'Producto',cantidad:2,precioUnit:9000,unidadesPorBulto:6,subtotal:18000,revisionImporte:{status:'ok'}}]});
  });
  await p.selectOption('[data-rev-prod="0"]','r3p');await p.click('[data-rev-stock="0:6"]');await p.selectOption('[data-rev-prod="0"]','r3q');
  assert.equal(await p.locator('[data-rev-bulto="0"]').inputValue(),'6');assert.equal(await p.locator('#okRev').isDisabled(),true);
  await p.click('[data-rev-stock="0:1"]');assert.equal(await p.locator('#okRev').isEnabled(),true);
 },
 async promotion(p){
  for(const [producto,cantidad,subtotal] of [['Producto',0,18000],['SALDO ANTERIOR',2,18000]]){
   await p.evaluate(({producto,cantidad,subtotal})=>{
    db.productos=[{id:'r3p',nombre:'Producto',costo:0,stock:0}];
    abrirRevisionFactura({proveedor:'R3',items:[{producto,cantidad,precioUnit:9000,unidadesPorBulto:6,subtotal,revisionImporte:{status:'ok'}}]});
   },{producto,cantidad,subtotal});
   assert.equal(await p.locator('#okRev').isEnabled(),true);
   await p.selectOption('[data-rev-prod="0"]','r3p');
   if(cantidad===0){await p.fill('[data-rev-cant="0"]','2');await p.locator('[data-rev-cant="0"]').dispatchEvent('change');}
   assert.equal(await p.locator('#okRev').isDisabled(),true,producto);
   assert.equal(await p.locator('[data-rev-bulto="0"]').inputValue(),'1');
   await p.click('[data-rev-stock="0:6"]');assert.equal(await p.locator('#okRev').isEnabled(),true);
  }
 },
 async largeModel(p){
  await p.evaluate(()=>{
   db.productos=[{id:'r3p',nombre:'Fernet',costo:0,stock:0}];
   abrirRevisionFactura({proveedor:'R3',items:[{producto:'FERNET BRANCA X750',cantidad:2,precioUnit:10000,unidadesPorBulto:750,subtotal:20000,revisionImporte:{status:'ok'},packDetectado:null}]});
  });
  assert.equal(await p.locator('#okRev').isDisabled(),true);assert.equal(await p.locator('[data-rev-stock="0:750"]').count(),0);
  assert.doesNotMatch(await p.locator('#revTabla').innerText(),/1500/);
  await p.selectOption('[data-rev-prod="0"]','r3p');await p.click('[data-rev-stock="0:1"]');
  assert.equal(await p.locator('#okRev').isEnabled(),true);
 }
};
(async()=>{let failed=0;for(const width of [1366,390])for(const [name,run] of Object.entries(cases)){
 if(process.argv[2]&&process.argv[2]!==name)continue;
 const h=await openShadow({width});h.page.setDefaultTimeout(5000);try{
  await run(h.page);assert.equal(await h.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(h.errors.filter(e=>e.startsWith('pageerror:')).length,0);console.log(JSON.stringify({width,case:name,passed:true}));
 }catch(e){failed++;console.error(JSON.stringify({width,case:name,passed:false,error:e.message}));}finally{await h.close();}
 }if(failed)process.exitCode=1;})().catch(e=>{console.error(e);process.exitCode=1;});
