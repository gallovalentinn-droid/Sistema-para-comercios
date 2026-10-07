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
function run(code, context = {}) {
  vm.createContext(context);
  vm.runInContext(code, context);
  return context;
}
function f43(initial, rpc) {
  const ctx = run(`${between('  const F43_CLIENT_VERSION=', '  return {F43_CLIENT_VERSION,createF43Runtime};')}\nthis.create=createF43Runtime;`);
  const saved = [];
  const runtime = ctx.create({
    loadPersistedState: () => initial,
    savePersistedState: async value => saved.push(value),
    isOnline: () => true,
    getCommerceId: () => 'comercio',
    rpc,
    activateAdapter: async () => { saved.push('adapter'); },
    restoreAdapter: async () => { saved.push('rollback'); },
  });
  return { runtime, saved };
}

test('si falla la red F4.3 carga los datos locales y conserva el estado preparado', async () => {
  const { runtime } = f43({ phase: 'prepared', frozen: true }, async () => ({ error: { message: 'TypeError: Failed to fetch' } }));
  let loads = 0;
  const state = await runtime.startup(async () => { loads++; });
  assert.equal(loads, 1);
  assert.equal(state.phase, 'prepared');
  assert.equal(state.frozen, true);
});

test('si falla la red F4.3 en v4_only usa la carga local sin hacer pull', async () => {
  const { runtime, saved } = f43({ phase: 'v4_only' }, async () => ({ error: { message: 'TypeError: Failed to fetch' } }));
  let legacyLoads = 0, localLoads = 0;
  const state = await runtime.startup(async () => { legacyLoads++; }, { v4OnlyBaseLoad: async () => { localLoads++; } });
  assert.equal(state.phase, 'v4_only');
  assert.equal(legacyLoads, 0);
  assert.equal(localLoads, 1);
  assert.ok(saved.includes('adapter'));
});

test('F4.3 no interpreta un rechazo del servidor como falta de red', async () => {
  const { runtime } = f43({}, async () => ({ error: { message: 'permission denied', code: '42501' } }));
  await assert.rejects(runtime.startup(async () => {}), /permission denied/);
});

test('F4.3 usa la base local cuando el servicio responde temporalmente 503', async () => {
  const { runtime } = f43({ phase: 'normal' }, async () => ({ error: { message: 'Service Unavailable', code: '503' } }));
  let loads = 0;
  await runtime.startup(async () => { loads++; });
  assert.equal(loads, 1);
});

test('una cuenta sincronizada no puede restaurar una copia local', () => {
  let dialogs = 0;
  const notices = [];
  const ctx = run(`${between('function restaurar(obj,origen){', 'let periodoResumen=')}\nthis.restaurar=restaurar;`, {
    sb: {}, sesion: { user: { id: 'usuario' } },
    modal: () => { dialogs++; }, aviso: (...args) => notices.push(args), esc: x => x,
  });
  ctx.restaurar({ db: { productos: [{ id: 'p' }] } }, 'prueba');
  assert.equal(dialogs, 0);
  assert.ok(notices.some(([message]) => /sincroniz|servidor/i.test(message)));
});

test('la fecha técnica del respaldo no pide permiso para editar maestros', () => {
  const ctx = run(`${between('function f3MutacionesMaestro(prev,actual){', 'function f3MutacionesMaestroNoAutorizadas(')}\nthis.mutaciones=f3MutacionesMaestro;`, {
    igualesEntidad: (collection, a, b) => JSON.stringify(a) === JSON.stringify(b),
  });
  const before = { config: { nombre: 'Almacén', ultBackup: null } };
  const after = { config: { nombre: 'Almacén', ultBackup: '2026-09-24T10:00:00Z' } };
  assert.deepEqual(Array.from(ctx.mutaciones(before, after)), []);
});

test('una caja nueva sin separación de cigarrillos toma un único fondo', () => {
  const context = run(`${between('function f3AsegurarSesionLocal(){', 'async function f3RegistrarDispositivoRemoto(')}\nthis.abrir=f3AsegurarSesionLocal;`, {
    f3Activo: () => true,
    f3Estado: { session: null, cajaId: 'caja', deviceUuid: 'equipo' },
    f3Uuid: () => 'sesion',
    db: { config: { fondoCaja: 10000, fondoCajaCigarros: 5000, moduloCigarros: false } },
  });
  const sesion = context.abrir();
  assert.equal(sesion.fondoGeneral, 10000);
  assert.equal(sesion.fondoCigarros, 0);
});

