import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import * as invoiceReader from '../supabase/functions/_shared/f6-invoice-reader.mjs';

import {
  F6_INVOICE_MAX_BYTES,
  F6_INVOICE_MODEL,
  buildGeminiInvoiceRequest,
  classifyGeminiProviderError,
  extractGeminiInvoice,
  extractGeminiUsage,
  validateInvoiceImageRequest,
} from '../supabase/functions/_shared/f6-invoice-reader.mjs';

const COMMERCE_ID = '11111111-1111-4111-8111-111111111111';
const REQUEST_ID = '22222222-2222-4222-8222-222222222222';
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlL7JwAAAAASUVORK5CYII=';
const edgeSource = () => readFileSync(
  new URL('../supabase/functions/leer-factura/index.ts', import.meta.url),
  'utf8',
);
const clientSource = () => readFileSync(
  new URL('../entregables/MiComercio-F6-PRUEBA.html', import.meta.url),
  'utf8',
);
const f5AuthoritySql = () => readFileSync(
  new URL('../supabase/f5/01_authority_membership.sql', import.meta.url),
  'utf8',
);
const f6InvoiceSql = () => readFileSync(
  new URL('../supabase/f6/10_invoice_reader.sql', import.meta.url),
  'utf8',
);

test('acepta el contrato exacto de una imagen y formatos compatibles con cámaras', () => {
  for (const mediaType of ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']) {
    const result = validateInvoiceImageRequest({
      comercioId: COMMERCE_ID,
      requestId: REQUEST_ID,
      imageBase64: PNG_1X1,
      mediaType,
    });
    assert.equal(result.ok, true, mediaType);
  }
  assert.equal(validateInvoiceImageRequest({
    comercioId: COMMERCE_ID,
    requestId: REQUEST_ID,
    imageBase64: PNG_1X1,
    mediaType: 'image/png',
    apiKey: 'no-debe-aceptarse',
  }).ok, false);
});

test('rechaza identificadores, MIME y base64 inválidos', () => {
  const base = { comercioId: COMMERCE_ID, requestId: REQUEST_ID, imageBase64: PNG_1X1, mediaType: 'image/png' };
  assert.equal(validateInvoiceImageRequest({ ...base, comercioId: 'no-uuid' }).ok, false);
  assert.equal(validateInvoiceImageRequest({ ...base, requestId: 'no-uuid' }).ok, false);
  assert.equal(validateInvoiceImageRequest({ ...base, mediaType: 'application/pdf' }).ok, false);
  assert.equal(validateInvoiceImageRequest({ ...base, imageBase64: '***' }).ok, false);
  assert.equal(validateInvoiceImageRequest({ ...base, imageBase64: '' }).ok, false);
});

test('rechaza imágenes que superan 8 MB sin decodificarlas', () => {
  const encodedLength = Math.ceil((F6_INVOICE_MAX_BYTES + 1) / 3) * 4;
  const oversized = 'A'.repeat(encodedLength);
  const result = validateInvoiceImageRequest({
    comercioId: COMMERCE_ID,
    requestId: REQUEST_ID,
    imageBase64: oversized,
    mediaType: 'image/jpeg',
  });
  assert.deepEqual(result, { ok: false, code: 'IMAGEN_DEMASIADO_GRANDE' });
});

test('construye una solicitud Gemini estructurada, efímera y sin secretos', () => {
  const request = buildGeminiInvoiceRequest({ imageBase64: PNG_1X1, mediaType: 'image/png' });
  assert.equal(F6_INVOICE_MODEL, 'gemini-3.8-flash');
  assert.equal(request.model, F6_INVOICE_MODEL);
  assert.equal(request.store, false);
  assert.equal(request.generation_config.thinking_level, 'low');
  assert.equal(request.input[1].type, 'image');
  assert.equal(request.input[1].data, PNG_1X1);
  assert.equal(request.input[1].mime_type, 'image/png');
  assert.equal(request.response_format.mime_type, 'application/json');
  assert.deepEqual(request.response_format.schema.required.sort(), ['items', 'nroComprobante', 'proveedor', 'total'].sort());
  const schemaText = JSON.stringify(request.response_format.schema);
  assert.ok(schemaText.length < 800, 'el esquema enviado debe mantenerse debajo del límite práctico del proveedor');
  assert.doesNotMatch(schemaText, /description|additionalProperties|minimum|maxItems|minItems/);
  assert.equal(JSON.stringify(request).includes('api-key'), false);
});

