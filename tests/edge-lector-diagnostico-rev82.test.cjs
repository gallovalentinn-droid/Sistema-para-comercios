const test=require('node:test'),assert=require('node:assert/strict');
const {run,modulo,id,invoice,output}=require('./edge-fixture/invoice.cjs');


test('REV84 cliente viejo se rechaza antes de reservar o llamar, incluso con pack o impuesto',async()=>{
 for(const row of [{...invoice.items[0],producto:'X8U'},{...invoice.items[0],impuestoFila:21}]){
  const r=await run({readerContract:null,status:200,body:output({...invoice,items:[row]})});assert.equal(r.status,426);assert.equal(r.data.code,'CLIENTE_REQUIERE_ACTUALIZACION');assert.equal(r.rpcs.length,0);assert.equal(r.calls,0);
 }
});
test('REV83 endpoint reserva una lectura aunque haya respaldo y registra el modelo efectivo',async()=>{
 const r=await run({openai:true,responses:[new Response(JSON.stringify({error:{code:'server_error',message:'PRIVATE'}}),{status:503}),new Response(JSON.stringify(output()),{status:200})]});
 assert.equal(r.status,200);assert.equal(r.calls,2);assert.deepEqual(r.rpcs,['f6_service_capacidades_lector_factura_rev84','f6_service_reservar_lectura_factura','f6_service_registrar_resultado_lectura_factura']);assert.equal(r.rpcParams.find(p=>p.p_model).p_model,'gemini-3.8-flash');assert.equal(r.data.iaProvider,'gemini');assert.equal(r.data.iaFallbackUsed,true);assert.doesNotMatch(JSON.stringify(r.logs),/PRIVATE/);
 const result={status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({...invoice,saldoAnterior:0,pagosACuenta:0,items:[{...invoice.items[0],codigo:'',descripcion:'',subtotal:100,impuestoFila:0}]})}]}]};
 const gpt=await run({openai:true,responses:[new Response(JSON.stringify(result),{status:200})]});assert.equal(gpt.status,200);assert.equal(gpt.calls,1);assert.equal(gpt.rpcParams.find(p=>p.p_model).p_model,'gpt-6-luna');assert.equal(gpt.data.iaProvider,'openai');assert.equal(gpt.data.iaFallbackUsed,false);
});
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
 const telemetry=await run({status:200,body:output(),telemetryError:true});assert.equal(telemetry.status,200);assert.equal(telemetry.data.iaAccountingDiagnostic?.stage,'telemetry');
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
 const r=await run({status:200,body:output()});assert.equal(r.status,200);assert.deepEqual(r.data.items[0],{...invoice.items[0],codigo:'',descripcion:'',descuentoFila:0,descuentoGlobalAsignado:0,impuestoFila:0,subtotal:null,packDetectado:null,revisionImporte:{status:'missing',expected:100,difference:null,tolerance:.02}});assert.equal(r.calls,1);
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
