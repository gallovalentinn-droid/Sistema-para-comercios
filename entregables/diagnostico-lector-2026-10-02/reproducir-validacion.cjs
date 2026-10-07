// Diagnóstico de sólo lectura: datos sintéticos; no invoca Gemini ni Supabase.
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
 const m=await import(pathToFileURL(path.resolve(__dirname,'../../supabase/functions/_shared/f6-invoice-reader.mjs')).href);
 const fila={producto:'Producto de prueba',codigo:'',descripcion:'',cantidad:1,unidadesPorBulto:1,precioUnit:100,descuento:0};
 const base={proveedor:'Proveedor de prueba',nroComprobante:'1',total:100,descuentoGlobal:0,saldoAnterior:0,pagosACuenta:0,items:[fila]};
 const respuesta=datos=>({status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(datos)}]}]});
 const casos=[
  ['lectura válida',base,true],
  ['una fila con cantidad negativa',{...base,items:[fila,{...fila,cantidad:-1}]},false],
  ['una fila con precio negativo',{...base,items:[fila,{...fila,precioUnit:-10}]},false],
  ['una fila con bulto cero',{...base,items:[fila,{...fila,unidadesPorBulto:0}]},false],
  ['cantidad devuelta como texto',{...base,items:[{...fila,cantidad:'1'}]},false],
  ['descuento global supera la mercadería',{...base,descuentoGlobal:101},false],
  ['falta un campo numérico obligatorio',{...base,items:[{...fila,descuento:undefined}]},false],
 ];
 const resultados=[];
 for(const [caso,datos,esperado] of casos){let aceptada=true,error='';try{m.extractGeminiInvoice(respuesta(datos));}catch(e){aceptada=false;error=e.message;}assert.equal(aceptada,esperado,caso);resultados.push({caso,aceptada,error});}
 assert.throws(()=>m.extractGeminiInvoice({status:'in_progress',steps:[]}),/F6_GEMINI_INCOMPLETE/);
 resultados.push({caso:'respuesta incompleta',aceptada:false,error:'F6_GEMINI_INCOMPLETE'});
 const categoria429=m.classifyGeminiProviderError(JSON.stringify({error:{code:'rate_limit_exceeded',message:'Too many requests'}}));
 // REV82 reconoce este código; el informe original conserva la medición de REV80.
 assert.equal(categoria429,'RATE_LIMIT');
 resultados.push({caso:'clasificación del código actual rate_limit_exceeded',categoria:categoria429});
 console.log(JSON.stringify({casos:resultados,redExterna:false},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
