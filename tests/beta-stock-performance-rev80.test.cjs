const test = require('node:test');
const assert = require('node:assert/strict');
const {fs, load, fixture, plain, baselineHtml, candidatePath, vm} = require('./stock-perf-rev80-fixture.cjs');
let html = fs.readFileSync(process.env.STOCK_HTML || candidatePath, 'utf8');
if (process.env.STOCK_PATCH) for (const {old, new: replacement} of JSON.parse(fs.readFileSync(process.env.STOCK_PATCH, 'utf8'))) {
  assert.equal(html.split(old).length, 2, 'cada fragmento base del parche aparece una vez');
  html = html.replace(old, replacement);
}
const run = input => plain(load(html).f79CompararStockTurnos(input));
const p = {id: 'p', nombre: 'Azúcar', stockBase: 100, rubro: 'Almacén'};
const t1 = {id: 's1', desde: '2026-10-01T08:00:00Z', hasta: '2026-10-01T12:00:00Z'};
const t2 = {id: 's2', desde: '2026-10-01T12:00:00Z', hasta: '2026-10-01T16:00:00Z'};
const mov = (session, cant, fecha, tipo = 'venta', extra = {}) => ({prodId: 'p', _v4sessionSegmentId: session, cant, fecha, tipo, ...extra});

// Catches returning to a complete movement scan for each product/shift.
test('comparar turnos visita cada identidad de producto una cantidad acotada de veces', () => {
  const input = fixture({products: 40, shifts: 12, movements: 1200});
  let reads = 0;
  input.movimientos = input.movimientos.map(m => {
    const id = m.prodId;
    return {...m, get prodId() {reads++; return id;}};
  });
  const ctx = load(html), r = ctx.f79CompararStockTurnos(input);
  assert.equal(r.filas.length, 40);
  assert.ok(reads <= 1200 * 4, `se hicieron ${reads} lecturas para 1200 movimientos; no recorrer el historial completo por producto`);
});

test('el corte inicial excluye la apertura y el final incluye exactamente el cierre global', () => {
  const r = run({productos: [p], turnos: [t1, t2], movimientos: [
    mov('old', 7, '2026-10-01T07:59:59Z', 'ingreso'),
    mov('s1', 3, t1.desde, 'ingreso'),
    mov('s1', -5, t1.hasta),
    mov('s2', -2, t2.desde),
    mov('', 4, '2026-10-01T13:00:00Z', 'ajuste'),
    mov('s2', -1, t2.hasta),
    mov('next', 99, '2026-10-01T16:00:00.001Z', 'ingreso')
  ]});
  assert.deepEqual(r.filas[0].turnos.map(t => [t.inicio, t.final, t.ingresos, t.vendidas, t.externos]), [[107, 103, 3, 5, -2], [110, 106, 0, 3, -1]]);
  assert.equal(r.sinTurno.length, 1);
});

test('movimientos tardíos y fechas inválidas conservan atribución pero no alteran cortes globales', () => {
  const r = run({productos: [p], turnos: [t1, t2], movimientos: [
    mov('s1', -0.125, '2026-10-01T10:00:00Z', 'venta', {_v4receivedAt: '2026-10-01T17:00:00Z'}),
    mov('s1', -2, 'fecha inválida'),
    mov('s1', 4, '2026-10-01T17:00:00Z', 'anulacion')
  ]});
  assert.deepEqual(r.filas[0].turnos.map(t => [t.inicio, t.final, t.vendidas, t.ajustes, t.neto, t.tardios, t.fueraDeHorario]), [[100, 99.875, 2.125, 4, 1.875, 1, true], [99.875, 99.875, 0, 0, 0, 0, false]]);
  assert.equal(r.filas[0].turnos[0].movs.length, 3);
});

test('la reconstrucción no conserva un índice obsoleto después de añadir, editar o anular movimientos', () => {
  const input = {productos: [p], turnos: [t1, t2], movimientos: [mov('s1', -1, '2026-10-01T10:00:00Z')]};
  const ctx = load(html), final = () => ctx.f79CompararStockTurnos(input).filas[0].turnos[1].final;
  assert.equal(final(), 99);
  input.movimientos.push(mov('s2', -2, '2026-10-01T14:00:00Z'));
  assert.equal(final(), 97);
  input.movimientos[0].cant = -4;
  assert.equal(final(), 94);
  input.movimientos.pop();
  assert.equal(final(), 96);
  p.stockBase = 101;
  assert.equal(final(), 97);
  p.stockBase = 100;
});

test('faltantes reconocidos y apertura aproximada conservan las cantidades sin presentar stock falso', () => {
  const input = {productos: [p], turnos: [{...t1, cantVentas: 2}, t2], ventas: [{_v4sessionSegmentId: 's1'}], movimientos: [mov('s1', -2, '2026-10-01T10:00:00Z')]};
  const r = run(input);
  assert.deepEqual(r.incompletos, ['s1']);
  assert.deepEqual(r.filas[0].turnos.map(t => [t.inicio, t.final]), [[null, null], [null, null]]);
  assert.equal(r.filas[0].turnos[0].vendidas, 2);
  input.ventas.push({_v4sessionSegmentId: 's1'});
  input.turnos[0].aperturaAproximada = true;
  const complete = run(input);
  assert.deepEqual(complete.incompletos, []);
  assert.deepEqual(complete.filas[0].turnos.map(t => [t.inicio, t.final]), [[null, 98], [98, 98]]);
});

