const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const artifactPath = path.join(ROOT, 'beta', 'index.html');

function sliceBetween(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `no se encontró ${start}`);
  assert.ok(to > from, `no se encontró ${end} después de ${start}`);
  return source.slice(from + start.length, to);
}

// Carga el núcleo de la compuerta de onboarding con el entorno mínimo que usa:
// el estado F3 (comercio actual) y el cliente de onboarding.
function loadGate({ comercioId = 'c0000000-0000-4000-8000-000000000001', cargar } = {}) {
  const core = sliceBetween(
    fs.readFileSync(artifactPath, 'utf8'),
    '/* F6_ONBOARDING_GATE_CORE_START */',
    '/* F6_ONBOARDING_GATE_CORE_END */',
  );
  const context = {
    f3Estado: { comercioId },
    f6WizardState: null,
    window: { MiComercioF6Onboarding: cargar ? { cargar } : null },
  };
  vm.createContext(context);
  vm.runInContext(`${core}\nthis.f6OnboardingPendiente=f6OnboardingPendiente;this.f6EsErrorSoloDuenio=f6EsErrorSoloDuenio;`, context, {
    filename: artifactPath,
  });
  return context;
}

// Reproduce el error que devuelve supabase-js cuando la RPC levanta la excepción.
function errorSoloDuenio() {
  return Object.assign(new Error('F6_ONBOARDING_OWNER_REQUIRED'), {
    code: 'P0001',
    details: null,
    hint: null,
  });
}

test('un empleado no queda bloqueado por la compuerta de onboarding', async () => {
  let llamadas = 0;
  const context = loadGate({
    cargar: async () => { llamadas += 1; throw errorSoloDuenio(); },
  });
  const pendiente = await context.f6OnboardingPendiente();
  assert.equal(llamadas, 1, 'la compuerta debe consultar el estado una sola vez');
  assert.equal(pendiente, false, 'para un empleado la compuerta no puede quedar pendiente ni propagar el error');
});

test('cualquier otro error del onboarding sigue propagándose', async () => {
  const context = loadGate({
    cargar: async () => { throw new Error('F6_ONBOARDING_CARGA_FALLO'); },
  });
  await assert.rejects(
    () => context.f6OnboardingPendiente(),
    /F6_ONBOARDING_CARGA_FALLO/,
    'un fallo genuino de carga no debe quedar silenciado',
  );
});

test('el dueño con onboarding incompleto sigue entrando al asistente', async () => {
  const context = loadGate({
    cargar: async () => ({ estado: 'en_curso', pasos_confirmados: ['datos_comercio'], siguiente_paso: 'caja_inicial' }),
  });
  assert.equal(await context.f6OnboardingPendiente(), true);
  assert.equal(context.f6WizardState.siguiente_paso, 'caja_inicial');
});

test('el dueño con onboarding completo entra directo a la aplicación', async () => {
  const context = loadGate({ cargar: async () => ({ estado: 'completo', pasos_confirmados: [], siguiente_paso: null }) });
  assert.equal(await context.f6OnboardingPendiente(), false);
});

test('sin comercio resuelto la compuerta no consulta al servidor', async () => {
  let llamadas = 0;
  const context = loadGate({ comercioId: '', cargar: async () => { llamadas += 1; return { estado: 'completo' }; } });
  assert.equal(await context.f6OnboardingPendiente(), false);
  assert.equal(llamadas, 0);
});

test('el reconocimiento del veto de dueño no depende de un único campo', () => {
  const context = loadGate({ cargar: async () => ({ estado: 'completo' }) });
  const { f6EsErrorSoloDuenio } = context;
  assert.equal(f6EsErrorSoloDuenio(errorSoloDuenio()), true);
  assert.equal(f6EsErrorSoloDuenio({ details: 'F6_ONBOARDING_OWNER_REQUIRED' }), true);
  assert.equal(f6EsErrorSoloDuenio({ hint: 'F6_ONBOARDING_OWNER_REQUIRED' }), true);
  assert.equal(f6EsErrorSoloDuenio('F6_ONBOARDING_OWNER_REQUIRED'), true);
  assert.equal(f6EsErrorSoloDuenio(new Error('F6_ONBOARDING_CARGA_FALLO')), false);
  assert.equal(f6EsErrorSoloDuenio(null), false);
});

test('el submit del login no deja la pantalla muerta si falla la apertura', () => {
  const html = fs.readFileSync(artifactPath, 'utf8');
  const submit = sliceBetween(html, "$('#formLogin').addEventListener('submit'", "$('#btnCrearAcceso').addEventListener");
  assert.match(submit, /try\{\s*await f43PostLoginSuccess\(\);\s*\}/);
  assert.match(submit, /catch\(err\)\{[\s\S]*mostrarLogin\(/);
});
