const test=require('node:test'),assert=require('node:assert/strict');
const {run,id,output}=require('./edge-fixture/invoice.cjs');
const text=JSON.stringify({comercioId:id,requestId:id,imageBase64:'AAAA',mediaType:'image/png',readerContract:'f6-invoice-review-v1'});
const request=body=>new Request('https://example.test/leer-factura',{method:'POST',headers:{authorization:'Bearer synthetic',origin:'https://micomercio.ar'},body,duplex:'half'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));

test('REV84 una subida real de 12 segundos llega a revisión, sin agotar admisión',async()=>{
 let pending;
 const image=JSON.stringify({...JSON.parse(text),imageBase64:Buffer.alloc(5*1024*1024).toString('base64')});
 const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(image.slice(0,20)));pending=setTimeout(()=>{c.enqueue(new TextEncoder().encode(image.slice(20)));c.close()},12000)},cancel(){clearTimeout(pending)}});
 try {const r=await run({request:request(stream),status:200,body:output()});assert.equal(r.status,200);assert.equal(r.calls,1);assert.equal(r.rpcs.filter(n=>n.includes('reservar')).length,1);}
 finally {clearTimeout(pending)}
});

test('REV84 los diez segundos de autenticación empiezan después de recibir la foto',async()=>{
 let time=0;
 const stream=new ReadableStream({pull(c){time=12000;c.enqueue(new TextEncoder().encode(text));c.close()}},{highWaterMark:0});
 const r=await run({request:request(stream),now:()=>time,claimsImpl:async()=>{await delay(20);return {data:{claims:{sub:id}}}},status:200,body:output()});
 assert.equal(r.status,200);assert.equal(r.calls,1);
});

test('REV84 una subida que vence el plazo total se cancela, no se culpa al JSON ni se reserva',async()=>{
 let time=0,cancelled=false,reads=0;
 const stream=new ReadableStream({pull(c){if(reads++===0){time=145001;c.enqueue(new TextEncoder().encode('{'))}},cancel(){cancelled=true}},{highWaterMark:0});
 const r=await run({request:request(stream),now:()=>time});
 assert.equal(r.status,408);assert.equal(r.data.code,'IA_TIEMPO_AGOTADO');assert.equal(r.data.diagnostic.stage,'upload');assert.equal(r.calls,0);assert.equal(r.rpcs.length,0);assert.equal(cancelled,true);
});

test('REV84 sesión y capacidad siguen compartiendo diez segundos, sin reservar si se agotan',async()=>{
 let time=0;
 const r=await run({now:()=>time,claimsImpl:async()=>{time+=9000;return {data:{claims:{sub:id}}}},rpcImpl:async()=>{time+=2000;await delay(20);return {data:{contract:'f6-reader-quota-rev84'}}}});
 assert.equal(r.status,503);assert.equal(r.data.code,'IA_RESERVA_NO_DISPONIBLE');assert.equal(r.calls,0);assert.ok(!r.rpcs.some(n=>n.includes('reservar')));
});
for(const seconds of [100,141])test(`N-01 subida de ${seconds}s sin tiempo útil no reserva ni llama en ambos modos`,async()=>{
 for(const modern of [false,true]){
  let time=0;
  const stream=new ReadableStream({pull(c){time=seconds*1000;c.enqueue(new TextEncoder().encode(text));c.close()}},{highWaterMark:0});
  const r=await run({request:request(stream),now:()=>time,...(modern?{rpcImpl:async n=>n.includes('capacidades')?{data:{contract:'f6-reader-quota-rev84'}}:{data:{ok:true}}}:{}),status:200,body:output()});
  assert.equal(r.status,408);assert.equal(r.data.diagnostic.stage,'upload');assert.equal(r.calls,0);assert.ok(!r.rpcs.some(n=>n.includes('reservar')));
 }
});
test('N-01 vuelve a comprobar el tiempo útil después de autenticar, antes de reservar',async()=>{
 let time=0;const stream=new ReadableStream({pull(c){time=63000;c.enqueue(new TextEncoder().encode(text));c.close()}},{highWaterMark:0});
 const r=await run({request:request(stream),now:()=>time,claimsImpl:async()=>{time+=3000;return {data:{claims:{sub:id}}}},status:200,body:output()});
 assert.equal(r.status,408);assert.equal(r.data.diagnostic.stage,'upload');assert.equal(r.calls,0);assert.ok(!r.rpcs.some(n=>n.includes('reservar')));
});
