'use strict';
process.env.PW||='C:/Users/valen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
process.env.CHROME||='C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=require('node:assert/strict'),{openShadow,abrirTurno}=require('./browser-fixture/shadow.cjs');
(async()=>{
 const width=Number(process.env.WIDTH)||1366;
 for(const recuperar of [true,false]){
  const h=await openShadow({width,height:900}),a=h.page;
  try{
   await abrirTurno(a);
   const state=await a.evaluate(()=>{
    db.config.verificarCobrosMP=false;db.ventas=[];db.productos=[{id:'p',nombre:'Producto',precio:100,costo:50,stock:10,unidad:'unidad'}];vista='vender';ticket=[];render();seleccionarProducto(db.productos[0]);pago='transferencia';
    return {user:sesion,commerce:f3Estado.comercioId,device:f3Estado.deviceUuid,lease:f5Estado(),data:db,session:f3Estado.session};
   });
   const b=await h.ctx.newPage();await b.goto(a.url());
   await b.evaluate(async s=>{window.__f43ok=1;sesion=s.user;f3Estado.comercioId=s.commerce;f3Estado.deviceUuid=s.device;f3Estado.session=s.session;f3Estado.modo='shadow';f5ReemplazarEstado(s.lease);db=s.data;assertWritable=()=>({ok:true,causas:[]});enLinea=false;f6AsegurarProteccionDispositivo=async()=>{interfazProtegida=false;};await mostrarApp();vista='vender';ticket=[];render();seleccionarProducto(db.productos[0]);pago='transferencia';},state);
   assert.equal(await a.evaluate(async()=>{guardar=()=>{throw Error('FALLO_DISCO_FICTICIO');};return mpConfirmarCobroManual();}),false);
   const id=await a.evaluate(()=>mpLeerPendiente().saleId);
   assert.equal(await b.evaluate(()=>mpTerminarCobro()),null,'Una segunda pestaña no cancela el guardado de la primera');
   assert.equal(await b.evaluate(()=>mpConfirmarCobroManual()),false,'Una segunda pestaña no lo registra');
   assert.equal(await b.evaluate(()=>mpLeerPendiente().saleId),id);
   if(recuperar)await a.close();else await a.reload();
   // El cierre de la página y la liberación del Web Lock usan tareas distintas.
   await b.evaluate(()=>navigator.locks.request('micomercio:manual:'+mpScope(),()=>true));
   if(recuperar){
    const result=await b.evaluate(()=>mpConfirmarCobroManual());
    assert.equal(result,true);
    assert.deepEqual(await b.evaluate(()=>({ids:db.ventas.map(v=>v.id),stock:db.productos[0].stock})),{ids:[id],stock:9});
   }else{
    assert.equal(await b.evaluate(()=>mpTerminarCobro()),'canceled');
    assert.deepEqual(await b.evaluate(()=>({ventas:db.ventas.length,stock:db.productos[0].stock})),{ventas:0,stock:10});
   }
   assert.equal(await b.evaluate(()=>mpLeerPendiente()),null);
   assert.deepEqual(h.errors.filter(e=>e.startsWith('pageerror')),[]);
  }finally{await h.close();}
 }
 console.log(JSON.stringify({width,pass:true,dosPestanas:true,cierreRecuperable:true,recargaCancelable:true}));
})().catch(e=>{console.error(e);process.exitCode=1;});
