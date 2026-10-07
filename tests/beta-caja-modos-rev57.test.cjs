const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../beta/index.html'), 'utf8').replace(/\r\n/g, '\n');
function section(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `falta ${start}`);
  return html.slice(a, b);
}

test('la configuración distingue una caja, una caja con separación y dos cajas físicas', () => {
  const context = vm.createContext({});
  vm.runInContext(`${section('function f57ModoCaja(', 'function f52UltimoCierreLocal(')}\nthis.modo=f57ModoCaja;`, context);
  assert.equal(context.modo({ moduloCigarros: false, separaCigarrillosAlCierre: false }), 'unica');
  assert.equal(context.modo({ moduloCigarros: false, separaCigarrillosAlCierre: true }), 'unica_separa_cigarrillos');
  assert.equal(context.modo({ moduloCigarros: true, separaCigarrillosAlCierre: false }), 'dos_cajas');
  assert.equal(context.modo({ moduloCigarros: true, separaCigarrillosAlCierre: true }), 'dos_cajas');
});

test('la elección de caja muestra tres opciones con la actual marcada', () => {
  const context = vm.createContext({});
  vm.runInContext(`${section('function f57ModoCaja(', 'function f52UltimoCierreLocal(')}\nthis.opciones=f57OpcionesModoCajaHTML;`, context);
  const markup = context.opciones({ moduloCigarros: false, separaCigarrillosAlCierre: true });
  assert.match(markup, /Una caja · separo cigarrillos al cerrar/);
  assert.match(markup, /Una sola caja/);
  assert.match(markup, /Dos cajas físicas/);
  assert.equal((markup.match(/checked/g) || []).length, 1);
  assert.match(markup, /value="unica_separa_cigarrillos"[^>]*checked/);
});

test('el modo de separación exige indicar un importe real, incluso cero, sin duplicar el retiro', () => {
  const context = vm.createContext({ numImportacion: text => ({ ok: /^\d+(?:[.,]\d{1,2})?$/.test(String(text)), blank: !String(text).trim(), value: Number(String(text).replace(',', '.')) }), $m: value => `$${Number(value).toFixed(2)}` });
  vm.runInContext(`${section('function f56ValidarApartadoCigarrillos(', 'function f52UltimoCierreLocal(')}\nthis.validar=f56ValidarApartadoCigarrillos;this.desglosar=f57DesgloseRetiroCigarrillos;`, context);
  const destino = { ok: true, retiroGeneral: 582000, quedaGeneral: 100000 };
  assert.equal(context.validar('', destino, true).ok, false);
  assert.equal(context.validar('0', destino, true).value, 0);
  assert.equal(context.validar('127600', destino, true).value, 127600);
  assert.equal(context.validar('582001', destino, true).ok, false);
  assert.match(context.validar('6000', {ok:true,retiroGeneral:2000,quedaGeneral:14000}, true).error,
    /Retirás \$2000\.00 y apartás \$6000\.00\. Bajá lo que queda o el apartado/);
  const partes = context.desglosar(destino, 127600);
  assert.equal(partes.otrosRetiros, 454400);
  assert.equal(partes.apartadoCigarrillos + partes.otrosRetiros + partes.quedaGeneral, 682000);
});

test('la preferencia viaja y vuelve por la configuración compartida', () => {
  const context = vm.createContext({});
  vm.runInContext(`${section('const F5_CONFIG_MAPA=', '/* F5_CONFIG_CONTRACT_END */')}\n${section('function f32MapConfig(', '// Fila recortada por el manifiesto')}\n${section('function f32MapConfigParcial(', 'function f32FirmaConfigLocal(')}\nthis.subir=f3PayloadConfig;this.bajar=f32MapConfig;this.parcial=f32MapConfigParcial;`, context);
  const payload = context.subir({ moduloCigarros: false, separaCigarrillosAlCierre: true });
  assert.equal(payload.modulo_cigarros, false);
  assert.equal(payload.separa_cigarrillos_al_cierre, true);
  assert.equal(context.bajar({ modulo_cigarros: false, separa_cigarrillos_al_cierre: true }).separaCigarrillosAlCierre, true);
  assert.equal(context.parcial({ separa_cigarrillos_al_cierre: true }).separaCigarrillosAlCierre, true);
});

test('un cierre de caja única con separación conserva su modelo al sincronizar', () => {
  let enviado;
  const session = { estado: 'abierta', rootSessionId: 'raiz', sessionSegmentId: 'segmento', deviceId: 'dispositivo' };
  const context = vm.createContext({
    db: { ventas: [], pagos: [], egresos: [] },
    f3Estado: { deviceUuid: 'dispositivo' },
    f3Activo: () => true,
    f5SesionDesdeObjeto: () => session,
    f3AsegurarV4Id: () => {},
    f3NuevaOperacion: (_tipo, payload) => { enviado = payload; return { operationId: 'op' }; },
    f32LocalParaRemoto: () => ({ actual: null, id: 'cierre' }),
    f32ResolverIdLocal: (_coleccion, id) => id,
    f32bEstado: () => ({ reversionesEgreso: {} }),
  });
  vm.runInContext(`${section('function f3OperacionCierre(', 'function f3MarcarSesionLocalCierrePendiente(')}\n${section('function f32bMapCierre(', 'function f32bAjusteCierreView(')}\nthis.enviar=f3OperacionCierre;this.mapear=f32bMapCierre;`, context);
  context.enviar({ id: 'local', _v4id: 'remoto', hasta: '2026-09-27T09:21:00Z', cajaUnica: true,
    separaCigarrosAlCierre: true, apartadoCigarrillos: 127600, contadoGeneral: 682000,
    retiroGeneral: 582000, quedaGeneral: 100000, contadoCigarros: 0,
    retiroCigarros: 0, quedaCigarros: 0, traspasoConfirmado: true,
    ventaIds: [], pagoIds: [], egresoIds: [] });
  assert.equal(enviado.modelo_caja, 'unica_separa_cigarrillos');
  const recuperado = context.mapear({ id: 'remoto' }, { traspasos: [{ id: 'remoto', modelo_caja: 'unica_separa_cigarrillos', apartado_cigarrillos: 127600 }] }, context.db);
  assert.equal(recuperado.cajaUnica, true);
  assert.equal(recuperado.separaCigarrosAlCierre, true);
  assert.equal(recuperado.apartadoCigarrillos, 127600);
});