test('el respaldo en la nube se dirige al comercio y no al usuario', async () => {
  const calls = [];
  const query = {
    insert: async value => { calls.push(['insert', value]); return { error: null }; },
    select() { return this; }, eq() { return this; }, order() { return this; },
    range: async () => ({ data: [] }),
  };
  const context = run(`${between('function backupCloudScope(){', 'function descargarBackup(){')}\nthis.backup=backupAuto;`, {
    db: { config: {}, productos: [] }, deepCopy: x => JSON.parse(JSON.stringify(x)),
    sb: { from: table => { calls.push(['table', table]); return query; } },
    sesion: { user: { id: 'usuario' } }, enLinea: true,
    f3Estado: { comercioId: 'comercio' }, f3RolServidorAdmin: () => true,
    guardarBackupLocalIdb: async () => true, guardar: () => {},
  });
  assert.equal(await context.backup(), true);
  assert.ok(calls.some(([kind, table]) => kind === 'table' && table === 'backups_comercio_v4'));
  assert.ok(calls.some(([kind, value]) => kind === 'insert' && value.comercio_id === 'comercio'));
});

test('un combo con componente faltante no entra al ticket', () => {
  const ticket = [], notices = [];
  const ctx = run(`${between('function agregarComboAlTicket(combo,cant=1){', 'function mostrarFeedbackProducto(){')}\nthis.agregar=agregarComboAlTicket;`, {
    ticket, prod: () => null, comboStockDisponible: () => 0, aviso: (...args) => notices.push(args),
    pintarPOS: () => {}, mostrarFeedbackProducto: () => {},
  });
  ctx.agregar({ id: 'c1', nombre: 'Combo', precio: 1500, items: [{ prodId: 'borrado', cant: 1 }] });
  assert.equal(ticket.length, 0);
  assert.equal(notices.length, 1);
});

test('el CSV de Resumen redondea kilos e importes', () => {
  const ctx = run(`${between('function csvProductosVendidos(d){', 'function exportarProductos(d){')}\nthis.csv=csvProductosVendidos;`, {
    prod: () => null, csvSeguro: value => JSON.stringify(String(value)),
  });
  const csv = ctx.csv({ productos: [{ nombre: 'Queso', rubro: 'Fiambres', cant: 0.333 + 0.271, importe: 6040.000000000001 }] });
  assert.match(csv, /"0\.604";"6040"/);
  assert.doesNotMatch(csv, /0000000001/);
});

test('un precio vacío se rechaza y un precio cero exige confirmación explícita', () => {
  const start = html.indexOf('function evaluarPrecioProducto(');
  assert.ok(start >= 0, 'falta validar el precio antes de guardar');
  const ctx = run(`${html.slice(start, html.indexOf('function formProducto(', start))}\nthis.evaluar=evaluarPrecioProducto;`, {
    numImportacion: raw => ({ blank: raw === '', ok: /^\d+(?:[,.]\d+)?$/.test(raw), value: Number(raw.replace(',', '.')) }),
  });
  assert.equal(ctx.evaluar('').ok, false);
  assert.equal(ctx.evaluar('0').requiereConfirmacion, true);
  assert.equal(ctx.evaluar('0', true).ok, true);
  assert.equal(ctx.evaluar('1200,50').precio, 1200.5);
});

test('el PIN detiene intentos consecutivos después de cinco errores', async () => {
  const values = new Map(); let checks = 0;
  const context = run(`${between('function f6DevicePinKey(userId,currentDeviceId){', 'async function verificarPin(')}\nthis.probar=f6VerificarPinVigente;this.espera=typeof f6PinEsperaMs==='function'?f6PinEsperaMs:()=>0;`, {
    sesion: { user: { id: 'usuario' } }, deviceId: 'WEB',
    localStorage: { getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) },
    verificarPin: async () => { checks++; return false; },
  });
  const intento = { userId: 'usuario', vigente: () => true };
  for (let i = 0; i < 6; i++) assert.equal(await context.probar('0000', intento), false);
  assert.equal(checks, 5);
  assert.ok(context.espera('usuario') > 0);
});

test('el service worker no guarda una respuesta HTTP fallida', async () => {
  const sw = fs.readFileSync(path.join(__dirname, '../beta/sw.js'), 'utf8');
  const listeners = {}, puts = [];
  const response = { ok: false, status: 404, clone() { return this; } };
  run(sw, {
    self: { addEventListener: (name, handler) => { listeners[name] = handler; } },
    caches: { open: async () => ({ put: async (...args) => puts.push(args) }), match: async () => null },
    fetch: async () => response, URL,
  });
  const event = { request: { method: 'GET', url: 'https://micomercio.ar/beta/index.html' }, respondWith(p) { this.promise = p; } };
  listeners.fetch(event);
  assert.equal(await event.promise, response);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(puts.length, 0);
});
