const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {run:serve}=require('./edge-fixture/invoice.cjs');
const load=()=>import(pathToFileURL(path.resolve(__dirname,'../supabase/functions/_shared/f6-invoice-providers.mjs')).href);
const id='00000000-0000-4000-8000-000000000001';
const input={comercioId:id,requestId:id,imageBase64:'AAAA',mediaType:'image/png',readerContract:'f6-invoice-review-v1'};
const invoice={proveedor:'Proveedor',nroComprobante:'1',total:100,descuentoGlobal:0,saldoAnterior:0,pagosACuenta:0,items:[{producto:'Producto',codigo:'1',descripcion:'Producto',cantidad:1,unidadesPorBulto:1,precioUnit:100,descuento:0,subtotal:100,impuestoFila:0}]};
const google=()=>({status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(invoice)}]}]});
const res=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json',...headers}});
// 503 de alta demanda; `espera` es el Retry-After que indica el proveedor (Gemini manda 30 en producción).
const caida=(espera=30)=>res({error:{code:'service_unavailable',message:'PRIVATE high demand'}},503,espera===null?{}:{'retry-after':String(espera)});
const colgado=(url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('PRIVATE'),{name:'AbortError'})),{once:true}));
// Reloj simulado: cada respuesta puede fijar la hora en que llega; la espera del reintento también lo adelanta.
async function leer(respuestas,opts={}){
 const llamadas=[],intentos=[],esperas=[],pedidos=[];let n=0,reloj=0;
 const conceder=opts.conceder===undefined?true:opts.conceder;delete opts.conceder;
 const promesa=(await load()).readInvoiceWithProviders({input,openaiApiKey:'synthetic',geminiApiKey:'synthetic',now:()=>reloj,totalTimeoutMs:135_000,
  fetchImpl:async(url,options)=>{llamadas.push([/openai/.test(url)?'openai':'gemini',reloj]);const r=respuestas[n++];if(Array.isArray(r)){reloj=r[0];return r[1];}return typeof r==='function'?r(url,options):r;},
  beforeAttempt:async x=>{intentos.push(x);},sleep:async ms=>{esperas.push(ms);reloj+=ms;},
  requestRetry:async x=>{pedidos.push(x);if(conceder instanceof Error)throw conceder;return conceder;},...opts});
 return {promesa,llamadas,intentos,esperas,pedidos};
}

test('REV95 el principal recibe más tiempo solo si queda margen para el respaldo',async()=>{
 // Plazos a escala 1:500 del real (135 s en total, 90 s de tope, 60 s de piso, 40 s de reserva).
 for(const [total,esperado] of [[270,180],[200,120],[150,120]]){
  let corte=0;
  const {promesa}=await leer([(u,o)=>{const inicio=Date.now();return colgado(u,o).catch(e=>{corte=Date.now()-inicio;throw e;});},res(google())],
   {now:Date.now,totalTimeoutMs:total,primaryTimeoutMs:180,primaryMinimumMs:120,fallbackReserveMs:80});
  const r=await promesa;assert.equal(r.provider,'gemini');
  assert.ok(corte>=esperado-15&&corte<=esperado+60,`total ${total}: cortó a los ${corte} ms, esperado ${esperado}`);
 }
 const fuente=require('node:fs').readFileSync(path.resolve(__dirname,'../supabase/functions/_shared/f6-invoice-providers.mjs'),'utf8');
 assert.match(fuente,/primaryTimeoutMs = 90_000,primaryMinimumMs = 60_000,fallbackReserveMs = 40_000/);
 assert.match(fuente,/retryDelayMs = 3_000,retryAdmissionMs = 4_000,retryMinimumMs = 25_000/);
});

test('R1 el reintento espera lo que indica Gemini y pide la plaza recién entonces',async()=>{
 // OpenAI falla rápido (como con la clave rechazada); Gemini responde 503 con Retry-After: 30.
 const ok=await leer([[1_000,res({error:{code:'server_error'}},503)],[8_000,caida(30)],[50_000,res(google())]]);const r=await ok.promesa;
 assert.deepEqual(ok.esperas,[30_000],'espera la indicada por el proveedor, no la local');
 assert.deepEqual(ok.llamadas,[['openai',0],['gemini',1_000],['gemini',38_000]],'el reintento empieza 30 s después del 503');
 assert.deepEqual(ok.pedidos,[{provider:'gemini',attempt:3}]);
 assert.deepEqual(ok.intentos,[{provider:'openai',attempt:1},{provider:'gemini',attempt:2},{provider:'gemini',attempt:3}]);
 assert.equal(r.provider,'gemini');assert.equal(r.fallbackUsed,true);assert.equal(r.retryUsed,true);assert.equal(r.fallbackDiagnostic.provider,'openai');
 // Sin indicación del proveedor rige la espera local acotada.
 const local=await leer([[1_000,res({error:{code:'server_error'}},503)],[8_000,caida(null)],res(google())]);assert.equal((await local.promesa).retryUsed,true);assert.deepEqual(local.esperas,[3_000]);
 // Sin OpenAI (HEIC o clave única) también rige.
 const solo=await leer([[7_000,caida(30)],res(google())],{openaiApiKey:''});const s=await solo.promesa;
 assert.deepEqual(solo.intentos.map(x=>x.attempt),[1,2]);assert.deepEqual(solo.pedidos,[{provider:'gemini',attempt:2}]);assert.equal(s.retryUsed,true);assert.equal(s.fallbackUsed,false);
});

