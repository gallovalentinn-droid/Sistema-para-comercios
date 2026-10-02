const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const modulo=()=>import(pathToFileURL(path.join(root,'supabase/functions/_shared/f6-invoice-reader.mjs')).href);
const id='00000000-0000-4000-8000-000000000001';
const invoice={proveedor:'Privado',nroComprobante:'123',total:100,descuentoGlobal:0,items:[{producto:'Privado',cantidad:1,unidadesPorBulto:1,precioUnit:100,descuento:0}]};
const output=(data=invoice)=>({status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(data)}]}]});
async function run({status=503,body={error:{code:'service_unavailable',message:'PRIVATE SECRET INVOICE'}},throws,telemetryError=false,reservationError=false,claimsError=null}={}){
 const m=await modulo();let handler,calls=0;const logs=[],rpcs=[];
 const client={auth:{getClaims:async()=>claimsError?{data:null,error:claimsError}:{data:{claims:{sub:id}}}},rpc:async(name)=>{rpcs.push(name);return name.includes('reservar')?{data:{ok:!reservationError}}:{data:{ok:!telemetryError}};}};
 const context={...m,Error,Response,Request,TextEncoder,TextDecoder,AbortController,setTimeout,clearTimeout,Set,console:{error:(...x)=>logs.push(x)},jsonResponse:(b,s,h)=>new Response(JSON.stringify(b),{status:s,headers:h}),createClient:()=>client,Deno:{env:{get:n=>n==='F6_ALLOWED_ORIGINS'?'https://micomercio.ar':'synthetic'},serve:h=>handler=h},fetch:async()=>{calls++;if(throws)throw throws;return new Response(typeof body==='string'?body:JSON.stringify(body),{status,headers:{'content-type':'application/json','retry-after':'12'}});}};
 let source=fs.readFileSync(path.join(root,'supabase/functions/leer-factura/index.ts'),'utf8').replace(/^import[\s\S]*?from\s+"[^"]+";\s*/gm,'');
 vm.runInNewContext(stripTypeScriptTypes(source),context);
 const response=await handler(new Request('https://example.test/leer-factura',{method:'POST',headers:{authorization:'Bearer synthetic',origin:'https://micomercio.ar'},body:JSON.stringify({comercioId:id,requestId:id,imageBase64:'AAAA',mediaType:'image/png'})}));
 return {status:response.status,data:await response.json(),logs,calls,rpcs};
}
test('REV82 Google rate limit, daily quota and ambiguous 429 have distinct safe diagnostics',async()=>{
 for(const [code,category] of [['rate_limit_exceeded','RATE_LIMIT'],['quota_exceeded','DAILY_QUOTA'],['RESOURCE_EXHAUSTED','QUOTA_EXCEEDED'],['unknown-secret','UNKNOWN']]){
  const r=await run({status:429,body:{error:{code,message:'PRIVATE SECRET INVOICE'}}});
  assert.equal(r.data.diagnostic?.providerCategory,category);assert.equal(r.data.diagnostic?.providerStatus,429);
  assert.equal(r.data.diagnostic?.requestId,id);assert.equal(r.data.diagnostic?.retryAfterSeconds,12);
  assert.equal(r.calls,1);assert.equal(r.rpcs.filter(n=>n.includes('reservar')).length,1);
  assert.doesNotMatch(JSON.stringify([r.data,r.logs]),/PRIVATE|SECRET|unknown-secret/);
 }
});
test('REV82 provider bad request does not blame the invoice; outage stays separate',async()=>{
 const bad=await run({status:400,body:{error:{code:'invalid_argument',message:'PRIVATE'}}});
 assert.equal(bad.data.code,'IA_SOLICITUD_RECHAZADA');assert.equal(bad.data.diagnostic?.stage,'provider');
 const down=await run();assert.equal(down.data.diagnostic?.providerCategory,'UNAVAILABLE');
});
test('REV82 network, timeout, malformed response and telemetry failures identify the stage',async()=>{
 const network=await run({throws:new TypeError('PRIVATE')});assert.equal(network.data.code,'IA_CONEXION_PROVEEDOR');
 const timeout=await run({throws:Object.assign(new Error('PRIVATE'),{name:'AbortError'})});assert.equal(timeout.data.code,'IA_TIEMPO_AGOTADO');
 const malformed=await run({status:200,body:'PRIVATE invalid JSON'});assert.equal(malformed.data.code,'IA_RESPUESTA_INVALIDA');assert.equal(malformed.data.diagnostic?.stage,'response');
 const telemetry=await run({status:200,body:output(),telemetryError:true});assert.equal(telemetry.data.diagnostic?.stage,'telemetry');
 const reservation=await run({reservationError:true});assert.equal(reservation.data.diagnostic?.stage,'reservation');assert.equal(reservation.calls,0);
 for(const r of [network,timeout,malformed,telemetry])assert.doesNotMatch(JSON.stringify([r.data,r.logs]),/PRIVATE/);
});
test('REV82 invalid invoice row identifies its field and row without product data',async()=>{
 const r=await run({status:200,body:output({...invoice,items:[invoice.items[0],{...invoice.items[0],cantidad:-1}]})});
 assert.equal(r.data.code,'FACTURA_NO_RECONOCIDA');assert.equal(r.data.diagnostic?.stage,'validation');
 assert.equal(r.data.diagnostic?.field,'cantidad');assert.equal(r.data.diagnostic?.row,2);assert.equal(r.data.diagnostic?.reason,'BELOW_MINIMUM');
 assert.doesNotMatch(JSON.stringify([r.data,r.logs]),/Privado/);
});
test('REV82 valid invoices preserve success and strict validation',async()=>{
 const r=await run({status:200,body:output()});assert.equal(r.status,200);assert.deepEqual(r.data.items[0],{...invoice.items[0],codigo:'',descripcion:''});assert.equal(r.calls,1);
 const m=await modulo();assert.throws(()=>m.extractGeminiInvoice(output({...invoice,items:[{...invoice.items[0],unidadesPorBulto:0}]})),e=>e.message==='F6_GEMINI_OUTPUT_INVALID'&&e.diagnostic?.field==='unidadesPorBulto');
 assert.equal(m.safeGeminiErrorMessage(new Error('PRIVATE')), 'UNKNOWN');
});
test('REV82 auth service outages do not report an invalid session',async()=>{
 for(const error of [{name:'AuthRetryableFetchError',status:503,message:'PRIVATE'},{name:'AuthRetryableFetchError',status:0,message:'PRIVATE'},{name:'AuthApiError',status:429,message:'PRIVATE'}]){
  const r=await run({claimsError:error});assert.equal(r.status,503);assert.equal(r.data.code,'IA_AUTENTICACION_NO_DISPONIBLE');assert.equal(r.data.diagnostic.stage,'authentication');assert.equal(r.calls,0);assert.doesNotMatch(JSON.stringify([r.data,r.logs]),/PRIVATE/);
 }
 const invalid=await run({claimsError:{name:'AuthApiError',status:401,message:'PRIVATE'}});assert.equal(invalid.data.code,'SESION_INVALIDA');assert.equal(invalid.status,401);
});
test('REV82 current provider codes and legacy numeric status preserve their actual meaning',async()=>{
 for(const [error,category] of [[{code:'authentication'},'AUTHENTICATION'],[{code:'deadline_exceeded'},'PROVIDER_TIMEOUT'],[{code:'not_found'},'RESOURCE_NOT_FOUND'],[{code:'model_not_found'},'MODEL_NOT_FOUND'],[{code:400,status:'INVALID_ARGUMENT'},'INVALID_ARGUMENT']]){
  const r=await run({status:400,body:{error:{...error,message:'PRIVATE'}}});assert.equal(r.data.diagnostic.providerCategory,category);assert.doesNotMatch(JSON.stringify([r.data,r.logs]),/PRIVATE/);
 }
});
