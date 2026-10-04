import {checkInvoiceRow,detectInvoicePack,INVOICE_REVIEW_RULES} from './f6-invoice-review.mjs';
export const F6_INVOICE_MAX_BYTES = 8 * 1024 * 1024;
export const F6_INVOICE_MODEL = 'gemini-3.8-flash';
export const F6_INVOICE_PROVIDER_TIMEOUT_MS = 90_000;
// REV70: cada renglón suma código y descripción (~20 tokens). Con 16384 entran unos 165 renglones.
export const F6_INVOICE_MAX_OUTPUT_TOKENS = 16384;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

const INVOICE_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    proveedor: { type: 'string' },
    nroComprobante: { type: 'string' },
    total: { type: 'number' },
    descuentoGlobal: { type: 'number' },
    saldoAnterior: { type: 'number' },
    pagosACuenta: { type: 'number' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          producto: { type: 'string' },
          codigo: { type: 'string' },
          descripcion: { type: 'string' },
          cantidad: { type: 'number' },
          unidadesPorBulto: { type: 'integer' },
          precioUnit: { type: 'number' },
          descuento: { type: 'number' },
        },
        required: ['producto', 'codigo', 'descripcion', 'cantidad', 'unidadesPorBulto', 'precioUnit', 'descuento'],
      },
    },
  },
  required: ['proveedor', 'nroComprobante', 'total', 'descuentoGlobal', 'saldoAnterior', 'pagosACuenta', 'items'],
});

