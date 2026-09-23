const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const artifactPath = path.resolve(__dirname, '../beta/index.html');
const source = fs.readFileSync(artifactPath, 'utf8');

function sliceBetween(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `no se encontró ${start}`);
  assert.ok(to > from, `no se encontró ${end} después de ${start}`);
  return source.slice(from, to);
}

function renderProducts(products) {
  const target = { innerHTML: '' };
  const context = {
    db: { productos: products },
    fProd: { q:'',rubros:[],actividad:'',estado:'activos',incompletos:false },
    selectedProductosRev31: new Set(),
    productoArchivadoRev31: product => !!product.archivadoAt,
    listaFiltrada: () => products,
    $: selector => selector === '#tabProd' ? target : null,
    $$: () => [],
    esc: value => String(value ?? ''),
    ic: () => '',
    wireProductosVacio: () => {},
    celdaProductoConFoto: (_product, content) => content,
    esSuelto: () => false,
    alertaVence: () => false,
    estaVencido: () => false,
    textoVence: () => '',
    bajo: product => product.stock <= product.stockMin,
    atadoDe: () => null,
    porAtado: () => 0,
    fFecha: value => value,
    fmtCant: (_product, value) => String(value),
    deseado: product => product.stockDeseado,
    $m: value => '$' + Number(value).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  };
  vm.createContext(context);
  vm.runInContext(sliceBetween('function tablaProductos(){', '\nfunction formProducto('), context);
  vm.runInContext('tablaProductos()', context);
  return target.innerHTML;
}

test('Costo, Venta, Margen y Stock usan alineación derecha y cifras tabulares', () => {
  const css = source.match(/<style>([\s\S]*?)<\/style>/)[1];
  const table = sliceBetween('function tablaProductos(){', '\nfunction formProducto(');

  assert.match(css, /#tabProd \.product-number\{[^}]*text-align:right[^}]*font-variant-numeric:tabular-nums/);
  for (const [label, className] of [['Costo','cost'], ['Venta','sale'], ['Margen','margin'], ['Stock','stock']]) {
    assert.match(table, new RegExp(`<th class="product-number product-${className}">${label}<\\/th>`));
  }
});

test('la tabla distingue costo faltante, venta principal y margen calculado', () => {
  const rendered = renderProducts([
    { id:'p0', nombre:'Sin costo', ean:'', rubro:'', proveedor:'', costo:0, precio:3300, stock:0, stockMin:4, stockDeseado:8, unidad:'unidad', vence:'' },
    { id:'p1', nombre:'Con costo', ean:'', rubro:'', proveedor:'', costo:2900, precio:4400, stock:6, stockMin:4, stockDeseado:8, unidad:'unidad', vence:'' }
  ]);

  assert.match(rendered, /data-label="Costo" class="[^"]*product-cost[^"]*">—<\/td>/);
  assert.match(rendered, /data-label="Costo" class="[^"]*product-cost[^"]*">\$2\.900,00<\/td>/);
  assert.match(rendered, /data-label="Venta" class="[^"]*product-sale[^"]*">\$3\.300,00<\/td>/);
  assert.match(rendered, /data-label="Margen" class="[^"]*product-value[^"]*">52%<\/td>/);
});

test('el stock sólo usa alerta roja cuando está en cero o negativo', () => {
  const rendered = renderProducts([
    { id:'p0', nombre:'Agotado', ean:'', rubro:'', proveedor:'', costo:1, precio:2, stock:0, stockMin:4, stockDeseado:8, unidad:'unidad', vence:'' },
    { id:'p1', nombre:'Disponible', ean:'', rubro:'', proveedor:'', costo:1, precio:2, stock:6, stockMin:8, stockDeseado:12, unidad:'unidad', vence:'' }
  ]);

  assert.match(rendered, /product-stock[^>]*><span class="pill bad num">0<\/span>/);
  assert.match(rendered, /product-stock[^>]*><span class="pill mute num">6<\/span>/);
  assert.doesNotMatch(rendered, /product-stock[^>]*><span class="pill warn num">6<\/span>/);
});
