'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../beta/index.html'), 'utf8').replace(/\r\n/g, '\n');
function funcion(nombre) {
  const inicio = source.indexOf(`function ${nombre}(`);
  assert.ok(inicio >= 0, `Falta implementar ${nombre}`);
  const fin = source.indexOf('\n}', inicio);
  assert.ok(fin > inicio, `No se encontró el cierre de ${nombre}`);
  return source.slice(inicio, fin + 2);
}

function cargar(datos = {}, requeridas = []) {
  // Solo el reloj y la presentación se sustituyen: la imputación FIFO y la mora
  // se ejecutan con las funciones reales de beta/index.html, sin DOM ni red.
  const instante = new Date(2026, 10, 2, 12).getTime();
  class FechaFija extends Date {
    constructor(...args) { super(...(args.length ? args : [instante])); }
    static now() { return instante; }
  }
  const context = vm.createContext({
    Date: FechaFija,
    db: {config: {diasPlazoFiado: 30}, ventas: [], pagos: [], ajustesFiado: [], ...datos},
    $m: numero => `$${Number(numero).toFixed(2)}`,
    fFecha: fecha => String(fecha).slice(0, 10),
  });
  const constantes = ['DIAS_PLAZO_FIADO', 'montoFiadoVenta', 'refVenta'].map(nombre => {
    const linea = source.split('\n').find(linea => linea.startsWith(`const ${nombre}=`));
    assert.ok(linea, `Falta la dependencia real ${nombre}`);
    return linea;
  });
  const funciones = ['fechaMasDiasISO', 'diasDesdeFechaLocal', 'ledgerFiadoCliente', 'estadoMoraCliente'].map(funcion);
  vm.runInContext([...constantes, ...funciones].join('\n'), context);
  for (const nombre of ['fiadoDatosVencimiento', 'fiadoMovimientosCuenta', 'fiadoCalcularAjuste']) {
    if (requeridas.includes(nombre) || source.includes(`function ${nombre}(`)) {
      vm.runInContext(funcion(nombre), context);
    }
  }
  return context;
}
const fecha = dia => `${dia}T12:00:00`;
const cliente = cambios => ({id: 'ana', nombre: 'Ana', saldoBase: 0, saldo: 0, credito: 0, alta: fecha('2026-09-01'), ...cambios});

function cuentaCorregida(){
  const c=cliente({_v4id:'cliente-canonico',saldo:100});
  const snapshot={version:1,created_at:fecha('2026-11-02'),cliente_id:c._v4id,cliente_legacy_id:c.id,saldo_base_incluido:true,
    cargos_abiertos:[{id:'cargo-comp',origen_tipo:'ajuste',origen_id:'comp-v4',origen_legacy_id:'comp',monto:100,restante:100,fecha_origen_device:fecha('2026-01-01'),vence_fecha:'2026-01-31',recargable:true}],
    incluidos:{ventas:[{id:'enero-v4',legacy_id:'enero'},{id:'febrero-v4',legacy_id:'febrero'}],pagos:[{id:'p1-v4',legacy_id:'p1'},{id:'p2-v4',legacy_id:'p2'}],ajustes:[{id:'comp-v4',legacy_id:'comp'}]}};
  const datos={ventas:[{id:'enero',clienteId:c.id,forma:'fiado',total:100,fecha:fecha('2026-01-01'),venceFiado:'2026-01-31'},{id:'febrero',clienteId:c.id,forma:'fiado',total:100,fecha:fecha('2026-02-01'),venceFiado:'2026-03-03'}],
    pagos:[{id:'p1',clienteId:c.id,monto:100,fecha:fecha('2026-01-15')},{id:'p2',clienteId:c.id,monto:100,fecha:fecha('2026-02-15')}],
    ajustesFiado:[{id:'comp',clienteId:c.id,monto:100,fecha:fecha('2026-11-02'),fechaOrigen:'2026-01-01',venceFiado:'2026-01-31',metadata:{estado_cuenta:snapshot}}]};
  return {c,datos};
}
test('corregir un cobro antiguo conserva aplicaciones posteriores y restaura su vencimiento canónico',()=>{
  const {c,datos}=cuentaCorregida(),app=cargar(datos);
  const abiertos=app.ledgerFiadoCliente(c);assert.equal(abiertos.length,1);assert.equal(abiertos[0].id,'ajuste:comp');assert.equal(abiertos[0].vence,'2026-01-31');assert.equal(abiertos[0].restante,100);
});
test('un cobro posterior a la corrección se aplica una sola vez al estado confirmado',()=>{
  const {c,datos}=cuentaCorregida();datos.pagos.push({id:'nuevo-local',clienteId:c.id,monto:25,fecha:'2026-11-02T13:00:00'});c.saldo=75;
  const app=cargar(datos),abiertos=app.ledgerFiadoCliente(c);assert.equal(abiertos.length,1);assert.equal(abiertos[0].restante,75);assert.equal(abiertos[0].vence,'2026-01-31');
});

