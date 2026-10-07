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

test('una caja física suma todo el efectivo y conserva cigarrillos como dato de ventas', () => {
  const context = vm.createContext({
    db: { config: { moduloCigarros: false } },
    esCigarrillo: rubro => rubro === 'Cigarrillos',
    netoItemVenta: item => item.neto,
    formaKey: forma => forma,
  });
  vm.runInContext(`${section('function efectivoCigarrillosVenta(', 'function montoEfectivoVenta(')}\nthis.totalizar=calcularTotalesTurno;`, context);
  const venta = { total: 300, forma: 'efectivo', items: [
    { tipo: 'producto', rubro: 'Cigarrillos', neto: 100, costo: 50, cant: 1 },
    { tipo: 'producto', rubro: 'Golosinas', neto: 200, costo: 100, cant: 1 },
  ] };
  const salida = { forma: 'efectivo', caja: 'general', monto: 50 };
  const unico = context.totalizar({ desde: '', ventasTodas: [venta], pagos: [], egresos: [salida], moduloCigarros: false });
  assert.equal(unico.genEfectivo, 300);
  assert.equal(unico.cigTotal, 100);
  assert.equal(unico.cigEfectivo, 100);
  assert.equal(unico.egrGeneral, 50);
  const separado = context.totalizar({ desde: '', ventasTodas: [venta], pagos: [], egresos: [salida], moduloCigarros: true });
  assert.equal(separado.genEfectivo, 200);
  assert.equal(separado.cigEfectivo, 100);
});

test('el apartado es una parte del retiro posterior al conteo', () => {
  const context = vm.createContext({ numImportacion: text => ({ ok: /^\d+(?:[.,]\d{1,2})?$/.test(String(text)), blank: !String(text).trim(), value: Number(String(text).replace(',', '.')) }), $m: value => `$${Number(value).toFixed(2)}` });
  vm.runInContext(`${section('function f56ValidarApartadoCigarrillos(', 'function f52UltimoCierreLocal(')}\nthis.validar=f56ValidarApartadoCigarrillos;`, context);
  assert.equal(context.validar('127600', { ok: true, retiroGeneral: 200000 }).value, 127600);
  assert.equal(context.validar('', { ok: true, retiroGeneral: 200000 }).value, 0);
  assert.equal(context.validar('200001', { ok: true, retiroGeneral: 200000 }).ok, false);
  assert.equal(context.validar('-1', { ok: true, retiroGeneral: 200000 }).ok, false);
  assert.equal(context.validar('1,25', { ok: true, retiroGeneral: 200000 }).value, 1.25);
});

test('caja única corrige un turno ya abierto; activar dos cajas espera al próximo turno', () => {
  const context = vm.createContext({});
  vm.runInContext(`${section('function f56CajaSeparadaEnSesion(', 'function f52UltimoCierreLocal(')}\nthis.modo=f56CajaSeparadaEnSesion;`, context);
  assert.equal(context.modo({ cajaSeparadaCigarros: true }, { moduloCigarros: false }), false);
  assert.equal(context.modo({ cajaSeparadaCigarros: false }, { moduloCigarros: true }), false);
  assert.equal(context.modo({}, { moduloCigarros: false }), false);
  assert.equal(context.modo({}, { moduloCigarros: true }), true);
});

test('un conteo físico de 682000 no agrega otro conteo por el rubro cigarrillos', () => {
  const context = vm.createContext({});
  vm.runInContext(`${section('function f56EsperadoCajaUnica(', 'function f52UltimoCierreLocal(')}\nthis.esperado=f56EsperadoCajaUnica;`, context);
  const resultado = context.esperado({ fondoGeneral: 0, fondoCigarros: 0, efectivoVentas: 781270, cobrosFiado: 0, egresosGeneral: 131200, egresosCigarros: 0, contado: 682000, cigarrillosInformativo: 127600 });
  assert.equal(resultado.esperado, 650070);
  assert.equal(resultado.diferencia, 31930);
});

test('el cierre sincroniza y recupera el modelo de caja y el apartado', () => {
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
    apartadoCigarrillos: 127600, contadoGeneral: 682000, retiroGeneral: 200000, quedaGeneral: 482000,
    contadoCigarros: 0, retiroCigarros: 0, quedaCigarros: 0, traspasoConfirmado: true,
    ventaIds: [], pagoIds: [], egresoIds: [] });
  assert.equal(enviado.modelo_caja, 'unica');
  assert.equal(enviado.apartado_cigarrillos, 127600);
  assert.equal(enviado.retiro_general, 200000);
  const recuperado = context.mapear({ id: 'remoto' }, { traspasos: [{ id: 'remoto', modelo_caja: 'unica', apartado_cigarrillos: 127600 }] }, context.db);
  assert.equal(recuperado.cajaUnica, true);
  assert.equal(recuperado.apartadoCigarrillos, 127600);
});
