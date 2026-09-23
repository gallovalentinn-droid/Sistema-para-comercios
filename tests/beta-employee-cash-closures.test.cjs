const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.resolve(__dirname, '../beta/index.html');
const source = fs.readFileSync(htmlPath, 'utf8');
const clone = (value) => JSON.parse(JSON.stringify(value));
const ownerDevice = '11111111-1111-4111-8111-111111111111';
const employeeDevice = '22222222-2222-4222-8222-222222222222';
const closeId = '33333333-3333-4333-8333-333333333333';
const sessionId = '44444444-4444-4444-8444-444444444444';
const commerceId = '55555555-5555-4555-8555-555555555555';
const spec = { tabla: 'cierres_caja', coleccion: 'cierres', ts: 'closed_at_server', kind: 'cierre' };

function functionSource(name, optional = false) {
  const match = new RegExp(`^(?:async )?function ${name}\\(`, 'm').exec(source);
  if (!match && optional) return '';
  assert.ok(match, `falta la función ${name}`);
  const start = match.index;
  const lineEnd = source.indexOf('\n', start);
  if (source.slice(start, lineEnd).trimEnd().endsWith('}')) return source.slice(start, lineEnd);
  const end = source.indexOf('\n}', start);
  assert.ok(end > start, `función incompleta: ${name}`);
  return source.slice(start, end + 2);
}

function serverClosure(deviceId = employeeDevice) {
  return {
    row: {
      id: closeId, legacy_id: 'cierre-empleado', comercio_id: commerceId,
      caja_sesion_id: sessionId, session_segment_id: sessionId,
      cerrado_por: '66666666-6666-4666-8666-666666666666',
      closed_at_device: '2026-09-15T18:00:00.000Z', closed_at_server: '2026-09-15T18:00:01.000Z',
      cant_ventas: 2, total_ventas: 1500, por_forma: { efectivo: 1500 },
      cig_total: 0, esperado_general: 1500, contado_general: 1450, diferencia_general: -50,
      esperado_cigarros: 0, contado_cigarros: 0, diferencia_cigarros: 0,
      egresos_general: 0, egresos_cigarros: 0, costo_ventas: 900,
      nota: 'Turno de empleado', estado: 'registrado',
    },
    extra: {
      sesiones: [{ id: sessionId, device_id: deviceId, opened_at_device: '2026-09-15T12:00:00.000Z' }],
      links: { ventas: [], pagos: [], egresos: [] },
    },
  };
}

