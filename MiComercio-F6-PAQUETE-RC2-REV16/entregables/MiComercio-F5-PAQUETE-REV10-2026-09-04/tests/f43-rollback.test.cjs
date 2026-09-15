const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ARTIFACT = require('./lib/artefacto.cjs').artifactPath();

function loadF43Modules() {
  const html = fs.readFileSync(ARTIFACT, 'utf8');
  const start = html.indexOf('/* ==========================================================================\n   MI COMERCIO — F4.3 QA2 CLIENT INTEGRATION');
  const end = html.indexOf('/* MiComercio F4.3 QA bootstrap', start);
  assert.notEqual(start, -1, 'no se encontró el comienzo del módulo F4.3');
  assert.notEqual(end, -1, 'no se encontró el final del módulo F4.3');

  const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  });
  vm.runInContext(html.slice(start, end), context, { filename: ARTIFACT });
  return {
    core: context.MiComercioF43Core,
    integration: context.MiComercioF43Integration,
  };
}

function runtimeFixture({ phase, serverStates = [] }) {
  const steps = [];
  const { core } = loadF43Modules();
  const runtime = core.createF43Runtime({
    loadPersistedState: () => ({ phase, frozen: phase === 'prepared' }),
    savePersistedState: async () => {},
    getCommerceId: () => 'comercio-1',
    rpc: async (name) => {
      if (name === 'estado_f43') return { data: serverStates.shift() };
      if (name === 'activar_v4_only_f43') return { data: { estado: 'v4_only', v4_only: true } };
      if (name === 'rollback_f43') return { data: { estado: 'rollback' } };
      throw new Error(`RPC inesperada: ${name}`);
    },
    activateAdapter: async () => { steps.push('adaptador-v4'); },
    restoreAdapter: async () => { steps.push('adaptador-legacy'); },
    pull: async () => {
      steps.push('pull-v4');
      return { ok: true, maestros: { completo: true }, operaciones: { completo: true } };
    },
  });
  return { runtime, steps };
}

function browserFixture({ autoPoll = false } = {}) {
  const { core, integration } = loadF43Modules();
  const steps = [];
  const window = { MiComercioF43Core: core };
  const key = 'micomercio:f43:comercio-1:dispositivo-1';
  const storage = new Map([[key, JSON.stringify({ phase: 'prepared', frozen: true })]]);
  let authority = { estado: 'rollback' };
  let pollCallback = null;
  const bindings = {
    window,
    document: { addEventListener() {} },
    navigator: { onLine: true },
    localStorage: {
      getItem: (name) => storage.get(name) || null,
      setItem: (name, value) => storage.set(name, value),
    },
    f3Estado: { comercioId: 'comercio-1', deviceUuid: 'dispositivo-1' },
    sb: {
      rpc: async (name) => {
        if (name === 'activar_v4_only_f43') return { data: { estado: 'v4_only', v4_only: true } };
        if (name === 'estado_f43') return { data: authority };
        if (name === 'rollback_f43') return { data: { estado: 'rollback' } };
        throw new Error(`RPC inesperada: ${name}`);
      },
    },
    MiComercioF32: {
      pull: async () => {
        steps.push('pull-v4');
        return { ok: true, maestros: { completo: true }, operaciones: { completo: true } };
      },
    },
    f42ActivateAdapter: async () => { steps.push('adaptador-v4'); },
    f42RestoreAdapter: async () => { steps.push('adaptador-legacy'); },
    f43LoadLocalOnly: async () => { steps.push('carga-local'); },
    cargar: async () => { steps.push('carga-legacy'); },
    setInterval: (_callback) => {
      pollCallback = _callback;
      return 7;
    },
    clearInterval() {},
  };
  const api = integration.installF43BrowserIntegration(bindings, { autoPoll, pollMs: 1000 });
  return {
    api,
    steps,
    setAuthority: (next) => { authority = next; },
    getPollCallback: () => pollCallback,
  };
}

test('rollback restaura el adaptador y recarga la base antes de descongelar', async () => {
  const { runtime, steps } = runtimeFixture({ phase: 'v4_only' });

  const result = await runtime.rollback({
    baseLoad: async () => { steps.push('carga-legacy'); },
  });

  assert.deepEqual(steps, ['adaptador-legacy', 'carga-legacy']);
  assert.equal(result.state.phase, 'rollback');
  assert.equal(result.state.frozen, false);
});

test('refreshAuthority usa la carga correcta al entrar en v4_only y rollback', async () => {
  const { runtime, steps } = runtimeFixture({
    phase: 'normal',
    serverStates: [
      { estado: 'v4_only', v4_only: true },
      { estado: 'rollback' },
    ],
  });

  await runtime.refreshAuthority({
    v4OnlyBaseLoad: async () => { steps.push('carga-local'); },
    rollbackBaseLoad: async () => { steps.push('carga-legacy'); },
  });
  assert.deepEqual(steps, ['adaptador-v4', 'carga-local', 'pull-v4']);

  steps.length = 0;
  await runtime.refreshAuthority({
    v4OnlyBaseLoad: async () => { steps.push('carga-local'); },
    rollbackBaseLoad: async () => { steps.push('carga-legacy'); },
  });
  assert.deepEqual(steps, ['adaptador-legacy', 'carga-legacy']);
});

test('activateCutover entra en v4_only usando la carga local protegida', async () => {
  const { runtime, steps } = runtimeFixture({ phase: 'prepared' });

  const result = await runtime.activateCutover({
    rollbackHours: 168,
    baseLoad: async () => { steps.push('carga-local'); },
  });

  assert.deepEqual(steps, ['adaptador-v4', 'carga-local', 'pull-v4']);
  assert.equal(result.state.phase, 'v4_only');
  assert.equal(result.state.frozen, false);
});

test('la API del navegador conecta las cargas base de cutover, refresh y rollback', async () => {
  const fixture = browserFixture();

  await fixture.api.activarV4Only(168);
  assert.deepEqual(fixture.steps, ['adaptador-v4', 'carga-local', 'pull-v4']);

  fixture.steps.length = 0;
  fixture.setAuthority({ estado: 'rollback' });
  await fixture.api.refrescar();
  assert.deepEqual(fixture.steps, ['adaptador-legacy', 'carga-legacy']);
});

test('el monitoreo automático usa la carga local al detectar v4_only', async () => {
  const fixture = browserFixture({ autoPoll: true });
  fixture.setAuthority({ estado: 'v4_only', v4_only: true });
  fixture.api.estado();

  fixture.getPollCallback()();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(fixture.steps, ['adaptador-v4', 'carga-local', 'pull-v4']);
});
