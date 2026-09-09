const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const identityPath = path.join(ROOT, 'entregables', 'BUILD-IDENTITY-F6.json');

function identityBlock(html) {
  const startMarker = '/* === MI COMERCIO BUILD IDENTITY START === */';
  const endMarker = '/* === MI COMERCIO BUILD IDENTITY END === */';
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);
  assert.notEqual(start, -1, 'falta identidad F6 dentro del artefacto');
  assert.ok(end > start, 'la identidad F6 del artefacto está incompleta');
  return html.slice(start + startMarker.length, end);
}

test('la identidad normativa F6 fija contratos, conteos y hash del artefacto', () => {
  const identity = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
  assert.equal(identity.build, '6.0.0-f6-rc2');
  assert.equal(identity.base_build, '5.0.0-f5-rc2');
  assert.equal(identity.projection_contract, 'f5-projection-v1');
  assert.equal(identity.config_contract, '10-canonical+6-legacy-only');
  assert.equal(identity.license_contract, 'f6-license-v1');
  assert.equal(identity.package_revision, 6);
  assert.equal(identity.expected_local_tests, 119);
  assert.equal(identity.expected_sql_suites, 16);
  assert.equal(identity.acceptance, 'candidate-pending-seven-day-pilot');
  const artifact = path.join(ROOT, identity.artifact.path);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(artifact)).digest('hex');
  assert.equal(hash, identity.artifact.sha256);
});

test('el navegador expone la misma identidad F6 campo por campo', () => {
  const identity = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
  const html = fs.readFileSync(path.join(ROOT, identity.artifact.path), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(identityBlock(html), sandbox);
  const observed = sandbox.window.MiComercioBuild;
  assert.equal(observed.version, identity.build);
  assert.equal(observed.phase, 'F6');
  assert.equal(observed.packageRevision, identity.package_revision);
  assert.equal(observed.baseBuild, identity.base_build);
  assert.equal(observed.projectionContract, identity.projection_contract);
  assert.equal(observed.configContract, identity.config_contract);
  assert.equal(observed.licenseContract, identity.license_contract);
});

test('el panel de soporte consulta el mismo build aprobado que el cliente', () => {
  const identity = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
  const support = fs.readFileSync(path.join(ROOT, 'entregables', 'MiComercio-Soporte-F6.html'), 'utf8');
  assert.match(support, new RegExp(`const BUILD=['"]${identity.build}['"]`));
});
