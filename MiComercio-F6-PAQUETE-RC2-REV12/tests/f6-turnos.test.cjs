const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const artifactPath = path.resolve(__dirname, '../entregables/MiComercio-F6-PRUEBA.html');

function loadCore() {
  const html = fs.readFileSync(artifactPath, 'utf8');
  const startMarker = '/* F6_TURNOS_CORE_START */';
  const endMarker = '/* F6_TURNOS_CORE_END */';
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);
  assert.notEqual(start, -1, 'falta el core F6 de turnos');
  assert.ok(end > start, 'el core F6 de turnos está incompleto');
  const context = { module: { exports: {} }, Intl, Date };
  vm.runInNewContext(
    `${html.slice(start + startMarker.length, end)}\nmodule.exports={f6ClaveTurno,f6AgruparCierresPorDia,f6ConsolidadoDia,f6EvaluarCierreTurno,f6FiltrarTurno};`,
    context,
    { filename: artifactPath },
  );
  return context.module.exports;
}

const manana = {
  id: 'cierre-1', _v4cajaSesionId: 'raiz-1', _v4sessionSegmentId: 'segmento-1',
  hasta: '2026-09-05T13:00:00Z', total: 1200, cantVentas: 3,
  porForma: { efectivo: 700, transferencia: 500 },
  esperadoGeneral: 900, contadoGeneral: 880, diferenciaGeneral: -20,
};
const tarde = {
  id: 'cierre-2', _v4cajaSesionId: 'raiz-2', _v4sessionSegmentId: 'segmento-2',
  hasta: '2026-09-05T22:00:00Z', total: 800, cantVentas: 2,
  porForma: { efectivo: 300, transferencia: 500 },
  esperadoGeneral: 400, contadoGeneral: 410, diferenciaGeneral: 10,
};

test('dos turnos del mismo día permanecen separados dentro del grupo diario', () => {
  const { f6AgruparCierresPorDia, f6ClaveTurno } = loadCore();
  const groups = f6AgruparCierresPorDia([tarde, manana], 'America/Argentina/Buenos_Aires', '04:00');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].cierres.length, 2);
  assert.deepEqual(Array.from(groups[0].cierres, f6ClaveTurno), ['segmento-1', 'segmento-2']);
});

test('el consolidado diario suma ventas pero no mezcla fondos ni diferencias', () => {
  const { f6ConsolidadoDia } = loadCore();
  const result = f6ConsolidadoDia([manana, tarde]);
  assert.equal(result.turnos, 2);
  assert.equal(result.totalVendido, 2000);
  assert.equal(result.cantidadVentas, 5);
  assert.equal(result.porForma.efectivo, 1000);
  assert.equal('fondoInicial' in result, false);
  assert.equal('esperadoGeneral' in result, false);
  assert.equal('contadoGeneral' in result, false);
  assert.equal('diferencia' in result, false);
  assert.equal('diferenciaGeneral' in result, false);
});

test('cerrar un turno limpia sólo la sesión y conserva autoridad para abrir el siguiente', () => {
  const { f6EvaluarCierreTurno } = loadCore();
  const lease = { lease_id: 'lease-1', writable: true, valid_until: '2026-09-12T10:00:00Z' };
  const session = { id: 'segmento-1', rootSessionId: 'raiz-1', sessionSegmentId: 'segmento-1', estado: 'abierta' };
  const result = f6EvaluarCierreTurno(session, [], lease);
  assert.equal(result.ok, true);
  assert.equal(result.activeSessionAfterClose, null);
  assert.deepEqual(JSON.parse(JSON.stringify(result.authority)), lease);
  assert.equal(result.canOpenNext, true);
  assert.equal(f6EvaluarCierreTurno(session, [manana], lease).code, 'F6_TURNO_YA_CERRADO');
});

test('un segmento provisional nunca entra al arqueo de otra sesión', () => {
  const { f6FiltrarTurno } = loadCore();
  const rows = [
    { id: 'a', _v4cajaSesionId: 'raiz', _v4sessionSegmentId: 'segmento-a' },
    { id: 'b', _v4cajaSesionId: 'raiz', _v4sessionSegmentId: 'segmento-b' },
    { id: 'legacy' },
  ];
  assert.deepEqual(Array.from(f6FiltrarTurno(rows, 'segmento-a'), (row) => row.id), ['a']);
  assert.deepEqual(Array.from(f6FiltrarTurno(rows, 'segmento-b'), (row) => row.id), ['b']);
});