test('R1 si la espera indicada no cabe en el plazo, no se pide plaza ni se reintenta',async()=>{
 // Caso de producción del 12/11: OpenAI agota 90 s y Gemini responde 503 siete segundos después. Quedan 38 s: 30 + 4 + 25 no caben.
 const tarde=await leer([[90_000,res({error:{code:'server_error'}},503)],[97_000,caida(30)],res(google())]);
 await assert.rejects(tarde.promesa,e=>e.diagnostic.providerCategory==='UNAVAILABLE'&&e.diagnostic.retryUsed===undefined&&e.diagnostic.retryAfterSeconds===30);
 assert.equal(tarde.llamadas.length,2);assert.deepEqual(tarde.pedidos,[]);assert.deepEqual(tarde.esperas,[]);
 // Límite exacto: con 59 s restantes entra (30 + 4 + 25); con 58 no.
 const justo=await leer([[70_000,res({error:{code:'server_error'}},503)],[76_000,caida(30)],res(google())]);assert.equal((await justo.promesa).retryUsed,true);
 const corto=await leer([[70_000,res({error:{code:'server_error'}},503)],[77_000,caida(30)],res(google())]);await assert.rejects(corto.promesa);assert.deepEqual(corto.pedidos,[]);
 // Una espera indicada más larga que el plazo tampoco se intenta, aunque Gemini falle enseguida.
 const larga=await leer([[1_000,res({error:{code:'server_error'}},503)],[5_000,caida(120)],res(google())]);await assert.rejects(larga.promesa);assert.deepEqual(larga.pedidos,[]);
 // Con la misma hora de falla pero sin indicación (3 s locales), sí cabe.
 const cabe=await leer([[90_000,res({error:{code:'server_error'}},503)],[97_000,caida(null)],res(google())]);assert.equal((await cabe.promesa).retryUsed,true);
});

test('R2 sin plaza concedida se informa el fallo original, sin esperar ni llamar otra vez',async()=>{
 for(const conceder of [false,undefined,null,'true',new Error('PRIVATE rpc')]){
  const r=await leer([[1_000,res({error:{code:'server_error'}},503)],[8_000,caida(30)],res(google())],{conceder:conceder===undefined?null:conceder});
  await assert.rejects(r.promesa,e=>{assert.equal(e.diagnostic.provider,'gemini');assert.equal(e.diagnostic.providerCategory,'UNAVAILABLE');assert.equal(e.diagnostic.retryUsed,undefined);assert.doesNotMatch(JSON.stringify(e.diagnostic),/PRIVATE/);return true;});
  assert.equal(r.llamadas.length,2);assert.equal(r.pedidos.length,1);assert.deepEqual(r.esperas,[]);assert.equal(r.intentos.length,2);
 }
 const sinGancho=await leer([[1_000,res({error:{code:'server_error'}},503)],[8_000,caida(30)],res(google())],{requestRetry:undefined});
 await assert.rejects(sinGancho.promesa);assert.equal(sinGancho.llamadas.length,2);
});

test('REV95 el reintento es único y solo ante un 503 de Gemini',async()=>{
 const dos=await leer([[1_000,res({error:{code:'server_error'}},503)],[8_000,caida(30)],[45_000,caida(30)],res(google())]);
 await assert.rejects(dos.promesa,e=>{assert.equal(e.diagnostic.retryUsed,true);assert.equal(e.diagnostic.fallbackUsed,true);assert.equal(e.diagnostic.providerCategory,'UNAVAILABLE');assert.doesNotMatch(JSON.stringify(e.diagnostic),/PRIVATE|high demand/);return true;});
 assert.equal(dos.llamadas.length,3);assert.equal(dos.pedidos.length,1);
 for(const fallo of [res({error:{code:'invalid_argument',message:'PRIVATE'}},400),res({error:{code:'rate_limit_exceeded',message:'PRIVATE'}},429,{'retry-after':'30'}),new Response('PRIVATE',{status:200})]){
  const otro=await leer([[1_000,res({error:{code:'server_error'}},503)],[8_000,fallo],res(google())]);await assert.rejects(otro.promesa);assert.equal(otro.llamadas.length,2);assert.deepEqual(otro.pedidos,[]);
 }
 // Un 503 de OpenAI pasa al respaldo; no se reintenta el principal.
 const principal=await leer([[1_000,res({error:{code:'server_error'}},503,{'retry-after':'30'})],res(google())]);assert.equal((await principal.promesa).retryUsed,undefined);assert.deepEqual(principal.pedidos,[]);
 // Un tiempo agotado de Gemini no se reintenta.
 const colgada=await leer([res({error:{code:'server_error'}},503),colgado,res(google())],{now:Date.now,totalTimeoutMs:60,retryMinimumMs:10,retryAdmissionMs:0,retryDelayMs:1});
 await assert.rejects(colgada.promesa,e=>e.code==='IA_TIEMPO_AGOTADO');assert.equal(colgada.llamadas.length,2);assert.deepEqual(colgada.pedidos,[]);
});