test('extrae y sanea la respuesta, sin dejar pasar campos inventados', () => {
  const invoice = extractGeminiInvoice({
    status: 'completed',
    steps: [{
      type: 'model_output',
      content: [{
        type: 'text',
        text: JSON.stringify({
          proveedor: '  Distribuidora Sur  ',
          nroComprobante: ' A-123 ',
          total: 12500.5,
          items: [{
            producto: ' Coca Cola 2,25 L ',
            cantidad: 2,
            unidadesPorBulto: 6,
            precioUnit: 1000,
            descuento: 100,
            ejecutar: 'DROP TABLE',
          }],
          secreto: 'descartar',
        }),
      }],
    }],
  });
  assert.deepEqual(invoice, {
    proveedor: 'Distribuidora Sur',
    nroComprobante: 'A-123',
    total: 12500.5,
    items: [{ producto: 'Coca Cola 2,25 L', cantidad: 2, unidadesPorBulto: 6, precioUnit: 1000, descuento: 100 }],
  });
});

test('rechaza respuestas incompletas, no JSON o con valores fuera de dominio', () => {
  assert.throws(() => extractGeminiInvoice({ status: 'failed', steps: [] }), /F6_GEMINI_INCOMPLETE/);
  assert.throws(() => extractGeminiInvoice({ status: 'completed', steps: [] }), /F6_GEMINI_OUTPUT_MISSING/);
  assert.throws(() => extractGeminiInvoice({
    status: 'completed',
    steps: [{ type: 'model_output', content: [{ type: 'text', text: '{no-json}' }] }],
  }), /F6_GEMINI_OUTPUT_INVALID/);
  assert.throws(() => extractGeminiInvoice({
    status: 'completed',
    steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify({
      proveedor: '', nroComprobante: '', total: -1,
      items: [{ producto: 'Yerba', cantidad: -2, unidadesPorBulto: 1, precioUnit: 10, descuento: 0 }],
    }) }] }],
  }), /F6_GEMINI_OUTPUT_INVALID/);
});

test('extrae el consumo real de tokens que informa Gemini', () => {
  assert.deepEqual(extractGeminiUsage({
    usage: {
      total_input_tokens: 1375,
      total_output_tokens: 241,
      total_thought_tokens: 86,
      total_cached_tokens: 0,
      total_tool_use_tokens: 0,
      total_tokens: 1702,
    },
  }), {
    inputTokens: 1375,
    outputTokens: 241,
    thoughtTokens: 86,
    cachedTokens: 0,
    toolUseTokens: 0,
    totalTokens: 1702,
  });
  assert.deepEqual(extractGeminiUsage({ usage: { total_tokens: -1 } }), {
    inputTokens: 0, outputTokens: 0, thoughtTokens: 0, cachedTokens: 0, toolUseTokens: 0, totalTokens: 0,
  });
});

test('clasifica errores del proveedor sin persistir su cuerpo', () => {
  assert.equal(classifyGeminiProviderError('API key not valid. Please pass a valid API key.'), 'API_KEY_INVALID');
  assert.equal(classifyGeminiProviderError('Invalid JSON payload received. Unknown name "thinking_level"'), 'FIELD_THINKING_LEVEL');
  assert.equal(classifyGeminiProviderError('Invalid value at response_format.schema'), 'FIELD_RESPONSE_FORMAT');
  assert.equal(classifyGeminiProviderError('RESOURCE_EXHAUSTED: quota exceeded; check billing details'), 'QUOTA_EXCEEDED');
  assert.equal(classifyGeminiProviderError('<html>Bad Request</html>'), 'UNKNOWN');
});

