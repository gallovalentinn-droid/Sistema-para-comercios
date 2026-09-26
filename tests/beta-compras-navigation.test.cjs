const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = () => fs.readFileSync(path.join(__dirname, '../beta/index.html'), 'utf8');

function functionSource(html, name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `falta ${name}`);
  const end = html.indexOf('\n}', start);
  assert.ok(end > start, `no termina ${name}`);
  return html.slice(start, end + 2);
}

test('Compras ocupa el lugar de Para pedir en la barra lateral', () => {
  const match = source().match(/const VISTAS=(\[[\s\S]*?\]);\s*\/\/ las que el dueño/);
  assert.ok(match);
  const views = vm.runInNewContext(match[1]);
  assert.equal(views.filter(view => view.id === 'compras').length, 1);
  assert.equal(views.some(view => view.id === 'reponer'), false);
  assert.equal(views.find(view => view.id === 'compras').txt, 'Compras');
  assert.ok(views.findIndex(view => view.id === 'compras') < views.findIndex(view => view.id === 'productos'));
});

test('el contador de productos para pedir no aparece en la barra lateral', () => {
  const html = source();
  const nav = {innerHTML:''};
  const context = {
    db:{productos:[{id:'bajo'}],clientes:[],config:{nombre:'Comercio'}},
    seRepone:()=>true, productosVencimiento:()=>[],
    vistasVisibles:()=>[{id:'compras',txt:'Compras',ic:'reponer'}],
    comprasPermisosActuales:()=>({pedir:true,factura:true}),
    vista:'compras', railColapsado:false,
    $:selector=>selector==='#nav'?nav:{textContent:''},
    $$:()=>[], aplicarColapso:()=>{}, ir:()=>{}, ic:()=>'', esc:value=>value,
  };
  vm.createContext(context);
  vm.runInContext(functionSource(html, 'pintarNav'), context);
  context.pintarNav();
  assert.match(nav.innerHTML, /data-v="compras"/);
  assert.doesNotMatch(nav.innerHTML, /class="tag"/);
});

test('los permisos de Compras separan pedidos de carga de facturas', () => {
  const html = source();
  const context = {};
  vm.createContext(context);
  vm.runInContext([
    functionSource(html, 'f5PermissionsObject'),
    functionSource(html, 'f5ComprasPermisos'),
  ].join('\n'), context);
  const onlyOrders = context.f5ComprasPermisos({rol:'empleado', permisos:{reposicion_ver:true}});
  const onlyInvoices = context.f5ComprasPermisos({rol:'empleado', permisos:{productos_editar:true}});
  const protectedOwner = context.f5ComprasPermisos({rol:'duenio'}, {protegida:true, permisosLocal:{reponer:false,productos:true}});
  assert.deepEqual(JSON.parse(JSON.stringify(onlyOrders)), {pedir:true,factura:false});
  assert.deepEqual(JSON.parse(JSON.stringify(onlyInvoices)), {pedir:false,factura:true});
  assert.deepEqual(JSON.parse(JSON.stringify(protectedOwner)), {pedir:false,factura:true});
});

test('Compras muestra dos pestañas y abre cada método de carga desde Facturas', () => {
  const html = source();
  const calls = [];
  const content = {innerHTML:''};
  const buttons = {};
  const context = {
    db:{productos:[{id:'bajo'}]}, seRepone:()=>true,
    comprasPermisosActuales:()=>({pedir:true,factura:true}),
    vReponer:()=>calls.push('pedir'),
    panelIngreso:(reset,mode)=>calls.push(mode),
    ic:()=>'',
    $:selector=>selector==='#comprasContenido'?content:(buttons[selector] ||= {}),
  };
  vm.createContext(context);
  vm.runInContext(`${html.match(/let comprasTab='[^']+';/)[0]}\n${functionSource(html, 'vCompras')}`, context);
  const main = {innerHTML:''};
  context.vCompras(main);
  assert.match(main.innerHTML, /role="tablist"[^>]*Compras/);
  assert.match(main.innerHTML, /Para pedir/);
  assert.match(main.innerHTML, /Cargar factura/);
  assert.ok(main.innerHTML.indexOf('id="comprasTabFactura"') < main.innerHTML.indexOf('id="comprasTabPedir"'));
  assert.match(main.innerHTML, /id="comprasTabFactura"[^>]*aria-selected="true"/);
  assert.doesNotMatch(main.innerHTML, /class="purchase-tab-count"/);
  assert.match(content.innerHTML, /Leer factura con IA/);
  assert.deepEqual(calls, []);
  buttons['#comprasTabPedir'].onclick();
  assert.deepEqual(calls, ['pedir']);
  assert.match(main.innerHTML, /id="comprasTabPedir"[^>]*aria-selected="true"[^>]*>[^<]*<span class="purchase-tab-count"/);
  assert.match(main.innerHTML, /class="purchase-tab-count"[^>]*>1<\/span>/);
  buttons['#comprasTabFactura'].onclick();
  assert.doesNotMatch(main.innerHTML, /class="purchase-tab-count"/);
  assert.match(content.innerHTML, /Leer factura con IA/);
  assert.match(content.innerHTML, /Cargar a mano/);
  buttons['#comprasIA'].onclick();
  buttons['#comprasManual'].onclick();
  assert.deepEqual(calls, ['pedir','ia','manual']);
});