test('un pago parcial hoy no reinicia los días de la deuda vencida que sigue abierta', () => {
  const c = cliente({saldo: 75});
  const app = cargar({
    ventas: [{id: 'vieja', clienteId: c.id, forma: 'fiado', total: 100, fecha: fecha('2026-09-01'), venceFiado: '2026-10-01'}],
    pagos: [{id: 'parcial', clienteId: c.id, monto: 25, fecha: fecha('2026-11-02')}],
  }, ['fiadoDatosVencimiento']);
  const estado = app.fiadoDatosVencimiento(c);
  assert.equal(estado.estado, 'mora');
  assert.equal(estado.dias, 32);
  assert.equal(estado.montoVencido, 75);
  assert.match(estado.texto, /vencid[oa].*32/i);
});

test('la fecha del cargo más próximo prevalece sobre la última compra y el plazo global', () => {
  const c = cliente({saldo: 100});
  const app = cargar({
    config: {diasPlazoFiado: 7},
    ventas: [
      {id: 'primera', clienteId: c.id, forma: 'fiado', total: 60, fecha: fecha('2026-10-01'), venceFiado: '2026-11-05'},
      {id: 'ultima', clienteId: c.id, forma: 'fiado', total: 40, fecha: fecha('2026-11-01'), venceFiado: '2026-11-20'},
    ],
  }, ['fiadoDatosVencimiento']);
  const estado = app.fiadoDatosVencimiento(c);
  assert.equal(estado.estado, 'vigente');
  assert.equal(estado.proximo, '2026-11-05');
  assert.equal(estado.dias, 3);
  assert.equal(estado.montoVencido, 0);
  assert.match(estado.texto, /vence/i);
});

test('un vencimiento de hoy todavía es vigente y se informa como hoy', () => {
  const c = cliente({saldo: 40});
  const app = cargar({ventas: [{id: 'hoy', clienteId: c.id, forma: 'fiado', total: 40, fecha: fecha('2026-10-03'), venceFiado: '2026-11-02'}]}, ['fiadoDatosVencimiento']);
  const estado = app.fiadoDatosVencimiento(c);
  assert.equal(estado.estado, 'vigente');
  assert.equal(estado.proximo, '2026-11-02');
  assert.ok(estado.dias === 0);
  assert.equal(estado.montoVencido, 0);
  assert.match(estado.texto, /vence hoy/i);
});

test('el saldo inicial conserva su fecha de alta al calcular la mora', () => {
  const c = cliente({saldoBase: 100, saldo: 100, alta: fecha('2026-09-01')});
  const app = cargar({}, ['fiadoDatosVencimiento']);
  const estado = app.fiadoDatosVencimiento(c);
  assert.equal(estado.estado, 'mora');
  assert.equal(estado.dias, 32);
  assert.equal(estado.montoVencido, 100);
});

test('sin deuda y con crédito no muestran una mora ficticia ni un vencimiento pendiente', () => {
  const app = cargar({}, ['fiadoDatosVencimiento']);
  for (const [c, esperado] of [[cliente(), 'sin_deuda'], [cliente({credito: 90}), 'credito']]) {
    const estado = app.fiadoDatosVencimiento(c);
    assert.equal(estado.estado, esperado);
    assert.equal(estado.montoVencido, 0);
    assert.ok(estado.proximo == null || estado.proximo === '');
    assert.doesNotMatch(estado.texto, /vencid[oa]|vence el/i);
  }
});

test('la cuenta incluye el saldo inicial y concilia fiados, mixtos, pagos, ajustes y recargos', () => {
  const c = cliente({saldoBase: 100, saldo: 110});
  const app = cargar({
    ventas: [
      {id: 'fiada', clienteId: c.id, forma: 'fiado', total: 40, fecha: fecha('2026-09-02')},
      {id: 'mixta', clienteId: c.id, forma: 'mixto', total: 100, pagos: [{forma: 'efectivo', monto: 75}, {forma: 'fiado', monto: 25}], fecha: fecha('2026-09-03')},
      {id: 'anulada', clienteId: c.id, forma: 'fiado', total: 999, anulada: true, fecha: fecha('2026-09-08')},
      {id: 'contado', clienteId: c.id, forma: 'efectivo', total: 999, fecha: fecha('2026-09-08')},
      {id: 'ajena', clienteId: 'otro', forma: 'fiado', total: 999, fecha: fecha('2026-09-08')},
    ],
    pagos: [{id: 'pago', clienteId: c.id, monto: 70, fecha: fecha('2026-09-04')}],
    ajustesFiado: [
      {id: 'deuda', clienteId: c.id, monto: 20, motivo: 'Deuda anterior', fecha: fecha('2026-09-05')},
      {id: 'interes', clienteId: c.id, tipo: 'recargo', monto: 5, motivo: 'Recargo acordado', fecha: fecha('2026-09-06')},
      {id: 'perdon', clienteId: c.id, monto: -10, motivo: 'Descuento acordado', fecha: fecha('2026-09-07')},
      {id: 'ajeno', clienteId: 'otro', monto: 999, fecha: fecha('2026-09-08')},
    ],
  }, ['fiadoMovimientosCuenta']);
  const movimientos = app.fiadoMovimientosCuenta(c);
  assert.deepEqual(Array.from(movimientos, m => [m.tipo, m.monto, m.saldo]), [
    ['ajuste', -10, 110], ['recargo', 5, 120], ['ajuste', 20, 115],
    ['pago', -70, 95], ['fiado', 25, 165], ['fiado', 40, 140], ['base', 100, 100],
  ]);
  assert.equal(movimientos.at(-1).fecha, c.alta);
  assert.equal(movimientos[0].saldo, c.saldo - c.credito);
  assert.equal(new Set(movimientos.map(m => m.id)).size, 7);
  for (const movimiento of movimientos) {
    assert.ok(movimiento.id);
    assert.equal(typeof movimiento.descripcion, 'string');
    assert.ok(movimiento.descripcion.length);
    assert.ok(Object.hasOwn(movimiento, 'registro'));
  }
  assert.equal(movimientos[0].registro.id, 'perdon');
  assert.equal(movimientos.find(m => m.tipo === 'pago').registro.id, 'pago');
});

