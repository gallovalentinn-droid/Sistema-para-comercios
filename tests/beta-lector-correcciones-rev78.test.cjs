const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {pathToFileURL} = require('node:url');
const html = fs.readFileSync(path.join(__dirname, '../beta/index.html'), 'utf8');
const ctx = vm.createContext({numFactura: v => Number(v) || 0, detectarBulto: () => 1});
vm.runInContext(html.slice(html.indexOf('/* REV70_EMPAREJADOR_START */'), html.indexOf('/* REV70_MEMORIA_END */')), ctx);
const catalogo = ['Pipas Clasicas 18gr', 'Pipas Gigantes 50gr', 'Pepas Trío 200 g', 'Papas Lays Clasicas 77gr',
  'Cigarrillo Philip Morris x10', 'Cigarrillo Marlboro Purple Fusion x10', 'Cigarrillo Marlboro Purple Fusion Box x20',
  'Azucar Ledesma', 'Yerba Playadito'].map((nombre, i) => ({id: `qa-${i}`, nombre}));
const idx = ctx.rev70Indice(catalogo);
const preparar = (items, extra = {}) => {
  const parsed = {proveedor: 'Proveedor QA', total: 10000, saldoAnterior: 0, ...extra,
    items: items.map(([producto, cantidad, precioUnit]) => ({producto, cantidad, precioUnit, unidadesPorBulto: 1, descuento: 0}))};
  return [parsed, ctx.rev70PrepararFilas(parsed, catalogo, ctx.rev70MemoriaVacia())];
};

test('una letra puede sugerir, pero no preseleccionar Papas como Pipas ni Pipas como Pepas', () => {
  for (const texto of ['PAPAS CLASICAS18GR', 'PAPAS GIGANTES50GR', 'PIPAS TRIO 200GR']) {
    const r = ctx.rev70Emparejar(texto, idx);
    assert.notEqual(r.estado, 'seguro', texto);
    assert.equal(r.producto, null, texto);
    assert.ok(r.candidatos.length > 0, 'la aproximación sigue sirviendo para sugerir');
  }
});

test('la descripción de IA no convierte una identidad aproximada en elección segura', () => {
  assert.notEqual(ctx.rev70Emparejar('PAPAS CLASICAS18GR', idx, {descripcion: 'Pipas Clasicas 18gr'}).estado, 'seguro');
});

test('las grafías corregibles siguen dando opciones y las identidades exactas siguen eligiéndose', () => {
  const philip = ctx.rev70Emparejar('PHILLP MORRIS X10', idx);
  assert.ok(philip.candidatos.some(c => c.producto.nombre === 'Cigarrillo Philip Morris x10'));
  for (const [texto, esperado] of [['PIPAS CLASICAS18GR', 'Pipas Clasicas 18gr'],
    ['PEPAS TRIO 200GR', 'Pepas Trío 200 g'], ['MARLBORO FUSION2 DE 10', 'Cigarrillo Marlboro Purple Fusion x10']]) {
    assert.equal(ctx.rev70Emparejar(texto, idx).producto?.nombre, esperado, texto);
  }
});

test('un pago a cuenta reduce la deuda neta en vez de sumarse a ella', () => {
  const [parsed, filas] = preparar([['Azucar Ledesma', 10, 1000], ['PAGO A CUENTA', 1, 2000]], {total: 8000});
  assert.equal(ctx.rev77DeudaDelTicket(parsed, filas), -2000);
  assert.equal(parsed.total - ctx.rev77DeudaDelTicket(parsed, filas), 10000);
});

test('una deuda con cantidad cero no modifica el total de mercadería', () => {
  const [parsed, filas] = preparar([['Azucar Ledesma', 10, 1000], ['DEUDA', 0, 5000]]);
  assert.equal(ctx.rev77DeudaDelTicket(parsed, filas), 0);
});

