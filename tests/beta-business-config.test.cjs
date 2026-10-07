const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const artifactPath = path.resolve(__dirname, '../beta/index.html');

function loadCore() {
  const html = fs.readFileSync(artifactPath, 'utf8');
  const startMarker = '/* F5_BUSINESS_CONFIG_CORE_START */';
  const endMarker = '/* F5_BUSINESS_CONFIG_CORE_END */';
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);
  assert.notEqual(start, -1, 'falta el núcleo de guardado de datos del comercio');
  assert.ok(end > start, 'el núcleo de guardado de datos del comercio está incompleto');
  const code = html.slice(start + startMarker.length, end);
  const context = { module: { exports: {} } };
  vm.runInNewContext(
    `${code}\nmodule.exports={f5CrearGuardadoDatosComercio};`,
    context,
    { filename: artifactPath },
  );
  return context.module.exports;
}

test('confirma el nombre remoto antes de aplicar los datos del comercio localmente', async () => {
  const { f5CrearGuardadoDatosComercio } = loadCore();
  const events = [];
  const save = f5CrearGuardadoDatosComercio({
    guardarNombreRemoto: async (nombre) => {
      events.push(['remoto', nombre]);
      return { id: 'comercio-1', nombre };
    },
    aplicarLocal: async (datos) => events.push(['local', { ...datos }]),
  });

  const result = await save({ nombre: '  Kiosco Centro  ', nroVenta: '8.9', whatsappDueno: ' 5491112345678 ' });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    nombre: 'Kiosco Centro',
    nroVenta: 8,
    whatsappDueno: '5491112345678',
  });
  assert.deepEqual(events, [
    ['remoto', 'Kiosco Centro'],
    ['local', { nombre: 'Kiosco Centro', nroVenta: 8, whatsappDueno: '5491112345678' }],
  ]);
});

test('no modifica los datos locales si el servidor no confirma el nuevo nombre', async () => {
  const { f5CrearGuardadoDatosComercio } = loadCore();
  let localApplications = 0;
  const save = f5CrearGuardadoDatosComercio({
    guardarNombreRemoto: async () => null,
    aplicarLocal: async () => { localApplications += 1; },
  });

  await assert.rejects(
    save({ nombre: 'Nombre nuevo', nroVenta: 2, whatsappDueno: '' }),
    /F5_COMERCIO_NOMBRE_NO_CONFIRMADO/,
  );
  assert.equal(localApplications, 0);
});
