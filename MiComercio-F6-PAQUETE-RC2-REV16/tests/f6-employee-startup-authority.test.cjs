const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.resolve(__dirname, '../entregables/MiComercio-F6-PRUEBA.html');

function loadPreparation(overrides = {}) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const start = html.indexOf('async function f42PrepararF3ParaPull(){');
  const end = html.indexOf('\nfunction f42Adapter()', start);
  assert.notEqual(start, -1, 'falta la preparación F4.2 del pull');
  assert.ok(end > start, 'la preparación F4.2 del pull está incompleta');

  const calls = [];
  const context = {
    f3Estado: {
      comercioId: '33333333-3333-4333-8333-333333333333',
      cajaId: '22222222-2222-4222-8222-222222222222',
      deviceUuid: '11111111-1111-4111-8111-111111111111',
      modo: 'off',
    },
    F3_SHADOW_KEY: 'f3-shadow',
    localStorage: { setItem: (key, value) => calls.push(['storage', key, value]) },
    f3DescubrirContextoV4: async () => calls.push(['discover']),
    f3RegistrarDispositivoRemoto: async () => calls.push(['register-device']),
    f5ChequearAutoridad: async (options) => {
      calls.push(['check-authority', options]);
      return { writable: true, causas: [] };
    },
    f5MembresiaActual: () => ({ rol: 'empleado' }),
    f3LimpiarError: () => calls.push(['clear-error']),
    f3GuardarEstadoLocal: async () => calls.push(['persist']),
    f3ProgramarProcesador: () => calls.push(['schedule']),
    f3Activo: () => context.f3Estado.modo === 'shadow',
    ...overrides,
  };
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.prepare = f42PrepararF3ParaPull;`, context, {
    filename: htmlPath,
  });
  return { prepare: context.prepare, calls, context };
}

test('el primer ingreso registra el dispositivo antes de validar y emitir el lease', async () => {
  const { prepare, calls } = loadPreparation();
  await prepare();

  const registerIndex = calls.findIndex(([name]) => name === 'register-device');
  const checkIndex = calls.findIndex(([name]) => name === 'check-authority');
  assert.ok(registerIndex >= 0, 'no se registró el dispositivo');
  assert.ok(checkIndex > registerIndex, 'la autoridad se consultó antes de registrar el dispositivo');
  assert.deepEqual(JSON.parse(JSON.stringify(calls[checkIndex][1])), {
    silent: true,
    emitir: true,
  });
});

test('un arranque sin autoridad escribible no entra a shadow ni inicia el pull', async () => {
  const { prepare, calls, context } = loadPreparation({
    f5ChequearAutoridad: async (options) => {
      calls.push(['check-authority', options]);
      return { writable: false, causas: ['F5_DEVICE_REVOKED'] };
    },
  });

  await assert.rejects(prepare(), /F42_F5_AUTORIDAD_NO_ESCRIBIBLE:F5_DEVICE_REVOKED/);
  assert.equal(context.f3Estado.modo, 'off');
  assert.equal(calls.some(([name]) => name === 'persist'), false);
});
