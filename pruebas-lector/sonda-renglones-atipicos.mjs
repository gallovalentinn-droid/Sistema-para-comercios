// Sonda: ¿una sola celda atípica descarta toda la lectura en modo revisión? Sin red ni IA.
import {extractOpenAIInvoice} from '../supabase/functions/_shared/f6-openai-invoice-reader.mjs';
import {extractGeminiInvoice} from '../supabase/functions/_shared/f6-invoice-reader.mjs';

const fila=(producto,cantidad,precioUnit,extra={})=>({producto,codigo:'',descripcion:producto,cantidad,unidadesPorBulto:1,precioUnit,descuento:0,subtotal:Math.round(cantidad*precioUnit*100)/100,impuestoFila:0,...extra});
const base=[fila('GASEOSA COLA 500 ML',12,800),fila('ALFAJOR TRIPLE X 6 UN',2,3000,{unidadesPorBulto:6})];
const casos={
  'devolución con cantidad negativa':fila('DEVOLUCION ENVASES',-6,150),
  'bonificación con precio negativo':fila('BONIF. ESPECIAL',1,-500),
  'nota de crédito en subtotal negativo':fila('NC ROTURA',1,500,{subtotal:-500}),
  'unidadesPorBulto 0 (no figura)':fila('CARAMELOS SURTIDOS',1,900,{unidadesPorBulto:0}),
  'renglón sin descripción (solo código)':fila('',1,700,{codigo:'A-77'}),
  'percepción negativa en impuestoFila':fila('JUGO 1 L',2,1000,{impuestoFila:-30,subtotal:1970}),
};
const openai=d=>({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(d)}]}]});
const gemini=d=>({status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(d)}]}]});
for(const [nombre,extra] of Object.entries(casos)){
  const items=[...base,extra];
  const factura={proveedor:'Distribuidora ficticia',nroComprobante:'0003-00000042',total:items.reduce((s,i)=>s+(i.subtotal??0),0),descuentoGlobal:0,saldoAnterior:0,pagosACuenta:0,items};
  const r={};
  for(const [p,fn] of [['openai',()=>extractOpenAIInvoice(openai(factura),{reviewMode:true})],['gemini',()=>extractGeminiInvoice(gemini(factura),{reviewMode:true})]]){
    try{fn();r[p]='se revisa';}catch(e){r[p]=`DESCARTA TODA LA LECTURA (${e.diagnostic?.field}:${e.diagnostic?.reason}, fila ${e.diagnostic?.row})`;}
  }
  console.log(`${nombre}\n   openai: ${r.openai}\n   gemini: ${r.gemini}`);
}
