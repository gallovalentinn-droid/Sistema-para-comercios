const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../beta/index.html'), 'utf8').replace(/\r\n/g, '\n');
const start = html.indexOf('function f59DesgloseCajaActual(');
const end = html.indexOf('function vCaja(', start);
function helpers() {
  assert.ok(start >= 0 && end > start, 'faltan los cálculos de presentación del turno');
  const context = vm.createContext({
    normalizarTexto: s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
  });
  vm.runInContext(`${html.slice(start, end)}\nthis.desglose=f59DesgloseCajaActual;this.movimientos=f59MovimientosCajaActual;this.tiempo=f59TiempoAbiertoCaja;`, context);
  return context;
}

const egresos = [
  { id:'g1', fecha:'2026-09-28T10:05:00Z', motivo:'Compra de insumos', forma:'efectivo', caja:'general', monto:20 },
  { id:'r1', fecha:'2026-09-28T10:04:00Z', motivo:'Retiro del dueño', forma:'efectivo', caja:'general', monto:10 },
  { id:'g2', fecha:'2026-09-28T10:03:00Z', motivo:'Pago a proveedor', forma:'efectivo', caja:'cigarrillos', monto:5 },
  { id:'r2', fecha:'2026-09-28T10:02:00Z', motivo:'Retiro del dueño', forma:'efectivo', caja:'cigarrillos', monto:10 },
  { id:'g3', fecha:'2026-09-28T10:01:00Z', motivo:'Servicios', forma:'transferencia', caja:'general', monto:25 },
];
const t = {
  total:400, genEfectivo:200, cigEfectivo:70, cobEfectivo:30,
  egrGeneral:30, egrCigarros:15, porForma:{ efectivo:270, transferencia:70, qr:10, tarjeta:40, fiado:10 },
  egresos,
  ventas:[
    { id:'v1', fecha:'2026-09-28T10:10:00Z', total:250, forma:'efectivo', items:[{cant:1}] },
    { id:'v2', fecha:'2026-09-28T10:00:00Z', total:150, forma:'transferencia', items:[{cant:2}] },
  ],
  pagos:[{ id:'p1', fecha:'2026-09-28T10:06:00Z', monto:30, forma:'efectivo', clienteId:'c1' }],
};

test('dos cajas físicas muestran dos cuentas sin duplicar gastos ni retiros', () => {
  const { desglose } = helpers();
  const result = desglose(t, true, 100, 50);
  assert.deepEqual(JSON.parse(JSON.stringify(result.general)), {
    inicio:100, ventas:200, cobros:30, gastos:20, retiros:10, esperado:300,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result.cigarrillos)), {
    inicio:50, ventas:70, cobros:0, gastos:5, retiros:10, esperado:105,
  });
});

test('una caja física reúne todo el efectivo, incluso si cigarrillos se apartan al cierre', () => {
  const { desglose } = helpers();
  const result = desglose(t, false, 100, 50);
  assert.equal(result.cigarrillos, null);
  assert.deepEqual(JSON.parse(JSON.stringify(result.general)), {
    inicio:150, ventas:270, cobros:30, gastos:25, retiros:20, esperado:405,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result.pagos)), {
    efectivo:270, transferencia:80, tarjeta:40, fiado:10, total:400, diferencia:0,
  });
});

test('el fondo inicial aparece aunque todavía no haya ventas ni movimientos', () => {
  const { desglose } = helpers();
  const result = desglose({ventas:[],pagos:[],egresos:[],genEfectivo:0,cigEfectivo:0,cobEfectivo:0,porForma:{},total:0}, false, 15550, 0);
  assert.equal(result.general.inicio, 15550);
  assert.equal(result.general.esperado, 15550);
  assert.equal(result.pagos.total, 0);
});

test('los cobros de fiado se ven como movimiento pero no inflan lo vendido del turno', () => {
  const { desglose, movimientos } = helpers();
  const result = desglose(t, false, 100, 50);
  assert.equal(result.general.cobros, 30);
  assert.equal(result.pagos.total, 400);
  const orden = movimientos(t);
  assert.deepEqual(Array.from(orden.slice(0, 5), x => `${x.tipo}:${x.registro.id}`), [
    'venta:v1', 'cobro:p1', 'gasto:g1', 'retiro:r1', 'gasto:g2',
  ]);
  assert.equal(orden.length, 8);
});

test('la antigüedad del turno es legible y no resulta negativa con relojes desfasados', () => {
  const { tiempo } = helpers();
  assert.equal(tiempo('2026-09-28T10:00:00Z', Date.parse('2026-09-28T12:15:00Z')), 'hace 2 h 15 min');
  assert.equal(tiempo('2026-09-28T13:00:00Z', Date.parse('2026-09-28T12:15:00Z')), 'hace menos de 1 min');
});
