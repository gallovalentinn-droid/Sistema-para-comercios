const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../beta/index.html'), 'utf8').replace(/\r\n/g, '\n');
const start = html.indexOf('function efectivoCigarrillosVenta(');
const end = html.indexOf('function montoEfectivoVenta(', start);
assert.ok(start >= 0 && end > start);

function totales(ventas) {
  const context = vm.createContext({
    db: { config: { moduloCigarros: false } },
    netoItemVenta: item => item.neto,
    esCigarrillo: rubro => rubro === 'Cigarrillos',
    formaKey: forma => ({ qr: 'transferencia', debito: 'tarjeta', credito: 'tarjeta' })[forma] || forma,
  });
  vm.runInContext(`${html.slice(start, end)}\nthis.calcular=calcularTotalesTurno;`, context);
  return context.calcular({ desde: '2026-09-29', ventasTodas: ventas, pagos: [], egresos: [], moduloCigarros: false });
}

const item = (neto, rubro = 'Cigarrillos') => ({ neto, rubro, cant: 1, costo: 1 });

test('la sugerencia incluye cigarrillos pagados con efectivo, transferencia, QR y tarjeta sin sumar esos medios a la caja física', () => {
  const turno = totales([
    { total: 1000, forma: 'mixto', pagos: [
      { forma: 'efectivo', monto: 400 }, { forma: 'transferencia', monto: 300 },
      { forma: 'qr', monto: 200 }, { forma: 'tarjeta', monto: 100 },
    ], items: [item(600), item(400, 'Almacén')] },
  ]);
  assert.equal(turno.cigCobradoTotal, 600);
  assert.equal(turno.cigCobradoPorForma.efectivo, 240);
  assert.equal(turno.cigCobradoPorForma.transferencia, 300);
  assert.equal(turno.cigCobradoPorForma.tarjeta, 60);
  assert.equal(turno.porForma.efectivo, 400);
  assert.equal(turno.genEfectivo, 400);
});

test('el fiado pendiente queda fuera y el pago combinado se prorratea sin duplicar cigarrillos', () => {
  const turno = totales([
    { total: 2000, forma: 'mixto', pagos: [
      { forma: 'efectivo', monto: 500 }, { forma: 'tarjeta', monto: 500 }, { forma: 'fiado', monto: 1000 },
    ], items: [item(1000), item(1000, 'Almacén')] },
    { total: 900, forma: 'fiado', items: [item(900)] },
    { total: 300, forma: 'transferencia', items: [item(300)], anulada: true },
  ]);
  assert.equal(turno.cigTotal, 1900);
  assert.equal(turno.cigCobradoTotal, 500);
  assert.equal(turno.cigCobradoPorForma.efectivo, 250);
  assert.equal(turno.cigCobradoPorForma.tarjeta, 250);
  assert.equal(turno.porForma.efectivo, 500);
  assert.equal(turno.genEfectivo, 500);
});

test('el prorrateo conserva centavos sin exceder el neto de cigarrillos', () => {
  const turno = totales([{
    total: 0.03, forma: 'mixto',
    pagos: [{ forma: 'efectivo', monto: 0.01 }, { forma: 'qr', monto: 0.01 }, { forma: 'tarjeta', monto: 0.01 }],
    items: [item(0.02), item(0.01, 'Almacén')],
  }]);
  assert.equal(turno.cigCobradoTotal, 0.02);
  assert.equal(Math.round(Object.values(turno.cigCobradoPorForma).reduce((a, b) => a + b, 0) * 100), 2);
});
