const test = require('node:test');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
const file = path.resolve(__dirname, '../supabase/functions/_shared/f6-openai-invoice-reader.mjs');
async function reader() {
  let m;
  try { m = await import(pathToFileURL(file).href); }
  catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }
  assert.ok(m, 'Falta el adaptador OpenAI del lector');
  return m;
}
const item = (extra = {}) => ({producto:'CARAMELOS X 800 G',codigo:'A1',descripcion:'Caramelos',cantidad:2,unidadesPorBulto:1,precioUnit:100,descuento:10,subtotal:190,...extra});
const invoice = (items = [item()], extra = {}) => ({proveedor:'Proveedor',nroComprobante:'0022-00002263',total:190,descuentoGlobal:0,saldoAnterior:0,pagosACuenta:0,items,...extra});
const response = (data, extra = {}) => ({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(data)}]}],...extra});

test('OpenAI genera un pedido de visión con esquema estricto sin alterar la petición Gemini', async () => {
  const m = await reader();
  const req = m.buildOpenAIInvoiceRequest({imageBase64:'AAAA',mediaType:'image/jpeg'});
  assert.equal(req.store, false);
  assert.equal(req.input[0].content[1].image_url, 'data:image/jpeg;base64,AAAA');
  assert.equal(req.text.format.strict, true);
  assert.equal(req.text.format.schema.additionalProperties, false);
  assert.equal(req.text.format.schema.properties.items.items.additionalProperties, false);
  assert.ok(req.text.format.schema.properties.items.items.required.includes('subtotal'));
  const old = await import(pathToFileURL(path.resolve(__dirname,'../supabase/functions/_shared/f6-invoice-reader.mjs')).href);
  assert.equal(old.buildGeminiInvoiceRequest({imageBase64:'AAAA',mediaType:'image/jpeg'}).response_format.schema.properties.items.items.properties.subtotal, undefined);
});

test('OpenAI conserva descuentos generales, deuda y pagos como Gemini, sin validar el subtotal contra el descuento repartido', async () => {
  const m = await reader();
  const r = m.extractOpenAIInvoice(response(invoice([item()],{total:170,descuentoGlobal:20,saldoAnterior:50,pagosACuenta:50})));
  assert.equal(r.items[0].descuento, 30);
  assert.equal(r.descuentoGlobal,20);
  assert.equal(r.saldoAnterior,50);
  assert.equal(r.pagosACuenta,50);
  assert.equal(r.total,170);
  assert.equal(r.items[0].subtotal,undefined,'La evidencia no cambia el contrato que consume la beta');
});

test('OpenAI obtiene packs de presentaciones explícitas sin multiplicar la cantidad ni convertir gramos en unidades', async () => {
  const m = await reader();
  const names = ['ALF. BLANCO X 12 UNI','CADBURY 12 UNI X 29 G','PIPAS TIRA X 10 UNI','SPEEDX473CCX6U-SP','GOMA X 1 KG','CHOCO X 20 G'];
  const r = m.extractOpenAIInvoice(response(invoice(names.map(producto=>item({producto,cantidad:0,precioUnit:0,descuento:0,subtotal:0})))));
  assert.deepEqual(r.items.map(x=>x.unidadesPorBulto),[12,12,10,6,1,1]);
  assert.deepEqual(r.items.map(x=>x.cantidad),[0,0,0,0,0,0]);
  assert.equal(r.items[0].producto,'ALF. BLANCO X 12 UNI');
});

test('OpenAI rechaza el desplazamiento observado de precio y descuento entre filas', async () => {
  const m = await reader();
  const bad = item({producto:'CARAM.ALKA CHERRY X 800 G',codigo:'009302',cantidad:1,precioUnit:6222.77,descuento:311.14,subtotal:10258.78});
  assert.throws(()=>m.extractOpenAIInvoice(response(invoice([bad]))),e=>e.message==='F6_OPENAI_OUTPUT_INVALID'&&e.diagnostic?.field==='subtotal'&&e.diagnostic?.row===1);
});

test('OpenAI conserva códigos repetidos en renglones independientes', async () => {
  const m = await reader();
  const r=m.extractOpenAIInvoice(response(invoice([item({codigo:'032203',cantidad:5,precioUnit:2567.66,descuento:0,subtotal:12838.30}),item({codigo:'032203',cantidad:1,precioUnit:2567.66,descuento:0,subtotal:2567.66})])));
  assert.equal(r.items.length,2);
  assert.deepEqual(r.items.map(x=>x.cantidad),[5,1]);
});

