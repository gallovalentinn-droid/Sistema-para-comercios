const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../beta/index.html'), 'utf8').replace(/\r\n/g, '\n');
function sourceOf(name) {
  const match = new RegExp(`^(?:async )?function ${name}\\(`, 'm').exec(html);
  assert.ok(match, `falta ${name}`);
  const end = html.indexOf('\n}', match.index);
  assert.ok(end > match.index, `función incompleta: ${name}`);
  return html.slice(match.index, end + 2);
}
function context(code, values) {
  vm.createContext(values);
  vm.runInContext(code, values);
  return values;
}

test('buscar un atado encuentra por nombre o código y mantiene visible el origen elegido', () => {
  const ctx = context(`${sourceOf('normalizarBusqueda')}\n${sourceOf('opcionesAtadoOrigen')}\nthis.buscar=opcionesAtadoOrigen;`, {});
  const candidates = Array.from({ length: 100 }, (_, i) => ({ id: `p${i}`, nombre: `Producto ${i}`, ean: String(i) }));
  candidates[2] = { id: 'p2', nombre: 'Márboro Box', ean: '779123' };
  const byName = ctx.buscar(candidates, 'marboro', 'p70', 60);
  assert.equal(byName.total, 1);
  assert.deepEqual(Array.from(byName.opciones, x => x.id), ['p70', 'p2']);
  const byCode = ctx.buscar(candidates, '779123', '', 60);
  assert.deepEqual(Array.from(byCode.opciones, x => x.id), ['p2']);
});

test('editar en Productos conserva la altura; cambiar de sección sí vuelve al inicio', () => {
  const positions = [];
  const window = { scrollY: 0, scrollTo(_x, y) { this.scrollY = y; positions.push(y); } };
  const ctx = {
    window, vista: 'productos', ultimaVistaRenderizada: '', db: { productos: [] },
    vistasVisibles: () => [{ id: 'productos' }, { id: 'vender' }],
    pintarNav: () => {}, pintarFoot: () => {}, $: () => ({}), f6ProgramarFotosProductos: () => {},
  };
  for (const name of ['vVender', 'vResumen', 'vProductos', 'vCompras', 'vCombos', 'vPromociones', 'vVencimientos', 'vFiado', 'vCaja', 'vMovimientos', 'vConfig', 'vSoporte']) ctx[name] = () => {};
  context(`${sourceOf('render')}\nthis.mostrar=render;`, ctx);
  ctx.mostrar();
  window.scrollY = 730;
  ctx.mostrar();
  assert.equal(positions.at(-1), 730);
  ctx.vista = 'vender';
  ctx.mostrar();
  assert.equal(positions.at(-1), 0);
  window.scrollY = 500;
  ctx.mostrar();
  assert.equal(positions.at(-1), 0);
});

test('al reconstruir la tabla de Productos conserva también su desplazamiento interno', () => {
  const oldList = { scrollTop: 460 };
  const newList = { scrollTop: 0 };
  let rebuilt = false;
  const root = { set innerHTML(_value) { rebuilt = true; } };
  const ctx = {
    db: { productos: [{ id: 'p1', nombre: 'Atado', costo: 10 }] },
    fProd: { q: '', rubros: [], actividad: '', estado: 'activos', orden: 'nombre', incompletos: false },
    ultimoCambioPrecios: null, selectedProductosRev31: new Set(),
    productoArchivadoRev31: () => false, productoIncompleto: () => false, bajo: () => false,
    esc: String, ic: () => '', htmlFiltroRubrosRev31: () => '',
    $: selector => selector === '#tabProd' ? (rebuilt ? newList : oldList) : null,
    wireProductosActions: () => {}, montarFiltroRubrosRev31: () => {}, tablaProductos: () => {},
  };
  context(`${sourceOf('vProductos')}\nthis.mostrar=vProductos;`, ctx);
  ctx.mostrar(root);
  assert.equal(newList.scrollTop, 460);
});

test('una apertura larga no convierte consultas posteriores rápidas en error de conexión', async () => {
  let now = 0;
  const begin = html.indexOf('let f6ArranqueActivo=');
  const end = html.indexOf('const sb =', begin);
  assert.ok(begin >= 0 && end > begin);
  const ctx = context(`${html.slice(begin, end)}\nthis.comenzar=f6IniciarArranque;this.pedir=f6FetchArranque;`, {
    Date: { now: () => now }, AbortController,
    fetch: async () => ({ ok: true }),
    setTimeout: () => 1, clearTimeout: () => {},
  });
  ctx.comenzar();
  now = 9000;
  assert.equal((await ctx.pedir('/rest/v1/ventas', {})).ok, true);
});

test('al reabrir envía todas las operaciones pendientes del mismo turno en orden', async () => {
  const sent = [];
  const rows = [1, 2, 3].map(localSeq => ({
    operationId: `op${localSeq}`, schemaVersion: 4, estado: 'pendiente_v4',
    comercioId: 'comercio', streamKey: 'caja-1', localSeq, opOrder: 0,
    createdAt: `2026-09-25T10:00:0${localSeq}Z`, nextAttemptAt: null,
  }));
  const ctx = context(`${sourceOf('f3ProcesarOutbox')}\nthis.drenar=f3ProcesarOutbox;`, {
    f3Activo: () => true, enLinea: true, document: { hidden: false },
    f3Procesando: false, f3DrainPendiente: false, f3DrainPendienteAllowHidden: false,
    f3Estado: { comercioId: 'comercio' },
    esperarPersistenciaLocal: async () => {}, f3LeerOutbox: async () => rows,
    f3ProcesarUna: async op => { sent.push(op.operationId); return true; },
    f3LimpiarConfirmados: async () => {}, queueMicrotask: () => {}, console,
  });
  await ctx.drenar();
  assert.deepEqual(sent, ['op1', 'op2', 'op3']);
});

test('una operación fallida bloquea las siguientes del mismo turno, sin frenar otra caja', async () => {
  const sent = [];
  const rows = [
    { operationId: 'caja1-a', streamKey: 'caja-1', localSeq: 1 },
    { operationId: 'caja1-b', streamKey: 'caja-1', localSeq: 2 },
    { operationId: 'caja2-a', streamKey: 'caja-2', localSeq: 1 },
  ].map(o => ({ ...o, schemaVersion: 4, estado: 'pendiente_v4', comercioId: 'comercio', createdAt: '2026-09-25T10:00:00Z' }));
  const ctx = context(`${sourceOf('f3ProcesarOutbox')}\nthis.drenar=f3ProcesarOutbox;`, {
    f3Activo: () => true, enLinea: true, document: { hidden: false },
    f3Procesando: false, f3DrainPendiente: false, f3DrainPendienteAllowHidden: false,
    f3Estado: { comercioId: 'comercio' },
    esperarPersistenciaLocal: async () => {}, f3LeerOutbox: async () => rows,
    f3ProcesarUna: async op => { sent.push(op.operationId); return op.operationId !== 'caja1-a'; },
    f3LimpiarConfirmados: async () => {}, queueMicrotask: () => {}, console,
  });
  await ctx.drenar();
  assert.deepEqual(sent, ['caja1-a', 'caja2-a']);
});
