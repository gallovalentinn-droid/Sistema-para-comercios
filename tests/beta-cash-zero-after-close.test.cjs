const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../beta/index.html'), 'utf8').replace(/\r\n/g, '\n');

function between(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `falta el bloque ${start}`);
  return html.slice(a, b);
}

test('cerrar un turno deja en cero los fondos del siguiente y conserva el cierre', () => {
  const cierre = { id: 'cierre-1', total: 170300, contadoGeneral: 38000, contadoCigarros: 95000 };
  const context = {
    f3Activo: () => true,
    f3Uuid: () => 'turno-2',
    f3Estado: {
      session: { id: 'turno-1', rootSessionId: 'turno-1', sessionSegmentId: 'turno-1', estado: 'abierta', fondoGeneral: 5000, fondoCigarros: 0 },
      cajaId: 'caja', deviceUuid: 'dispositivo',
    },
    db: { config: { fondoCaja: 5000, fondoCajaCigarros: 95000, moduloCigarros: true }, cierres: [cierre] },
  };
  vm.createContext(context);
  vm.runInContext([
    between('function f5SesionIds(session){', 'function f5CamposSesionLocal(session){'),
    between('function f5SessionKey(row){', 'function f5FiltrarPorSesion(rows,sessionId){'),
    between('function f3AsegurarSesionLocal(){', 'async function f3RegistrarDispositivoRemoto('),
    between('function f3MarcarSesionLocalCierrePendiente(cierre,op,fondoSiguiente=null){', 'function f3OperacionBloqueada(tipo,detalle){'),
    'this.abrir=f3AsegurarSesionLocal;this.marcar=f3MarcarSesionLocalCierrePendiente;',
  ].join('\n'), context);

  assert.equal(context.marcar({ _v4sessionSegmentId: 'turno-1', hasta: '2026-09-24T18:26:44Z' }, { operationId: 'op-1' }), true);
  assert.equal(context.f3Estado.session.estado, 'cierre_pendiente');
  context.f3Estado.session = null; // el flujo de cierre libera la sesión después de guardarla
  const persisted = JSON.parse(JSON.stringify(context.f3Estado));
  context.f3Estado = persisted; // simula recargar antes de abrir el turno siguiente
  const nuevo = context.abrir();

  assert.equal(nuevo.fondoGeneral, 0);
  assert.equal(nuevo.fondoCigarros, 0);
  assert.equal(nuevo.id, 'turno-2');
  assert.equal(context.f3Estado.fondoCeroProximoTurno, false);
  assert.equal(context.db.cierres[0].contadoGeneral, 38000);
  assert.equal(context.db.cierres[0].contadoCigarros, 95000);
});

test('cerrar una caja no borra el fondo de apertura de otra caja', () => {
  const context = {
    f3Activo: () => true, f3Uuid: () => 'turno',
    f3Estado: { session: null, cajaId: 'caja-2', deviceUuid: 'dispositivo', fondoCeroProximoTurno: true, fondoCeroProximoTurnoCajaId: 'caja-1' },
    db: { config: { fondoCaja: 5000, fondoCajaCigarros: 1000, moduloCigarros: true } },
  };
  vm.createContext(context);
  vm.runInContext(`${between('function f3AsegurarSesionLocal(){', 'async function f3RegistrarDispositivoRemoto(')}\nthis.abrir=f3AsegurarSesionLocal;`, context);
  const otraCaja = context.abrir();
  assert.equal(otraCaja.fondoGeneral, 5000);
  assert.equal(otraCaja.fondoCigarros, 1000);
  assert.equal(context.f3Estado.fondoCeroProximoTurno, true);
  context.f3Estado.session = null;
  context.f3Estado.cajaId = 'caja-1';
  const cajaCerrada = context.abrir();
  assert.equal(cajaCerrada.fondoGeneral, 0);
  assert.equal(cajaCerrada.fondoCigarros, 0);
  assert.equal(context.f3Estado.fondoCeroProximoTurno, false);
});

