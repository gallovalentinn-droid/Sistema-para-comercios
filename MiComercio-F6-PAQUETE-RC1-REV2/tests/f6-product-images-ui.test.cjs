const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const artifactPath = path.resolve(__dirname, '../entregables/MiComercio-F6-PRUEBA.html');
const html = () => fs.readFileSync(artifactPath, 'utf8');

function sliceBetween(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `no se encontró ${start}`);
  assert.ok(to > from, `no se encontró ${end} después de ${start}`);
  return source.slice(from, to);
}

function makeStorage(publicUrl = 'https://cdn.example/product-images/comercio/p1.jpg') {
  return {
    storage: {
      from(bucket) {
        assert.equal(bucket, 'product-images');
        return {
          getPublicUrl(filePath) {
            assert.equal(filePath, 'comercio/p1.jpg');
            return { data: { publicUrl } };
          },
        };
      },
    },
  };
}

function loadUi(source, extra = '') {
  const core = sliceBetween(
    source,
    '/* F6_PRODUCT_IMAGES_UI_CORE_START */',
    '/* F6_PRODUCT_IMAGES_UI_CORE_END */',
  );
  const context = {
    sb: makeStorage(),
    esc: (value) => String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;'),
  };
  vm.createContext(context);
  vm.runInContext(`${core}\n${extra}`, context, { filename: artifactPath });
  return context;
}

test('la miniatura recupera la foto persistida y conserva un tamaño controlado', () => {
  const context = loadUi(html(), 'this.result = miniFoto({ nombre: "Coca", fotoPath: "comercio/p1.jpg" });');

  assert.match(context.result, /class="thumb product-thumb"/);
  assert.match(context.result, /src="https:\/\/cdn\.example\/product-images\/comercio\/p1\.jpg"/);
  assert.match(context.result, /alt="Foto de Coca"/);
  assert.match(context.result, /loading="lazy"/);
});

test('Productos y Para pedir renderizan la misma foto guardada', () => {
  const source = html();
  const productTable = sliceBetween(source, 'function tablaProductos(){', '\nfunction formProducto(');
  const replenishTable = sliceBetween(source, 'function tablaRep(l){', '\n/* ── armador de pedido ── */');
  const common = `
    const producto = {
      id:'p1', nombre:'Coca Cola', fotoPath:'comercio/p1.jpg', ean:'779', rubro:'Bebidas',
      proveedor:'Distribuidora', costo:100, precio:150, stock:0, stockMin:4, stockDeseado:8,
      unidad:'unidad', origenId:'', porAtado:0, vence:''
    };
    const db={productos:[producto]};
    const fProd={q:'',rubro:'',orden:'nombre'};
    const pedido={}; let repOrden='rubro';
    const target={innerHTML:''};
    const $=()=>target, $$=()=>[];
    const listaFiltrada=()=>[producto], esSuelto=()=>false, alertaVence=()=>false;
    const estaVencido=()=>false, textoVence=()=>'', fFecha=()=>'', atadoDe=()=>null;
    const bajo=()=>true, fmtCant=(_p,n)=>String(n), deseado=p=>p.stockDeseado;
    const faltante=p=>p.stockDeseado-p.stock, $m=n=>'$'+Number(n).toFixed(2);
    const ic=()=>'';
    const formAbrirAtado=()=>{}, formProducto=()=>{}, formAjuste=()=>{}, verHistorial=()=>{};
  `;
  const context = loadUi(source, `${common}\n${productTable}\n${replenishTable}\ntablaProductos();this.productos=target.innerHTML;this.reponer=tablaRep([producto]);`);

  assert.match(context.productos, /class="product-cell"/);
  assert.match(context.productos, /src="https:\/\/cdn\.example\/product-images\/comercio\/p1\.jpg"/);
  assert.match(context.reponer, /class="product-cell"/);
  assert.match(context.reponer, /src="https:\/\/cdn\.example\/product-images\/comercio\/p1\.jpg"/);
});

test('todos los grupos de Para pedir reciben una grilla fija compartida', () => {
  const source = html();
  const replenishTable = sliceBetween(source, 'function tablaRep(l){', '\n/* ── armador de pedido ── */');
  const context = loadUi(source, `
    let repOrden='rubro'; const pedido={};
    const fmtCant=(_p,n)=>String(n), deseado=p=>p.stockDeseado, faltante=p=>p.stockDeseado-p.stock;
    const $m=n=>'$'+Number(n).toFixed(2);
    ${replenishTable}
    this.short=tablaRep([{id:'p1',nombre:'A',fotoPath:'',proveedor:'P',rubro:'R',stock:0,stockMin:1,stockDeseado:2,unidad:'unidad',costo:1}]);
    this.long=tablaRep([{id:'p1',nombre:'Un nombre de producto extremadamente largo',fotoPath:'comercio/p1.jpg',proveedor:'Proveedor con nombre largo',rubro:'R',stock:0,stockMin:1,stockDeseado:2,unidad:'unidad',costo:1}]);
  `);

  const colgroup = /<colgroup>[\s\S]*?<\/colgroup>/;
  assert.equal(context.short.match(colgroup)?.[0], context.long.match(colgroup)?.[0]);
  assert.match(context.short, /class="mtable rep-table"/);
  assert.match(source, /\.rep-table\{table-layout:fixed\}/);
});

test('el editor encierra la foto existente sin superponer los campos siguientes', () => {
  const source = html();
  const productForm = sliceBetween(
    source,
    'function formProducto(id,pre={},luego){',
    '\n/* ═══════════════════════════════════════════════',
  );
  const context = loadUi(source, `
    const producto={id:'p1',nombre:'Coca Cola',fotoPath:'comercio/p1.jpg',ean:'779',rubro:'Bebidas',proveedor:'',costo:1,precio:2,stock:0,stockMin:1,stockDeseado:2,unidad:'unidad',origenId:'',porAtado:0,vence:''};
    const db={productos:[producto],config:{diasAvisoVence:7}};
    const prod=()=>producto, esSuelto=()=>false, rubros=()=>['Bebidas'];
    const opcionesRubroProducto=()=>['Bebidas'], proveedores=()=>[], num=n=>Number(n)||0;
    const normalizarBusqueda=value=>String(value||'').toLowerCase();
    const atadoDe=()=>null, porAtado=()=>0, fFecha=()=>'', ic=()=>'';
    let captured=null; const modal=options=>{captured=options;};
    ${productForm}
    formProducto('p1'); this.body=captured.cuerpo;
  `);

  assert.match(context.body, /id="f_fotoVista" class="product-photo-preview"/);
  assert.match(context.body, /class="thumb product-thumb product-thumb-editor"/);
  assert.ok(context.body.indexOf('id="f_fotoVista"') < context.body.indexOf('for="f_vence"'));
  assert.match(source, /\.product-thumb-editor img\{[^}]*object-fit/u);
});