const INVOICE_PROMPT = `Leé esta factura o remito de compra para un comercio argentino.
Extraé únicamente datos visibles; no inventes nombres, cantidades ni precios.
Para cada fila de producto:
- producto: descripción impresa, tal cual figura, con sus abreviaturas;
- codigo: código de artículo del proveedor impreso en esa fila (columna código, art. o cód.), o "" si no hay;
- descripcion: la misma descripción escrita completa y legible (marca, producto, variedad y presentación, por ejemplo "Lata Speed Unlimited 473 ml"). Expandí solo abreviaturas evidentes; si no estás seguro, repetí la descripción impresa;
- cantidad: cantidad facturada de cajas, packs o unidades, tal como está impresa (si dice 0, devolvé 0);
- unidadesPorBulto: unidades sueltas por caja o pack; usá 1 si se compra suelto o el dato no figura;
- precioUnit: precio de cada caja, pack o unidad de la columna cantidad, antes del descuento, no el subtotal de la fila;
- descuento: importe monetario total bonificado específicamente en esa fila, o 0;
- descuentoGlobal: descuento general aplicado fuera de las filas (por pago, promoción o total de la factura), o 0. No lo repitas en descuento de cada fila.
- saldoAnterior: deuda o saldo anterior que el total incluye y que no es mercadería de esta compra (por ejemplo una fila «DEUDA» o «SALDO ANTERIOR»), o 0.
- pagosACuenta: pagos, anticipos o entregas a cuenta ya restados del total visible del ticket, o 0. Informalos aparte: no son descuentos del precio de la mercadería. total conserva el importe final visible, sin volver a sumar ni restar esos ajustes.
No pongas en items las filas de deuda, saldo anterior, pagos o entregas a cuenta: no son productos.
Usá números sin símbolos de moneda ni separadores de miles. Si la imagen no es una factura legible, devolvé items vacío. La persona revisará todos los valores antes de cargarlos.`;

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function decodedBase64Bytes(value) {
  if (!value || value.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(value)) return -1;
  const firstPadding = value.indexOf('=');
  if (firstPadding !== -1 && firstPadding < value.length - 2) return -1;
  if (firstPadding !== -1 && !/^={1,2}$/.test(value.slice(firstPadding))) return -1;
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

export function validateInvoiceImageRequest(value) {
  const keys = ['comercioId', 'requestId', 'imageBase64', 'mediaType'];
  if (isRecord(value) && Object.prototype.hasOwnProperty.call(value, 'imageParts')) keys.push('imageParts');
  if (isRecord(value) && Object.prototype.hasOwnProperty.call(value, 'readerContract')) keys.push('readerContract');
  if (!exactKeys(value, keys)
    || typeof value.comercioId !== 'string' || !UUID_RE.test(value.comercioId)
    || typeof value.requestId !== 'string' || !UUID_RE.test(value.requestId)
    || typeof value.mediaType !== 'string' || !IMAGE_TYPES.has(value.mediaType)
    || typeof value.imageBase64 !== 'string'
    || (keys.includes('readerContract') && (typeof value.readerContract !== 'string' || value.readerContract.length>80))) {
    return { ok: false, code: 'DATOS_INVALIDOS' };
  }
  const imageBytes = decodedBase64Bytes(value.imageBase64);
  if (imageBytes < 1) return { ok: false, code: 'DATOS_INVALIDOS' };
  if (imageBytes > F6_INVOICE_MAX_BYTES) return { ok: false, code: 'IMAGEN_DEMASIADO_GRANDE' };
  if (keys.includes('imageParts')) {
    if (!Array.isArray(value.imageParts) || value.imageParts.length > 3) return { ok: false, code: 'DATOS_INVALIDOS' };
    let partBytes = 0;
    for (const part of value.imageParts) {
      if (!exactKeys(part, ['imageBase64', 'mediaType']) || !['image/png', 'image/jpeg', 'image/webp'].includes(part.mediaType)
        || typeof part.imageBase64 !== 'string') return { ok: false, code: 'DATOS_INVALIDOS' };
      const bytes = decodedBase64Bytes(part.imageBase64);
      if (bytes < 1) return { ok: false, code: 'DATOS_INVALIDOS' };
      partBytes += bytes;
      if (partBytes > F6_INVOICE_MAX_BYTES) return { ok: false, code: 'IMAGEN_DEMASIADO_GRANDE' };
    }
  }
  return { ok: true, ...value, imageBytes };
}

export function classifyGeminiProviderError(value) {
  let provider;
  try { provider = JSON.parse(String(value ?? '')).error; } catch (_) {}
  const code = String(provider?.code ?? provider?.status ?? '').toLowerCase();
  const known = {rate_limit_exceeded:'RATE_LIMIT',too_many_requests:'RATE_LIMIT',quota_exceeded:'DAILY_QUOTA',service_unavailable:'UNAVAILABLE',unavailable:'UNAVAILABLE',internal:'INTERNAL',internal_error:'INTERNAL',resource_exhausted:'QUOTA_EXCEEDED',invalid_argument:'INVALID_ARGUMENT',model_not_found:'MODEL_NOT_FOUND',not_found:'RESOURCE_NOT_FOUND',authentication:'AUTHENTICATION',deadline_exceeded:'PROVIDER_TIMEOUT',authentication_error:'API_KEY_INVALID',payment_required:'BILLING_REQUIRED',permission_denied:'PERMISSION_DENIED'};
  if (Object.prototype.hasOwnProperty.call(known, code)) return known[code];
  const text = String(value ?? '').toLowerCase();
  if (/api[_ ]key[_ ]invalid|api key not valid|invalid api key/.test(text)) return 'API_KEY_INVALID';
  if (/service[_ ]disabled|api has not been used|generativelanguage[^\n]{0,160}disabled/.test(text)) return 'API_DISABLED';
  const statusCode = String(provider?.status ?? '').toLowerCase();
  if (Object.prototype.hasOwnProperty.call(known, statusCode)) return known[statusCode];
  // REV70: el 503 de modelo saturado ya no se registra como UNKNOWN.
  if (/"unavailable"|overloaded|high demand|try again later/.test(text)) return 'UNAVAILABLE';
  if (/"internal"|internal error/.test(text)) return 'INTERNAL';
  if (/model[^\n]{0,120}not found|not found[^\n]{0,120}model/.test(text)) return 'MODEL_NOT_FOUND';
  if (/thinking[_ ]level/.test(text)) return 'FIELD_THINKING_LEVEL';
  if (/response[_ ]format/.test(text)) return 'FIELD_RESPONSE_FORMAT';
  if (/mime[_ ]type|base64|image/.test(text)) return 'FIELD_IMAGE';
  if (/resource[_ ]exhausted|quota/.test(text)) return 'QUOTA_EXCEEDED';
  if (/billing/.test(text)) return 'BILLING_REQUIRED';
  if (/permission[_ ]denied|permission denied|forbidden/.test(text)) return 'PERMISSION_DENIED';
  if (/invalid argument|invalid json|unknown field|unknown name/.test(text)) return 'INVALID_ARGUMENT';
  return 'UNKNOWN';
}

export function safeGeminiErrorMessage(error) {
  const code = error instanceof Error ? error.message : '';
  return ['F6_GEMINI_OUTPUT_INVALID','F6_GEMINI_INCOMPLETE','F6_GEMINI_OUTPUT_MISSING'].includes(code) ? code : 'UNKNOWN';
}

// Sólo categorías conocidas y metadatos: nunca se devuelve el mensaje crudo de Google.
export function geminiProviderDiagnostic(text, status, retryAfter) {
  let category = classifyGeminiProviderError(text);
  if (category === 'UNKNOWN' && status === 503) category = 'UNAVAILABLE';
  if (category === 'UNKNOWN' && status === 500) category = 'INTERNAL';
  const diagnostic = {providerStatus: status, providerCategory: category};
  const seconds = typeof retryAfter === 'string' && /^\d{1,6}$/.test(retryAfter) ? Number(retryAfter) : 0;
  if (seconds > 0 && seconds <= 86400) diagnostic.retryAfterSeconds = seconds;
  return diagnostic;
}

function invalidOutput(field, reason, row) {
  const error = new Error('F6_GEMINI_OUTPUT_INVALID');
  error.diagnostic = {field, reason, ...(row ? {row} : {})};
  return error;
}

export function buildGeminiInvoiceRequest({ imageBase64, mediaType, imageParts=[], reviewMode=false, model = F6_INVOICE_MODEL }) {
  const schema=structuredClone(INVOICE_SCHEMA);
  if(reviewMode){
    schema.properties.items.items.properties.subtotal={type:['number','null']};
    schema.properties.items.items.properties.impuestoFila={type:'number'};
    schema.properties.items.items.required.push('subtotal','impuestoFila');
  }
  return {
    model,
    store: false,
    input: [
      { type: 'text', text: INVOICE_PROMPT+(reviewMode?INVOICE_REVIEW_RULES:'') },
      { type: 'image', data: imageBase64, mime_type: mediaType },
      ...imageParts.map(p=>({type:'image',data:p.imageBase64,mime_type:p.mediaType})),
    ],
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema,
    },
    generation_config: {
      max_output_tokens: F6_INVOICE_MAX_OUTPUT_TOKENS,
      thinking_level: 'low',
    },
  };
}

