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

test('aprovecha el alto disponible siempre y reserva la ampliación visual para pantalla completa', () => {
  const html = fs.readFileSync(artifactPath, 'utf8');

  assert.match(html, /#tabProd\{max-height:calc\(100vh - 220px\);max-height:calc\(100dvh - 220px\);overflow:auto\}/,
    'Productos debe llegar cerca del borde inferior también en modo normal');
  assert.doesNotMatch(html, /#tabProd\{max-height:65vh;/,
    'el límite porcentual anterior deja espacio vacío en notebooks');
  assert.match(html, /\.product-thumb\{width:42px;height:42px;/,
    'el modo normal debe conservar miniaturas de 42 px');
  assert.match(html, /html\.modo-pantalla-completa \.product-thumb:not\(\.product-thumb-editor\)\{width:50px;height:50px;flex-basis:50px;border-radius:10px\}/,
    'la miniatura ampliada debe alcanzar todas las listas en pantalla completa');
  assert.match(html, /html\.modo-pantalla-completa \.product-cell\{gap:12px\}/,
    'la foto ampliada necesita una separación proporcionada');
  assert.match(html, /html\.modo-pantalla-completa #tabProd td\[data-label="Producto"\]\{min-width:300px;max-width:420px\}/,
    'la columna Producto debe ganar espacio únicamente en pantalla completa');
});

test('Productos deja visibles las acciones y distribuye los filtros según el ancho', () => {
  const html = fs.readFileSync(artifactPath, 'utf8');
  assert.match(html, /\.main\{padding:28px 32px 110px;width:100%;min-width:0\}/);
  assert.match(html, /@media\(max-width:1904px\) and \(min-width:761px\)\{[\s\S]*?#tabProd td:last-child \.btn\{width:38px/);
  assert.match(html, /\.products-filters #filtrarIncompletos\{margin-left:auto;white-space:nowrap\}/);
  assert.match(html, /@media\(max-width:1400px\)\{\.products-filters\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(html, /status\.hidden=guard\.ok&&ev\.estado==='activa'/);
  assert.match(html, /id="abrirEstadoSistema">Ver sincronización y licencia/);
});
