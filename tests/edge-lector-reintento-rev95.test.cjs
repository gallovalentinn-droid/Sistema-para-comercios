const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {run:serve}=require('./edge-fixture/invoice.cjs');
const load=()=>import(pathToFileURL(path.resolve(__dirname,'../supabase/functions/_shared/f6-invoice-providers.mjs')).href);
const id='00000000-0000-4000-8000-000000000001';
const input={comercioId:id,requestId:id,imageBase64:'AAAA',mediaType:'image/png',readerContract:'f6-invoice-review-v1'};
const invoice={proveedor:'Proveedor',nroComprobante:'1',total:100,descuentoGlobal:0,saldoAnterior:0,pagosACuenta:0,items:[{producto:'Producto',codigo:'1',descripcion:'Producto',cantidad:1,unidadesPorBulto:1,precioUnit:100,descuento:0,subtotal:100,impuestoFila:0}]};
const google=()=>({status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(invoice)}]}]});
const res=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','retry-after':'30'}});
const caida=()=>res({error:{code:'service_unavailable',message:'PRIVATE high demand'}},503);
const colgado=(url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('PRIVATE'),{name:'AbortError'})),{once:true}));
async function leer(respuestas,opts={}){
 const llamadas=[],intentos=[],esperas=[];let n=0;
 const promesa=(await load()).readInvoiceWithProviders({input,openaiApiKey:'synthetic',geminiApiKey:'synthetic',
  fetchImpl:async(url,options)=>{llamadas.push(/openai/.test(url)?'openai':'gemini');const r=respuestas[n++];return typeof r==='function'?r(url,options):r;},
  beforeAttempt:async x=>{intentos.push(x);},sleep:async ms=>{esperas.push(ms);},...opts});
 return {promesa,llamadas,intentos,esperas};
}

test('REV95 el principal recibe más tiempo solo si queda margen para el respaldo',async()=>{
 // Plazos a escala 1:1000 del real (135 s en total, 90 s de tope, 60 s de piso, 40 s de reserva).
 for(const [total,esperado] of [[270,180],[200,120],[150,120]]){
  let corte=0;
  const {promesa}=await leer([(u,o)=>{const inicio=Date.now();return colgado(u,o).catch(e=>{corte=Date.now()-inicio;throw e;});},res(google())],
   {totalTimeoutMs:total,primaryTimeoutMs:180,primaryMinimumMs:120,fallbackReserveMs:80});
  const r=await promesa;assert.equal(r.provider,'gemini');
  assert.ok(corte>=esperado-15&&corte<=esperado+60,`total ${total}: cortó a los ${corte} ms, esperado ${esperado}`);
 }
 const fuente=require('node:fs').readFileSync(path.resolve(__dirname,'../supabase/functions/_shared/f6-invoice-providers.mjs'),'utf8');
 assert.match(fuente,/primaryTimeoutMs = 90_000,primaryMinimumMs = 60_000,fallbackReserveMs = 40_000/);
});

test('REV95 un 503 de Gemini se reintenta una vez, en orden y con la plaza ya admitida',async()=>{
 const ok=await leer([caida(),caida(),res(google())],{geminiRetries:1});const r=await ok.promesa;
 assert.deepEqual(ok.llamadas,['openai','gemini','gemini']);
 assert.deepEqual(ok.intentos,[{provider:'openai',attempt:1},{provider:'gemini',attempt:2},{provider:'gemini',attempt:3}]);
 assert.deepEqual(ok.esperas,[3000]);
 assert.equal(r.provider,'gemini');assert.equal(r.fallbackUsed,true);assert.equal(r.retryUsed,true);assert.equal(r.fallbackDiagnostic.provider,'openai');
 // Sin OpenAI (HEIC o clave única), el reintento también rige y no hay respaldo previo.
 const solo=await leer([caida(),res(google())],{geminiRetries:1,openaiApiKey:''});const s=await solo.promesa;
 assert.deepEqual(solo.intentos.map(x=>x.attempt),[1,2]);assert.equal(s.retryUsed,true);assert.equal(s.fallbackUsed,false);
});

test('REV95 el reintento es único y su fallo se informa sin texto del proveedor',async()=>{
 const dos=await leer([caida(),caida(),caida(),res(google())],{geminiRetries:1});
 await assert.rejects(dos.promesa,e=>{assert.equal(e.diagnostic.provider,'gemini');assert.equal(e.diagnostic.providerCategory,'UNAVAILABLE');assert.equal(e.diagnostic.retryUsed,true);assert.equal(e.diagnostic.fallbackUsed,true);assert.doesNotMatch(JSON.stringify(e.diagnostic),/PRIVATE|high demand/);return true;});
 assert.equal(dos.llamadas.length,3);
});