test('acota a 200 caracteres el mensaje seguro de un error de procesamiento', () => {
  assert.equal(typeof invoiceReader.safeGeminiErrorMessage, 'function');
  assert.equal(invoiceReader.safeGeminiErrorMessage(new Error('x'.repeat(250))), 'x'.repeat(200));
  assert.equal(invoiceReader.safeGeminiErrorMessage({ message: 'no confiable' }), 'unknown');
});

test('la Edge exige sesión, reserva cupo mensual y guarda Gemini sólo en secretos', () => {
  const source = edgeSource();
  assert.match(source, /getClaims/);
  assert.match(source, /f6_service_reservar_lectura_factura/);
  assert.match(source, /Deno\.env\.get\("GEMINI_API_KEY"\)/);
  assert.match(source, /x-goog-api-key/);
  assert.match(source, /AbortController/);
  assert.match(source, /F6_GEMINI_PROVIDER_ERROR/);
  assert.doesNotMatch(source, /F6_GEMINI_(?:PROVIDER|FORMAT|IMAGE)_PROBE/);
  assert.match(source, /F6_GEMINI_PROCESSING_ERROR/);
  assert.doesNotMatch(source, /console\.error\([^\n]*geminiApiKey/);
  assert.doesNotMatch(source, /console\.error\([^\n]*(?:body|providerError)/);
  assert.doesNotMatch(source, /console\.(?:log|info|debug)\s*\(/);
  assert.doesNotMatch(source, /AIza[0-9A-Za-z_-]{20,}/);
});

test('el cliente registra el consumo real devuelto por cada lectura exitosa', async () => {
  const source = clientSource();
  const start = source.indexOf('function f6RegistrarUsoIa');
  const end = source.indexOf('let revisionFactura=[];', start);
  assert.ok(start >= 0 && end > start, 'falta el registro de uso IA en el cliente');

  const logs = [];
  let revisada = null;
  const context = {
    $: () => ({ innerHTML: 'Elegir foto', style: {} }),
    sb: { functions: { invoke: async () => ({
      data: {
        proveedor: 'Proveedor QA', nroComprobante: 'A-1', total: 1200,
        items: [{ producto: 'Yerba', cantidad: 2, unidadesPorBulto: 1, precioUnit: 600, descuento: 0 }],
        iaUsage: { inputTokens: 1375, outputTokens: 241, thoughtTokens: 86, cachedTokens: 0, toolUseTokens: 0, totalTokens: 1702 },
      },
      error: null,
    }) } },
    sesion: {},
    f3Estado: { comercioId: COMMERCE_ID },
    fileABase64: async () => PNG_1X1,
    crypto: { randomUUID: () => REQUEST_ID },
    abrirRevisionFactura: (data) => { revisada = data; },
    aviso: () => {},
    document: { body: { contains: () => true } },
    console: { info: (...args) => logs.push(args), error: () => {} },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  await vm.runInContext(`leerFacturaFoto({size:32,type:'image/png'},{});`, context);

  assert.equal(revisada?.proveedor, 'Proveedor QA');
  assert.deepEqual(JSON.parse(JSON.stringify(logs)), [[
    'F6_IA_USAGE',
    { inputTokens: 1375, outputTokens: 241, thoughtTokens: 86, cachedTokens: 0, toolUseTokens: 0, totalTokens: 1702 },
  ]]);
});

test('el selector de factura anuncia exclusivamente los formatos aceptados', () => {
  const source = clientSource();
  const input = source.match(/<input type="file" id="facFoto" accept="([^"]+)"/);
  assert.ok(input, 'falta el selector de foto de factura');
  assert.deepEqual(
    input[1].split(',').sort(),
    ['image/heic', 'image/heif', 'image/jpeg', 'image/png', 'image/webp'],
  );
});

test('el cliente rechaza un formato incompatible o ausente antes de leer y enviar', async () => {
  const source = clientSource();
  const start = source.indexOf('function f6RegistrarUsoIa');
  const end = source.indexOf('let revisionFactura=[];', start);
  assert.ok(start >= 0 && end > start, 'falta el bloque del lector IA en el cliente');

  for (const type of ['image/gif', '']) {
    let base64Calls = 0;
    let invokeCalls = 0;
    const avisos = [];
    const context = {
      $: () => ({ innerHTML: 'Elegir foto', style: {} }),
      sb: { functions: { invoke: async () => { invokeCalls += 1; return { data: null, error: null }; } } },
      sesion: {},
      f3Estado: { comercioId: COMMERCE_ID },
      fileABase64: async () => { base64Calls += 1; return PNG_1X1; },
      crypto: { randomUUID: () => REQUEST_ID },
      abrirRevisionFactura: () => {},
      aviso: (...args) => avisos.push(args),
      document: { body: { contains: () => true } },
      console: { info: () => {}, error: () => {} },
    };
    vm.createContext(context);
    vm.runInContext(source.slice(start, end), context);
    await vm.runInContext(`leerFacturaFoto({size:32,type:${JSON.stringify(type)}},{});`, context);

    assert.equal(base64Calls, 0, `no debe leer Base64 para MIME ${JSON.stringify(type)}`);
    assert.equal(invokeCalls, 0, `no debe invocar Supabase para MIME ${JSON.stringify(type)}`);
    assert.equal(avisos.at(-1)?.[0], 'El formato de la imagen no es compatible. Usá JPEG, PNG, WebP, HEIC o HEIF.');
  }
});

test('el cliente normaliza el MIME aceptado antes de enviarlo al servidor', async () => {
  const source = clientSource();
  const start = source.indexOf('function f6RegistrarUsoIa');
  const end = source.indexOf('let revisionFactura=[];', start);
  assert.ok(start >= 0 && end > start, 'falta el bloque del lector IA en el cliente');

  let sentBody = null;
  const context = {
    $: () => ({ innerHTML: 'Elegir foto', style: {} }),
    sb: { functions: { invoke: async (_name, request) => {
      sentBody = request.body;
      return { data: { items: [{ producto: 'Producto QA' }] }, error: null };
    } } },
    sesion: {},
    f3Estado: { comercioId: COMMERCE_ID },
    fileABase64: async () => PNG_1X1,
    crypto: { randomUUID: () => REQUEST_ID },
    abrirRevisionFactura: () => {},
    aviso: () => {},
    document: { body: { contains: () => true } },
    console: { info: () => {}, error: () => {} },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  await vm.runInContext(`leerFacturaFoto({size:32,type:'IMAGE/JPEG'},{});`, context);

  assert.equal(sentBody?.mediaType, 'image/jpeg');
});

test('el permiso del lector permanece dentro del catálogo canónico F5', () => {
  const catalog = f5AuthoritySql().match(/create or replace function private\.f5_catalogo_permisos\(\)[\s\S]*?\$function\$;/i)?.[0] ?? '';
  const reservation = f6InvoiceSql().match(/create or replace function public\.f6_service_reservar_lectura_factura[\s\S]*?\$function\$;/i)?.[0] ?? '';
  assert.match(catalog, /'productos_editar'/);
  assert.match(reservation, /miembro\.permisos->>'productos_editar'\s*=\s*'true'/);
});

test('el cliente identifica comercio y solicitud, y mantiene la revisión humana', () => {
  const source = clientSource();
  assert.match(source, /functions\.invoke\('leer-factura'/);
  assert.match(source, /comercioId:f3Estado\.comercioId/);
  assert.match(source, /requestId:crypto\.randomUUID\(\)/);
  assert.match(source, /Revisá lo que leímos de la factura/);
  assert.match(source, /LIMITE_IA_MENSUAL/);
});
