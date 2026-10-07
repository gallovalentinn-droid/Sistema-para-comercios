const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'beta', 'index.html'), 'utf8');

test('REV66: un producto sin foto muestra su inicial para que los nombres queden alineados', () => {
  const inicio = html.indexOf('function miniFoto(');
  const fin = html.indexOf('function celdaProductoConFoto(');
  assert.ok(inicio > 0 && fin > inicio);
  const cuerpo = html.slice(inicio, fin);
  assert.match(cuerpo, /aria-hidden="true">\$\{esc\(\(p&&p\.nombre\|\|'\?'\)\.trim\(\)\.charAt\(0\)\.toUpperCase\(\)\)\}<\/span>/);
  assert.doesNotMatch(cuerpo, /return '';/);
});

test('REV66: Historial y Archivar vuelven a mostrar su texto en pantallas anchas', () => {
  assert.doesNotMatch(html, /\.product-secondary-action\{[^}]*font-size:0/);
  assert.match(html, /@media\(min-width:1905px\)\{[^}]*#tabProd \.product-code\{white-space:nowrap\}/);
  assert.match(html, /#tabProd table\.product-selecting \.product-code\{display:none\}/);
});

test('identidad del paquete (REV77)', () => {
  const sw = fs.readFileSync(path.join(__dirname, '..', 'beta', 'sw.js'), 'utf8');
  assert.match(html, /packageRevision:88,/);
  assert.match(sw, /micomercio-beta-6\.0\.0-f6-rc2-rev88/);
});
