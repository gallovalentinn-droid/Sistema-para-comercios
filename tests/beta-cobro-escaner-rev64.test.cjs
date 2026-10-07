const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../beta/index.html'), 'utf8');
const start = html.indexOf('function f62ImporteEfectivo(');
const end = html.indexOf('let f62VersionNueva=', start);
assert.ok(start >= 0 && end > start);

function evaluar(raw, total, productos = []) {
  const context = vm.createContext({num: value => Number(String(value).replace(',', '.')) || 0});
  vm.runInContext(`${html.slice(start, end)}\nthis.evaluar=f64IntentoCobroEfectivo;`, context);
  return context.evaluar(raw, total, productos);
}

test('un EAN del catálogo no se acepta como importe recibido aunque alcance el total', () => {
  const producto = {nombre: 'Oreo', ean: '7622300869229'};
  const intento = evaluar(producto.ean, 1500, [producto]);
  assert.equal(intento.valido, false);
  assert.equal(intento.codigo, true);
  assert.equal(intento.producto.nombre, 'Oreo');
});

test('un código largo desconocido tampoco confirma el cobro; un importe normal con Enter sigue siendo válido', () => {
  const codigo = evaluar('7790000000001', 1500);
  assert.equal(codigo.valido, false);
  assert.equal(codigo.codigo, true);
  const normal = evaluar('2000', 1500);
  assert.equal(normal.valido, true);
  assert.equal(normal.recibido, 2000);
  assert.equal(normal.vuelto, 500);
  assert.equal(evaluar('', 1500).valido, true);
  assert.equal(evaluar('10000000', 9000000).valido, true);
});
