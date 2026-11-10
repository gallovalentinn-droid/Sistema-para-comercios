const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),{pathToFileURL}=require('node:url');
const shared=f=>import(pathToFileURL(path.resolve(__dirname,'../supabase/functions/_shared',f)).href);
const fila=(producto,cantidad,precioUnit)=>({producto,codigo:'',descripcion:producto,cantidad,unidadesPorBulto:1,precioUnit,descuento:0,subtotal:cantidad*precioUnit,impuestoFila:0});
const factura={proveedor:'Proveedor',nroComprobante:'1',total:180,descuentoGlobal:20,saldoAnterior:0,pagosACuenta:0,
  items:[fila('GASEOSA',2,100),fila('VASOS REGALO',0,50),fila('SORBETES REGALO',0,30)]};
const gemini=d=>({status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(d)}]}]});
const openai=d=>({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(d)}]}]});

test('el descuento general no deja NaN cuando los últimos renglones tienen importe cero',async()=>{
  const {extractGeminiInvoice}=await shared('f6-invoice-reader.mjs'),{extractOpenAIInvoice}=await shared('f6-openai-invoice-reader.mjs');
  for(const [nombre,leer] of [['gemini',o=>extractGeminiInvoice(gemini(factura),o)],['openai',o=>extractOpenAIInvoice(openai(factura),o)]]){
    for(const reviewMode of [false,true]){
      const r=leer({reviewMode});
      assert.deepEqual(r.items.map(i=>i.descuento),[20,0,0],`${nombre} revisión=${reviewMode}`);
      if(reviewMode)assert.deepEqual(r.items.map(i=>i.descuentoGlobalAsignado),[20,0,0],nombre);
    }
  }
});
