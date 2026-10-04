const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../beta/index.html'),'utf8');
function harness(invoke,render=()=>{}){
 const text={textContent:'Foto'},label={style:{},setAttribute(){},removeAttribute(){}},box={hidden:true,textContent:''};
 const ov={},ids=[],failures=[];let seq=0;
 const context={Error,Promise,AbortController,setTimeout,clearTimeout,crypto:{randomUUID:()=>`id-${++seq}`},document:{body:{contains:()=>true}},console:{error(){}},
 $:selector=>selector==='#facFotoLabel'?label:selector==='.invoice-ai-choose'?text:box,
 sb:{functions:{invoke:async(name,o)=>{ids.push(o.body.requestId);assert.equal(o.body.readerContract,'f6-invoice-review-v1');return invoke(o)}}},sesion:{},f3Estado:{comercioId:'commerce'},fileABase64:async()=> 'AAAA',f83SectoresFactura:async()=>[],f6RegistrarUsoIa(){},rev70SincronizarMemoria:async()=>[],abrirRevisionFactura:render,f82MostrarFalloFactura:(o,e)=>failures.push(e),f82DescribirFalloFactura:()=>({detail:'safe'})};
 const start=source.indexOf('async function rev84RevisarRespuesta'),end=source.indexOf('\nlet revisionFactura=',start);
 assert.ok(start>0,'helper preserves received response');vm.runInNewContext(source.slice(start,end),context);
 return {context,ov,ids,failures,file:{size:3,type:'image/png'}};
}
test('REV84 reintento manual tras falla crea otro identificador en ambos modos de cupo',async()=>{
 for(const mode of ['legacy-rev83','rev84']){let n=0;const h=harness(async()=>++n===1?{data:{code:'IA_NO_DISPONIBLE'}}:{data:{items:[{}],iaQuotaMode:mode}});
 await h.context.leerFacturaFoto(h.file,h.ov);await h.context.leerFacturaFoto(h.file,h.ov);assert.equal(h.ids.length,2);assert.notEqual(h.ids[0],h.ids[1]);assert.equal(h.failures.length,1);assert.ok(h.ov._rev84Response);
 }
});
test('REV84 doble acción en curso llama una vez; un error de pantalla reutiliza respuesta',async()=>{
 let resolve,draws=0;const h=harness(()=>new Promise(r=>resolve=r),()=>{if(++draws===1)throw new Error('render')});
 const first=h.context.leerFacturaFoto(h.file,h.ov);await h.context.leerFacturaFoto(h.file,h.ov);await new Promise(r=>setImmediate(r));assert.equal(h.ids.length,1);
 resolve({data:{items:[{}]}});await first;assert.ok(h.ov._rev84Response);assert.equal(h.failures.length,1);
 await h.context.rev84RevisarRespuesta(h.ov);assert.equal(draws,2);assert.equal(h.ids.length,1);
});
