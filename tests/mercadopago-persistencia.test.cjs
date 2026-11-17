'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
function setup({syncFailure=false}={}){
 const memory=new Map(),html=fs.readFileSync(require('node:path').join(__dirname,'../beta/index.html'),'utf8').replaceAll('\r\n','\n');
 const close=html.slice(html.indexOf('function cerrarVenta('),html.indexOf('\nfunction ticketImpreso('));let saves=0;
 const c=vm.createContext({structuredClone,TextEncoder,crypto:crypto.webcrypto,Date,Promise,Set,console,setTimeout:()=>0,
 localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},
 sesion:{user:{id:'u'}},f3Estado:{comercioId:'c',deviceUuid:'d',cajaCodigo:'caja'},ticket:[{id:'line',tipo:'producto',prodId:'p',nombre:'Producto',cant:1,precio:100}],pago:'transferencia',pagoMixto:[],dto:{},recibido:'',clienteFiado:'',uid:()=> 'sale',
 db:{ventas:[],productos:[{id:'p',stock:10}],config:{nroVenta:1}},ventaEnProceso:false,amount:100,estadoTurnoRev31:()=>({requiereApertura:false}),productoArchivadoRev31:()=>false,
 totalTicket:()=>c.amount,prod:id=>c.db.productos.find(p=>p.id===id),f3Activo:()=>false,deviceId:'d',f5TicketRef:()=> 'ref',DIAS_PLAZO_FIADO:()=>7,subtotalTicket:()=>100,montoDescuento:()=>0,descuentoPromoAuto:()=>100-c.amount,detallePromoAuto:()=>[],descuentoPromoPago:()=>0,promoPagoPct:()=>0,
 buildVentaItem:i=>({...i}),asignarNetosVenta:()=>{},movimiento:()=>{},f5CamposSesionLocal:()=>({}),f5EstamparSesionLocal:()=>{},f3OperacionVenta:v=>v,f5ExigirEscritura:()=>{},
 guardar:()=>{saves++;if(syncFailure&&saves===1)throw new Error('SYNC_BARRIER');return Promise.resolve();},limpiarDescuento:()=>{},pintarPOS:()=>{},pintarNav:()=>{},ticketImpreso:()=>{},aviso:()=>{},render:()=>{},$:()=>null,FORMAS:{transferencia:'Transferencia'},$m:String,num:Number});
 vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../beta/mercadopago.js'),'utf8')+'\n'+close,c);
 return {c,saves:()=>saves};
}
test('guardar síncrono fallido se reintenta sin perder venta ni descontar stock otra vez',async()=>{
 const {c,saves}=setup({syncFailure:true});
 await vm.runInContext(`(async()=>{const p=await mpPreparar('a');try{await mpCompletar({paymentId:'1',amountCents:10000},p);}catch{}await mpCompletar({paymentId:'1',amountCents:10000},p);})()`,c);
 assert.equal(saves(),2);assert.equal(c.db.ventas.length,1);assert.equal(c.db.productos[0].stock,9);assert.equal(c.ventaEnProceso,false);assert.equal(vm.runInContext('mpLeerPendiente()',c),null);
});
test('una promoción cambiada mientras espera QR no altera el total cobrado ni su desglose',async()=>{
 const {c}=setup();await vm.runInContext(`(async()=>{const p=await mpPreparar('a');amount=90;await mpCompletar({paymentId:'1',amountCents:10000},p);})()`,c);
 assert.equal(c.db.ventas[0].total,100);assert.equal(c.db.ventas[0].promoAuto,0);assert.equal(c.db.ventas[0].items[0].precio,100);
});
test('un guardado manual pendiente no se puede convertir en un cobro QR',async()=>{const {c}=setup();await vm.runInContext(`(async()=>{const p=await mpPreparar('a');p.stage='manual';mpGuardarPendiente(p);})()`,c);await assert.rejects(vm.runInContext("mpPreparar('a')",c),/MANUAL_PENDIENTE/);});
test('cambiar de usuario durante la confirmación no lleva la venta al usuario nuevo',async()=>{const {c}=setup();await assert.rejects(vm.runInContext(`(async()=>{const p=await mpPreparar('a');const closing=mpCompletar({paymentId:'1',amountCents:10000},p);sesion.user.id='otra';await closing;})()`,c),/SESION_INVALIDA/);assert.equal(c.db.ventas.length,0);});
test('cerrar pago anterior conserva el borrador nuevo aunque falle el guardado y al reintentar no duplica stock',async()=>{
 const {c,saves}=setup({syncFailure:true});c.document={querySelector:()=>null};
 await vm.runInContext(`(async()=>{mpRequest=async()=>({receipt:{paymentId:'1',amountCents:10000}});await mpPreparar('a');ticket=[{id:'new',tipo:'producto',prodId:'p',nombre:'Borrador nuevo',cant:2,precio:100}];await mpTerminarCobro();})()`,c);
 assert.equal(c.ticket[0].id,'new');assert.equal(c.ticket[0].cant,2);assert.equal(c.db.ventas.length,1);assert.equal(c.db.productos[0].stock,9);
 await vm.runInContext('mpTerminarCobro()',c);assert.equal(c.ticket[0].id,'new');assert.equal(c.ticket[0].cant,2);assert.equal(c.db.ventas.length,1);assert.equal(c.db.productos[0].stock,9);assert.equal(saves(),2);assert.equal(vm.runInContext('mpLeerPendiente()',c),null);
});
test('cerrar completa manual remoto cuya respuesta se perdio, sin descartar la venta',async()=>{const {c}=setup();c.document={querySelector:()=>null};await vm.runInContext(`(async()=>{mpRequest=async()=>({attempt:{status:'manual'}});const p=await mpPreparar('a');p.stage='transfer';mpGuardarPendiente(p);await mpTerminarCobro();})()`,c);assert.equal(c.db.ventas.length,1);assert.equal(c.db.ventas[0].mpCobro.estado,'manual');assert.equal(c.db.productos[0].stock,9);assert.equal(vm.runInContext('mpLeerPendiente()',c),null);});
test('fallo al guardar recibo conserva borrador nuevo y evidencia del cobro anterior',async()=>{const {c}=setup();c.document={querySelector:()=>null};await vm.runInContext(`(async()=>{mpRequest=async()=>({receipt:{paymentId:'1',amountCents:10000}});await mpPreparar('a');ticket=[{id:'new',tipo:'producto',prodId:'p',nombre:'Borrador nuevo',cant:2,precio:100}];localStorage.setItem=()=>{throw Error('DISCO_LLENO');};await mpTerminarCobro();})()`,c);assert.equal(c.ticket[0].id,'new');assert.equal(c.db.ventas.length,0);assert.ok(vm.runInContext('mpLeerPendiente()',c));});