test('la apertura confirma cero sólo si el último cierre dejó cero explícitamente', () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${between('function f52ResumenTraspaso(', 'async function f52ConsultarTraspasoCaja(')}\nthis.resumen=f52ResumenTraspaso;`, context);
  const nuevo=context.resumen({id:'nuevo',traspasoConfirmado:true,quedaGeneral:0,quedaCigarros:0});
  assert.equal(nuevo.tipo,'confirmado');
  assert.equal(nuevo.quedaGeneral,0);
  assert.equal(nuevo.quedaCigarros,0);
  const anterior=context.resumen({id:'viejo',contadoGeneral:38000});
  assert.equal(anterior.tipo,'anterior');
  assert.equal(anterior.quedaGeneral,null);
  assert.match(html,/¿Está esa plata en la caja\?/);
});

test('un turno abierto automáticamente antes de REV40 pierde el fondo heredado del cierre', () => {
  const cierre = { hasta: '2026-09-24T18:26:44Z', _v4receivedAt: '2026-09-24T18:26:45Z', _v4deviceId: 'dispositivo', _v4cajaId: 'caja', _v4sessionSegmentId: 'turno-1', _v4fondoGeneral: 5000, _v4fondoCigarros: 0, contadoGeneral: 38000 };
  const context = {
    f3Estado: { cajaId: 'caja', session: {
      id: 'turno-2', sessionSegmentId: 'turno-2', estado: 'abierta', cajaId: 'caja', deviceId: 'dispositivo',
      openedAtDevice: '2026-09-24T18:26:54Z', fondoGeneral: 5000, fondoCigarros: 0, rev31AperturaExplicita: true,
    } },
    db: { config: { fondoCaja: 8250, fondoCajaCigarros: 0 }, cierres: [cierre] },
  };
  vm.createContext(context);
  vm.runInContext(`${between('function f3NormalizarFondoPoscierreAntiguo(){', 'async function f3RegistrarDispositivoRemoto(')}\nthis.normalizar=f3NormalizarFondoPoscierreAntiguo;`, context);
  assert.equal(context.normalizar(), true);
  assert.equal(context.f3Estado.session.fondoGeneral, 0);
  assert.equal(context.f3Estado.session.fondoCigarros, 0);
  assert.equal(context.db.cierres[0].contadoGeneral, 38000);
});

test('la actualización respeta un fondo manual y un turno sin cierre anterior', () => {
  const context = {
    f3Estado: { cajaId: 'caja', session: {
      id: 'turno-2', sessionSegmentId: 'turno-2', estado: 'abierta', cajaId: 'caja', deviceId: 'dispositivo',
      openedAtDevice: '2026-09-24T18:26:54Z', fondoGeneral: 12000, fondoCigarros: 500, rev31AperturaExplicita: true,
    } },
    db: { config: { fondoCaja: 8250, fondoCajaCigarros: 0 }, cierres: [{ hasta: '2026-09-24T18:26:44Z', _v4deviceId: 'dispositivo', _v4cajaId: 'caja', _v4sessionSegmentId: 'turno-1', _v4fondoGeneral: 5000, _v4fondoCigarros: 0 }] },
  };
  vm.createContext(context);
  vm.runInContext(`${between('function f3NormalizarFondoPoscierreAntiguo(){', 'async function f3RegistrarDispositivoRemoto(')}\nthis.normalizar=f3NormalizarFondoPoscierreAntiguo;`, context);
  assert.equal(context.normalizar(), false);
  assert.equal(context.f3Estado.session.fondoGeneral, 12000);
  assert.equal(context.f3Estado.session.fondoCigarros, 500);
  context.db.cierres = [];
  assert.equal(context.normalizar(), false);
});

test('un fondo manual igual al anterior se conserva después de REV40', () => {
  const context = {
    f3Estado: { cajaId: 'caja', session: {
      id: 'turno-nuevo', sessionSegmentId: 'turno-nuevo', estado: 'abierta', cajaId: 'caja', deviceId: 'dispositivo',
      openedAtDevice: '2026-09-25T12:00:10Z', fondoGeneral: 5000, fondoCigarros: 0, rev31AperturaExplicita: true,
    } },
    db: { cierres: [{ hasta: '2026-09-25T12:00:00Z', _v4deviceId: 'dispositivo', _v4cajaId: 'caja', _v4sessionSegmentId: 'turno-anterior', _v4fondoGeneral: 5000, _v4fondoCigarros: 0 }] },
  };
  vm.createContext(context);
  vm.runInContext(`${between('function f3NormalizarFondoPoscierreAntiguo(){', 'async function f3RegistrarDispositivoRemoto(')}\nthis.normalizar=f3NormalizarFondoPoscierreAntiguo;`, context);
  assert.equal(context.normalizar(), false);
  assert.equal(context.f3Estado.session.fondoGeneral, 5000);
});

test('un reloj atrasado no permite normalizar un fondo reciente confirmado por el servidor', () => {
  const context = {
    f3Estado: { cajaId: 'caja', session: {
      id: 'turno-nuevo', sessionSegmentId: 'turno-nuevo', estado: 'abierta', cajaId: 'caja', deviceId: 'dispositivo',
      openedAtDevice: '2026-09-24T18:26:54Z', fondoGeneral: 5000, fondoCigarros: 0, rev31AperturaExplicita: true,
    } },
    db: { cierres: [{ hasta: '2026-09-24T18:26:44Z', _v4receivedAt: '2026-09-25T12:00:00Z', _v4deviceId: 'dispositivo', _v4cajaId: 'caja', _v4sessionSegmentId: 'turno-anterior', _v4fondoGeneral: 5000, _v4fondoCigarros: 0 }] },
  };
  vm.createContext(context);
  vm.runInContext(`${between('function f3NormalizarFondoPoscierreAntiguo(){', 'async function f3RegistrarDispositivoRemoto(')}\nthis.normalizar=f3NormalizarFondoPoscierreAntiguo;`, context);
  assert.equal(context.normalizar(), false);
  assert.equal(context.f3Estado.session.fondoGeneral, 5000);
  delete context.db.cierres[0]._v4receivedAt;
  assert.equal(context.normalizar(), false);
  assert.equal(context.f3Estado.session.fondoGeneral, 5000);
});

test('el cierre puede reservar un fondo explícito para la siguiente caja sin turnos', () => {
  const context = {
    f3Activo: () => true, f3Uuid: () => 'turno-2',
    f3Estado: { cajaId: 'caja', deviceUuid: 'dispositivo', session: { id: 'turno-1', rootSessionId: 'turno-1', sessionSegmentId: 'turno-1', estado: 'abierta', cajaId: 'caja' } },
    db: { config: { fondoCaja: 9000, fondoCajaCigarros: 2000, moduloCigarros: true } },
  };
  vm.createContext(context);
  vm.runInContext([
    between('function f5SesionIds(session){', 'function f5CamposSesionLocal(session){'),
    between('function f5SessionKey(row){', 'function f5FiltrarPorSesion(rows,sessionId){'),
    between('function f3AsegurarSesionLocal(){', 'async function f3RegistrarDispositivoRemoto('),
    between('function f3MarcarSesionLocalCierrePendiente(cierre,op,fondoSiguiente=null){', 'function f3OperacionBloqueada(tipo,detalle){'),
    'this.abrir=f3AsegurarSesionLocal;this.marcar=f3MarcarSesionLocalCierrePendiente;',
  ].join('\n'), context);
  assert.equal(context.marcar({ _v4sessionSegmentId: 'turno-1', hasta: '2026-09-25T12:00:00Z' }, { operationId: 'op-1' }, { general: 5000, cigarros: 1000 }), true);
  context.f3Estado.session = null;
  const nuevo = context.abrir();
  assert.equal(nuevo.fondoGeneral, 5000);
  assert.equal(nuevo.fondoCigarros, 1000);
  assert.equal(context.f3Estado.fondoProximoTurnoGeneral, null);
  assert.equal(context.f3Estado.fondoProximoTurnoCigarros, null);
});
