const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const artifactPath = path.resolve(__dirname, '../entregables/MiComercio-F6-PRUEBA.html');

function assertArtifactSyntax() {
  const html = fs.readFileSync(artifactPath, 'utf8');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .filter((code) => code.trim());
  assert.ok(scripts.length > 0);
  scripts.forEach((code, index) => new vm.Script(code, { filename: `${artifactPath}#${index + 1}` }));
}

function loadCore(extra = {}) {
  const html = fs.readFileSync(artifactPath, 'utf8');
  const startMarker = '/* F6_ONBOARDING_CORE_START */';
  const endMarker = '/* F6_ONBOARDING_CORE_END */';
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);
  assert.notEqual(start, -1, 'falta el core F6 de onboarding');
  assert.ok(end > start, 'el core F6 de onboarding está incompleto');
  const code = html.slice(start + startMarker.length, end);
  const context = {
    module: { exports: {} },
    structuredClone,
    window: {},
    ...extra,
  };
  vm.runInNewContext(
    `${code}\nmodule.exports={F6_ONBOARDING_STEPS,f6VistaOnboarding,f6SimularComprobacion,f6CrearOnboardingClient,f6InviteTokenFromSearch,f6CrearFlujoAlta};`,
    context,
    { filename: artifactPath },
  );
  return context.module.exports;
}

const initial = { estado: 'no_iniciado', pasos_confirmados: [], siguiente_paso: 'datos_comercio' };

test('render inicial muestra el primer paso y progreso vacío', () => {
  assertArtifactSyntax();
  const { f6VistaOnboarding } = loadCore();
  const view = f6VistaOnboarding(initial);
  assert.deepEqual(JSON.parse(JSON.stringify(view)), {
    estado: 'no_iniciado',
    pasoActual: 'datos_comercio',
    completados: 0,
    total: 7,
    puedeOmitir: false,
    puedeEntrarPos: false,
  });
});

test('reanuda en el paso posterior al último confirmado por servidor', () => {
  const { f6VistaOnboarding } = loadCore();
  const view = f6VistaOnboarding({
    estado: 'en_curso',
    pasos_confirmados: ['datos_comercio', 'caja_inicial'],
    siguiente_paso: 'modulos',
  });
  assert.equal(view.pasoActual, 'modulos');
  assert.equal(view.completados, 2);
});

test('el cliente avanza sólo después de que confirmarPaso responde', async () => {
  const { f6CrearOnboardingClient } = loadCore();
  let fail = true;
  const client = f6CrearOnboardingClient({
    cargar: async () => initial,
    confirmarPaso: async () => {
      if (fail) throw new Error('corte');
      return { estado: 'en_curso', pasos_confirmados: ['datos_comercio'], siguiente_paso: 'caja_inicial' };
    },
    comprobar: async () => ({}),
  });
  await client.cargar('comercio-1');
  await assert.rejects(client.confirmarPaso('datos_comercio', {}, 'key-1'), /corte/);
  assert.equal(client.estado().siguiente_paso, 'datos_comercio');
  fail = false;
  await client.confirmarPaso('datos_comercio', {}, 'key-1');
  assert.equal(client.estado().siguiente_paso, 'caja_inicial');
});

test('un corte al recargar conserva el último estado confirmado', async () => {
  const { f6CrearOnboardingClient } = loadCore();
  let calls = 0;
  const saved = { estado: 'en_curso', pasos_confirmados: ['datos_comercio'], siguiente_paso: 'caja_inicial' };
  const client = f6CrearOnboardingClient({
    cargar: async () => {
      calls += 1;
      if (calls > 1) throw new Error('sin red');
      return saved;
    },
    confirmarPaso: async () => ({}),
    comprobar: async () => ({}),
  });
  await client.cargar('comercio-1');
  await assert.rejects(client.cargar('comercio-1'), /sin red/);
  assert.equal(client.estado().siguiente_paso, 'caja_inicial');
});

test('sólo empleados y clientes ofrecen Omitir por ahora', () => {
  const { f6VistaOnboarding } = loadCore();
  for (const paso of ['datos_comercio', 'caja_inicial', 'modulos', 'productos', 'comprobacion_final']) {
    assert.equal(f6VistaOnboarding({ ...initial, siguiente_paso: paso }).puedeOmitir, false);
  }
  for (const paso of ['empleados', 'clientes']) {
    assert.equal(f6VistaOnboarding({ ...initial, siguiente_paso: paso }).puedeOmitir, true);
  }
});

