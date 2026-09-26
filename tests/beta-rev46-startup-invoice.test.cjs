const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../beta/index.html'), 'utf8').replace(/\r\n/g, '\n');
function between(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `falta el bloque ${start}`);
  return source.slice(a, b);
}

test('al vencer una consulta de arranque las siguientes fallan enseguida, y reintentar restablece la red', async () => {
  const timers = [];
  let requests = 0;
  const context = {
    AbortController, Error,
    setTimeout: callback => { timers.push(callback); return timers.length; },
    clearTimeout: () => {},
    fetch: (_input, init) => {
      requests++;
      return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
    },
  };
  vm.createContext(context);
  vm.runInContext(`${between('let f6ArranqueActivo=true;', 'const sb = ')}\nthis.request=f6FetchArranque;this.retry=f6IniciarArranque;`, context);
  const first = context.request('/colgada');
  timers.shift()();
  await assert.rejects(first, /NETWORK_TIMEOUT/);
  const second = context.request('/segunda');
  assert.equal(requests, 1);
  await assert.rejects(second, /NETWORK_TIMEOUT/);
  context.retry();
  const next = context.request('/reintento');
  assert.equal(requests, 2);
  timers.shift()();
  await assert.rejects(next, /NETWORK_TIMEOUT/);
});

test('una factura no puede crear un producto nuevo sin precio de venta válido', () => {
  const context = {
    remito: [{ prodId: 'nuevo-1', precio: '' }],
    productosFacturaPendientes: [{ id: 'nuevo-1', nombre: 'Producto leído' }],
    numImportacion: value => {
      const number = Number(value);
      return { ok: String(value).trim() !== '' && Number.isFinite(number), value: number };
    },
  };
  vm.createContext(context);
  vm.runInContext(`${between('function productoFacturaNuevoSinPrecio(){', 'function productoEnFactura(id){')}\nthis.sinPrecio=productoFacturaNuevoSinPrecio;`, context);
  assert.equal(context.sinPrecio(), 0);
  context.remito[0].precio = '0';
  assert.equal(context.sinPrecio(), 0);
  context.remito[0].precio = '3500';
  assert.equal(context.sinPrecio(), -1);
});
