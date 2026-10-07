const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'beta', 'index.html'), 'utf8');

test('REV68: el arranque sólo limpia marcadores viejos, nunca un turno abierto a mano o con movimientos', () => {
  const i = html.indexOf('function f3SesionEsMarcadorViejo(s){');
  assert.ok(i > 0);
  const cuerpo = html.slice(i, html.indexOf('\n}\n', i));
  assert.match(cuerpo, /s\.rev31AperturaExplicita===true\|\|s\.abiertoPor/);
  assert.match(cuerpo, /f3SesionTieneMovimientos\(s\)/);
  const migrar = html.slice(html.indexOf('function f3MigrarPlaceholderSesionLocal(){'));
  assert.match(migrar.slice(0, 300), /if\(!f3SesionEsMarcadorViejo\(s\)\) return false;/);
});

test('REV68: la integración F43 usa la misma regla para saber si hay turno abierto', () => {
  assert.match(html, /bindings\.f3SesionEsMarcadorViejo\(s\)/);
  assert.match(html, /f3TurnoLegacyLimpio,\n\s+f3SesionEsMarcadorViejo,/);
  assert.doesNotMatch(html, /if\(bindings\.f3TurnoLegacyLimpio\(\)\) return false;/);
});
