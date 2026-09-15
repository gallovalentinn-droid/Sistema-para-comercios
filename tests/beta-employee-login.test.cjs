const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const artifactPath = path.resolve(__dirname, '../beta/index.html');

function loadCore() {
  const html = fs.readFileSync(artifactPath, 'utf8');
  const startMarker = '/* F5_EMPLOYEE_LOGIN_CORE_START */';
  const endMarker = '/* F5_EMPLOYEE_LOGIN_CORE_END */';
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);
  assert.notEqual(start, -1, 'falta el núcleo cliente del acceso de empleados');
  assert.ok(end > start, 'el núcleo cliente del acceso de empleados está incompleto');
  const code = html.slice(start + startMarker.length, end);
  const context = { module: { exports: {} } };
  vm.runInNewContext(
    `${code}\nmodule.exports={f5CredencialesEmpleado,f5CrearSolicitudLoginEmpleado,f5CrearLoginEmpleadoClient,f5EjecutarIngreso,f5VistaLogin};`,
    context,
    { filename: artifactPath },
  );
  return context.module.exports;
}

test('normaliza código y usuario antes de autenticar al empleado', () => {
  const { f5CredencialesEmpleado } = loadCore();
  assert.deepEqual(JSON.parse(JSON.stringify(f5CredencialesEmpleado({
    comercio: ' AB-12 CD-3456 ',
    usuario: ' CAJA_1 ',
    clave: 'peludito12',
  }))), {
    comercio: 'ab12cd3456',
    usuario: 'caja_1',
    clave: 'peludito12',
  });
  assert.throws(
    () => f5CredencialesEmpleado({ comercio: 'corto', usuario: 'caja', clave: 'peludito12' }),
    /F5_LOGIN_COMERCIO_INVALIDO/,
  );
});

test('envía las credenciales al endpoint público sin simular un correo técnico', async () => {
  const { f5CrearSolicitudLoginEmpleado } = loadCore();
  let observed = null;
  const request = f5CrearSolicitudLoginEmpleado({
    url: 'https://example.supabase.co/functions/v1/f5-login',
    anonKey: 'public-key',
    fetchFn: async (url, options) => {
      observed = { url, options };
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'access', refresh_token: 'refresh', membresia: { rol: 'empleado' } }),
      };
    },
  });
  await request({ comercio: 'ab12cd3456', usuario: 'caja_1', clave: 'peludito12' });
  assert.equal(observed.url, 'https://example.supabase.co/functions/v1/f5-login');
  assert.equal(observed.options.method, 'POST');
  assert.equal(observed.options.headers.apikey, 'public-key');
  assert.equal('authorization' in observed.options.headers, false);
  assert.deepEqual(JSON.parse(observed.options.body), {
    comercio: 'ab12cd3456', usuario: 'caja_1', clave: 'peludito12',
  });
});

test('instala en Supabase la sesión pública devuelta por f5-login', async () => {
  const { f5CrearLoginEmpleadoClient } = loadCore();
  let tokens = null;
  const expectedSession = { access_token: 'access', refresh_token: 'refresh', user: { id: 'empleado-1' } };
  const login = f5CrearLoginEmpleadoClient({
    request: async () => ({
      access_token: 'access', refresh_token: 'refresh', membresia: { rol: 'empleado', comercio_id: 'comercio-1' },
    }),
    setSession: async (value) => {
      tokens = value;
      return { data: { session: expectedSession }, error: null };
    },
  });
  const result = await login({ comercio: 'ab12cd3456', usuario: 'caja_1', clave: 'peludito12' });
  assert.deepEqual(JSON.parse(JSON.stringify(tokens)), { access_token: 'access', refresh_token: 'refresh' });
  assert.equal(result.session, expectedSession);
  assert.equal(result.membresia.rol, 'empleado');
});

test('el selector dirige empleados al servicio y dueños al acceso por mail', async () => {
  const { f5EjecutarIngreso } = loadCore();
  const calls = [];
  const actions = {
    owner: async (email, password) => { calls.push(['owner', email, password]); return 'owner-ok'; },
    employee: async (comercio, usuario, clave) => { calls.push(['employee', comercio, usuario, clave]); return 'employee-ok'; },
  };
  assert.equal(await f5EjecutarIngreso('empleado', {
    comercio: 'ab12cd3456', usuario: 'caja_1', clave: 'peludito12',
  }, actions), 'employee-ok');
  assert.equal(await f5EjecutarIngreso('dueno', {
    email: 'owner@example.com', clave: 'owner-pass',
  }, actions), 'owner-ok');
  assert.deepEqual(calls, [
    ['employee', 'ab12cd3456', 'caja_1', 'peludito12'],
    ['owner', 'owner@example.com', 'owner-pass'],
  ]);
});

test('una invitación fuerza el acceso de dueño y oculta los campos de empleado', () => {
  const { f5VistaLogin } = loadCore();
  assert.deepEqual(JSON.parse(JSON.stringify(f5VistaLogin('empleado', { invitation: false }))), {
    mode: 'empleado', ownerHidden: true, employeeHidden: false, switchHidden: false, focusId: 'loginComercio',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(f5VistaLogin('empleado', { invitation: true }))), {
    mode: 'dueno', ownerHidden: false, employeeHidden: true, switchHidden: true, focusId: 'loginEmail',
  });
});
