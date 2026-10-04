const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {pathToFileURL} = require('node:url');

const root = path.resolve(__dirname, '..');
// REV71: import() necesita una URL de archivo; con una ruta de Windows (C:\...) Node la toma como esquema «c:».
const modulo = () => import(pathToFileURL(path.join(root, 'supabase/functions/_shared/f6-invoice-reader.mjs')).href);
const respuesta = (datos, extra = {}) => ({status: 'completed', steps: [{type: 'model_output', content: [{type: 'text', text: JSON.stringify(datos)}]}], ...extra});
const base = {proveedor: 'Limón', nroComprobante: '0002-00012345', total: 100, descuentoGlobal: 0};

test('REV70 el pedido a Gemini pide código y descripción expandida sin perder lo impreso', async () => {
  const m = await modulo();
  const pedido = m.buildGeminiInvoiceRequest({imageBase64: 'AAAA', mediaType: 'image/jpeg'});
  const fila = pedido.response_format.schema.properties.items.items;
  assert.deepEqual(Object.keys(fila.properties), ['producto', 'codigo', 'descripcion', 'cantidad', 'unidadesPorBulto', 'precioUnit', 'descuento']);
  assert.deepEqual(fila.required, ['producto', 'codigo', 'descripcion', 'cantidad', 'unidadesPorBulto', 'precioUnit', 'descuento']);
  const prompt = pedido.input[0].text;
  assert.match(prompt, /producto: descripción impresa, tal cual figura, con sus abreviaturas/);
  assert.match(prompt, /codigo: código de artículo del proveedor/);
  assert.match(prompt, /Expandí solo abreviaturas evidentes; si no estás seguro, repetí la descripción impresa/);
  assert.equal(pedido.generation_config.max_output_tokens, 16384);
  assert.equal(pedido.generation_config.thinking_level, 'low');
  assert.equal(pedido.store, false);
  assert.equal(pedido.model, 'gemini-3.8-flash');
});

test('REV70 la lectura acepta código y descripción, y no se cae si faltan o vienen mal', async () => {
  const m = await modulo();
  const fila = {producto: 'SPEEDXLUNLIMITEDX473CCX6U-SP', cantidad: 4, unidadesPorBulto: 6, precioUnit: 9000, descuento: 0};
  const r = m.extractGeminiInvoice(respuesta({...base, items: [
    {...fila, codigo: ' 7790-123 ', descripcion: ' Lata Speed Unlimited 473 ml '},
    {...fila},
    {...fila, codigo: 12345, descripcion: null},
    {...fila, codigo: 'X'.repeat(41), descripcion: 'D'.repeat(260)},
    {...fila, codigo: 'ÑANDÚ-1/2', descripcion: ''},
    {...fila, codigo: '<script>', descripcion: 'ok'},
  ]}));
  assert.deepEqual(r.items.map(i => [i.codigo, i.descripcion.length]), [
    ['7790-123', 'Lata Speed Unlimited 473 ml'.length], ['', 0], ['', 0], ['', 200], ['ÑANDÚ-1/2', 0], ['', 2],
  ]);
  assert.equal(r.items[0].producto, 'SPEEDXLUNLIMITEDX473CCX6U-SP', 'lo impreso no se reemplaza');
  // Lo que ya se validaba sigue igual.
  assert.throws(() => m.extractGeminiInvoice(respuesta({...base, items: [{...fila, producto: ''}]})), /F6_GEMINI_OUTPUT_INVALID/);
  assert.throws(() => m.extractGeminiInvoice(respuesta({...base, items: [{...fila, unidadesPorBulto: 0}]})), /F6_GEMINI_OUTPUT_INVALID/);
});

test('REV70 la telemetría registra solo los campos que vinieron con valor', async () => {
  const m = await modulo();
  const usage = {inputTokens: 1300, outputTokens: 900, thoughtTokens: 0, cachedTokens: 0, toolUseTokens: 0, totalTokens: 2200};
  const lleno = m.buildInvoiceTelemetry({invoice: {proveedor: 'X', nroComprobante: '1', total: 10, descuentoGlobal: 2, items: [{}]}, usage});
  assert.deepEqual(lleno.recognizedFields, ['proveedor', 'nroComprobante', 'total', 'descuentoGlobal', 'items']);
  const parcial = m.buildInvoiceTelemetry({invoice: {proveedor: ' ', nroComprobante: '', total: 0, descuentoGlobal: 0, items: []}, usage});
  assert.deepEqual(parcial.recognizedFields, []);
  assert.equal(parcial.recognizedItems, 0);
  const soloItems = m.buildInvoiceTelemetry({invoice: {proveedor: 'Limón', nroComprobante: '', total: 5000, descuentoGlobal: 0, items: [{}, {}]}, usage});
  assert.deepEqual(soloItems.recognizedFields, ['proveedor', 'total', 'items']);
  // La RPC acepta un subconjunto sin repetidos de estos cinco nombres.
  const permitidos = ['proveedor', 'nroComprobante', 'total', 'descuentoGlobal', 'items'];
  assert.ok(lleno.recognizedFields.every(f => permitidos.includes(f)));
});

test('REV70 el 503 de modelo saturado tiene su propia categoría', async () => {
  const m = await modulo();
  const saturado = '{"error":{"code":503,"message":"The model is overloaded. Please try again later.","status":"UNAVAILABLE"}}';
  assert.equal(m.classifyGeminiProviderError(saturado), 'UNAVAILABLE');
  assert.equal(m.classifyGeminiProviderError('{"error":{"code":500,"message":"An internal error has occurred.","status":"INTERNAL"}}'), 'INTERNAL');
  assert.equal(m.classifyGeminiProviderError('{"error":{"message":"API key not valid"}}'), 'API_KEY_INVALID');
  assert.equal(m.classifyGeminiProviderError('{"error":{"status":"RESOURCE_EXHAUSTED","message":"quota"}}'), 'QUOTA_EXCEEDED');
  assert.equal(m.classifyGeminiProviderError('algo raro'), 'UNKNOWN');
});

test('REV70 la función devuelve al navegador los campos nuevos sin cambios en index.ts', () => {
  const index = fs.readFileSync(path.join(root, 'supabase/functions/leer-factura/index.ts'), 'utf8');
  assert.match(index, /return respond\(origin, \{ \.\.\.invoice, iaUsage, iaProvider:result.provider, iaFallbackUsed:result.fallbackUsed,/);
  assert.match(index, /f6_service_reservar_lectura_factura/);
  assert.doesNotMatch(index, /AIza[0-9A-Za-z_-]{20,}/);
});
