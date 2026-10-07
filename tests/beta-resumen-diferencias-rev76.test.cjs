// REV76: el Resumen deja de listar los cierres por turno (están en Caja › Historial) y muestra una sola línea
// con las diferencias de caja del período, calculadas igual que en ese historial.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'beta/index.html'), 'utf8').replace(/\r\n/g, '\n');
const tramo = (desde, hasta) => html.slice(html.indexOf(desde), html.indexOf(hasta, html.indexOf(desde)));
const ctx = vm.createContext({$m: v => `$${Number(v).toFixed(2)}`});
vm.runInContext(tramo('function f69ResumenCierre(c){', '\nasync function f69CargarTurnosInterrumpidos('), ctx);
vm.runInContext(tramo('function f76DiferenciasCaja(cierres){', '\nfunction vResumen(m){'), ctx);
const vResumen = tramo('function vResumen(m){', '\nfunction ');
const plano = x => JSON.parse(JSON.stringify(x));

test('REV76: el Resumen ya no lista los cierres por turno', () => {
  assert.doesNotMatch(html, /Cierres por turno/);
  assert.doesNotMatch(html, /f6CierresResumenHtml/);
  assert.match(vResumen, /\$\{esDuenio\(\)\?f76DiferenciasCajaHtml\(cierresPorDia\.flatMap\(g=>g\.cierres\),vistaVisible\(/);
  // El historial de Caja sigue intacto.
  assert.match(html, /function htmlCierresAnteriores\(\)\{/);
  assert.match(html, /<h2>Historial de turnos<\/h2>/);
});

test('REV76: lo que sobró y lo que faltó se suman por separado', () => {
  const cierres = [
    {contadoGeneral: 6500, esperadoGeneral: 6500},
    {contadoGeneral: 28900, esperadoGeneral: 28800},
    {contadoGeneral: 2000, esperadoGeneral: 0},
    {contadoGeneral: 1000, esperadoGeneral: 1100},
    {contadoGeneral: 500, esperadoGeneral: 500, diferenciaCigarros: -300},
  ];
  assert.deepEqual(plano(ctx.f76DiferenciasCaja(cierres)), {turnos: 4, sobro: 2100, falto: 400});
  // Un sobrante no tapa un faltante del mismo monto.
  assert.deepEqual(plano(ctx.f76DiferenciasCaja([{contadoGeneral: 1100, esperadoGeneral: 1000}, {contadoGeneral: 900, esperadoGeneral: 1000}])),
    {turnos: 2, sobro: 100, falto: 100});
});

test('REV76: la diferencia es la misma que muestra el historial de Caja', () => {
  // Con efectivo arrastrado de un turno interrumpido, el historial usa la diferencia ajustada.
  const conArrastre = {contadoGeneral: 5000, esperadoGeneral: 4000, diferenciaGeneral: 1000,
    _v4ajustes: [{tipo: 'efectivo_arrastrado_turno_interrumpido', estado: 'resuelto', origenSegmentId: 's1', monto: 1000}]};
  assert.equal(ctx.f69ResumenCierre(conArrastre).diferenciaAjustada, 0);
  assert.deepEqual(plano(ctx.f76DiferenciasCaja([conArrastre])), {turnos: 0, sobro: 0, falto: 0});
  // Un cierre sin contado y esperado usa la diferencia guardada.
  assert.deepEqual(plano(ctx.f76DiferenciasCaja([{diferenciaGeneral: 250}])), {turnos: 1, sobro: 250, falto: 0});
  assert.deepEqual(plano(ctx.f76DiferenciasCaja([{diferencia_general: -80}])), {turnos: 1, sobro: 0, falto: 80});
  // Centavos de redondeo no cuentan como diferencia.
  assert.deepEqual(plano(ctx.f76DiferenciasCaja([{contadoGeneral: 100.001, esperadoGeneral: 100}])), {turnos: 0, sobro: 0, falto: 0});
});

test('REV76: la línea del Resumen', () => {
  assert.equal(ctx.f76DiferenciasCajaHtml([], true), '');
  assert.equal(ctx.f76DiferenciasCajaHtml([{contadoGeneral: 100, esperadoGeneral: 100}], true), '', 'si todo cuadró, no se muestra nada');
  const sobro = ctx.f76DiferenciasCajaHtml([{contadoGeneral: 4400, esperadoGeneral: 100}, {contadoGeneral: 100, esperadoGeneral: 0}], true);
  assert.match(sobro, /Diferencias de caja en el período:<\/b> Sobró <b class="num">\$4400\.00<\/b> en 2 turnos\./);
  assert.match(sobro, /class="ux-banner resumen-diferencias-caja"/, 'sin faltante no se marca en ámbar');
  assert.match(sobro, /id="resVerCaja">Ver en Caja</);
  const ambos = ctx.f76DiferenciasCajaHtml([{contadoGeneral: 1100, esperadoGeneral: 1000}, {contadoGeneral: 900, esperadoGeneral: 1000}], false);
  assert.match(ambos, /Sobró <b class="num">\$100\.00<\/b> y faltó <b class="num">\$100\.00<\/b> en 2 turnos\./);
  assert.match(ambos, /ux-banner warn/);
  assert.doesNotMatch(ambos, /resVerCaja/, 'sin acceso a Caja no se ofrece el botón');
  assert.match(ctx.f76DiferenciasCajaHtml([{diferenciaGeneral: -50}], true), /Faltó <b class="num">\$50\.00<\/b> en 1 turno\./);
});

test('REV76: «Ver en Caja» abre el historial', () => {
  assert.match(vResumen, /const verCaja=\$\('#resVerCaja'\);if\(verCaja\)verCaja\.onclick=\(\)=>\{globalThis\.__miCajaVista='historial';ir\('caja'\);\};/);
  assert.match(html, /const cajaVista=vistasCaja\.includes\(globalThis\.__miCajaVista\)\?globalThis\.__miCajaVista:'turno';/);
});
