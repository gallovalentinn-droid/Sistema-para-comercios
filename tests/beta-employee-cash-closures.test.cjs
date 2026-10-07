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
    if (!nodes.has(key)) nodes.set(key, { dataset, value: '', innerHTML: '', focus: () => {},
      classList:{add:()=>{},remove:()=>{},toggle:()=>{}},setAttribute:()=>{} });
    return nodes.get(key);
  }
  const context = {
    db: { config: { moduloCigarros: false }, cierres: [], ventas: [], pagos: [], egresos: [] },
    snapshotLocal: { cierres: [] },
    f3Estado: { comercioId: commerceId, deviceUuid: ownerDevice, session: null },
    f32RecuperacionReplay: false,
    F32_VERSION: 'test', F32B_VERSION: 'test',
    F32_CURSOR_ZERO: { ts: '1970-01-01T00:00:00.000Z', id: '00000000-0000-0000-0000-000000000000' },
    clonarLocal: clone,
    f3Activo: () => true,
    esDuenio: () => true,
    recalcularDerivados: () => {},
    f32PersistirDatoEntrante: async ({ puts }) => {
      for (const { coleccion, valor } of puts) durable.set(`${coleccion}:${valor.id}`, clone(valor));
    },
    f32PersistirFinalizacion: async ({ mutarPull }) => mutarPull(context.f32EstadoPull()),
    turnoActual: (id) => id ? clone(emptyTurn) : null,
    $: (selector) => main.innerHTML.includes(`id="${selector.slice(1)}"`) ? node(selector) : null,
    $$: (selector) => {
      const match = /^\[data-(vt|wa|destino-caja)\]$/.exec(selector);
      if (!match) return [];
      return [...main.innerHTML.matchAll(new RegExp(`data-${match[1]}="([^"]+)"`, 'g'))]
        .map((item) => node(`${selector}:${item[1]}`, { [match[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]: item[1] }));
    },
    esc: (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]),
    $m: (value) => `$${Number(value).toFixed(2)}`,
    num: (value) => Number(value) || 0,
    normalizarTexto: (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
    fFH: (value) => value,
    fFecha: (value) => value,
    ic: () => '',
    nfM: { format: (value) => String(value) },
    FORMAS: { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta' },
    busCajaTurno: '',
    cierreResponsableFiltro: 'todos',
    f69Estado: { comercioId: commerceId, items: [], loading: false, loadedAt: 0, error: '' },
    filtrarVentasPorBusqueda: (rows) => rows,
    verVentasTurno: (id) => actions.push(['ventas', id]),
    verVentasTurnoInterrumpido: (id) => actions.push(['interrumpido', id]),
    modalEnviarResumen: (cierre) => actions.push(['resumen', cierre.id]),
  };
  vm.createContext(context);
  const names = [
    'f5SesionIds', 'f32Iso', 'f32Cursor', 'f32EstadoPull', 'f32IdLocalRemoto',
    'f32BuscarLocalV4', 'f32BuscarLocalLegacy', 'f32LocalParaRemoto', 'f32ResolverIdLocal',
    'f32UpsertArray', 'f32AplicarVisible', 'f32bEstado', 'f32bCursorKey', 'f32bSetCursor',
    'f32bMapEgreso', 'f32bMapVenta', 'f32bMapCierre', 'f32bMapOperacion', 'f32bDeviceFila', 'f32bAplicarVisible',
    'f32bAvanzarOmitida', 'f32bProcesarFila', 'pintarVentasCajaActual', 'responsableCierre',
    'montoDiferenciaCaja', 'motivoCierrePendiente', 'motivoDiferenciaCaja', 'estadoDiferenciaCaja', 'f69ResumenCierre', 'f52CalcularDestinoCierre',
    'f56ValidarApartadoCigarrillos', 'f57DesgloseRetiroCigarrillos', 'f56CajaSeparadaEnSesion', 'f57ModoCaja', 'f56EsperadoCajaUnica',
    'esEgresoOperativo', 'f59DesgloseCajaActual', 'f59MovimientosCajaActual', 'f59TiempoAbiertoCaja',
    'f6ClaveTurno', 'f88HuellaArqueo', 'vCaja',
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
  assert.match(main.innerHTML, /Historial de turnos/);
  assert.match(main.innerHTML, /Turno de empleado/);
  assert.match(main.innerHTML, /\$1450\.00/);
  assert.equal(context.f3Estado.session, null);
  nodes.get('[data-vt]:cierre-empleado').onclick();
  nodes.get('[data-wa]:cierre-empleado').onclick();
  assert.deepEqual(actions, [['ventas', 'cierre-empleado'], ['resumen', 'cierre-empleado']]);
});

test('un cierre de otro dispositivo conserva responsable, retiro, saldo y diferencia de apertura', async () => {
  const {context,main}=load();
  const {row,extra}=serverClosure();
  extra.sesiones[0].caja_id='caja-compartida';
  extra.traspasos=[{id:closeId,cerrado_por:row.cerrado_por,retiro_general:1000,retiro_cigarros:0,queda_general:450,queda_cigarros:0}];
  extra.miembros=[{user_id:row.cerrado_por,nombre_mostrado:'Ana'}];
  extra.segmentos=[{segment_id:sessionId,apertura_diferencia_general:-100,apertura_diferencia_cigarros:0,apertura_motivo:'Faltante contado'}];
  await context.f32bProcesarFila(spec,row,extra);
  const cierre=context.db.cierres[0];
  assert.equal(cierre.responsableNombre,'Ana');
  assert.equal(cierre._v4cajaId,'caja-compartida');
  assert.equal(cierre.retiroGeneral,1000);
  assert.equal(cierre.quedaGeneral,450);
  assert.equal(cierre.aperturaDiferenciaGeneral,-100);
  context.vCaja(main);
  assert.match(main.innerHTML,/Ana/);
  assert.match(main.innerHTML,/Faltó \$100/);
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

test('al reconstruir una copia local vacía recupera un egreso propio ya confirmado', async () => {
  const { context, durable } = load();
  context.f32RecuperacionReplay = true;
  const egresoSpec = { tabla: 'egresos', coleccion: 'egresos', ts: 'received_at_server', kind: 'egreso' };
  const row = {
    id: '77777777-7777-4777-8777-777777777777', legacy_id: 'egreso-propio',
    comercio_id: commerceId, device_id: ownerDevice, caja_sesion_id: sessionId,
    session_segment_id: sessionId, monto: 100, forma: 'efectivo', caja_fisica: 'general',
    motivo: 'Compra', nota: '', occurred_at_device: '2026-09-24T18:00:00Z',
    received_at_server: '2026-09-24T18:00:01Z',
  };
  await context.f32bProcesarFila(egresoSpec, row, {});
  assert.equal(context.db.egresos.length, 1);
  assert.equal(context.db.egresos[0].monto, 100);
  assert.equal(durable.get('egresos:egreso-propio')._v4id, row.id);
});

test('al reconstruir una copia local vacía recupera una venta propia sin duplicarla', async () => {
  const { context, durable } = load();
  context.f32RecuperacionReplay = true;
  const saleSpec = { tabla: 'ventas', coleccion: 'ventas', ts: 'received_at_server', kind: 'venta' };
  const row = {
    id: '88888888-8888-4888-8888-888888888888', legacy_id: 'venta-propia',
    comercio_id: commerceId, device_id: ownerDevice, caja_sesion_id: sessionId,
    session_segment_id: sessionId, ticket_seq: 8, ticket_ref: 'CAJA-8',
    subtotal: 1500, descuento_manual: 0, promo_auto: 0, promo_pago: 0,
    total: 1500, forma: 'efectivo', recibido: 1500, vuelto: 0, monto_fiado: 0,
    occurred_at_device: '2026-09-24T18:00:00Z', received_at_server: '2026-09-24T18:00:01Z',
  };
  await context.f32bProcesarFila(saleSpec, row, { items: [], componentes: [], pagos: [] });
  await context.f32bProcesarFila(saleSpec, row, { items: [], componentes: [], pagos: [] });
  assert.equal(context.db.ventas.length, 1);
  assert.equal(context.db.ventas[0].total, 1500);
  assert.equal(durable.get('ventas:venta-propia')._v4id, row.id);
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
  context.turnoActual = () => ({ ...turno, genEfectivo: 1000, porForma: { ...turno.porForma, efectivo: 1000 } });
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

test('Caja exige contar y elegir el destino antes de habilitar el cierre', () => {
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
  assert.equal(boton.disabled, true);
  nodes.get('[data-destino-caja]:retirar_todo').onclick();
  assert.equal(boton.disabled, false);
  assert.equal(ayuda.hidden, true);
});

test('una caja con separación de cigarrillos cuenta el efectivo una vez y exige el importe apartado', () => {
  const { context, main, nodes } = load();
  const turno = context.turnoActual('turno-duenio');
  context.turnoActual = () => ({ ...turno, genEfectivo: 514440, cigEfectivo: 159530,
    porForma: { ...turno.porForma, efectivo: 673970 } });
  context.numImportacion = text => ({ ok: /^\d+(?:[.,]\d{1,2})?$/.test(String(text)),
    blank: !String(text).trim(), value: Number(String(text).replace(',', '.')) });
  context.db.config.separaCigarrillosAlCierre = true;
  context.f3Estado.session = { id:'turno-duenio', estado:'abierta', fondoGeneral:8030, fondoCigarros:0 };
  context.vCaja(main);
  assert.match(main.innerHTML, /Todo el efectivo se cuenta junto\. El monto de cigarrillos se aparta al cerrar\./);
  assert.match(main.innerHTML, /<tr><td style="padding-left:0">Ventas en efectivo<\/td><td class="r num">\+ \$673970\.00<\/td><\/tr>/);
  assert.match(main.innerHTML, /Separación de cigarrillos/);
  assert.doesNotMatch(main.innerHTML, /id="contadoC"/);
  nodes.get('#contadoG').value = '682000';
  nodes.get('#contadoG').oninput();
  assert.match(nodes.get('#difG').innerHTML, /\$0\.00/);
  nodes.get('[data-destino-caja]:retirar_todo').onclick();
  assert.equal(nodes.get('#cerrarCaja').disabled, true);
  assert.match(nodes.get('#ayudaCerrarCaja').textContent, /cuánto efectivo separás para cigarrillos/i);
  nodes.get('#apartadoCigarrillos').value = '159530';
  nodes.get('#apartadoCigarrillos').oninput();
  assert.equal(nodes.get('#cerrarCaja').disabled, false);
  assert.match(nodes.get('#resumenDestinoCaja').textContent, /\$159530\.00 para cigarrillos/);
  assert.match(nodes.get('#resumenDestinoCaja').textContent, /\$522470\.00 en otros retiros/);
});

test('el cierre sugiere cigarrillos cobrados por otros medios y calcula cuánto queda tras apartarlos', () => {
  const { context, main, nodes } = load();
  const turno = context.turnoActual('turno-duenio');
  context.turnoActual = () => ({ ...turno, cigCobradoTotal: 30000,
    cigCobradoPorForma: { efectivo: 10000, transferencia: 15000, tarjeta: 5000, otros: 0 } });
  context.numImportacion = text => ({ ok: /^\d+(?:[.,]\d{1,2})?$/.test(String(text)),
    blank: !String(text).trim(), value: Number(String(text).replace(',', '.')) });
  context.db.config.separaCigarrillosAlCierre = true;
  context.f3Estado.session = { id:'turno-duenio', estado:'abierta', fondoGeneral:50000, fondoCigarros:0 };
  context.vCaja(main);
  assert.match(main.innerHTML, /Sugerencia por ventas de cigarrillos ya cobradas: <b>\$30000\.00<\/b>/);
  assert.match(main.innerHTML, /Transferencia \/ QR \$15000\.00/);
  assert.match(main.innerHTML, /El fiado pendiente no se incluye/);
  assert.equal(nodes.get('#apartadoCigarrillos').value, '');
  nodes.get('#contadoG').value = '50000';
  nodes.get('#contadoG').oninput();
  nodes.get('[data-destino-caja]:dejar').onclick();
  nodes.get('#usarSugerenciaCigarrillos').onclick();
  assert.equal(nodes.get('#apartadoCigarrillos').value, '30000');
  assert.equal(nodes.get('#quedaCajaGeneral').value, '20000');
  assert.match(nodes.get('#resumenDestinoCaja').textContent, /\$30000\.00 para cigarrillos/);
  assert.match(nodes.get('#resumenDestinoCaja').textContent, /\$20000\.00 queda/);
  nodes.get('#apartadoCigarrillos').value = '25000';
  nodes.get('#apartadoCigarrillos').oninput();
  assert.equal(nodes.get('#quedaCajaGeneral').value, '25000');
  nodes.get('#quedaCajaGeneral').value = '18000';
  nodes.get('#quedaCajaGeneral').oninput();
  nodes.get('#apartadoCigarrillos').value = '20000';
  nodes.get('#apartadoCigarrillos').oninput();
  assert.equal(nodes.get('#quedaCajaGeneral').value, '18000');
});

test('si lo vendido en cigarrillos supera el efectivo contado, advierte y no intenta apartar plata inexistente', () => {
  const { context, main, nodes } = load();
  const turno = context.turnoActual('turno-duenio');
  context.turnoActual = () => ({ ...turno, cigCobradoTotal: 30000,
    cigCobradoPorForma: { efectivo: 0, transferencia: 30000, tarjeta: 0, otros: 0 } });
  context.numImportacion = text => ({ ok: /^\d+(?:[.,]\d{1,2})?$/.test(String(text)),
    blank: !String(text).trim(), value: Number(String(text).replace(',', '.')) });
  context.db.config.separaCigarrillosAlCierre = true;
  context.f3Estado.session = { id:'turno-duenio', estado:'abierta', fondoGeneral:10000, fondoCigarros:0 };
  context.vCaja(main);
  nodes.get('#contadoG').value = '10000';
  nodes.get('#contadoG').oninput();
  assert.match(nodes.get('#avisoSugerenciaCigarrillos').textContent, /supera el efectivo contado por \$20000\.00/);
  nodes.get('[data-destino-caja]:dejar').onclick();
  nodes.get('#usarSugerenciaCigarrillos').onclick();
  assert.equal(nodes.get('#apartadoCigarrillos').value, '10000');
  assert.equal(nodes.get('#quedaCajaGeneral').value, '0');
  assert.match(nodes.get('#resumenDestinoCaja').textContent, /\$10000\.00 para cigarrillos/);
});

test('el cierre guiado no revela el cálculo hasta que se cuenta y permite volver', () => {
  const { context, main, nodes } = load();
  context.f3Estado.session = { id:'turno-duenio', estado:'abierta' };
  const paneles = ['contar','revisar','finalizar'].map(cajaPaso => ({dataset:{cajaPaso},hidden:false}));
  const indicadores = ['contar','revisar','finalizar'].map(cajaIndicador => ({dataset:{cajaIndicador},classList:{toggle:()=>{}}}));
  const original = context.$$;
  context.$$ = (selector, root) => selector==='[data-caja-paso]' ? paneles : selector==='[data-caja-indicador]' ? indicadores : original(selector, root);
  context.vCaja(main);
  assert.deepEqual(paneles.map(p => p.hidden), [false,true,true]);
  nodes.get('#pasoCajaSiguiente').onclick();
  assert.deepEqual(paneles.map(p => p.hidden), [false,true,true]);
  assert.match(nodes.get('#ayudaConteoCaja').textContent, /caja general/);
  nodes.get('#contadoG').value = '-5';
  nodes.get('#pasoCajaSiguiente').onclick();
  assert.deepEqual(paneles.map(p => p.hidden), [false,true,true]);
  assert.match(nodes.get('#ayudaConteoCaja').textContent, /igual o mayor a 0/);
  nodes.get('#contadoG').value = '0';
  nodes.get('#contadoG').oninput();
  nodes.get('#pasoCajaSiguiente').onclick();
  assert.deepEqual(paneles.map(p => p.hidden), [true,false,true]);
  nodes.get('#pasoCajaFinalizar').onclick();
  assert.deepEqual(paneles.map(p => p.hidden), [true,true,false]);
  nodes.get('#pasoCajaAnterior').onclick();
  assert.deepEqual(paneles.map(p => p.hidden), [true,false,true]);
});

test('sin turno y sin historial muestra Abrir turno', () => {
  const { context, main } = load();
  context.vCaja(main);
  assert.match(main.innerHTML, /Abrir turno/);
  assert.match(main.innerHTML, /Sin turnos anteriores/);
});

test('al terminar un turno, la próxima caja vuelve a la vista de turno actual', () => {
  const { context, main } = load();
  context.__miCajaVista='cierre';
  context.vCaja(main);
  assert.equal(context.__miCajaVista,'turno');
  assert.match(main.innerHTML, /No hay un turno abierto/);
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
