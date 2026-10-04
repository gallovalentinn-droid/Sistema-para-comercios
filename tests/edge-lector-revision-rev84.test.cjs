const test=require('node:test'),assert=require('node:assert/strict');
const load=async()=>({gem:await import('../supabase/functions/_shared/f6-invoice-reader.mjs'),gpt:await import('../supabase/functions/_shared/f6-openai-invoice-reader.mjs')});
const row=(extra={})=>({producto:'ALFAJOR X 12 UNI',codigo:'001',descripcion:'Alfajor',cantidad:1,unidadesPorBulto:1,precioUnit:100,descuento:0,subtotal:100,impuestoFila:0,...extra});
const doc=items=>({proveedor:'Proveedor',nroComprobante:'1',total:0,descuentoGlobal:0,saldoAnterior:0,pagosACuenta:0,items});
const gem=d=>({status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(d)}]}]});
const gpt=d=>({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(d)}]}]});
test('REV84 devuelve 38 filas por ambos modelos y marca solo la discordante sin forzar stock',async()=>{
 const m=await load();const d=doc(Array.from({length:38},(_,i)=>row({codigo:String(i+1),subtotal:i===37?99:100})));
 for(const [fn,input] of [[m.gem.extractGeminiInvoice,gem(d)],[m.gpt.extractOpenAIInvoice,gpt(d)]]){
  const result=fn(input,{reviewMode:true});assert.equal(result.items.length,38);
  assert.equal(result.items[0].revisionImporte?.status,'ok');assert.equal(result.items[37].revisionImporte?.status,'mismatch');
  assert.equal(result.items[37].revisionImporte.difference,1);assert.equal(result.items[37].revisionImporte.tolerance,.02);
  assert.equal(result.items[0].packDetectado,12);assert.equal(result.items[0].unidadesPorBulto,1);
 }
});
test('REV84 conserva impuesto y evidencia anterior al reparto global sin duplicar descuento',async()=>{
 const m=await load();const d={...doc([row({impuestoFila:21,subtotal:121})]),descuentoGlobal:10};
 for(const [fn,input] of [[m.gem.extractGeminiInvoice,gem(d)],[m.gpt.extractOpenAIInvoice,gpt(d)]]){
  const item=fn(input,{reviewMode:true}).items[0];assert.equal(item.subtotal,121);assert.equal(item.impuestoFila,21);
  assert.equal(item.revisionImporte?.status,'ok');assert.equal(item.descuentoFila,0);assert.equal(item.descuentoGlobalAsignado,10);
 }
});
test('REV84 subtotal ausente se marca, tax negativo o números como texto siguen rechazados',async()=>{
 const m=await load();for(const [fn,encode] of [[m.gem.extractGeminiInvoice,gem],[m.gpt.extractOpenAIInvoice,gpt]]){
  assert.equal(fn(encode(doc([row({subtotal:null})])),{reviewMode:true}).items[0].revisionImporte?.status,'missing');
  for(const extra of [{impuestoFila:-1},{cantidad:'1'},{precioUnit:-1},{subtotal:-1}])assert.throws(()=>fn(encode(doc([row(extra)])),{reviewMode:true}));
 }
});
test('REV84 tolerancia firme en 198/200 y packs excluyen pesos, códigos y ambigüedad',async()=>{
 const m=await load();for(const [fn,encode] of [[m.gem.extractGeminiInvoice,gem],[m.gpt.extractOpenAIInvoice,gpt]]){
  for(const [cantidad,status] of [[198,'mismatch'],[200,'ok'],[144,'mismatch']]){
   const extra=cantidad===144?{precioUnit:1234.57,subtotal:177773.76}:{subtotal:cantidad*100-1};
   assert.equal(fn(encode(doc([row({cantidad,...extra})])),{reviewMode:true}).items[0].revisionImporte?.status,status);
  }
  for(const [producto,want] of [['X8U',8],['X 12 UN',12],['TIRA X 10 UNI',10],['800 G',null],['(X12U)',null],['X8U X12U',null]])
   assert.equal(fn(encode(doc([row({producto})])),{reviewMode:true}).items[0].packDetectado,want);
 }
});
test('REV84 impuesto omitido y porcentaje mal convertido quedan marcados por ambos proveedores',async()=>{
 const m=await load();for(const [fn,encode] of [[m.gem.extractGeminiInvoice,gem],[m.gpt.extractOpenAIInvoice,gpt]]){
  for(const extra of [{subtotal:121,impuestoFila:0},{cantidad:2,precioUnit:100,descuento:5,subtotal:190}]){
   const item=fn(encode(doc([row(extra)])),{reviewMode:true}).items[0];assert.equal(item.revisionImporte.status,'mismatch');
  }
 }
});
test('REV84 pack explícito sin U y ambiguo no autorizan conversión; base subleída no descarta revisión',async()=>{
 const m=await load();for(const [fn,encode] of [[m.gem.extractGeminiInvoice,gem],[m.gpt.extractOpenAIInvoice,gpt]]){
  assert.equal(fn(encode(doc([row({producto:'Alfajor PACK X 12'})])),{reviewMode:true}).items[0].packDetectado,12);
  assert.equal(fn(encode(doc([row({producto:'X8U X12U'})])),{reviewMode:true}).items[0].packAmbiguo,true);
  const result=fn(encode({...doc([row({precioUnit:1,subtotal:100})]),descuentoGlobal:10}),{reviewMode:true});assert.equal(result.items[0].revisionImporte.status,'mismatch');
 }
});