test('OpenAI admite subtotal no visible y tolera redondeo, pero no valores inválidos o ausencia de evidencia', async () => {
  const m = await reader();
  assert.equal(m.extractOpenAIInvoice(response(invoice([item({subtotal:null})]))).items.length,1);
  assert.equal(m.extractOpenAIInvoice(response(invoice([item({subtotal:190.01})]))).items.length,1);
  for(const subtotal of [-1,'190',undefined]) assert.throws(()=>m.extractOpenAIInvoice(response(invoice([item({subtotal})]))),/F6_OPENAI_OUTPUT_INVALID/);
  assert.throws(()=>m.extractOpenAIInvoice(response(invoice([item({cantidad:-1,subtotal:null})]))),/F6_OPENAI_OUTPUT_INVALID/);
});

test('OpenAI rechaza respuesta incompleta, negativa del modelo, texto ausente y JSON inválido', async () => {
  const m = await reader();
  assert.throws(()=>m.extractOpenAIInvoice(response(invoice(),{status:'incomplete'})),/F6_OPENAI_INCOMPLETE/);
  assert.throws(()=>m.extractOpenAIInvoice({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'refusal',refusal:'No'}]}]}),/F6_OPENAI_REFUSAL/);
  assert.throws(()=>m.extractOpenAIInvoice({status:'completed',output:[]}),/F6_OPENAI_OUTPUT_MISSING/);
  assert.throws(()=>m.extractOpenAIInvoice({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'{'}]}]}),/F6_OPENAI_OUTPUT_INVALID/);
});

test('OpenAI normaliza usage sin sumar dos veces los tokens de razonamiento', async () => {
  const m = await reader();
  assert.deepEqual(m.extractOpenAIUsage({usage:{input_tokens:2500,output_tokens:4000,total_tokens:6500,input_tokens_details:{cached_tokens:100},output_tokens_details:{reasoning_tokens:1200}}}),{inputTokens:2500,outputTokens:4000,thoughtTokens:1200,cachedTokens:100,toolUseTokens:0,totalTokens:6500});
});

test('OpenAI admite sectores legibles de la misma foto como apoyo, conservando la imagen completa', async () => {
  const m=await reader();
  const r=m.buildOpenAIInvoiceRequest({imageBase64:'AAAA',mediaType:'image/jpeg',imageParts:[{imageBase64:'BBBB',mediaType:'image/png'},{imageBase64:'CCCC',mediaType:'image/jpeg'}]});
  const images=r.input[0].content.filter(c=>c.type==='input_image');
  assert.deepEqual(images.map(c=>c.image_url),['data:image/jpeg;base64,AAAA','data:image/png;base64,BBBB','data:image/jpeg;base64,CCCC']);
});

test('OpenAI conserva lo impreso cuando la expansión introduce letras de otro alfabeto', async () => {
  const m=await reader();
  const r=m.extractOpenAIInvoice(response(invoice([item({producto:'GOMA MOGUL VIBORITAS X 12 UNI',descripcion:'Goma Mogul Vibორitas x 12 unidades'})])));
  assert.equal(r.items[0].descripcion,'GOMA MOGUL VIBORITAS X 12 UNI');
  assert.equal(r.items[0].unidadesPorBulto,12);
});

test('OpenAI no interpreta un código entre paréntesis como unidades por pack', async () => {
  const m=await reader();
  const r=m.extractOpenAIInvoice(response(invoice([item({producto:'CARAMELOS 800 G (X12U)',codigo:'X12U',unidadesPorBulto:1})])));
  assert.equal(r.items[0].unidadesPorBulto,1);
});

test('OpenAI coteja subtotales con impuestos de fila separados sin cambiar el contrato Gemini', async () => {
  const m=await reader();
  const r=m.extractOpenAIInvoice(response(invoice([item({cantidad:1,precioUnit:100,descuento:0,impuestoFila:21,subtotal:121})],{total:121})));
  assert.equal(r.total,121);
  assert.equal(r.items[0].precioUnit,100);
  assert.equal(r.items[0].impuestoFila,undefined);
  assert.throws(()=>m.extractOpenAIInvoice(response(invoice([item({impuestoFila:-1})]))),/F6_OPENAI_OUTPUT_INVALID/);
});
