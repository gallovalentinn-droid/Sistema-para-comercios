const test=require('node:test'),assert=require('node:assert/strict');
const input={imageBase64:'AAAA',mediaType:'image/jpeg',readerContract:'f6-invoice-review-v1'};
const invoice={proveedor:'P',nroComprobante:'1',total:0,descuentoGlobal:0,saldoAnterior:0,pagosACuenta:0,items:[{producto:'X8U',codigo:'1',descripcion:'Producto',cantidad:1,unidadesPorBulto:1,precioUnit:100,descuento:0,subtotal:99,impuestoFila:0}]};
const gem=()=>new Response(JSON.stringify({status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(invoice)}]}]}));
test('REV84 acceso, saldo, modelo, 429 desconocido e incompleta pasan una vez a Gemini con evidencia',async()=>{
 const {readInvoiceWithProviders}=await import('../supabase/functions/_shared/f6-invoice-providers.mjs');
 for(const [status,body] of [[401,{error:{code:'invalid_api_key'}}],[429,{error:{type:'insufficient_quota'}}],[404,{error:{code:'model_not_found'}}],[429,{error:{code:'unknown'}}],[200,{status:'incomplete'}]]){
  let calls=0;const r=await readInvoiceWithProviders({input,openaiApiKey:'fixture',geminiApiKey:'fixture',fetchImpl:async()=>++calls===1?new Response(JSON.stringify(body),{status}):gem()});
  assert.equal(calls,2);assert.equal(r.provider,'gemini');assert.equal(r.invoice.items[0].revisionImporte?.status,'mismatch');assert.equal(r.fallbackDiagnostic.provider,'openai');
 }
});
test('REV84 rechazo explícito o JSON roto no habilitan respaldo; hook fallido tampoco',async()=>{
 const {readInvoiceWithProviders}=await import('../supabase/functions/_shared/f6-invoice-providers.mjs');
 for(const response of [new Response('broken'),new Response(JSON.stringify({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'refusal'}]}]}))]){
  let calls=0;await assert.rejects(readInvoiceWithProviders({input,openaiApiKey:'fixture',geminiApiKey:'fixture',fetchImpl:async()=>{calls++;return response}}));assert.equal(calls,1);
 }
 let calls=0;await assert.rejects(readInvoiceWithProviders({input,openaiApiKey:'fixture',geminiApiKey:'fixture',beforeAttempt:()=>{throw new Error('quota')},fetchImpl:async()=>{calls++;return gem()}}));assert.equal(calls,0);
});
test('REV84 limita también el cuerpo lento y deja presupuesto de respaldo descontando el hook',async()=>{
 const {readInvoiceWithProviders}=await import('../supabase/functions/_shared/f6-invoice-providers.mjs');let calls=0;
 const r=await readInvoiceWithProviders({input,openaiApiKey:'fixture',geminiApiKey:'fixture',totalTimeoutMs:100,primaryTimeoutMs:5,fetchImpl:async()=>++calls===1?{ok:true,json:()=>new Promise(()=>{})}:gem()});assert.equal(r.provider,'gemini');assert.equal(calls,2);
 let time=0;calls=0;const hooks=[];
 const timed=await readInvoiceWithProviders({input,openaiApiKey:'fixture',geminiApiKey:'fixture',now:()=>time,totalTimeoutMs:135000,beforeAttempt:async a=>{hooks.push(a);time+=2000},fetchImpl:async()=>{calls++;if(calls===1){time+=60000;throw Object.assign(new Error('timeout'),{name:'AbortError'})}time+=54000;return gem()}});
 assert.equal(timed.provider,'gemini');assert.equal(hooks.length,2);assert.equal(calls,2);
});
