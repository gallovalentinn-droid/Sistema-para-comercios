const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const load=()=>import(pathToFileURL(path.resolve(__dirname,'../supabase/functions/_shared/f6-invoice-providers.mjs')).href);
const reader=()=>import(pathToFileURL(path.resolve(__dirname,'../supabase/functions/_shared/f6-invoice-reader.mjs')).href);
const id='00000000-0000-4000-8000-000000000001';
const input={comercioId:id,requestId:id,imageBase64:'AAAA',mediaType:'image/png'};
const invoice={proveedor:'Proveedor',nroComprobante:'1',total:100,descuentoGlobal:0,saldoAnterior:0,pagosACuenta:0,items:[{producto:'Producto',codigo:'1',descripcion:'Producto',cantidad:1,unidadesPorBulto:1,precioUnit:100,descuento:0,subtotal:100,impuestoFila:0}]};
const ai=(data=invoice)=>({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(data)}]}],usage:{input_tokens:20,output_tokens:10,total_tokens:30}});
const google=()=>({status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(invoice)}]}]});
const res=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
async function run(fetchImpl,opts={}){return (await load()).readInvoiceWithProviders({input,openaiApiKey:'synthetic',geminiApiKey:'synthetic',fetchImpl,...opts});}
test('REV83 GPT principal conserva contrato, sectores y telemetría propia',async()=>{
 const calls=[];const r=await run(async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return res(ai());},{input:{...input,imageParts:[{imageBase64:'AAAA',mediaType:'image/png'}]}});
 assert.equal(calls.length,1);assert.match(calls[0].url,/api.openai.com/);assert.equal(calls[0].body.input[0].content.filter(c=>c.type==='input_image').length,2);
 assert.equal(r.model,'gpt-6-luna');assert.equal(r.provider,'openai');assert.equal(r.fallbackUsed,false);assert.equal(r.iaUsage.totalTokens,30);assert.equal(r.invoice.items.length,1);assert.equal(r.invoice.items[0].subtotal,undefined);
});
test('REV83 503 y rate limit usan Gemini una sola vez, siempre secuencial',async()=>{
 for(const [status,code] of [[503,'server_error'],[429,'rate_limit_exceeded']]){
  let calls=0,active=0;const r=await run(async(url)=>{assert.equal(active,0);active++;calls++;await Promise.resolve();active--;return calls===1?res({error:{code,message:'PRIVATE SECRET'}},status):res(google());});
  assert.equal(calls,2);assert.equal(r.provider,'gemini');assert.equal(r.model,'gemini-3.8-flash');assert.equal(r.fallbackUsed,true);
 }
});
test('REV83 conexión y timeout usan respaldo dentro del plazo conjunto',async()=>{
 let calls=0;const network=await run(async()=>{if(++calls===1)throw new TypeError('PRIVATE');return res(google());});assert.equal(network.provider,'gemini');assert.equal(calls,2);
 calls=0;const timed=await run(async(url,{signal})=>{if(++calls===2)return res(google());return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('PRIVATE'),{name:'AbortError'})),{once:true}));},{primaryTimeoutMs:5,totalTimeoutMs:100});assert.equal(timed.provider,'gemini');assert.equal(calls,2);
 let time=0;calls=0;await assert.rejects(run(async()=>{calls++;time=100;throw Object.assign(new Error('PRIVATE'),{name:'AbortError'});},{now:()=>time,totalTimeoutMs:90}),e=>e.code==='IA_TIEMPO_AGOTADO');assert.equal(calls,1);
});
test('REV83 saldo agotado, credenciales y parámetros no disparan respaldo ni exponen mensajes',async()=>{
 for(const [status,code,category] of [[429,'insufficient_quota','BILLING_REQUIRED'],[429,'credit_balance_exhausted','BILLING_REQUIRED'],[401,'invalid_api_key','API_KEY_INVALID'],[400,'invalid_value','INVALID_ARGUMENT'],[403,'permission_denied','PERMISSION_DENIED']]){
  let calls=0;await assert.rejects(run(async()=>{calls++;return res({error:{code,message:'PRIVATE SECRET'}},status);}),e=>{assert.equal(e.diagnostic.provider,'openai');assert.equal(e.diagnostic.providerCategory,category);assert.doesNotMatch(JSON.stringify(e),/PRIVATE|SECRET/);return true;});assert.equal(calls,1);
 }
});
test('REV83 JSON roto, respuesta incompleta e importe incoherente se rechazan sin respaldo',async()=>{
 for(const response of [new Response('PRIVATE',{status:200}),res({status:'incomplete'}),res(ai({...invoice,items:[{...invoice.items[0],subtotal:200}]}))]){
  let calls=0;await assert.rejects(run(async()=>{calls++;return response;}),e=>['response','validation'].includes(e.diagnostic.stage));assert.equal(calls,1);
 }
});
test('REV83 insuficiencia de cuota por type prevalece sobre un code desconocido',async()=>{
 let calls=0;await assert.rejects(run(async()=>{calls++;return res({error:{type:'insufficient_quota',code:'unrecognized_code',message:'PRIVATE SECRET'}},429);}),e=>e.code==='IA_SALDO_AGOTADO'&&e.diagnostic.providerCategory==='BILLING_REQUIRED');assert.equal(calls,1);
});
test('REV83 429 desconocido y credenciales por type no se tratan como límite temporal',async()=>{
 for(const [status,body,category] of [[429,{code:'unknown'},'UNKNOWN'],[429,{code:'rate_limit_exceeded',type:'invalid_api_key'},'API_KEY_INVALID'],[500,{code:'invalid_api_key'},'API_KEY_INVALID']]){
  let calls=0;await assert.rejects(run(async()=>{calls++;return res({error:body},status);}),e=>e.diagnostic.providerCategory===category);assert.equal(calls,1);
 }
});
test('REV83 respaldo fallido informa Google, configuración parcial y HEIC mantienen compatibilidad',async()=>{
 let calls=0;await assert.rejects(run(async()=>{calls++;return res({error:{code:'unavailable',message:'PRIVATE'}},503);}),e=>e.diagnostic.provider==='gemini'&&e.diagnostic.fallbackUsed===true);assert.equal(calls,2);
 for(const opts of [{openaiApiKey:''},{input:{...input,mediaType:'image/heic'}}]){let url;const r=await run(async(u)=>{url=u;return res(google());},opts);assert.match(url,/googleapis/);assert.equal(r.provider,'gemini');}
 await assert.rejects(run(async()=>{throw new Error('must not call');},{openaiApiKey:'',geminiApiKey:''}),e=>e.code==='IA_NO_CONFIGURADA');
});
test('REV83 sectores opcionales acotados, base64 válido, tipos y contrato legado',async()=>{
 const m=await reader(),part={imageBase64:'AAAA',mediaType:'image/png'};
 assert.equal(m.validateInvoiceImageRequest(input).ok,true);assert.equal(m.validateInvoiceImageRequest({...input,imageParts:[part,part,part]}).ok,true);
 for(const imageParts of [null,{},[part,part,part,part],[{...part,imageBase64:'invalid'}],[{...part,mediaType:'image/svg+xml'}],[{...part,extra:'x'}]])assert.equal(m.validateInvoiceImageRequest({...input,imageParts}).ok,false);
 const big={...part,imageBase64:Buffer.alloc(3*1024*1024).toString('base64')};assert.equal(m.validateInvoiceImageRequest({...input,imageParts:[big,big,big]}).code,'IMAGEN_DEMASIADO_GRANDE');
 assert.equal(m.validateInvoiceImageRequest({...input,unknown:true}).ok,false);
});
