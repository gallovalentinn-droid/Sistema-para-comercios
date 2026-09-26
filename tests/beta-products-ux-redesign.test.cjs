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

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `no se encontró ${name}`);
  const end = source.indexOf('\n}', start);
  assert.ok(end > start, `no termina ${name}`);
  return source.slice(start, end + 2);
}

test('el catálogo cargado deja la factura en Compras y agrupa las acciones secundarias', () => {
  const source = html();
  const products = sliceBetween(source, 'function vProductos(m){', '\nfunction listaFiltrada(){');

  assert.match(products, /id="bMasProductos"[^>]*aria-expanded="false"/);
  assert.match(products, /id="menuProductos"[^>]*hidden/);
  assert.match(products, /id="bPrecios"[\s\S]*Cambio masivo de precios/);
  assert.match(products, /id="bImportar"[\s\S]*Importar Excel\/CSV/);
  assert.match(products, /id="bExportarExcel"[\s\S]*Excel/);
  assert.doesNotMatch(products, /id="bExportarCSV"/);
  assert.doesNotMatch(source, /Usá la opción CSV|Probá con CSV/);
  assert.equal((products.match(/role="menuitem"/g)||[]).length, 3);
  assert.match(products, /id="bNuevo"[\s\S]*Nuevo producto/);
  assert.doesNotMatch(products, /id="bIngreso"|Cargar factura/);
  assert.ok(products.indexOf('id="bMasProductos"') < products.indexOf('id="bNuevo"'));
  assert.match(source, /function cerrarMenuProductos\(/);
  assert.match(source, /e\.key==='Escape'/);
});

test('el cambio masivo presenta pasos claros y sólo ofrece precios de venta', () => {
  const source = html();
  const panel = sliceBetween(source, 'function panelPrecios(){', '\nfunction redondearPrecio(');
  assert.match(panel, /Cambio masivo de precios/);
  assert.match(panel, /precio de venta/i);
  assert.match(panel, /Elegí.*productos/);
  assert.match(panel, /Definí.*cambio/);
  assert.match(panel, /Revisá.*resultado/);
  assert.match(panel, /id="px_alcance"/);
  assert.match(panel, /id="px_red"/);
  assert.doesNotMatch(panel, /data-pxc|De costo/);
});

test('aplicar un cambio masivo modifica ventas sin tocar costos', () => {
  const source = html();
  const product = {id:'p1',nombre:'Producto',precio:1000,costo:600};
  let saved = 0, confirmation = '';
  const context = {
    pxConf:{campo:'costo',modo:'aumentar',tipo:'porcentaje',valor:'10',rubro:'',proveedor:'',alcance:'catalogo',sel:{}},
    ultimoCambioPrecios:null,
    productosSeleccionados:()=>[product], nuevoPrecio:value=>value*1.1,
    num:Number, $m:value=>`$${value}`, esc:value=>value,
    confirmar:(title,message,callback)=>{confirmation=message;callback();},
    guardar:()=>saved++, cerrarModal:()=>{}, render:()=>{}, aviso:()=>{},
    movimiento:()=>{throw new Error('No debe registrar un cambio de costo');},
  };
  vm.createContext(context);
  vm.runInContext(`${functionSource(source, 'valorCambioPreciosValido')}\n${functionSource(source, 'aplicarPrecios')}`, context);
  context.aplicarPrecios({});
  assert.equal(product.precio, 1100);
  assert.equal(product.costo, 600);
  assert.equal(saved, 1);
  assert.doesNotMatch(confirmation, /precio de costo/i);
  assert.deepEqual(JSON.parse(JSON.stringify(context.ultimoCambioPrecios.items)), [
    {id:'p1',campo:'precio',anterior:1000,aplicado:1100},
  ]);
});

test('una baja porcentual mayor al límite no permite aplicar el lote', () => {
  const source = html();
  const product = {id:'p1',nombre:'Producto',precio:1000,costo:600};
  const nodes = {'#px_preview':{innerHTML:''},'#px_resumen':{innerHTML:''},'#okPx':{disabled:false}};
  const notices = [];
  const context = {
    pxConf:{campo:'precio',modo:'disminuir',tipo:'porcentaje',valor:'95',sel:{}},
    productosAfectados:()=>[product], nuevoPrecio:()=>50,
    num:Number, $m:value=>`$${value}`, esc:value=>value,
    celdaProductoConFoto:(p,body)=>body,
    $:selector=>nodes[selector], $$:()=>[],
    aviso:message=>notices.push(message),
    confirmar:()=>{throw new Error('No debe confirmar una baja inválida');},
  };
  vm.createContext(context);
  vm.runInContext(`${functionSource(source, 'valorCambioPreciosValido')}\n${functionSource(source, 'pintarPreviewPrecios')}\n${functionSource(source, 'aplicarPrecios')}`, context);
  context.pintarPreviewPrecios({});
  assert.equal(nodes['#okPx'].disabled, true);
  context.aplicarPrecios({});
  assert.deepEqual(notices, ['Ingresá un ajuste válido antes de aplicar']);
});

test('un comercio sin productos recibe importación y carga manual', () => {
  const source = html();
  const products = sliceBetween(source, 'function vProductos(m){', '\nfunction formProducto(');

  assert.match(products, /const catalogoVacio=!db\.productos\.length/);
  assert.match(products, /Todavía no cargaste ningún producto/);
  assert.match(products, /Empecemos cargando tu catálogo/);
  assert.match(products, /Esta pantalla solo se ve así hasta que tengas tu primer producto cargado/);
  assert.match(products, /id="bImportarVacio"/);
  assert.doesNotMatch(products, /id="bIngresoVacio"/);
  assert.match(products, /id="bNuevoVacio"/);
  assert.match(source, /function wireProductosVacio\(/);
});

test('Cargar factura abre primero la foto y mantiene disponible la carga manual', () => {
  const source = html();
  const invoice = sliceBetween(source, "function panelIngreso(reset=true,modo='ia'){", '\nfunction addRemito(');

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
  assert.equal(build.packageRevision, 51);
  assert.match(serviceWorker, /micomercio-beta-6\.0\.0-f6-rc2-rev51/);
});