test('un empleado que sólo puede cargar productos no ve la lista de pedidos', () => {
  const html = source();
  const content = {innerHTML:''};
  const buttons = {};
  const context = {
    comprasTab:'pedir',
    comprasPermisosActuales:()=>({pedir:false,factura:true}),
    vReponer:()=>{throw new Error('No debe abrir Para pedir');},
    panelIngreso:()=>{}, ic:()=>'',
    $:selector=>selector==='#comprasContenido'?content:(buttons[selector] ||= {}),
  };
  vm.createContext(context);
  vm.runInContext(functionSource(html, 'vCompras'), context);
  const main = {innerHTML:''};
  context.vCompras(main);
  assert.doesNotMatch(main.innerHTML, /id="comprasTabPedir"/);
  assert.match(main.innerHTML, /id="comprasTabFactura"/);
  assert.match(content.innerHTML, /Cargar a mano/);
});

test('la carga manual abre los campos directamente y la lectura IA abre la foto', () => {
  const html = source();
  let captured;
  const context = {
    remito:[], remitoHeader:{proveedor:'',nroComprobante:'',total:''},
    ic:()=>'', esc:value=>String(value||''),
    modal:options=>{captured=options;},
  };
  vm.createContext(context);
  vm.runInContext(functionSource(html, 'panelIngreso'), context);
  context.panelIngreso(true, 'manual');
  assert.match(captured.cuerpo, /id="facManualContent"/);
  assert.doesNotMatch(captured.cuerpo, /id="facFotoLabel"/);
  assert.doesNotMatch(captured.cuerpo, /id="facManualContent" hidden/);
  context.panelIngreso(true, 'ia');
  assert.match(captured.cuerpo, /id="facFotoLabel"/);
  assert.match(captured.cuerpo, /id="facManualContent" hidden/);
});

test('revisar una factura con un producto nuevo no cambia el catálogo hasta confirmar', () => {
  const html = source();
  let captured;
  const button = {};
  const context = {
    db:{productos:[]}, remito:[], productosFacturaPendientes:[],
    remitoHeader:{proveedor:'',nroComprobante:'',total:''},
    coincidenciaProducto:()=>null, numFactura:value=>Number(value)||0,
    detectarBulto:()=>1, $m:value=>String(value),
    modal:options=>{captured=options;},
    pintarRevision:()=>{}, $:selector=>selector==='#okRev'?button:null,
    uid:()=> 'new-1', recomputeLinea:()=>{},
    cerrarModal:()=>{}, panelIngreso:()=>{}, aviso:()=>{},
  };
  vm.createContext(context);
  vm.runInContext(functionSource(html, 'abrirRevisionFactura'), context);
  context.abrirRevisionFactura({items:[{producto:'Nuevo artículo',cantidad:2,precioUnit:500}], proveedor:'Proveedor'});
  vm.runInContext(`revisionFactura[0].prodId='__nuevo__'`, context);
  captured.alAbrir({});
  button.onclick();
  assert.equal(context.db.productos.length, 0);
  assert.equal(context.productosFacturaPendientes.length, 1);
  assert.equal(context.remito.length, 1);
  assert.equal(context.remito[0].prodId, 'new-1');
});

test('confirmar la factura agrega el producto nuevo una sola vez con su stock', () => {
  const html = source();
  const nuevo = {id:'new-1',nombre:'Nuevo artículo',stock:0,costo:500,precio:0};
  const nodes = new Map();
  const node = selector => {
    if(selector==='#facFotoLabel'||selector==='#facFoto'||selector==='#facManualToggle')return null;
    if(!nodes.has(selector))nodes.set(selector,{value:'',classList:{add(){}},focus(){}});
    return nodes.get(selector);
  };
  let captured, saves=0;
  const context = {
    remito:[{prodId:'new-1',cant:2,porBulto:1,costoU:'500',totalL:'1000',descuento:0,precio:''}],
    remitoHeader:{proveedor:'',nroComprobante:'',total:''},
    productosFacturaPendientes:[nuevo], db:{productos:[]},
    ic:()=>'', esc:value=>String(value||''),
    $:node, modal:options=>{captured=options;},
    pintarRemito:()=>{}, productoEnFactura:id=>context.productosFacturaPendientes.find(p=>p.id===id)||context.db.productos.find(p=>p.id===id),
    unidadesLinea:line=>line.cant*line.porBulto,
    costoLinea:line=>Number(line.costoU), num:value=>Number(value)||0,
    numImportacion:value=>({blank:String(value).trim()==='',ok:Number.isFinite(Number(value)),value:Number(value)}),
    movimiento:()=>{}, guardar:()=>{saves++;}, cerrarModal:()=>{}, render:()=>{},
    aviso:()=>{}, resumenCostos:()=>{},
  };
  vm.createContext(context);
  vm.runInContext(`${functionSource(html, 'productoFacturaNuevoSinPrecio')}\n${functionSource(html, 'panelIngreso')}`, context);
  context.panelIngreso(false, 'manual');
  captured.alAbrir({});
  nodes.get('#okIng').onclick();
  assert.equal(context.db.productos.length, 0);
  assert.equal(saves, 0);
  context.remito[0].precio='900';
  nodes.get('#okIng').onclick();
  assert.equal(context.db.productos.length, 1);
  assert.equal(context.db.productos[0].stock, 2);
  assert.equal(context.db.productos[0].precio, 900);
  assert.equal(saves, 1);
});