test('el historial mantiene el saldo neto negativo cuando un pago deja crédito', () => {
  const c = cliente({credito: 60});
  const app = cargar({
    pagos: [{id: 'adelanto', clienteId: c.id, monto: 100, fecha: fecha('2026-09-01')}],
    ventas: [{id: 'uso', clienteId: c.id, forma: 'fiado', total: 40, fecha: fecha('2026-09-02')}],
  }, ['fiadoMovimientosCuenta']);
  assert.deepEqual(Array.from(app.fiadoMovimientosCuenta(c), m => [m.tipo, m.monto, m.saldo]), [
    ['fiado', 40, -60], ['pago', -100, -100],
  ]);
});

test('agregar deuda anterior suma únicamente el monto indicado al saldo neto', () => {
  const app = cargar({}, ['fiadoCalcularAjuste']);
  const ajuste = app.fiadoCalcularAjuste({intencion: 'deuda_anterior', monto: 30, saldo: 100});
  assert.equal(ajuste.ok, true);
  assert.equal(ajuste.delta, 30);
  assert.equal(ajuste.nuevoSaldo, 130);
});

test('perdonar siempre resta y no puede crear crédito', () => {
  const app = cargar({}, ['fiadoCalcularAjuste']);
  for (const [monto, delta, saldo] of [[25, -25, 75], [100, -100, 0]]) {
    const ajuste = app.fiadoCalcularAjuste({intencion: 'perdonar', monto, saldo: 100});
    assert.equal(ajuste.ok, true);
    assert.equal(ajuste.delta, delta);
    assert.equal(ajuste.nuevoSaldo, saldo);
  }
  assert.equal(app.fiadoCalcularAjuste({intencion: 'perdonar', monto: 101, saldo: 100}).ok, false);
  assert.equal(app.fiadoCalcularAjuste({intencion: 'perdonar', monto: 1, saldo: 0, credito: 100}).ok, false);
});

test('corregir establece el saldo final y permite dejarlo en cero', () => {
  const app = cargar({}, ['fiadoCalcularAjuste']);
  for (const [monto, delta] of [[0, -100], [60, -40], [140, 40]]) {
    const ajuste = app.fiadoCalcularAjuste({intencion: 'corregir', monto, saldo: 100});
    assert.equal(ajuste.ok, true);
    assert.equal(ajuste.delta, delta);
    assert.equal(ajuste.nuevoSaldo, monto);
  }
  assert.equal(app.fiadoCalcularAjuste({intencion: 'corregir', monto: 100, saldo: 100}).ok, false);
});

test('agregar deuda consume un crédito existente sin perder el saldo neto restante', () => {
  const app = cargar({}, ['fiadoCalcularAjuste']);
  for (const [monto, saldo] of [[25, -75], [100, 0], [150, 50]]) {
    const ajuste = app.fiadoCalcularAjuste({intencion: 'deuda_anterior', monto, saldo: 0, credito: 100});
    assert.equal(ajuste.ok, true);
    assert.equal(ajuste.delta, monto);
    assert.equal(ajuste.nuevoSaldo, saldo);
  }
  const correccion = app.fiadoCalcularAjuste({intencion: 'corregir', monto: 0, saldo: 0, credito: 100});
  assert.equal(correccion.ok, true);
  assert.equal(correccion.delta, 100);
  assert.equal(correccion.nuevoSaldo, 0);
});

test('los ajustes rechazan negativos, importes no finitos y operaciones vacías', () => {
  const app = cargar({}, ['fiadoCalcularAjuste']);
  for (const intencion of ['deuda_anterior', 'corregir', 'perdonar']) {
    for (const monto of [-1, NaN, Infinity, -Infinity]) {
      assert.equal(app.fiadoCalcularAjuste({intencion, monto, saldo: 100}).ok, false, `${intencion}: ${String(monto)}`);
    }
  }
  for (const intencion of ['deuda_anterior', 'perdonar']) {
    assert.equal(app.fiadoCalcularAjuste({intencion, monto: 0, saldo: 100}).ok, false);
  }
  assert.equal(app.fiadoCalcularAjuste({intencion: 'desconocida', monto: 10, saldo: 100}).ok, false);
});
