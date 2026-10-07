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

function load({ localProducts = [], localSales = [], remoteProducts = 660, remoteSales = 63, cursorAdvanced = true, outbox = [], manifest = null } = {}) {
  const cursor = { ts: '2026-09-24T20:30:00Z', id: '11111111-1111-4111-8111-111111111111' };
  const state = {
    cursores: cursorAdvanced ? { productos: { ...cursor }, ventas: { ...cursor }, movimientos_stock: { ...cursor } } : {},
    diferidos: { productos: {}, clientes: {}, combos: {}, promociones: {}, config: null },
    stats: {},
  };
  const context = {
    db: { productos: localProducts, clientes: [], ventas: localSales, cierres: [] },
    f3Estado: { comercioId: '22222222-2222-4222-8222-222222222222', pull: state },
    F32_CURSOR_ZERO: { ts: '1970-01-01T00:00:00Z', id: '00000000-0000-0000-0000-000000000000' },
    F32B_OPERATION_SPECS: [{ tabla: 'ventas' }, { tabla: 'movimientos_stock' }, { tabla: 'cierres_caja' }],
    f32EstadoPull: () => state,
    f3LeerOutbox: async () => outbox,
    f32CompararCursor: (a, b) => a.ts === b.ts ? 0 : a.ts > b.ts ? 1 : -1,
    f5ManifestActual: () => manifest,
    f5ProjectionAllows: (value, table) => !!value.collections[table],
    f5ProjectionScope: (value, table) => value.collections[table].scope,
    f32PersistirFinalizacion: async ({ mutarPull }) => { mutarPull(state); context.persisted = true; },
    sb: {
      from(table) {
        return {
          select() { return this; },
          eq(column, value) { (context.filters ||= []).push([table, column, value]); return this; },
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
  assert.equal(context.f3Estado.pull.cursores.ventas, undefined);
  assert.equal(context.f3Estado.pull.cursores.movimientos_stock, undefined);
  assert.ok(context.f3Estado.pull.cursores.productos);
  assert.equal(context.f3Estado.pull.recuperacionPendiente, true);
});

test('una copia nueva recupera ventas propias aunque el cursor todavía esté en cero', async () => {
  const context = load({ cursorAdvanced: false });
  assert.equal(await context.recuperar(), true);
  assert.equal(context.f3Estado.pull.recuperacionPendiente, true);
});

test('un envío pendiente no impide recuperar ventas confirmadas que faltan localmente', async () => {
  const context = load({ localProducts: Array(660).fill({ id: 'producto' }), localSales: [], remoteSales: 63, outbox: [{ comercioId: '22222222-2222-4222-8222-222222222222', schemaVersion: 4, estado: 'reintento_v4' }] });
  assert.equal(await context.recuperar(), true);
  assert.equal(context.f3Estado.pull.cursores.ventas, undefined);
  assert.ok(context.f3Estado.pull.cursores.productos);
});

test('recuperar ventas no obliga a volver a descargar todos los productos', async () => {
  const context = load({ localProducts: Array(660).fill({ id: 'producto' }), localSales: [], remoteSales: 63 });
  assert.equal(await context.recuperar(), true);
  assert.equal(context.f3Estado.pull.cursores.ventas, undefined);
  assert.ok(context.f3Estado.pull.cursores.productos);
});

test('el recuento respeta la proyección por dispositivo y omite colecciones no autorizadas', async () => {
  const context = load({
    localSales: Array(63).fill({ id: 'venta' }), remoteSales: 63,
    manifest: { collections: { productos: { scope: 'commerce' }, ventas: { scope: 'device' } } },
  });
  context.f3Estado.deviceUuid = 'dispositivo-1';
  assert.equal(await context.recuperar(), true); // productos vacíos sí requieren recuperación
  assert.ok(context.filters.some(([table, column, value]) => table === 'ventas' && column === 'device_id' && value === 'dispositivo-1'));
  assert.equal(context.filters.some(([table]) => table === 'clientes' || table === 'cierres_caja'), false);
});

test('el pull compara cantidades después del catch-up normal', async () => {
  const calls = [];
  const state = { recuperacionPendiente: false, lastPullAt: null };
  const context = {
    sb: {}, sesion: { user: { id: 'u' } }, enLinea: true,
    f3Estado: { comercioId: 'c' }, f3Activo: () => true,
    f32EstadoPull: () => state, f32bEstado: () => state,
    f5RefrescarProyeccion: async () => ({ manifest: { id: 'm' }, coverage: {} }),
    f32bDrenarMaestrosAntesOperaciones: async () => { calls.push('maestros'); return {}; },
    f32bDrenarOperacionesCompleto: async () => { calls.push('operaciones'); return { aplicados: 0, borrados: 0 }; },
    f32RecuperarCursoresSiFaltanDatos: async () => { calls.push('revisar'); return false; },
    f32PersistirFinalizacion: async () => {}, render: () => {},
    console,
  };
  vm.createContext(context);
  vm.runInContext(`let f32RevisionLocalInicialScope='';let f32RecuperacionReplay=false;\n${functionSource('f32PullV4')}\nthis.pull=f32PullV4;`, context);
  await context.pull();
  assert.deepEqual(calls, ['maestros', 'operaciones', 'revisar']);
});

test('si quedan registros locales faltantes tras el catch-up, repite el pull una vez', async () => {
  const calls = [];
  const state = { recuperacionPendiente: false };
  const context = {
    sb: {}, sesion: { user: { id: 'u' } }, enLinea: true,
    f3Estado: { comercioId: 'c' }, f3Activo: () => true,
    f32EstadoPull: () => state, f32bEstado: () => state,
    f5RefrescarProyeccion: async () => ({ manifest: { id: 'm' }, coverage: {} }),
    f32bDrenarMaestrosAntesOperaciones: async () => { calls.push('maestros'); return {}; },
    f32bDrenarOperacionesCompleto: async () => { calls.push('operaciones'); return { aplicados: 0, borrados: 0 }; },
    f32RecuperarCursoresSiFaltanDatos: async () => { calls.push('revisar'); state.recuperacionPendiente = true; return true; },
    f32PersistirFinalizacion: async () => {}, render: () => {}, console,
  };
  vm.createContext(context);
  vm.runInContext(`let f32RevisionLocalInicialScope='';let f32RecuperacionReplay=false;\n${functionSource('f32PullV4')}\nthis.pull=f32PullV4;`, context);
  await context.pull();
  assert.deepEqual(calls, ['maestros', 'operaciones', 'revisar', 'maestros', 'operaciones']);
  assert.equal(state.recuperacionPendiente, false);
});
