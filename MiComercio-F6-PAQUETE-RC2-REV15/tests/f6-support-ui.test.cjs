const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const path = require('node:path');
const htmlPath = path.resolve(__dirname, '../entregables/MiComercio-Soporte-F6.html');
const html = () => fs.readFileSync(htmlPath, 'utf8');

function supportCommands(source) {
  const match = source.match(/const SUPPORT_COMMANDS=Object\.freeze\((\{[\s\S]*?\})\);/);
  assert.ok(match, 'falta SUPPORT_COMMANDS');
  return vm.runInNewContext(`(${match[1]})`);
}

test('expone sólo los once comandos seguros y ningún editor comercial', () => {
  const source = html();
  assert.deepEqual({ ...supportCommands(source) }, {
    reenviarInvitacion: 'invite', regenerarInvitacion: 'invite', revocarInvitacion: 'invite',
    extender: 'license', pausar: 'license', reactivar: 'license', cancelar: 'license',
    revocarDispositivo: 'device_revoke', reintentarSync: 'sync_retry',
    exportarDiagnostico: 'diagnostic_export', anotarConciliacion: 'reconciliation_note',
  });
  assert.doesNotMatch(source, /data-command="(?:editarVenta|editarStock|editarCaja|editarSaldo)"/);
  assert.doesNotMatch(source, /contenteditable/i);
});

test('prioriza estado efectivo y organiza el diagnóstico en cinco bloques', () => {
  const source = html();
  for (const block of ['Alta', 'Licencia', 'Dispositivos', 'Sincronización', 'Conciliaciones']) {
    assert.match(source, new RegExp(`data-support-block="${block}"`));
  }
  assert.match(source, /estado_efectivo/);
  assert.match(source, /data-severity="(?:danger|warning|info)"/);
  assert.match(source, /<details/);
});

test('cada mutación exige motivo y conserva las advertencias específicas', () => {
  const source = html();
  assert.match(source, /reason\.value\.trim\(\)/);
  assert.match(source, /confirmAction\.disabled\s*=\s*!reason\.value\.trim\(\)/);
  assert.match(source, /rechazo total/i);
  assert.match(source, /segundos exactos/i);
  assert.match(source, /requiere una licencia nueva/i);
  assert.match(source, /operaciones offline pendientes/i);
  assert.match(source, /no resuelve ni modifica datos comerciales/i);
});

test('muestra el mismo código de incidente y es adaptable sin desborde horizontal', () => {
  const source = html();
  assert.match(source, /result\.code/);
  assert.match(source, /showIncident\(.*code/s);
  assert.match(source, /@media\s*\(max-width:\s*600px\)/);
  assert.match(source, /overflow-x:\s*hidden/);
  assert.match(source, /minmax\(min\(100%,\s*22rem\),\s*1fr\)/);
  const script = source.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, 'falta script embebido');
  assert.doesNotThrow(() => new vm.Script(script));
});
