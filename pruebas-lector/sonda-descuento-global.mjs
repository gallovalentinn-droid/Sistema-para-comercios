// Sonda: reparto del descuento general cuando los últimos renglones tienen importe 0. Sin red ni IA.
import {extractGeminiInvoice} from '../supabase/functions/_shared/f6-invoice-reader.mjs';
import {extractOpenAIInvoice} from '../supabase/functions/_shared/f6-openai-invoice-reader.mjs';

const fila=(producto,cantidad,precioUnit,extra={})=>({producto,codigo:'',descripcion:producto,cantidad,unidadesPorBulto:1,precioUnit,descuento:0,subtotal:cantidad*precioUnit,impuestoFila:0,...extra});
const factura={proveedor:'Proveedor ficticio',nroComprobante:'0001-00000001',total:180,descuentoGlobal:20,saldoAnterior:0,pagosACuenta:0,
  items:[fila('GASEOSA COLA X 6 UN',2,100),fila('BONIFICACION ALFAJOR',1,0),fila('VASOS REGALO',0,50)]};
const gemini=d=>({status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(d)}]}]});
const openai=d=>({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(d)}]}]});

for(const [nombre,fn] of [['gemini',()=>extractGeminiInvoice(gemini(factura))],['gemini-revision',()=>extractGeminiInvoice(gemini(factura),{reviewMode:true})],
  ['openai',()=>extractOpenAIInvoice(openai(factura))],['openai-revision',()=>extractOpenAIInvoice(openai(factura),{reviewMode:true})]]){
  try{const r=fn();console.log(nombre,JSON.stringify(r.items.map(i=>i.descuento)),'→ JSON enviado:',JSON.stringify(r.items.map(i=>({descuento:i.descuento}))));}
  catch(e){console.log(nombre,'ERROR',e.message,JSON.stringify(e.diagnostic));}
}
