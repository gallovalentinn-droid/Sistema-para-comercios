const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const artifactPath = path.resolve(__dirname, '../beta/index.html');
const serviceWorkerPath = path.resolve(__dirname, '../beta/sw.js');
const html = () => fs.readFileSync(artifactPath, 'utf8');

function sliceBetween(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `no se encontró ${start}`);
  assert.ok(to > from, `no se encontró ${end} después de ${start}`);
  return source.slice(from, to);
}

test('el catálogo cargado prioriza factura y agrupa las acciones secundarias', () => {
  const source = html();
  const products = sliceBetween(source, 'function vProductos(m){', '\nfunction listaFiltrada(){');

  assert.match(products, /id="bMasProductos"[^>]*aria-expanded="false"/);
  assert.match(products, /id="menuProductos"[^>]*hidden/);
  assert.match(products, /id="bPrecios"[\s\S]*Cambiar precios/);
  assert.match(products, /id="bImportar"[\s\S]*Importar Excel\/CSV/);
  assert.match(products, /id="bNuevo"[\s\S]*Nuevo producto/);
  assert.match(products, /id="bIngreso"[\s\S]*Cargar factura/);
  assert.match(products, /class="ai-badge"[^>]*>IA</);
  assert.ok(products.indexOf('id="bMasProductos"') < products.indexOf('id="bNuevo"'));
  assert.ok(products.indexOf('id="bNuevo"') < products.indexOf('id="bIngreso"'));
  assert.match(source, /function cerrarMenuProductos\(/);
  assert.match(source, /e\.key==='Escape'/);
});

test('un comercio sin productos recibe el estado inicial con tres caminos de carga', () => {
  const source = html();
  const products = sliceBetween(source, 'function vProductos(m){', '\nfunction formProducto(');

  assert.match(products, /const catalogoVacio=!db\.productos\.length/);
  assert.match(products, /Todavía no cargaste ningún producto/);
  assert.match(products, /Empecemos cargando tu catálogo/);
  assert.match(products, /Esta pantalla solo se ve así hasta que tengas tu primer producto cargado/);
  assert.match(products, /id="bImportarVacio"/);
  assert.match(products, /id="bIngresoVacio"/);
  assert.match(products, /id="bNuevoVacio"/);
  assert.match(source, /function wireProductosVacio\(/);
});

test('Cargar factura abre primero la foto y mantiene disponible la carga manual', () => {
  const source = html();
  const invoice = sliceBetween(source, 'function panelIngreso(reset=true){', '\nfunction addRemito(');

  assert.match(invoice, /class="invoice-ai-card"/);
  assert.match(invoice, /Sacale una foto a la factura/);
  assert.match(invoice, /Probamos completar todo solos: productos, cantidades y precios/);
  assert.match(invoice, /id="facManualToggle"/);
  assert.match(invoice, /¿Preferís cargar los productos a mano\?/);
  assert.match(invoice, /id="facManualContent"[^>]*\$\{mostrarManual\?'':'hidden'\}/);
  assert.match(invoice, /id="okIng"[^>]*\$\{remito\.length\?'':'disabled'\}/);
  assert.match(source, /okIng\.disabled=!remito\.length/);
});

test('el rediseño publica una identidad de caché nueva y alineada', () => {
  const source = html();
  const serviceWorker = fs.readFileSync(serviceWorkerPath, 'utf8');
  const identity = source.match(/const MICOMERCIO_BUILD=Object\.freeze\((\{[\s\S]*?\})\);/);
  assert.ok(identity, 'falta la identidad del build');
  const build = vm.runInNewContext(`(${identity[1]})`);
  assert.equal(build.packageRevision, 35);
  assert.match(serviceWorker, /micomercio-beta-6\.0\.0-f6-rc2-rev35/);
});
