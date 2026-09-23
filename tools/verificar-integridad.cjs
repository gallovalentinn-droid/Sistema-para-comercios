#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'integrity-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const failures = [];

for (const [relative, expected] of Object.entries(manifest.files || {})) {
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(root + path.sep) || !fs.existsSync(absolute)) {
    failures.push(`${relative}: archivo ausente`);
    continue;
  }
  const actual = crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
  if (actual !== expected) failures.push(`${relative}: hash distinto`);
}

const secretPatterns = [
  ['Supabase secret key', /\bsb_secret_[A-Za-z0-9._-]{12,}\b/g],
  ['service role key', /\bservice[_-]?role\b\s*[:=]\s*['"][^'"]{16,}['"]/gi],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['GitHub token', /\bgh[opsu]_[A-Za-z0-9]{30,}\b/g],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{30,}\b/g],
];
const scanRoots = ['index.html', 'beta', 'clientes'];
function filesAt(target) {
  const absolute = path.join(root, target);
  if (!fs.existsSync(absolute)) return [];
  if (fs.statSync(absolute).isFile()) return [absolute];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap(entry =>
    filesAt(path.join(target, entry.name))
  );
}
for (const absolute of scanRoots.flatMap(filesAt)) {
  if (!/\.(?:html|js|cjs|json|txt|md)$/i.test(absolute)) continue;
  const text = fs.readFileSync(absolute, 'utf8');
  for (const [name, pattern] of secretPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) failures.push(`${path.relative(root, absolute)}: posible ${name}`);
  }
}

if (failures.length) {
  console.error('Verificación fallida:');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`Integridad correcta: ${Object.keys(manifest.files || {}).length} archivos, sin secretos privados detectados.`);
