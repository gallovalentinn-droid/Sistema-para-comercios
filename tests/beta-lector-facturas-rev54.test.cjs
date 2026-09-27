const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'beta/index.html'), 'utf8').replace(/\r\n/g, '\n');
function section(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `Falta ${start} / ${end}`);
  return html.slice(a, b);
}

test('las tablas del lector de facturas usan un diseño propio que no aplasta el nombre del producto', () => {
  assert.match(html, /\.mod\.wide\.invoice-wide\{max-width:min\(1200px,calc\(100vw - 32px\)\)\}/);
  assert.match(html, /#iTabla,#revTabla\{container:factura \/ inline-size\}/);
  assert.match(html, /@container factura \(max-width:959px\)/);
  assert.match(html, /\.invoice-lines td\[data-label="Producto"\],\.invoice-lines td\[data-label="Leído en la factura"\]\{min-width:230px\}/);
  const remito = section('function pintarRemito(){', 'function resumenCostos');
  assert.match(remito, /<table class="mtable invoice-lines">/);
  assert.match(remito, /classList\.toggle\('invoice-wide',remito\.length>0\)/);
  const revision = section('function pintarRevision(ov2){', 'function recomputeLinea');
  assert.match(revision, /<table class="mtable invoice-lines">/);
  assert.match(revision, /value="__nuevo__" \$\{r\.prodId==='__nuevo__'\?'selected':''\}/);
});

test('la revisión y la carga ofrecen volver un paso', () => {
  const revision = section('function abrirRevisionFactura(', 'function pintarRevision(');
  assert.match(revision, /id="volverFotoFac"/);
  assert.match(revision, /pasosFacturaIA\('revisar'\)/);
  const ingreso = section('function panelIngreso(', 'async function leerFacturaFoto');
  assert.match(ingreso, /id="volverRevFac"/);
  assert.match(ingreso, /Tocá otra vez para confirmar/);
});

test('volver al paso anterior restaura una copia y no la memoria del paso', () => {
  const codigo = section('let facturaIA=null;', 'function abrirRevisionFactura(');
  const ctx = vm.createContext({remito:[], remitoHeader:{}, productosFacturaPendientes:[], JSON});
  vm.runInContext(`${codigo}; this.api={copiaFactura,restaurarFactura,huellaFactura,pasosFacturaIA,get remito(){return remito;}};`, ctx);
  vm.runInContext(`remito=[{prodId:'a',cant:1}];remitoHeader={proveedor:'X'};`, ctx);
  const copia = ctx.api.copiaFactura();
  vm.runInContext(`remito.push({prodId:'b',cant:2});`, ctx);
  ctx.api.restaurarFactura(copia);
  vm.runInContext(`remito.push({prodId:'c',cant:3});`, ctx);
  assert.equal(copia.remito.length, 1, 'la copia guardada no debe cambiar al editar después de volver');
  assert.equal(ctx.api.remito.length, 2);
  assert.match(ctx.api.pasosFacturaIA('cargar'), /class="active" aria-current="step">3 · Confirmar carga/);
});
