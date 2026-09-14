const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const artifactPath = path.resolve(__dirname, '../entregables/MiComercio-F6-PRUEBA.html');

function html() { return fs.readFileSync(artifactPath, 'utf8'); }

function loadCore() {
  const source = html();
  const startMarker = '/* F6_LICENSE_CLIENT_START */';
  const endMarker = '/* F6_LICENSE_CLIENT_END */';
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  assert.notEqual(start, -1, 'falta el core cliente de licencia F6');
  assert.ok(end > start, 'el core cliente de licencia F6 está incompleto');
  const context = { module: { exports: {} } };
  vm.runInNewContext(
    `${source.slice(start + startMarker.length, end)}\nmodule.exports={f6AccionesLicencia,f6ResumenLicencia,f6TraducirErrorLicencia,f6ComponerEscritura,f6CapacidadesSoloLectura,f6ValidarActivacion};`,
    context,
    { filename: artifactPath },
  );
  return context.module.exports;
}

function runF33Normalizer(data) {
  const source = html();
  const num = source.match(/function f33Num\([^\n]+\}/)?.[0];
  const normalizer = source.match(/function f33NormalizarLicencia\(data,nowMs=Date\.now\(\)\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(num && normalizer, 'falta el normalizador F3.3');
  const context = { data, result: null };
  vm.runInNewContext(`${num}\n${normalizer}\nresult=f33NormalizarLicencia(data,1000);`, context);
  return context.result;
}

test('presenta estado efectivo y no ofrece reactivación simple cuando exige vigencia', () => {
  const { f6AccionesLicencia, f6ValidarActivacion } = loadCore();
  assert.deepEqual(Array.from(f6AccionesLicencia({ estado_efectivo: 'vencida' })), ['extend', 'cancel']);
  assert.equal(html().includes('estadoEfectivo:String(d.estado_efectivo'), true);
  assert.equal(f6ValidarActivacion({ estado_efectivo: 'activa', puede_operar: true, duration_seconds: 604800 }), true);
  assert.throws(
    () => f6ValidarActivacion({ estado_efectivo: 'activa', puede_operar: true, duration_seconds: 604799 }),
    /F6_LICENSE_DURATION_INVALID/,
  );
});

test('vencida domina el estado administrativo pausado sin inferencia local', () => {
  const normalized = runF33Normalizer({
    activo: false,
    puede_operar: false,
    estado_efectivo: 'vencida',
    estado_administrativo: 'pausada',
    server_now: '2026-09-04T12:00:00Z',
    offline_valid_until: '2026-09-04T12:00:00Z',
    valid_until: '2026-09-04T12:00:00Z',
  });
  assert.equal(normalized.estadoEfectivo, 'vencida');
  assert.equal(normalized.puedeOperar, false);
});

test('muestra el saldo adicional restante en días y segundos', () => {
  const { f6ResumenLicencia } = loadCore();
  const result = f6ResumenLicencia({
    estado_efectivo: 'activa',
    extension_used_seconds: 432000,
    extension_remaining_seconds: 172800,
  });
  assert.equal(result.saldoRestanteSegundos, 172800);
  assert.equal(result.saldoRestanteDias, 2);
});

test('traduce exceso como rechazo total y nunca propone un recorte', () => {
  const { f6TraducirErrorLicencia } = loadCore();
  const result = f6TraducirErrorLicencia(new Error(
    'F6_EXTENSION_SUPERA_SALDO:solicitado=345600,remanente=172800',
  ));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    code: 'F6_EXTENSION_SUPERA_SALDO',
    solicitadoSegundos: 345600,
    remanenteSegundos: 172800,
    recortado: false,
  });
});

test('escribir exige simultáneamente preparación, licencia y lease F5', () => {
  const { f6ComponerEscritura } = loadCore();
  assert.equal(f6ComponerEscritura({ preparationWritable: true, licenseWritable: true, leaseWritable: true }).ok, true);
  const blocked = f6ComponerEscritura({ preparationWritable: true, licenseWritable: false, leaseWritable: false });
  assert.equal(blocked.ok, false);
  assert.deepEqual(Array.from(blocked.causas), ['F33_LICENSE_NOT_OPERABLE', 'F5_LEASE_EXPIRED_OR_REVOKED']);
});

test('sólo lectura conserva exportación y outbox sin habilitar ventas', () => {
  const { f6CapacidadesSoloLectura } = loadCore();
  assert.deepEqual(JSON.parse(JSON.stringify(f6CapacidadesSoloLectura({ puede_operar: false }))), {
    vender: false,
    mutarMaestros: false,
    exportar: true,
    verOutbox: true,
    reintentarOutbox: false,
  });
});