function load() {
  const main = { innerHTML: '' };
  const nodes = new Map();
  const durable = new Map();
  const actions = [];
  const emptyTurn = {
    desde: '2026-09-15T19:00:00.000Z', ventas: [], ventasTodas: [], pagos: [], egresos: [],
    total: 0, costo: 0, porForma: { efectivo: 0, transferencia: 0, tarjeta: 0, fiado: 0 },
    cigTotal: 0, genEfectivo: 0, cigEfectivo: 0, cobEfectivo: 0, egrGeneral: 0, egrCigarros: 0, egrOtros: 0,
  };
  function node(key, dataset = {}) {
    if (!nodes.has(key)) nodes.set(key, { dataset, value: '', innerHTML: '' });
    return nodes.get(key);
  }
  const context = {
    db: { config: { moduloCigarros: false }, cierres: [], ventas: [], pagos: [], egresos: [] },
    snapshotLocal: { cierres: [] },
    f3Estado: { comercioId: commerceId, deviceUuid: ownerDevice, session: null },
    F32_VERSION: 'test', F32B_VERSION: 'test',
    F32_CURSOR_ZERO: { ts: '1970-01-01T00:00:00.000Z', id: '00000000-0000-0000-0000-000000000000' },
    clonarLocal: clone,
    f3Activo: () => true,
    recalcularDerivados: () => {},
    f32PersistirDatoEntrante: async ({ puts }) => {
      for (const { coleccion, valor } of puts) durable.set(`${coleccion}:${valor.id}`, clone(valor));
    },
    f32PersistirFinalizacion: async ({ mutarPull }) => mutarPull(context.f32EstadoPull()),
    turnoActual: (id) => id ? clone(emptyTurn) : null,
    $: (selector) => main.innerHTML.includes(`id="${selector.slice(1)}"`) ? node(selector) : null,
    $$: (selector) => {
      const match = /^\[data-(vt|wa)\]$/.exec(selector);
      if (!match) return [];
      return [...main.innerHTML.matchAll(new RegExp(`data-${match[1]}="([^"]+)"`, 'g'))]
        .map((item) => node(`${selector}:${item[1]}`, { [match[1]]: item[1] }));
    },
    esc: (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]),
    $m: (value) => `$${Number(value).toFixed(2)}`,
    num: (value) => Number(value) || 0,
    normalizarTexto: (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
    fFH: (value) => value,
    nfM: { format: (value) => String(value) },
    FORMAS: { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta' },
    busCajaTurno: '',
    cierreResponsableFiltro: 'todos',
    filtrarVentasPorBusqueda: (rows) => rows,
    verVentasTurno: (id) => actions.push(['ventas', id]),
    modalEnviarResumen: (cierre) => actions.push(['resumen', cierre.id]),
  };
  vm.createContext(context);
  const names = [
    'f5SesionIds', 'f32Iso', 'f32Cursor', 'f32EstadoPull', 'f32IdLocalRemoto',
    'f32BuscarLocalV4', 'f32BuscarLocalLegacy', 'f32LocalParaRemoto', 'f32ResolverIdLocal',
    'f32UpsertArray', 'f32AplicarVisible', 'f32bEstado', 'f32bCursorKey', 'f32bSetCursor',
    'f32bMapCierre', 'f32bMapOperacion', 'f32bDeviceFila', 'f32bAplicarVisible',
    'f32bAvanzarOmitida', 'f32bProcesarFila', 'pintarVentasCajaActual', 'responsableCierre',
    'montoDiferenciaCaja', 'motivoCierrePendiente',
    'esEgresoOperativo', 'vCaja',
  ];
  vm.runInContext([
    ...names.map((name) => functionSource(name)),
    functionSource('htmlCierresAnteriores', true),
    functionSource('enlazarCierresAnteriores', true),
  ].join('\n'), context, { filename: htmlPath });
  return { context, main, durable, nodes, actions };
}

test('el dueño ve el cierre de otro dispositivo sin tener un turno abierto', async () => {
  const { context, main, durable, nodes, actions } = load();
  const { row, extra } = serverClosure();
  await context.f32bProcesarFila(spec, row, extra);
  context.vCaja(main);

  assert.equal(durable.get('cierres:cierre-empleado').total, 1500);
  assert.match(main.innerHTML, /Cierres anteriores/);
  assert.match(main.innerHTML, /Turno de empleado/);
  assert.match(main.innerHTML, /\$1450\.00/);
  assert.equal(context.f3Estado.session, null);
  nodes.get('[data-vt]:cierre-empleado').onclick();
  nodes.get('[data-wa]:cierre-empleado').onclick();
  assert.deepEqual(actions, [['ventas', 'cierre-empleado'], ['resumen', 'cierre-empleado']]);
});

test('al cambiar de empleado a dueño en el mismo dispositivo recupera el cierre que falta', async () => {
  const { context, durable } = load();
  const { row, extra } = serverClosure(ownerDevice);
  await context.f32bProcesarFila(spec, row, extra);

  assert.equal(context.db.cierres.length, 1);
  assert.equal(context.db.cierres[0].total, 1500);
  assert.equal(context.db.cierres[0].diferenciaGeneral, -50);
  assert.equal(durable.get('cierres:cierre-empleado')._v4id, closeId);
  assert.equal(context.f3Estado.pull.cursores.cierres_caja.id, closeId);
});

test('repetir el pull del cierre no lo duplica ni altera su arqueo', async () => {
  const { context } = load();
  const { row, extra } = serverClosure();
  await context.f32bProcesarFila(spec, row, extra);
  await context.f32bProcesarFila(spec, row, extra);
  assert.equal(context.db.cierres.length, 1);
  assert.equal(context.db.cierres[0].contadoGeneral, 1450);
  assert.equal(context.db.cierres[0].diferenciaGeneral, -50);
});

test('el eco de un cierre local existente conserva el registro y sus referencias', async () => {
  const { context, durable } = load();
  const { row, extra } = serverClosure(ownerDevice);
  const local = { id: 'cierre-empleado', _v4id: closeId, total: 1500, ventaIds: ['venta-local'] };
  context.db.cierres.push(local);
  await context.f32bProcesarFila(spec, row, extra);
  assert.equal(context.db.cierres.length, 1);
  assert.equal(context.db.cierres[0], local);
  assert.deepEqual(context.db.cierres[0].ventaIds, ['venta-local']);
  assert.equal(durable.size, 0);
});

test('el historial sigue visible con un turno abierto y ordena por fecha de cierre', async () => {
  const { context, main } = load();
  const { row, extra } = serverClosure();
  await context.f32bProcesarFila(spec, row, extra);
  context.db.cierres.unshift({ ...context.db.cierres[0], id: 'reciente', hasta: '2026-09-15T20:00:00.000Z', nota: 'Cierre reciente' });
  context.f3Estado.session = { id: 'turno-duenio', estado: 'abierta' };
  context.vCaja(main);
  assert.match(main.innerHTML, /Vendido en el turno/);
  assert.match(main.innerHTML, /Turno de empleado/);
  assert.ok(main.innerHTML.indexOf('Cierre reciente') < main.innerHTML.indexOf('Turno de empleado'));
  assert.equal(context.f3Estado.session.id, 'turno-duenio');
});

test('el arqueo reserva el rojo para una diferencia negativa real', () => {
  const { context, main, nodes } = load();
  const turno = context.turnoActual('turno-duenio');
  context.turnoActual = () => ({ ...turno, genEfectivo: 1000 });
  context.f3Estado.session = { id: 'turno-duenio', estado: 'abierta' };
  context.vCaja(main);

  const contado = nodes.get('#contadoG');
  const diferencia = nodes.get('#difG');
  contado.value = '800';
  contado.oninput();
  assert.equal(diferencia.className, 'cash-difference negative');
  assert.match(diferencia.innerHTML, /Falta/);
  assert.match(diferencia.innerHTML, /\$200\.00/);

  contado.value = '1000';
  contado.oninput();
  assert.equal(diferencia.className, 'cash-difference ok');
  assert.doesNotMatch(diferencia.innerHTML, /Falta|Sobra/);
});

test('Caja explica el botón de cierre deshabilitado y lo habilita al contar cero', () => {
  const { context, main, nodes } = load();
  context.f3Estado.session = { id:'turno-duenio', estado:'abierta' };
  context.vCaja(main);
  const boton = nodes.get('#cerrarCaja');
  const ayuda = nodes.get('#ayudaCerrarCaja');
  assert.equal(boton.disabled, true);
  assert.match(ayuda.textContent, /caja general/);
  const contado = nodes.get('#contadoG');
  contado.value = '0';
  contado.oninput();
  assert.equal(boton.disabled, false);
  assert.equal(ayuda.hidden, true);
});

test('sin turno y sin cierres muestra el historial vacío junto a Abrir turno', () => {
  const { context, main } = load();
  context.vCaja(main);
  assert.match(main.innerHTML, /Abrir turno/);
  assert.match(main.innerHTML, /Sin cierres todavía/);
});

test('la actualización recupera cierres omitidos previamente y conserva los demás cursores', () => {
  const { context } = load();
  const oldCursor = { ts: '2026-09-15T18:00:01.000Z', id: closeId };
  context.f3Estado.pull = { cursores: { cierres_caja: clone(oldCursor), ventas: clone(oldCursor) } };
  context.f32bEstado();
  assert.equal(context.f3Estado.pull.cursores.cierres_caja, undefined);
  assert.deepEqual(clone(context.f3Estado.pull.cursores.ventas), oldCursor);
  context.f3Estado.pull.cursores.cierres_caja = clone(oldCursor);
  context.f32bEstado();
  assert.deepEqual(clone(context.f3Estado.pull.cursores.cierres_caja), oldCursor);
});

test('el detalle conserva el resumen guardado cuando aún faltan las ventas de otro usuario', async () => {
  const { context } = load();
  const { row, extra } = serverClosure(ownerDevice);
  await context.f32bProcesarFila(spec, row, extra);
  let dialog;
  context.modal = (options) => { dialog = options; };
  vm.runInContext(functionSource('ventasDeCierre') + '\n' + functionSource('verVentasTurno'), context);
  context.verVentasTurno('cierre-empleado');
  assert.match(dialog.cuerpo, /<span>Ventas<\/span><b>2<\/b>/);
  assert.match(dialog.cuerpo, /\$1500\.00/);
  assert.match(dialog.cuerpo, /Falta el detalle de 2 ventas/);
});

test('el detalle parcial mantiene la cantidad original de ventas del cierre', async () => {
  const { context } = load();
  const { row, extra } = serverClosure();
  extra.links.ventas = [{ cierre_id: closeId, venta_id: 'venta-uno' }, { cierre_id: closeId, venta_id: 'venta-dos' }];
  context.db.ventas.push({ id: 'venta-local', _v4id: 'venta-uno', fecha: row.closed_at_device });
  await context.f32bProcesarFila(spec, row, extra);
  let dialog;
  context.modal = (options) => { dialog = options; };
  vm.runInContext(functionSource('ventasDeCierre') + '\n' + functionSource('verVentasTurno'), context);
  context.verVentasTurno('cierre-empleado');
  assert.match(dialog.cuerpo, /<span>Ventas<\/span><b>2<\/b>/);
  assert.match(dialog.cuerpo, /Falta el detalle de 1 venta/);
  assert.match(dialog.cuerpo, /id="qCajaCierre"/);
});
