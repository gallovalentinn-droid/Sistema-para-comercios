const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../beta/index.html'), 'utf8');

function functionSource(name) {
  const match = new RegExp(`^(?:async )?function ${name}\\(`, 'm').exec(source);
  assert.ok(match, `falta la función ${name}`);
  const start = match.index;
  const end = source.indexOf('\n}', start);
  assert.ok(end > start, `función incompleta: ${name}`);
  return source.slice(start, end + 2);
}

function load({ localProducts = [], localSales = [], remoteProducts = 660, remoteSales = 63, cursorAdvanced = true, outbox = [] } = {}) {
  const cursor = { ts: '2026-09-24T20:30:00Z', id: '11111111-1111-4111-8111-111111111111' };
  const state = {
    cursores: cursorAdvanced ? { productos: { ...cursor }, ventas: { ...cursor } } : {},
    diferidos: { productos: {}, clientes: {}, combos: {}, promociones: {}, config: null },
    stats: {},
  };
  const context = {
    db: { productos: localProducts, clientes: [], ventas: localSales, cierres: [] },
    f3Estado: { comercioId: '22222222-2222-4222-8222-222222222222', pull: state },
    F32_CURSOR_ZERO: { ts: '1970-01-01T00:00:00Z', id: '00000000-0000-0000-0000-000000000000' },
    f32EstadoPull: () => state,
    f3LeerOutbox: async () => outbox,
    f32CompararCursor: (a, b) => a.ts === b.ts ? 0 : a.ts > b.ts ? 1 : -1,
    f32PersistirFinalizacion: async ({ mutarPull }) => { mutarPull(state); context.persisted = true; },
    sb: {
      from(table) {
        return {
          select() { return this; },
          eq() { return this; },
          is() { return this; },
          then(resolve, reject) { return Promise.resolve({ count: { productos: remoteProducts, ventas: remoteSales, clientes: 0, cierres_caja: 0 }[table] || 0, error: null }).then(resolve, reject); },
        };
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(`${functionSource('f32RecuperarCursoresSiFaltanDatos')}\nthis.recuperar=f32RecuperarCursoresSiFaltanDatos;`, context);
  return context;
}

test('si el catálogo local está vacío con cursor avanzado, vuelve a consultar la base completa', async () => {
  const context = load();
  const recovered = await context.recuperar();
  assert.equal(recovered, true);
  assert.deepEqual(Object.keys(context.f3Estado.pull.cursores), []);
  assert.equal(context.persisted, true);
  assert.equal(context.db.productos.length, 0); // la función no borra ni inventa datos
});

test('si la copia local coincide con el servidor conserva los cursores', async () => {
  const context = load({ localProducts: Array(660).fill({ id: 'producto' }), localSales: Array(63).fill({ id: 'venta' }) });
  const recovered = await context.recuperar();
  assert.equal(recovered, false);
  assert.equal(context.f3Estado.pull.cursores.productos.ts, '2026-09-24T20:30:00Z');
  assert.equal(context.persisted, undefined);
});

test('un comercio realmente vacío no dispara una reconstrucción', async () => {
  const context = load({ remoteProducts: 0, remoteSales: 0 });
  const recovered = await context.recuperar();
  assert.equal(recovered, false);
  assert.equal(context.f3Estado.pull.cursores.ventas.ts, '2026-09-24T20:30:00Z');
});

test('reconstruye ventas incompletas aunque haya algunas guardadas localmente', async () => {
  const context = load({ localProducts: Array(660).fill({ id: 'producto' }), localSales: [{ id: 'venta-local' }], remoteSales: 63 });
  assert.equal(await context.recuperar(), true);
  assert.deepEqual(Object.keys(context.f3Estado.pull.cursores), []);
  assert.equal(context.f3Estado.pull.recuperacionPendiente, true);
});

test('una copia nueva recupera ventas propias aunque el cursor todavía esté en cero', async () => {
  const context = load({ cursorAdvanced: false });
  assert.equal(await context.recuperar(), true);
  assert.equal(context.f3Estado.pull.recuperacionPendiente, true);
});

test('espera cambios locales pendientes antes de comparar el recuento del servidor', async () => {
  const context = load({ localProducts: [], remoteProducts: 1, remoteSales: 0, outbox: [{ comercioId: '22222222-2222-4222-8222-222222222222', schemaVersion: 4, estado: 'reintento_v4' }] });
  assert.equal(await context.recuperar(), null);
  assert.equal(context.persisted, undefined);
  assert.ok(context.f3Estado.pull.cursores.productos);
});
