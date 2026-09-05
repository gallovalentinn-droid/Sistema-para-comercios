const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const F5_PACKAGE = path.join(
  ROOT,
  'entregables',
  'MiComercio-F5-PAQUETE-REV10-2026-09-04'
);
const F5_HTML = path.join(F5_PACKAGE, 'entregables', 'MiComercio-F5-PRUEBA.html');
const F5_IDENTITY = path.join(F5_PACKAGE, 'BUILD-IDENTITY-F5.json');
const F5_MANIFEST = path.join(F5_PACKAGE, 'SHA256SUMS-F5.txt');
const F6_HTML = path.join(ROOT, 'entregables', 'MiComercio-F6-PRUEBA.html');
const F6_EVIDENCE = path.join(ROOT, 'entregables', 'QA-F6-EVIDENCIA.md');
const F5_SHA256 = '05412b8b2edcd785716f854f88fc863c47c51a659f17394fb05bbd7a5a537d43';
const F5_MANIFEST_SHA256 = 'f06a7f895f7c71ea8e9f2ca356d537bc86909fd451df95a3a78895134e37cb93';

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(fullPath) : [fullPath];
  });
}

test('F6 conserva la identidad de partida y las fuentes F5 rev10 rc2 aprobadas', () => {
  const build = JSON.parse(fs.readFileSync(F5_IDENTITY, 'utf8'));
  const f5SourceHtml = fs.readFileSync(F5_HTML);
  const f6WorkingHtml = fs.readFileSync(F6_HTML, 'utf8');

  assert.equal(build.build, '5.0.0-f5-rc2');
  assert.equal(build.artifact.sha256, F5_SHA256);
  assert.equal(sha256(f5SourceHtml), F5_SHA256);
  assert.match(f6WorkingHtml, /baseBuild:'5\.0\.0-f5-rc2'/);
  assert.match(f6WorkingHtml, /F6_ONBOARDING_CORE_START/);

  const manifestBuffer = fs.readFileSync(F5_MANIFEST);
  assert.equal(sha256(manifestBuffer), F5_MANIFEST_SHA256, 'cambió el manifiesto aprobado de F5 rev10');
  const canonicalF5Entries = manifestBuffer.toString('utf8').split(/\r?\n/u)
    .map((line) => line.match(/^([0-9a-f]{64})  (supabase\/f5\/([^/]+))$/u))
    .filter(Boolean)
    .map((match) => ({ hash: match[1], relative: match[2], name: match[3] }));
  const canonicalF5Sql = canonicalF5Entries.map((entry) => entry.name).sort();
  assert.deepEqual(
    fs.readdirSync(path.join(F5_PACKAGE, 'supabase', 'f5')).sort(),
    canonicalF5Sql,
    'el directorio F5 rev10 debe coincidir con su manifiesto aprobado',
  );
  const workspaceF5Sql = fs.readdirSync(path.join(ROOT, 'supabase', 'f5')).sort();
  assert.deepEqual(
    workspaceF5Sql,
    canonicalF5Sql,
    'el conjunto SQL F5 del workspace debe ser exactamente el de rev10',
  );
  for (const entry of canonicalF5Entries) {
    assert.equal(sha256(fs.readFileSync(path.join(F5_PACKAGE, entry.relative))), entry.hash);
    assert.equal(sha256(fs.readFileSync(path.join(ROOT, entry.relative))), entry.hash);
  }

  for (const packageDirectory of ['supabase', 'tests']) {
    const packageRoot = path.join(F5_PACKAGE, packageDirectory);
    for (const packageFile of filesUnder(packageRoot)) {
      const relative = path.relative(F5_PACKAGE, packageFile);
      const workspaceFile = path.join(ROOT, relative);
      assert.deepEqual(
        fs.readFileSync(workspaceFile),
        fs.readFileSync(packageFile),
        `el workspace F5 difiere de rev10 en ${relative}`,
      );
    }
  }
});

test('la evidencia enumera los tres gates previos al piloto sin darlos por resueltos', () => {
  const evidence = fs.readFileSync(F6_EVIDENCE, 'utf8');

  for (const gate of ['v4_only', 'baseline F2–F5', 'verificarPin()']) {
    assert.match(evidence, new RegExp(escapeRegex(gate)));
  }
  assert.match(evidence, /estado:\s*pendiente/iu);
});