const cuerpo=google(),base=name=>name.includes('capacidades')?{data:{contract:'f6-reader-quota-rev84'}}:{data:{ok:true}};
test('R2 la función reserva solo las plazas base y pide la extra recién al reintentar',async()=>{
 const pedidas=r=>r.rpcParams.filter(p=>p.p_max_attempts).map(p=>p.p_max_attempts),amplio=r=>r.rpcs.filter(n=>n.includes('ampliar_intento')).length;
 const normal=await serve({openai:true,status:200,body:{status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(invoice)}]}]},rpcImpl:base});
 assert.equal(normal.status,200);assert.deepEqual(pedidas(normal),[2]);assert.equal(amplio(normal),0,'una lectura normal no pide plaza extra');assert.equal(normal.data.iaRetryUsed,undefined);
 const respaldo=await serve({openai:true,responses:[new Response('{}',{status:503}),res(cuerpo)],rpcImpl:base});
 assert.equal(respaldo.status,200);assert.equal(amplio(respaldo),0,'un respaldo que responde tampoco');
 // Sin capacidad, sin la RPC (base sin migrar) o con error: el fallo original, sin tercera llamada.
 for(const rechazo of [{data:{ok:false,code:'IA_LIMITE_FRECUENCIA'}},{data:{ok:false,code:'IA_REINTENTO_NO_DISPONIBLE'}},{error:{code:'PGRST202',message:'Could not find the function'}},{error:{message:'F6_IA_RESERVATION_NOT_ACTIVE'}}]){
  const r=await serve({openai:true,responses:[new Response('{}',{status:503}),caida(null),res(cuerpo)],rpcImpl:n=>n.includes('ampliar_intento')?rechazo:base(n)});
  assert.deepEqual(pedidas(r),[2]);assert.equal(amplio(r),1);assert.equal(r.calls,2);assert.equal(r.status,503);assert.equal(r.data.diagnostic.providerCategory,'UNAVAILABLE');assert.equal(r.data.diagnostic.retryUsed,undefined);
  assert.equal(r.rpcs.filter(n=>n.includes('iniciar_intento')).length,2);assert.ok(r.rpcs.some(n=>n.includes('finalizar')));
 }
 const colgada=await serve({openai:true,responses:[new Response('{}',{status:503}),caida(null),res(cuerpo)],rpcImpl:n=>{if(n.includes('ampliar_intento'))throw new Error('PRIVATE');return base(n);}});
 assert.equal(colgada.status,503);assert.equal(colgada.calls,2);assert.doesNotMatch(JSON.stringify([colgada.data,colgada.logs]),/PRIVATE/);
 const legado=await serve({openai:true,responses:[new Response('{}',{status:503}),caida(null),res(cuerpo)]});assert.equal(legado.data.iaQuotaMode,'legacy-rev83');assert.equal(amplio(legado),0);assert.equal(legado.calls,2);
});

test('REV95 la función reintenta Gemini tras un 503, registra tres intentos y lo informa',async()=>{
 const r=await serve({openai:true,responses:[new Response('{}',{status:503}),caida(null),res(cuerpo)],rpcImpl:base});
 assert.equal(r.status,200);assert.equal(r.calls,3);assert.equal(r.data.iaProvider,'gemini');assert.equal(r.data.iaFallbackUsed,true);assert.equal(r.data.iaRetryUsed,true);
 const orden=r.rpcs.filter(n=>/iniciar_intento|ampliar_intento/.test(n)).map(n=>n.includes('ampliar')?'ampliar':'iniciar');
 assert.deepEqual(orden,['iniciar','iniciar','ampliar','iniciar'],'la plaza se pide después de fallar el respaldo y antes del tercer intento');
 assert.deepEqual(r.rpcParams.filter(p=>p.p_attempt).map(p=>[p.p_provider,p.p_attempt]),[['openai',1],['gemini',2],['gemini',3]]);
 assert.equal(r.rpcParams.find(p=>p.p_model).p_model,'gemini-3.5-flash-lite');
 assert.ok(r.logs.some(x=>x[0]==='F6_IA_RETRY'));assert.doesNotMatch(JSON.stringify([r.data,r.logs]),/PRIVATE|high demand/);
});
