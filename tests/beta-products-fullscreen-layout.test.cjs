const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const artifactPath = path.resolve(__dirname, '../beta/index.html');

function loadCore() {
  const html = fs.readFileSync(artifactPath, 'utf8');
  const startMarker = '/* F6_FULLSCREEN_LAYOUT_CORE_START */';
  const endMarker = '/* F6_FULLSCREEN_LAYOUT_CORE_END */';
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);
  assert.notEqual(start, -1, 'falta el núcleo de detección de pantalla completa');
  assert.ok(end > start, 'el núcleo de detección de pantalla completa está incompleto');
  const code = html.slice(start + startMarker.length, end);
  const context = { module: { exports: {} } };
  vm.runInNewContext(
    `${code}\nmodule.exports={f6EsPantallaCompleta,f6AplicarModoPantallaCompleta};`,
    context,
    { filename: artifactPath },
  );
  return context.module.exports;
}

function fakeRoot(initial = []) {
  const classes = new Set(initial);
  return {
    classes,
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
    },
  };
}

test('sólo activa el diseño extendido cuando la aplicación ocupa toda la pantalla', () => {
  const { f6AplicarModoPantallaCompleta } = loadCore();
  const root = fakeRoot(['modo-pantalla-completa']);

  assert.equal(f6AplicarModoPantallaCompleta(root, {
    innerHeight: 900,
    screenHeight: 1080,
    fullscreenElement: null,
    displayModeFullscreen: false,
  }), false);
  assert.equal(root.classes.has('modo-pantalla-completa'), false);

  assert.equal(f6AplicarModoPantallaCompleta(root, {
    innerHeight: 1079,
    screenHeight: 1080,
    fullscreenElement: null,
    displayModeFullscreen: false,
  }), true);
  assert.equal(root.classes.has('modo-pantalla-completa'), true);
});

test('también reconoce la API de pantalla completa sin depender del tamaño', () => {
  const { f6EsPantallaCompleta } = loadCore();

  assert.equal(f6EsPantallaCompleta({
    innerHeight: 700,
    screenHeight: 1080,
    fullscreenElement: {},
    displayModeFullscreen: false,
  }), true);
  assert.equal(f6EsPantallaCompleta({
    innerHeight: 700,
    screenHeight: 1080,
    fullscreenElement: null,
    displayModeFullscreen: true,
  }), true);
});

test('agranda la foto y la columna de producto sólo en pantalla completa', () => {
  const html = fs.readFileSync(artifactPath, 'utf8');

  assert.match(html, /\.product-thumb\{width:42px;height:42px;/,
    'el modo normal debe conservar miniaturas de 42 px');
  assert.match(html, /html\.modo-pantalla-completa \.product-thumb:not\(\.product-thumb-editor\)\{width:50px;height:50px;flex-basis:50px;border-radius:10px\}/,
    'la miniatura ampliada debe alcanzar todas las listas en pantalla completa');
  assert.match(html, /html\.modo-pantalla-completa \.product-cell\{gap:12px\}/,
    'la foto ampliada necesita una separación proporcionada');
  assert.match(html, /html\.modo-pantalla-completa #tabProd td\[data-label="Producto"\]\{min-width:300px;max-width:420px\}/,
    'la columna Producto debe ganar espacio únicamente en pantalla completa');
});
