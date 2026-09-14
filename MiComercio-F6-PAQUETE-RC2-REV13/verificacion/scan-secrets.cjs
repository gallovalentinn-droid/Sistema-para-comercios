const fs = require('node:fs');
const path = require('node:path');

const HIGH_RISK_SECRET = /(?:sb_secret_[A-Za-z0-9_-]{20,}|postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}|AIza[A-Za-z0-9_-]{35}|AQ\.[A-Za-z0-9_-]{40,80})/i;

function walkFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function scanTree(root, excluded = []) {
  const base = path.resolve(root);
  const exclusions = new Set(excluded.map((value) => value.replaceAll('\\', '/')));
  return walkFiles(base).flatMap((file) => {
    const relative = path.relative(base, file).replaceAll('\\', '/');
    if (exclusions.has(relative) || exclusions.has(path.basename(file))) return [];
    return HIGH_RISK_SECRET.test(fs.readFileSync(file, 'utf8')) ? [relative] : [];
  });
}

if (require.main === module) {
  const [root = '.', ...excluded] = process.argv.slice(2);
  const findings = scanTree(root, excluded);
  if (findings.length) {
    process.stderr.write(`Posibles secretos detectados:\n${findings.join('\n')}\n`);
    process.exitCode = 1;
  }
}

module.exports = { scanTree };
