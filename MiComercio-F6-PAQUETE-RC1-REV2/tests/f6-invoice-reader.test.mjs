import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  F6_INVOICE_MAX_BYTES,
  F6_INVOICE_MODEL,
  buildGeminiInvoiceRequest,
  extractGeminiInvoice,
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
  assert.equal(request.input[1].type, 'image');
  assert.equal(request.input[1].data, PNG_1X1);
  assert.equal(request.input[1].mime_type, 'image/png');
  assert.equal(request.response_format.mime_type, 'application/json');
  assert.deepEqual(request.response_format.schema.required.sort(), ['items', 'nroComprobante', 'proveedor', 'total'].sort());
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

test('la Edge exige sesión, reserva cupo diario y guarda Gemini sólo en secretos', () => {
  const source = edgeSource();
  assert.match(source, /getClaims/);
  assert.match(source, /f6_service_reservar_lectura_factura/);
  assert.match(source, /Deno\.env\.get\("GEMINI_API_KEY"\)/);
  assert.match(source, /x-goog-api-key/);
  assert.match(source, /AbortController/);
  assert.doesNotMatch(source, /console\.(?:log|info|debug)\s*\(/);
  assert.doesNotMatch(source, /AIza[0-9A-Za-z_-]{20,}/);
});

test('el cliente identifica comercio y solicitud, y mantiene la revisión humana', () => {
  const source = clientSource();
  assert.match(source, /functions\.invoke\('leer-factura'/);
  assert.match(source, /comercioId:f3Estado\.comercioId/);
  assert.match(source, /requestId:crypto\.randomUUID\(\)/);
  assert.match(source, /Revisá lo que leímos de la factura/);
  assert.match(source, /LIMITE_IA_DIARIO/);
});
