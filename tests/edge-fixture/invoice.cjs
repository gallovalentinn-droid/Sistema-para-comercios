const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../..');
const modulo=()=>import(pathToFileURL(path.join(root,'supabase/functions/_shared/f6-invoice-reader.mjs')).href);
const id='00000000-0000-4000-8000-000000000001';
const invoice={proveedor:'Privado',nroComprobante:'123',total:100,descuentoGlobal:0,items:[{producto:'Privado',cantidad:1,unidadesPorBulto:1,precioUnit:100,descuento:0}]};
const output=(data=invoice)=>({status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(data)}]}]});
async function run({status=503,body={error:{code:'service_unavailable',message:'PRIVATE SECRET INVOICE'}},throws,telemetryError=false,reservationError=false,claimsError=null,openai=false,responses,readerContract='f6-invoice-review-v1',rpcImpl}={}){
 const m=await modulo(), providers=await import(pathToFileURL(path.join(root,'supabase/functions/_shared/f6-invoice-providers.mjs')).href);let handler,calls=0;const logs=[],rpcs=[];
 const rpcParams=[];const client={auth:{getClaims:async()=>claimsError?{data:null,error:claimsError}:{data:{claims:{sub:id}}}},rpc:async(name,params)=>{rpcs.push(name);rpcParams.push(params);if(rpcImpl)return rpcImpl(name,params);if(name.includes('capacidades'))return {error:{code:'PGRST202',message:'Could not find public.f6_service_capacidades_lector_factura_rev84'}};return name.includes('reservar')?{data:{ok:!reservationError}}:{data:{ok:!telemetryError}};}};
 const context={...m,...providers,Error,Response,Request,TextEncoder,TextDecoder,AbortController,setTimeout,clearTimeout,Set,console:{error:(...x)=>logs.push(x)},jsonResponse:(b,s,h)=>new Response(JSON.stringify(b),{status:s,headers:h}),createClient:()=>client,Deno:{env:{get:n=>n==='OPENAI_API_KEY'?(openai?'synthetic':''):n==='F6_ALLOWED_ORIGINS'?'https://micomercio.ar':'synthetic'},serve:h=>handler=h},fetch:async()=>{calls++;if(throws)throw throws;if(responses)return responses[calls-1];return new Response(typeof body==='string'?body:JSON.stringify(body),{status,headers:{'content-type':'application/json','retry-after':'12'}});}};
 let source=fs.readFileSync(path.join(root,'supabase/functions/leer-factura/index.ts'),'utf8').replace(/^import[\s\S]*?from\s+"[^"]+";\s*/gm,'');
 vm.runInNewContext(stripTypeScriptTypes(source),context);
 const response=await handler(new Request('https://example.test/leer-factura',{method:'POST',headers:{authorization:'Bearer synthetic',origin:'https://micomercio.ar'},body:JSON.stringify({comercioId:id,requestId:id,imageBase64:'AAAA',mediaType:'image/png',...(readerContract?{readerContract}:{})})}));
 return {status:response.status,data:await response.json(),logs,calls,rpcs,rpcParams};
}
module.exports={run,modulo,id,invoice,output};
