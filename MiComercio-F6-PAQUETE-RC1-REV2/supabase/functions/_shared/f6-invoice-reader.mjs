export const F6_INVOICE_MAX_BYTES = 8 * 1024 * 1024;
export const F6_INVOICE_MODEL = 'gemini-3.8-flash';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

const INVOICE_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    proveedor: {
      type: 'string',
      description: 'Nombre del proveedor. Cadena vacía si no se puede leer.',
    },
    nroComprobante: {
      type: 'string',
      description: 'Número completo del comprobante. Cadena vacía si no se puede leer.',
    },
    total: {
      type: 'number',
      minimum: 0,
      description: 'Total final de la factura. Cero si no se puede leer con certeza.',
    },
    items: {
      type: 'array',
      minItems: 0,
      maxItems: 200,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          producto: { type: 'string', description: 'Descripción del producto tal como aparece.' },
          cantidad: { type: 'number', minimum: 0, description: 'Cantidad de cajas, packs o unidades facturadas en la fila.' },
          unidadesPorBulto: { type: 'integer', minimum: 1, description: 'Unidades sueltas dentro de cada caja o pack; 1 si se vende suelto o no consta.' },
          precioUnit: { type: 'number', minimum: 0, description: 'Precio de una caja, pack o unidad de la columna cantidad, antes del descuento.' },
          descuento: { type: 'number', minimum: 0, description: 'Descuento monetario total aplicado a la fila; 0 si no consta.' },
        },
        required: ['producto', 'cantidad', 'unidadesPorBulto', 'precioUnit', 'descuento'],
      },
    },
  },
  required: ['proveedor', 'nroComprobante', 'total', 'items'],
});

const INVOICE_PROMPT = `Leé esta factura o remito de compra para un comercio argentino.
Extraé únicamente datos visibles; no inventes nombres, cantidades ni precios.
Para cada fila de producto:
- producto: descripción impresa;
- cantidad: cantidad facturada de cajas, packs o unidades;
- unidadesPorBulto: unidades sueltas por caja o pack; usá 1 si se compra suelto o el dato no figura;
- precioUnit: precio de cada caja, pack o unidad de la columna cantidad, antes del descuento, no el subtotal de la fila;
- descuento: importe monetario total bonificado en esa fila, o 0.
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
  if (!exactKeys(value, ['comercioId', 'requestId', 'imageBase64', 'mediaType'])
    || typeof value.comercioId !== 'string' || !UUID_RE.test(value.comercioId)
    || typeof value.requestId !== 'string' || !UUID_RE.test(value.requestId)
    || typeof value.mediaType !== 'string' || !IMAGE_TYPES.has(value.mediaType)
    || typeof value.imageBase64 !== 'string') {
    return { ok: false, code: 'DATOS_INVALIDOS' };
  }
  const imageBytes = decodedBase64Bytes(value.imageBase64);
  if (imageBytes < 1) return { ok: false, code: 'DATOS_INVALIDOS' };
  if (imageBytes > F6_INVOICE_MAX_BYTES) return { ok: false, code: 'IMAGEN_DEMASIADO_GRANDE' };
  return { ok: true, ...value, imageBytes };
}

export function buildGeminiInvoiceRequest({ imageBase64, mediaType, model = F6_INVOICE_MODEL }) {
  return {
    model,
    store: false,
    input: [
      { type: 'text', text: INVOICE_PROMPT },
      { type: 'image', data: imageBase64, mime_type: mediaType },
    ],
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: INVOICE_SCHEMA,
    },
    generation_config: {
      max_output_tokens: 8192,
      thinking_level: 'minimal',
    },
  };
}

function boundedText(value, maximum) {
  if (typeof value !== 'string') throw new Error('F6_GEMINI_OUTPUT_INVALID');
  const result = value.trim();
  if (result.length > maximum) throw new Error('F6_GEMINI_OUTPUT_INVALID');
  return result;
}

function boundedNumber(value, maximum, { integer = false, minimum = 0 } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error('F6_GEMINI_OUTPUT_INVALID');
  }
  if (integer && !Number.isInteger(value)) throw new Error('F6_GEMINI_OUTPUT_INVALID');
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

export function extractGeminiInvoice(response) {
  let parsed;
  try {
    parsed = JSON.parse(modelOutputText(response));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('F6_GEMINI_')) throw error;
    throw new Error('F6_GEMINI_OUTPUT_INVALID');
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.items) || parsed.items.length > 200) {
    throw new Error('F6_GEMINI_OUTPUT_INVALID');
  }
  return {
    proveedor: boundedText(parsed.proveedor, 160),
    nroComprobante: boundedText(parsed.nroComprobante, 80),
    total: boundedNumber(parsed.total, 1_000_000_000_000),
    items: parsed.items.map((item) => {
      if (!isRecord(item)) throw new Error('F6_GEMINI_OUTPUT_INVALID');
      const producto = boundedText(item.producto, 200);
      if (!producto) throw new Error('F6_GEMINI_OUTPUT_INVALID');
      return {
        producto,
        cantidad: boundedNumber(item.cantidad, 1_000_000),
        unidadesPorBulto: boundedNumber(item.unidadesPorBulto, 1_000_000, { integer: true, minimum: 1 }),
        precioUnit: boundedNumber(item.precioUnit, 1_000_000_000),
        descuento: boundedNumber(item.descuento, 1_000_000_000),
      };
    }),
  };
}
