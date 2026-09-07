const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.resolve(__dirname, '../beta/index.html');
const html = () => fs.readFileSync(htmlPath, 'utf8');

function navigationViews(source) {
  const match = source.match(/const VISTAS=(\[[\s\S]*?\]);\s*\/\/ las que el dueño/);
  assert.ok(match, 'no se encontró la definición real de la navegación');
  return vm.runInNewContext(match[1]);
}

test('la sección diaria se presenta como Movimientos de stock', () => {
  const movimientos = navigationViews(html()).find(view => view.id === 'movimientos');

  assert.ok(movimientos, 'falta la sección de movimientos');
  assert.equal(movimientos.txt, 'Movimientos de stock');
});

test('las etiquetas de la barra quedan contenidas y la extensa puede ocupar dos líneas', () => {
  const source = html();
  const labelRule = source.match(/\.nav \.nav-label\{([^}]*)\}/)?.[1] || '';

  assert.match(source, /<span class="nav-label">\$\{v\.txt\}<\/span>/);
  assert.match(labelRule, /min-width:\s*0/);
  assert.match(labelRule, /white-space:\s*normal/);
  assert.match(labelRule, /overflow-wrap:\s*anywhere/);
});

test('el pie de la barra presenta el rol dueño con su nombre legible', () => {
  const source = html();
  const match = source.match(/function etiquetaRolVisible\(rol,bloqueado\)\{[\s\S]*?\n\}/);

  assert.ok(match, 'no se encontró el formateador real del rol visible');
  const etiquetaRolVisible = vm.runInNewContext(`(${match[0]})`);
  assert.equal(etiquetaRolVisible('duenio', true), 'Dueño · bloqueado');
  assert.equal(etiquetaRolVisible('duenio', false), 'Dueño');
  assert.equal(etiquetaRolVisible('admin', false), 'Administrador');
  assert.equal(etiquetaRolVisible('empleado', false), 'Empleado');
});