function boundedText(value, maximum, field) {
  if (typeof value !== 'string') throw invalidOutput(field, 'EXPECTED_TEXT');
  const result = value.trim();
  if (result.length > maximum) throw invalidOutput(field, 'TOO_LONG');
  return result;
}

// REV70: código y descripción ayudan a emparejar, pero no invalidan la lectura si faltan o vienen mal.
function optionalCode(value) {
  if (typeof value !== 'string') return '';
  const result = value.trim();
  return result.length <= 40 && /^[\p{L}\p{N} ._\-/]*$/u.test(result) ? result : '';
}

function optionalText(value, maximum) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function boundedNumber(value, maximum, { integer = false, minimum = 0, field } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw invalidOutput(field, 'EXPECTED_NUMBER');
  if (value < minimum) throw invalidOutput(field, 'BELOW_MINIMUM');
  if (value > maximum) throw invalidOutput(field, 'ABOVE_MAXIMUM');
  if (integer && !Number.isInteger(value)) throw invalidOutput(field, 'EXPECTED_INTEGER');
  return value;
}

function modelOutputText(response) {
  if (!isRecord(response) || response.status !== 'completed') throw new Error('F6_GEMINI_INCOMPLETE');
  const steps = Array.isArray(response.steps) ? response.steps : [];
  for (let stepIndex = steps.length - 1; stepIndex >= 0; stepIndex -= 1) {
    const step = steps[stepIndex];
    if (!isRecord(step) || step.type !== 'model_output' || !Array.isArray(step.content)) continue;
    for (let contentIndex = step.content.length - 1; contentIndex >= 0; contentIndex -= 1) {
      const content = step.content[contentIndex];
      if (isRecord(content) && content.type === 'text' && typeof content.text === 'string' && content.text.trim()) {
        return content.text;
      }
    }
  }
  throw new Error('F6_GEMINI_OUTPUT_MISSING');
}