test('la simulación exige caja y producto activos sin producir efectos', () => {
  const { f6SimularComprobacion } = loadCore();
  assert.equal(f6SimularComprobacion({ cajaActiva: false, productosActivos: 1 }).ok, false);
  assert.equal(f6SimularComprobacion({ cajaActiva: true, productosActivos: 1 }).ok, true);
  assert.equal(f6SimularComprobacion({ cajaActiva: true, productosActivos: 0 }).ok, false);
  assert.equal(f6SimularComprobacion({ cajaActiva: true, productosActivos: 2 }).ok, true);
  const forbidden = () => { throw new Error('EFECTO_NO_PERMITIDO'); };
  const { f6SimularComprobacion: simulate } = loadCore({
    guardar: forbidden,
    f3NuevaOperacion: forbidden,
    abrirTurno: forbidden,
    cerrarTurno: forbidden,
    db: Object.freeze({ ventas: Object.freeze([]) }),
  });
  const snapshot = { cajaActiva: true, productosActivos: 1, totalEjemplo: 1250 };
  const before = structuredClone(snapshot);
  const result = simulate(snapshot);
  assert.deepEqual(snapshot, before);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    ok: true,
    sideEffects: 0,
    totalEjemplo: 1250,
  });
});

test('alta completa consume una invitación una vez, reanuda y activa siete días exactos', async () => {
  const { f6InviteTokenFromSearch, f6CrearFlujoAlta } = loadCore({ URLSearchParams });
  const calls = [];
  const storageData = new Map();
  const storage = {
    getItem: (key) => storageData.get(key) ?? null,
    setItem: (key, value) => storageData.set(key, String(value)),
    removeItem: (key) => storageData.delete(key),
  };
  const states = [
    initial,
    { estado: 'en_curso', pasos_confirmados: ['datos_comercio'], siguiente_paso: 'caja_inicial' },
  ];
  const api = {
    uuid: () => '11111111-1111-4111-8111-111111111111',
    preview: async (token) => ({ ok: true, code: 'INVITATION_AVAILABLE', token }),
    authenticate: async (credentials) => ({ userId: '22222222-2222-4222-8222-222222222222', credentials }),
    consume: async (token, userId, key) => {
      calls.push(['consume', token, userId, key]);
      return { ok: true, comercio_id: '33333333-3333-4333-8333-333333333333' };
    },
    cargarOnboarding: async () => states.shift() || { estado: 'en_curso', pasos_confirmados: [], siguiente_paso: 'datos_comercio' },
    confirmarPaso: async (_commerceId, step, _payload, key) => {
      calls.push(['paso', step, key]);
      return { estado: 'en_curso', pasos_confirmados: [], siguiente_paso: step };
    },
    comprobar: async () => ({ estado: 'completo', siguiente_paso: null }),
    licencia: async () => ({
      estado_efectivo: 'activa',
      puede_operar: true,
      duration_seconds: 604800,
    }),
  };
  const token = 'token-secreto-de-invitacion';
  assert.equal(f6InviteTokenFromSearch(`?invite=${token}`), token);
  const flow = f6CrearFlujoAlta(api, storage);
  assert.equal((await flow.iniciar(`?invite=${token}`)).ok, true);
  const authenticated = await flow.autenticar({ email: 'owner@example.com', password: 'secret123' });
  assert.equal(authenticated.onboarding.siguiente_paso, 'datos_comercio');
  assert.equal(calls[0][0], 'consume');
  assert.equal(storageData.size, 0, 'la clave idempotente se limpia sólo después de confirmar consumo');
  await flow.confirmarPaso('datos_comercio', { nombre: 'Comercio' }, 'paso-1');
  const completed = await flow.completar();
  assert.equal(completed.onboarding.estado, 'completo');
  assert.equal(completed.license.duration_seconds, 604800);
  assert.equal(completed.license.puede_operar, true);
});

test('invitación inválida o vencida usa un mensaje genérico sin filtrar comercio', async () => {
  const { f6CrearFlujoAlta } = loadCore({ URLSearchParams });
  const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  for (const preview of [
    { ok: false, code: 'INVITATION_EXPIRED', comercio_nombre: 'Secreto SA' },
    { ok: false, code: 'INVITATION_REVOKED', comercio_id: 'privado' },
  ]) {
    const flow = f6CrearFlujoAlta({ preview: async () => preview }, storage);
    const result = await flow.iniciar('?invite=no-valida');
    assert.deepEqual(JSON.parse(JSON.stringify(result)), {
      ok: false,
      code: 'INVITATION_NOT_AVAILABLE',
      message: 'El enlace no está disponible',
    });
    assert.equal(JSON.stringify(result).includes('Secreto'), false);
    assert.equal(JSON.stringify(result).includes('privado'), false);
  }
});
