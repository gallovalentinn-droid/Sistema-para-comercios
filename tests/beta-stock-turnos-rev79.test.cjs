const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../beta/index.html'), 'utf8');
const ctx = vm.createContext({});
for (const name of ['UX_BUSQUEDAS_PAGOS_HELPERS', 'F5_SESSION_CORE', 'F6_TURNOS_CORE', 'REV79_MOVIMIENTOS']) {
  const start = html.indexOf(`/* ${name}_START */`), end = html.indexOf(`/* ${name}_END */`);
  if (start >= 0 && end > start) vm.runInContext(html.slice(start, end), ctx);
}
const p = {id: 'p', nombre: 'Azucar', stockBase: 100, rubro: 'Almacen'};
const t1 = {id: 's1', desde: '2026-10-01T08:00:00Z', hasta: '2026-10-01T12:00:00Z'};
const t2 = {id: 's2', desde: '2026-10-01T12:00:01Z', hasta: '2026-10-01T16:00:00Z'};
const mov = (session, tipo, cant, fecha, extra = {}) => ({prodId: 'p', _v4cajaSesionId: 'root', _v4sessionSegmentId: session, tipo, cant, fecha, ...extra});
const plain = x => JSON.parse(JSON.stringify(x));
const run = (movimientos, extra = {}) => {
  assert.equal(typeof ctx.f79CompararStockTurnos, 'function', 'existe la comparación de turnos');
  return plain(ctx.f79CompararStockTurnos({productos: [p], movimientos, turnos: [t1, t2], ...extra}));
};

test('los segmentos de una misma raíz conservan sus ingresos y ventas separados', () => {
  const r = run([mov('s1', 'ingreso', 10, '2026-10-01T09:00:00Z'), mov('s1', 'venta', -3, '2026-10-01T10:00:00Z'),
    mov('s2', 'venta', -5, '2026-10-01T14:00:00Z')]);
  assert.deepEqual(r.filas[0].turnos.map(t => [t.inicio, t.ingresos, t.vendidas, t.ajustes, t.final]), [[100, 10, 3, 0, 107], [107, 0, 5, 0, 102]]);
});

test('los movimientos sin segmento no se asignan a un turno nuevo por compartir raíz u horario', () => {
  const r = run([mov('', 'ingreso', 9, '2026-10-01T10:00:00Z'), {prodId: 'p', tipo: 'ajuste', cant: -2, fecha: '2026-10-01T13:00:00Z'}]);
  assert.equal(r.sinTurno.length, 1, 'una raíz explícita distinta se conserva como otra identidad');
  assert.equal(r.filas[0].turnos[0].ingresos, 0);
  assert.equal(r.filas[0].turnos[0].externos, 9);
  assert.equal(r.filas[0].turnos[1].externos, -2);
});

test('turnos simultáneos comparten stock global sin duplicar la venta del otro turno', () => {
  const r = run([mov('s1', 'venta', -4, '2026-10-01T10:00:00Z'), mov('s2', 'venta', -6, '2026-10-01T11:00:00Z')],
    {turnos: [t1, {...t2, desde: t1.desde, hasta: t1.hasta}]});
  assert.deepEqual(r.filas[0].turnos.map(t => [t.vendidas, t.externos, t.final]), [[4, -6, 90], [6, -4, 90]]);
});

test('una devolución se muestra como ajuste en su turno y no borra la salida original', () => {
  const r = run([mov('s1', 'venta', -4, '2026-10-01T10:00:00Z'), mov('s2', 'anulacion', 4, '2026-10-01T14:00:00Z')]);
  assert.equal(r.filas[0].turnos[0].vendidas, 4);
  assert.equal(r.filas[0].turnos[1].ajustes, 4);
  assert.equal(r.filas[0].turnos[1].final, 100);
});

test('las cantidades por peso y las llegadas posteriores al cierre se conservan', () => {
  const r = run([mov('s1', 'venta', -0.125, '2026-10-01T10:00:00Z', {_v4receivedAt: '2026-10-01T13:00:00Z'})]);
  assert.equal(r.filas[0].turnos[0].vendidas, 0.125);
  assert.equal(r.filas[0].turnos[0].tardios, 1);
});

test('sin base histórica se muestran cantidades no disponibles y productos ausentes visibles', () => {
  const r = run([mov('s1', 'ingreso', 3, '2026-10-01T09:00:00Z'), mov('s1', 'venta', -2, '2026-10-01T10:00:00Z', {prodId: 'ausente'})], {productos: [{...p, stockBase: null}]});
  assert.equal(r.filas.find(r => r.producto.id === 'p').turnos[0].inicio, null);
  assert.equal(r.filas.find(r => r.producto.id === 'ausente').producto.ausente, true);
});

test('buscar producto no elimina el cálculo de los movimientos externos ni modifica los datos', () => {
  const movimientos = [mov('s1', 'ingreso', 2, '2026-10-01T09:00:00Z')];
  const before = JSON.stringify(movimientos);
  assert.equal(run(movimientos, {q: 'no existe'}).filas.length, 0);
  assert.equal(run(movimientos, {q: 'azucar'}).filas.length, 1);
  assert.equal(JSON.stringify(movimientos), before);
});

test('la apertura de un segmento reabierto prevalece sobre la apertura de la caja raíz', () => {
  const scope = vm.createContext({db: {}, f32LocalParaRemoto: () => ({actual: null, id: 'c'}), f32ResolverIdLocal: () => 'unused'});
  const start = html.indexOf('function f32bMapCierre('), end = html.indexOf('function f32bAjusteCierreView(', start);
  vm.runInContext(html.slice(start, end), scope);
  const cierre = scope.f32bMapCierre({id: 'c', caja_sesion_id: 'root', session_segment_id: 's2', closed_at_device: t2.hasta},
    {sesiones: [{id: 'root', opened_at_device: t1.desde}], segmentos: [{segment_id: 's2', opened_at_device: t2.desde}]});
  assert.equal(cierre.desde, '2026-10-01T12:00:01Z');
});

test('los turnos cerrados y abiertos se identifican por segmento sin repetir un cierre', () => {
  assert.equal(typeof ctx.f79TurnosStock, 'function');
  const r = plain(ctx.f79TurnosStock([{_v4sessionSegmentId: 's1', desde: t1.desde, hasta: t1.hasta}],
    {id: 's2', rootSessionId: 'root', sessionSegmentId: 's2', openedAtDevice: t2.desde, estado: 'abierta'},
    [{segmentId: 's1', desde: t1.desde, hasta: t1.hasta}], t2.hasta));
  assert.equal(r.length, 2);
  assert.equal(r[0].estado, 'Abierto · provisional');
});

test('un cierre con ventas cuyo detalle no llegó indica datos incompletos', () => {
  const r = run([], {turnos: [{...t1, cantVentas: 1}, t2], ventas: []});
  assert.deepEqual(r.incompletos, ['s1']);
});

test('un faltante conocido de un turno invalida también el stock global del turno siguiente', () => {
  const r = run([mov('s1', 'venta', -2, '2026-10-01T10:00:00Z'), mov('s2', 'venta', -1, '2026-10-01T14:00:00Z')],
    {turnos: [{...t1, cantVentas: 2}, {...t2, cantVentas: 1}], ventas: [{_v4sessionSegmentId: 's1'}, {_v4sessionSegmentId: 's2'}]});
  assert.equal(r.filas[0].turnos[1].inicio, null);
  assert.equal(r.filas[0].turnos[1].final, null);
  assert.equal(r.filas[0].turnos[1].vendidas, 1, 'se conserva el movimiento registrado del segundo turno');
});