export function extractGeminiInvoice(response,{reviewMode=false}={}) {
  let parsed;
  try {
    parsed = JSON.parse(modelOutputText(response));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('F6_GEMINI_')) throw error;
    throw invalidOutput('response', 'INVALID_JSON');
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.items) || parsed.items.length > 200) {
    throw invalidOutput('items', Array.isArray(parsed?.items) ? 'TOO_MANY_ROWS' : 'EXPECTED_ROWS');
  }
  const items = parsed.items.map((item, index) => {
    try {
    if (!isRecord(item)) throw invalidOutput('items', 'EXPECTED_ROW');
    const producto = boundedText(item.producto, 200, 'producto');
    if (!producto) throw invalidOutput('producto', 'EMPTY_TEXT');
    const result={
      producto,
      codigo: optionalCode(item.codigo),
      descripcion: optionalText(item.descripcion, 200),
      cantidad: boundedNumber(item.cantidad, 1_000_000, {field:'cantidad'}),
      unidadesPorBulto: boundedNumber(item.unidadesPorBulto, 1_000_000, { integer: true, minimum: 1, field:'unidadesPorBulto' }),
      precioUnit: boundedNumber(item.precioUnit, 1_000_000_000, {field:'precioUnit'}),
      descuento: boundedNumber(item.descuento, 1_000_000_000_000, {field:'descuento'}),
    };
    if(reviewMode){
      result.impuestoFila=boundedNumber(item.impuestoFila===undefined?0:item.impuestoFila,1e12,{field:'impuestoFila'});
      result.subtotal=item.subtotal==null?null:boundedNumber(item.subtotal,1e12,{field:'subtotal'});
      result.descuentoFila=result.descuento;
      result.descuentoGlobalAsignado=0;
      result.packDetectado=detectInvoicePack(result.producto);
      result.revisionImporte=checkInvoiceRow(result);
    }
    return result;
    } catch (error) {
      if (error.diagnostic) error.diagnostic.row = index + 1;
      throw error;
    }
  });
  const descuentoGlobal = boundedNumber(parsed.descuentoGlobal, 1_000_000_000_000, {field:'descuentoGlobal'});
  if (descuentoGlobal > 0) {
    const bases = items.map((item) => Math.max(0, item.cantidad * item.precioUnit - item.descuento+(reviewMode?item.impuestoFila:0)));
    const totalBase = bases.reduce((sum, value) => sum + value, 0);
    if (totalBase <= 0 || descuentoGlobal > totalBase + 0.005) throw invalidOutput('descuentoGlobal', 'EXCEEDS_ITEMS_TOTAL');

    let descuentoRestante = Math.round(descuentoGlobal * 100);
    let baseRestante = totalBase;
    items.forEach((item, index) => {
      const base = bases[index];
      const asignado = index === items.length - 1
        ? descuentoRestante
        : Math.min(descuentoRestante, Math.round(descuentoRestante * base / baseRestante));
      item.descuento = Math.round((item.descuento + asignado / 100) * 100) / 100;
      if(reviewMode)item.descuentoGlobalAsignado=asignado/100;
      descuentoRestante -= asignado;
      baseRestante -= base;
    });
  }

  // REV77: el saldo anterior es informativo; si falta o viene mal, no invalida la lectura.
  const saldoAnterior = typeof parsed.saldoAnterior === 'number' && Number.isFinite(parsed.saldoAnterior)
    && parsed.saldoAnterior >= 0 && parsed.saldoAnterior <= 1_000_000_000_000 ? parsed.saldoAnterior : 0;
  const pagosACuenta = typeof parsed.pagosACuenta === 'number' && Number.isFinite(parsed.pagosACuenta)
    && parsed.pagosACuenta >= 0 && parsed.pagosACuenta <= 1_000_000_000_000 ? parsed.pagosACuenta : 0;
  return {
    proveedor: boundedText(parsed.proveedor, 160, 'proveedor'),
    nroComprobante: boundedText(parsed.nroComprobante, 80, 'nroComprobante'),
    total: boundedNumber(parsed.total, 1_000_000_000_000, {field:'total'}),
    descuentoGlobal,
    saldoAnterior,
    pagosACuenta,
    items,
  };
}

function usageToken(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function extractGeminiUsage(response) {
  const usage = isRecord(response) && isRecord(response.usage) ? response.usage : {};
  return {
    inputTokens: usageToken(usage.total_input_tokens),
    outputTokens: usageToken(usage.total_output_tokens),
    thoughtTokens: usageToken(usage.total_thought_tokens),
    cachedTokens: usageToken(usage.total_cached_tokens),
    toolUseTokens: usageToken(usage.total_tool_use_tokens),
    totalTokens: usageToken(usage.total_tokens),
  };
}

// REV70: se registran solo los campos que la lectura trajo con valor (antes eran siempre los cinco).
export function recognizedInvoiceFields(invoice) {
  const fields = [];
  if (typeof invoice?.proveedor === 'string' && invoice.proveedor.trim()) fields.push('proveedor');
  if (typeof invoice?.nroComprobante === 'string' && invoice.nroComprobante.trim()) fields.push('nroComprobante');
  if (Number(invoice?.total) > 0) fields.push('total');
  if (Number(invoice?.descuentoGlobal) > 0) fields.push('descuentoGlobal');
  if (Array.isArray(invoice?.items) && invoice.items.length > 0) fields.push('items');
  return fields;
}

export function buildInvoiceTelemetry({ invoice, usage, model = F6_INVOICE_MODEL }) {
  const safeUsage = isRecord(usage) ? usage : {};
  return {
    model,
    usage: {
      inputTokens: usageToken(safeUsage.inputTokens),
      outputTokens: usageToken(safeUsage.outputTokens),
      thoughtTokens: usageToken(safeUsage.thoughtTokens),
      cachedTokens: usageToken(safeUsage.cachedTokens),
      toolUseTokens: usageToken(safeUsage.toolUseTokens),
      totalTokens: usageToken(safeUsage.totalTokens),
    },
    recognizedFields: recognizedInvoiceFields(invoice),
    recognizedItems: Array.isArray(invoice?.items) ? Math.min(200, invoice.items.length) : 0,
  };
}
