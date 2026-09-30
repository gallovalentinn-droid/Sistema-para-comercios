const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = () => fs.readFileSync(path.resolve(__dirname, '../beta/index.html'), 'utf8').replace(/\r\n/g, '\n');
const section = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)));

test('una diferencia mayor a 2000 por caja exige un motivo', () => {
  const text = source();
  const logic = section(text, 'function motivoDiferenciaCaja(', '\nfunction htmlCierresAnteriores(');
  assert.ok(logic.startsWith('function motivoDiferenciaCaja('));
  const context = vm.createContext({});
  vm.runInContext(`${logic}\nthis.check=motivoDiferenciaCaja;`, context);
  assert.equal(context.check(2000, 0, ''), '');
  assert.equal(context.check(-2000, 0, ''), '');
  assert.match(context.check(2000.01, 0, ''), /motivo/i);
  assert.match(context.check(0, -2000.01, '  '), /motivo/i);
  assert.equal(context.check(2000.01, 0, 'Revisé el conteo'), '');
});

test('el motivo se pide al revisar y se valida antes de cerrar', () => {
  const caja = section(source(), 'function vCaja(m){', '\n/* ═══════════════════════════════════════════════════════\n   MOVIMIENTOS EN CUENTAS');
  const revisar = section(caja, 'data-caja-paso="revisar"', 'data-caja-paso="finalizar"');
  assert.match(revisar, /id="motivoDiferenciaCaja"/);
  assert.match(caja, /motivoDiferenciaCaja\(dG,dC,/);
  assert.match(caja, /nota:explicacionCaja\.value\.trim\(\)/);
});

test('el cierre no muestra sugerencias de fondos y las correcciones quedan separadas de la lista de movimientos', () => {
  const caja = section(source(), 'function vCaja(m){', '\n/* ═══════════════════════════════════════════════════════\n   MOVIMIENTOS EN CUENTAS');
  assert.doesNotMatch(caja, /Configurar sugerencias de fondos de apertura/);
  assert.doesNotMatch(caja, /id="okFondo"/);
  assert.equal((caja.match(/<summary>Más datos y correcciones<\/summary>/g) || []).length, 1);
  assert.match(caja, /movimientos\.slice\(0,5\)\.map\(htmlMovimiento\)/);
  assert.match(caja, /movimientos\.slice\(5\)\.map\(htmlMovimiento\)/);
  assert.doesNotMatch(caja, /movimientos\.map\(htmlMovimiento\)/);
  assert.doesNotMatch(caja, /Cobros por forma de pago/);
  assert.doesNotMatch(caja, /<summary>Ver más datos del turno|<summary>Ver cobros por forma de pago|<summary>Ver ventas y egresos del turno/);
  assert.match(caja, /id="contadoG"[^>]*inputmode="decimal"[^>]*>/);
  assert.doesNotMatch(caja, /id="contadoG"[^>]*placeholder="0,00"/);
});

test('los fondos sugeridos se configuran fuera del cierre y rechazan importes inválidos', () => {
  const config = section(source(), 'function vConfig(m){', '\n/* F6_');
  assert.match(config, /id="cfgFondoGeneral"/);
  assert.match(config, /id="cfgFondoCigarros"/);
  assert.match(config, /Monto sugerido para abrir una caja sin cierre previo/);
  assert.match(config, /id="guardarFondosSugeridos"/);
  assert.match(config, /numImportacion\(.*cfgFondoGeneral/);
  assert.match(config, /if\(!lecturaGeneral\.ok/);
});

test('la caja muestra la cuenta del efectivo sin ocultar un cálculo negativo', () => {
  const caja = section(source(), 'function vCaja(m){', '\n/* ═══════════════════════════════════════════════════════\n   MOVIMIENTOS EN CUENTAS');
  assert.match(caja, /tarjetaCaja\(moduloCigarros\?'Caja general':'Caja única',resumen\.general,espGeneral/);
  assert.match(caja, /class="cash-box-amount \$\{esperado<0\?'negative'/);
  assert.doesNotMatch(caja, /Math\.max\(0,espGeneral\)/);
});

test('el historial informa faltas y sobrantes por caja sin compensarlos', () => {
  const text = source();
  const logic = section(text, 'function estadoDiferenciaCaja(', '\nfunction htmlCierresAnteriores(');
  assert.ok(logic.startsWith('function estadoDiferenciaCaja('));
  const context = vm.createContext({});
  vm.runInContext(`${logic}\nthis.estado=estadoDiferenciaCaja;`, context);
  assert.equal(context.estado(0).texto, 'Cuadró');
  assert.equal(context.estado(-1500).texto, 'Faltó $1.500,00');
  assert.equal(context.estado(2001).clase, 'bad');
  const historial = section(text, 'function htmlCierresAnteriores(', '\nfunction enlazarCierresAnteriores(');
  assert.match(historial, /estadoDiferenciaCaja\(resumen\.diferenciaAjustada\)/);
  assert.match(historial, /estadoDiferenciaCaja\(c\.diferenciaCigarros\)/);
  assert.doesNotMatch(historial, /Diferencia neta/);
  assert.match(historial, /Vendido:/);
});