test('poner una fila financiera en cero también anula su copia separada del importe', () => {
  for (const [nombre, extra] of [['DEUDA', {total: 12000, saldoAnterior: 2000}],
    ['PAGO A CUENTA', {total: 8000, pagosACuenta: 2000}]]) {
    const [parsed, filas] = preparar([['Azucar Ledesma', 10, 1000], [nombre, 1, 2000]], extra);
    filas[1].cantidad = 0;
    const cuenta = ctx.rev78CuentaTicket(parsed, filas);
    assert.equal(cuenta.totalMercaderia, extra.total, nombre);
    assert.equal(cuenta.revisar, false, nombre);
  }
});

test('saldo anterior y pagos se concilian sin duplicar el mismo importe informado en filas', () => {
  const [parsed, filas] = preparar([['Azucar Ledesma', 10, 1000], ['DEUDA', 1, 3000], ['PAGO', 1, 500]],
    {total: 12500, saldoAnterior: 3000, pagosACuenta: 500});
  assert.equal(ctx.rev77DeudaDelTicket(parsed, filas), 2500);
  assert.equal(parsed.total - ctx.rev77DeudaDelTicket(parsed, filas), 10000);
});

test('los importes de deuda contradictorios no se descuentan silenciosamente', () => {
  const [parsed, filas] = preparar([['Azucar Ledesma', 10, 1000], ['DEUDA', 1, 1000], ['PAGO', 1, 500]],
    {total: 12500, saldoAnterior: 3000});
  assert.equal(ctx.rev77DeudaDelTicket(parsed, filas), 0, 'se conserva el total leído hasta revisión humana');
});

test('una fila convertida explícitamente en producto deja de ser un ajuste del ticket', () => {
  const [parsed, filas] = preparar([['Entrega Azucar Ledesma', 1, 1000], ['Yerba Playadito', 1, 2000]], {total: 3000});
  filas[0].prodId = 'qa-7';
  filas[0].origen = 'manual';
  assert.equal(ctx.rev77DeudaDelTicket(parsed, filas), 0);
});

test('una corrección manual también reconcilia la copia de esa deuda en saldoAnterior', () => {
  const [parsed, filas] = preparar([['DEUDA', 1, 1000], ['Yerba Playadito', 1, 2000]], {total: 3000, saldoAnterior: 1000});
  filas[0].prodId = 'qa-7'; filas[0].origen = 'manual'; filas[0].noMercaderia = false;
  assert.equal(ctx.rev77DeudaDelTicket(parsed, filas), 0);
});

test('un renglón con indicaciones contradictorias de deuda y pago no decide solo el signo', () => {
  const [parsed, filas] = preparar([['Azucar Ledesma', 10, 1000], ['DEUDA PAGO A CUENTA', 1, 2000]], {total: 12000});
  assert.equal(ctx.rev77DeudaDelTicket(parsed, filas), 0);
});

test('los pagos separados de items por el servidor llegan al cálculo del cliente', async () => {
  const m = await import(pathToFileURL(path.join(__dirname, '../supabase/functions/_shared/f6-invoice-reader.mjs')).href);
  const response = pagosACuenta => ({status: 'completed', steps: [{type: 'model_output', content: [{type: 'text',
    text: JSON.stringify({proveedor: 'QA', nroComprobante: '1', total: 8000, descuentoGlobal: 0, saldoAnterior: 0, pagosACuenta,
      items: [{producto: 'Azucar Ledesma', cantidad: 10, unidadesPorBulto: 1, precioUnit: 1000, descuento: 0}]})}]}]});
  const parsed = m.extractGeminiInvoice(response(2000));
  const filas = ctx.rev70PrepararFilas(parsed, catalogo, ctx.rev70MemoriaVacia());
  assert.equal(parsed.pagosACuenta, 2000);
  assert.equal(parsed.total - ctx.rev77DeudaDelTicket(parsed, filas), 10000);
  assert.equal(m.extractGeminiInvoice(response(-5)).pagosACuenta, 0);
});