test('mantiene resultados REV79 para raíces, ausentes, simultáneos, filtros y decimales', () => {
  const old = load(baselineHtml(html)), current = load(html);
  const input = fixture({products: 35, shifts: 8, movements: 1200});
  input.movimientos.push(null, {prodId: 'ausente', tipo: 'ingreso', cant: 0.1, fecha: input.turnos[0].desde, _v4cajaSesionId: 'root'});
  input.movimientos[0].fecha = 'inválida';
  input.movimientos[1]._v4sessionSegmentId = '';
  input.movimientos[2]._v4receivedAt = '2027-01-01T00:00:00Z';
  input.productos[0].stockBase = null;
  input.productos[1].stockBase = 0.1;
  for (const q of ['', 'producto 001', 'no existe']) {
    for (const rubro of ['', 'Almacén', 'otro']) {
      for (const selected of [input.turnos, [input.turnos[0], {...input.turnos[1], desde: input.turnos[0].desde, hasta: input.turnos[0].hasta}], []]) {
        const args = {...input, turnos: selected, q, rubro};
        assert.deepEqual(plain(current.f79CompararStockTurnos(args)), plain(old.f79CompararStockTurnos(args)));
      }
    }
  }
});

function searchHarness() {
  let timerId = 0, timers = new Map(), elements = {}, buttons = [], paints = [];
  const host = {set innerHTML(value) {
    Object.values(elements).forEach(e => e.isConnected = false);
    elements = Object.fromEntries(['qMovimientos', 'rubroMovimientos', 'movTurnoA', 'movTurnoB', 'fechaMovimientos', 'movRango'].map(id => [id, {value: '', isConnected: true}]));
    buttons = ['periodo', 'turnos'].map(v => ({dataset: {movVista: v}}));
  }};
  const ctx = vm.createContext({
    movVista: 'turnos', movTurnoA: 's1', movTurnoB: 's2', fechaMovimientos: '2026-10-01', movRango: 'dia', filtrosMovimientos: {q: '', rubro: ''},
    f79PuedeCompararTurnos: () => true, f79OpcionesTurnos: () => [t1, t2], esc: x => x, fFH: x => x, rubros: () => [], hoy: () => '2026-10-01',
    $: selector => elements[selector.slice(1)], $$: () => buttons,
    pintarMovimientosActual: () => paints.push(ctx.filtrosMovimientos.q),
    setTimeout: fn => {timers.set(++timerId, fn); return timerId;}, clearTimeout: id => timers.delete(id)
  });
  const start = html.indexOf('function vMovimientos(m){'), end = html.indexOf('\n/* ═', start);
  const debounceStart = html.indexOf('/* REV80_MOVIMIENTOS_BUSQUEDA_START */'), debounceEnd = html.indexOf('/* REV80_MOVIMIENTOS_BUSQUEDA_END */');
  if (debounceStart >= 0) vm.runInContext(html.slice(debounceStart, debounceEnd), ctx);
  const uxStart = html.indexOf('/* REV81_COMPARACION_START */'), uxEnd = html.indexOf('/* REV81_COMPARACION_END */');
  if (uxStart >= 0) vm.runInContext(html.slice(uxStart, uxEnd), ctx);
  vm.runInContext(html.slice(start, end), ctx);
  ctx.vMovimientos(host);
  return {ctx, paints, type: value => {elements.qMovimientos.value = value; elements.qMovimientos.oninput({target: elements.qMovimientos});},
    flush: () => {const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn());},
    switchTo: value => buttons.find(b => b.dataset.movVista === value).onclick(),
    rerender: () => ctx.vMovimientos(host)};
}

// Catches repainting the expensive comparison synchronously on every key.
test('buscar en turnos reúne pulsaciones rápidas y dibuja sólo la última consulta', () => {
  const h = searchHarness();
  h.type('a'); h.type('az'); h.type('azu');
  assert.deepEqual(h.paints, [''], 'no bloquea cada pulsación con un repintado');
  h.flush();
  assert.deepEqual(h.paints, ['', 'azu']);
});

test('la consulta por período continúa inmediata y descarta un repintado pendiente de turnos', () => {
  const h = searchHarness();
  h.type('a');
  h.switchTo('periodo');
  const afterSwitch = h.paints.length;
  h.flush();
  assert.equal(h.paints.length, afterSwitch);
  h.type('az');
  assert.equal(h.paints.at(-1), 'az');
  assert.equal(h.paints.length, afterSwitch + 1);
});

test('repintar la vista cancela su búsqueda pendiente evitando resultados de un control eliminado', () => {
  const h = searchHarness();
  h.type('a'); h.rerender();
  const afterRender = h.paints.length;
  h.flush();
  assert.equal(h.paints.length, afterRender);
});
