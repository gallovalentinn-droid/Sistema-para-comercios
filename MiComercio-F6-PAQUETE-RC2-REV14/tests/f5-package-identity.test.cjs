const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { extractBlock } = require('./lib/artefacto.cjs');

const ROOT = path.resolve(__dirname, '..');

test('la identidad formal F5 nombra el candidato y fija el hash del HTML entregado', () => {
  const identityPath = path.join(ROOT, 'BUILD-IDENTITY-F5.json');
  assert.equal(fs.existsSync(identityPath), true, 'falta BUILD-IDENTITY-F5.json');

  const identity = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
  assert.equal(identity.build, '5.0.0-f5-rc2');
  assert.equal(identity.package_revision, 10);
  assert.equal(identity.projection_contract, 'f5-projection-v1');
  assert.equal(identity.config_contract, '10-canonical+6-legacy-only');
  assert.equal(identity.acceptance, 'candidate-pending-v4-only-browser-gate');

  const artifactPath = path.join(ROOT, identity.artifact.path);
  const actualHash = crypto
    .createHash('sha256')
    .update(fs.readFileSync(artifactPath))
    .digest('hex');
  assert.equal(actualHash, identity.artifact.sha256);
});

test('el navegador expone la identidad F5 para diagnóstico y gates', () => {
  const source = extractBlock(
    '/* === MI COMERCIO BUILD IDENTITY START === */',
    '/* === MI COMERCIO BUILD IDENTITY END === */'
  );
  const sandbox = { window: {} };

  vm.runInNewContext(source, sandbox);

  assert.equal(sandbox.window.MiComercioBuild.version, '5.0.0-f5-rc2');
  assert.equal(sandbox.window.MiComercioBuild.phase, 'F5');
  assert.equal(sandbox.window.MiComercioBuild.packageRevision, 10);
  assert.equal(sandbox.window.MiComercioBuild.projectionContract, 'f5-projection-v1');
  assert.equal(sandbox.window.MiComercioBuild.configContract, '10-canonical+6-legacy-only');
});