test('REV95 no reintenta sin plaza, ante otro tipo de falla ni sin tiempo para otra lectura',async()=>{
 const sinPlaza=await leer([caida(),caida(),res(google())]);await assert.rejects(sinPlaza.promesa,e=>e.diagnostic.retryUsed===undefined);assert.equal(sinPlaza.llamadas.length,2);
 for(const fallo of [res({error:{code:'invalid_argument',message:'PRIVATE'}},400),res({error:{code:'rate_limit_exceeded',message:'PRIVATE'}},429),new Response('PRIVATE',{status:200})]){
  const otro=await leer([caida(),fallo,res(google())],{geminiRetries:1});await assert.rejects(otro.promesa);assert.equal(otro.llamadas.length,2);assert.deepEqual(otro.esperas,[]);
 }
 const colgada=await leer([caida(),colgado,res(google())],{geminiRetries:1,totalTimeoutMs:60,primaryTimeoutMs:20,primaryMinimumMs:20,retryMinimumMs:10,retryDelayMs:1});
 await assert.rejects(colgada.promesa,e=>e.code==='IA_TIEMPO_AGOTADO');assert.equal(colgada.llamadas.length,2,'un tiempo agotado no se reintenta');
 let reloj=0;const justo=await leer([()=>{reloj=100_000;return caida();},()=>{reloj=108_000;return caida();},res(google())],{geminiRetries:1,now:()=>reloj,totalTimeoutMs:135_000});
 await assert.rejects(justo.promesa,e=>e.diagnostic.providerCategory==='UNAVAILABLE');assert.equal(justo.llamadas.length,2,'27 s restantes no alcanzan para esperar y leer');
 reloj=0;const alcanza=await leer([()=>{reloj=90_000;return caida();},()=>{reloj=97_000;return caida();},res(google())],{geminiRetries:1,now:()=>reloj,totalTimeoutMs:135_000});
 assert.equal((await alcanza.promesa).retryUsed,true);
});

const cuerpo=google(),base=name=>name.includes('capacidades')?{data:{contract:'f6-reader-quota-rev84'}}:{data:{ok:true}};
test('REV95 la función pide la plaza extra y sigue sin ella si el límite o la base no la admiten',async()=>{
 const pedidas=r=>r.rpcParams.filter(p=>p.p_max_attempts).map(p=>p.p_max_attempts);
 const normal=await serve({openai:true,status:200,body:{status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(invoice)}]}]},rpcImpl:base});
 assert.equal(normal.status,200);assert.deepEqual(pedidas(normal),[3]);assert.equal(normal.data.iaRetryUsed,undefined);
 for(const rechazo of [{data:{ok:false,code:'IA_LIMITE_FRECUENCIA',retryAfterSeconds:40}},{error:{message:'F6_IA_INPUT_INVALID'}}]){
  const r=await serve({openai:true,responses:[new Response('{}',{status:503}),caida(),res(cuerpo)],rpcImpl:(n,p)=>n.includes('reservar')&&p.p_max_attempts===3?rechazo:base(n)});
  assert.deepEqual(pedidas(r),[3,2]);assert.equal(r.calls,2,'sin plaza extra no hay reintento');assert.equal(r.status,503);assert.equal(r.data.diagnostic.providerCategory,'UNAVAILABLE');
 }
 const lleno=await serve({openai:true,rpcImpl:n=>n.includes('reservar')?{data:{ok:false,code:'IA_LIMITE_FRECUENCIA',retryAfterSeconds:40}}:base(n)});
 assert.equal(lleno.status,429);assert.equal(lleno.data.code,'IA_LIMITE_FRECUENCIA');assert.equal(lleno.data.diagnostic.retryAfterSeconds,40);assert.equal(lleno.calls,0);assert.deepEqual(pedidas(lleno),[3,2]);
 const otroError=await serve({openai:true,rpcImpl:n=>n.includes('reservar')?{error:{message:'F6_IA_FORBIDDEN'}}:base(n)});assert.equal(otroError.status,403);assert.deepEqual(pedidas(otroError),[3]);
 const legado=await serve({openai:true,status:200,body:cuerpo});assert.equal(legado.data.iaQuotaMode,'legacy-rev83');assert.deepEqual(pedidas(legado),[]);
});

test('REV95 la función reintenta Gemini tras un 503, registra tres intentos y lo informa',async()=>{
 const r=await serve({openai:true,responses:[new Response('{}',{status:503}),caida(),res(cuerpo)],rpcImpl:base});
 assert.equal(r.status,200);assert.equal(r.calls,3);assert.equal(r.data.iaProvider,'gemini');assert.equal(r.data.iaFallbackUsed,true);assert.equal(r.data.iaRetryUsed,true);
 const intentos=r.rpcParams.filter(p=>p.p_attempt).map(p=>[p.p_provider,p.p_attempt]);
 assert.deepEqual(intentos,[['openai',1],['gemini',2],['gemini',3]]);
 assert.equal(r.rpcParams.find(p=>p.p_model).p_model,'gemini-3.5-flash-lite');
 assert.ok(r.logs.some(x=>x[0]==='F6_IA_RETRY'));assert.doesNotMatch(JSON.stringify([r.data,r.logs]),/PRIVATE|high demand/);
});
