const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'beta', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const piece = (start, end) => {
  const first = html.indexOf(start);
  assert.ok(first >= 0, `${start} debe existir`);
  const last = html.indexOf(end, first + start.length);
  assert.ok(last > first, `${end} debe seguir a ${start}`);
  return html.slice(first, last);
};

test('REV69 explica el arrastre sin reescribir el arqueo original', () => {
  const code = piece('function f69ResumenCierre(', '\nfunction htmlCierresAnteriores(');
  const context = vm.createContext({});
  vm.runInContext(`${code}\nthis.resumen=f69ResumenCierre;`, context);
  const cierre = {
    esperadoGeneral: 1200, contadoGeneral: 10000, diferenciaGeneral: 8800,
    retiroGeneral: 9000, quedaGeneral: 1000,
    _v4ajustes: [{ id: 'a', tipo: 'efectivo_arrastrado_turno_interrumpido', estado: 'resuelto', monto: 5000 }]
  };
  const antes = JSON.stringify(cierre);
  const result = context.resumen(cierre);
  assert.equal(result.arrastre, 5000);
  assert.equal(result.esperadoAjustado, 6200);
  assert.equal(result.diferenciaAjustada, 3800);
  assert.equal(JSON.stringify(cierre), antes);
});

test('REV69 no suma ajustes pendientes ni duplica un mismo segmento', () => {
  const code = piece('function f69ResumenCierre(', '\nfunction htmlCierresAnteriores(');
  const context = vm.createContext({});
  vm.runInContext(`${code}\nthis.resumen=f69ResumenCierre;`, context);
  const cierre = {
    esperadoGeneral: 2000, contadoGeneral: 2100,
    _v4ajustes: [
      { id: 'a', tipo: 'efectivo_arrastrado_turno_interrumpido', estado: 'pendiente', monto: 500 },
      { id: 'b', tipo: 'ajuste_manual', estado: 'resuelto', monto: 1000 }
    ]
  };
  const result = context.resumen(cierre);
  assert.equal(result.arrastre, 0);
  assert.equal(result.diferenciaAjustada, 100);
});

test('REV69 conserva revisión del cierre aunque se resuelva un arrastre', () => {
  const code = piece('function f32bRecalcularEstadoCierre(', '\nfunction f32bAplicarAjusteCierrePuro(');
  const context = vm.createContext({});
  vm.runInContext(`${code}\nthis.recalcular=f32bRecalcularEstadoCierre;`, context);
  const cierre = {
    _v4estadoBase: 'requiere_conciliacion',
    _v4ajustes: [{ tipo: 'efectivo_arrastrado_turno_interrumpido', estado: 'resuelto', monto: 5000 }]
  };
  assert.equal(context.recalcular(cierre)._v4estado, 'requiere_conciliacion');
});

test('REV69 resume ventas del segmento sin inventar contado ni diferencia', () => {
  const code = piece('function f69MapTurnosInterrumpidos(', '\nfunction f69ResumenCierre(');
  const context = vm.createContext({});
  vm.runInContext(`${code}\nthis.mapear=f69MapTurnosInterrumpidos;`, context);
  const turnos = context.mapear([
    { segment_id: 's1', opened_at_device: '2026-09-29T12:14:00Z', interrumpido_at_device: '2026-09-29T13:54:00Z', interrumpido_motivo: 'Recarga', apertura_contado_general: 8500 }
  ], [
    { session_segment_id: 's1', id: 'v1', total: 3000 },
    { session_segment_id: 's1', id: 'v2', total: 5000 }
  ]);
  assert.equal(turnos.length, 1);
  assert.equal(turnos[0].cantVentas, 2);
  assert.equal(turnos[0].total, 8000);
  assert.equal(turnos[0].contadoGeneral, undefined);
  assert.equal(turnos[0].diferenciaGeneral, undefined);
});

test('REV69 muestra interrupciones sin arqueo en el historial de Caja', () => {
  const historial = piece('function htmlCierresAnteriores(', '\nfunction enlazarCierresAnteriores(');
  assert.match(historial, /Sin arqueo/);
  assert.match(historial, /f69Estado\.items/);
  assert.match(historial, /f69ResumenCierre\(c\)/);
  assert.match(historial, /data-vt-interrumpido/);
  assert.match(historial, /Revisión pendiente/);
  assert.doesNotMatch(historial, /contado.*\$\{t\.contado/);
});

test('REV69 ofrece ventas del turno interrumpido y advierte si faltan en el dispositivo', () => {
  const code = piece('function verVentasTurnoInterrumpido(', '\nfunction verVentasTurno(');
  let dialog;
  const context = vm.createContext({
    f69Estado: { items: [{ segmentId: 's1', cantVentas: 2, total: 8000, desde: '2026-09-29T12:14:00Z', hasta: '2026-09-29T13:54:00Z' }] },
    db: { ventas: [{ _v4sessionSegmentId: 's1', fecha: '2026-09-29T13:00:00Z', total: 3000 }] },
    modal: x => { dialog = x; },
    fFH: x => x, $m: x => `$${x}`
  });
  vm.runInContext(`${code}\nthis.ver=verVentasTurnoInterrumpido;`, context);
  context.ver('s1');
  assert.match(dialog.titulo, /Sin arqueo/);
  assert.match(dialog.cuerpo, /Falta el detalle de 1 venta/);
  assert.match(dialog.cuerpo, /\$8000/);
});

test('REV69 encuentra una venta local por su ID remoto aunque falte el segmento local', () => {
  const code = piece('function verVentasTurnoInterrumpido(', '\nfunction verVentasTurno(');
  let dialog;
  const context = vm.createContext({
    f69Estado: { items: [{ segmentId: 's1', ventaV4Ids: ['v1'], cantVentas: 1, total: 3000, desde: '2026-09-29T12:14:00Z', hasta: '2026-09-29T13:54:00Z' }] },
    db: { ventas: [{ _v4id: 'v1', fecha: '2026-09-29T13:00:00Z', total: 3000 }] },
    modal: x => { dialog = x; },
    fFH: x => x, $m: x => `$${x}`
  });
  vm.runInContext(`${code}\nthis.ver=verVentasTurnoInterrumpido;`, context);
  context.ver('s1');
  assert.doesNotMatch(dialog.cuerpo, /Falta el detalle/);
  assert.match(dialog.cuerpo, /Buscar en estas ventas/);
});

test('REV69 migración exige origen único y no crea cierres ficticios', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'REV69-TURNOS-INTERRUMPIDOS.sql'), 'utf8');
  assert.match(sql, /interrumpido_at_device/);
  assert.match(sql, /interrumpido_motivo/);
  assert.match(sql, /origen_segment_id/);
  assert.match(sql, /unique index/i);
  assert.match(sql, /efectivo_arrastrado_turno_interrumpido/);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.cierres_caja/i);
  assert.doesNotMatch(sql, /update\s+public\.cierres_caja/i);
});

test('HTML y service worker alineados en la revisión actual (REV75)', () => {
  const sw = fs.readFileSync(path.join(__dirname, '..', 'beta', 'sw.js'), 'utf8');
  assert.match(html, /packageRevision:75,/);
  assert.match(sw, /micomercio-beta-6\.0\.0-f6-rc2-rev75/);
});
