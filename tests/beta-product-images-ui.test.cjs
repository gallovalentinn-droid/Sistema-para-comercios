const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const artifactPath = path.resolve(__dirname, '../beta/index.html');
const serviceWorkerPath = path.resolve(__dirname, '../beta/sw.js');
const html = () => fs.readFileSync(artifactPath, 'utf8');

test('el cache offline corresponde a la identidad de build del HTML', () => {
  const serviceWorker = fs.readFileSync(serviceWorkerPath, 'utf8');
  const identity = html().match(/const MICOMERCIO_BUILD=Object\.freeze\((\{[\s\S]*?\})\);/);
  assert.ok(identity, 'falta la identidad del build');
  const build = vm.runInNewContext(`(${identity[1]})`);
  const cache = serviceWorker.match(/const CACHE='([^']+)'/);
  assert.ok(cache, 'falta la identidad del cache');
  assert.equal(cache[1], `micomercio-beta-${build.version}-rev${build.packageRevision}`);
});

function sliceBetween(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `no se encontró ${start}`);
  assert.ok(to > from, `no se encontró ${end} después de ${start}`);
  return source.slice(from, to);
}

function makeStorage(signedUrl = 'https://storage.example/sign/product-images/comercio/p1.jpg?token=temporal') {
  const calls = [];
  return {
    calls,
    client: {
    storage: {
      from(bucket) {
        assert.equal(bucket, 'product-images');
        return {
          async createSignedUrls(filePaths, expiresIn) {
            calls.push({ filePaths, expiresIn });
            return {
              data: filePaths.map((filePath) => ({
                path: filePath,
                signedUrl: signedUrl.replace('comercio/p1.jpg', filePath),
              })),
              error: null,
            };
          },
        };
      },
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
  const storage = makeStorage();
  const context = {
    sb: storage.client,
    __storageCalls: storage.calls,
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

test('la miniatura usa una URL firmada en memoria y no conserva la URL pública anterior', async () => {
  const product = {
    nombre: 'Coca',
    foto: 'https://public.example/object/public/product-images/comercio/p1.jpg',
    fotoPath: 'comercio/p1.jpg',
  };
  const context = loadUi(html());

  assert.doesNotMatch(context.miniFoto(product), /public\.example/);
  assert.equal(await context.f6PrepararFotosProductos([product]), true);
  const result = context.miniFoto(product);

  assert.match(result, /class="thumb product-thumb"/);
  assert.match(result, /src="https:\/\/storage\.example\/sign\/product-images\/comercio\/p1\.jpg\?token=temporal"/);
  assert.match(result, /alt="Foto de Coca"/);
  assert.match(result, /loading="lazy"/);
  assert.equal(product.foto, 'https://public.example/object/public/product-images/comercio/p1.jpg');
  assert.deepEqual(JSON.parse(JSON.stringify(context.__storageCalls)), [{
    filePaths: ['comercio/p1.jpg'],
    expiresIn: 3600,
  }]);
});

test('Productos y Para pedir renderizan la misma foto firmada', async () => {
  const source = html();
  const productTable = sliceBetween(source, 'function tablaProductos(){', '\nfunction formProducto(');
  const replenishTable = sliceBetween(source, 'function tablaRep(l){', '\n/* ── armador de pedido ── */');
  const common = `
    const producto = {
      id:'p1', nombre:'Coca Cola', fotoPath:'comercio/p1.jpg', ean:'779', rubro:'Bebidas',
      proveedor:'Distribuidora', costo:100, precio:150, stock:0, stockMin:4, stockDeseado:8,
      unidad:'unidad', origenId:'', porAtado:0, vence:''
    };
    this.producto=producto;
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
  const context = loadUi(source, `${common}\n${productTable}\n${replenishTable}`);
  await context.f6PrepararFotosProductos([context.producto]);
  vm.runInContext('tablaProductos();this.productos=target.innerHTML;this.reponer=tablaRep([producto]);', context);

  assert.match(context.productos, /class="product-cell"/);
  assert.match(context.productos, /src="https:\/\/storage\.example\/sign\/product-images\/comercio\/p1\.jpg\?token=temporal"/);
  assert.match(context.reponer, /class="product-cell"/);
  assert.match(context.reponer, /src="https:\/\/storage\.example\/sign\/product-images\/comercio\/p1\.jpg\?token=temporal"/);
});

test('la resolución agrupa rutas, evita duplicados y reutiliza la URL firmada', async () => {
  const context = loadUi(html());
  const productos = [
    { nombre: 'A', fotoPath: 'comercio/p1.jpg' },
    { nombre: 'A repetido', fotoPath: 'comercio/p1.jpg' },
    { nombre: 'Sin foto', fotoPath: '' },
  ];

  assert.equal(await context.f6PrepararFotosProductos(productos), true);
  assert.equal(await context.f6PrepararFotosProductos(productos), false);
  assert.equal(context.__storageCalls.length, 1);
  assert.deepEqual(Array.from(context.__storageCalls[0].filePaths), ['comercio/p1.jpg']);
});

test('el cliente publicado elimina getPublicUrl y usa firmas temporales', () => {
  const source = html();
  const core = sliceBetween(
    source,
    '/* F6_PRODUCT_IMAGES_UI_CORE_START */',
    '/* F6_PRODUCT_IMAGES_UI_CORE_END */',
  );
  assert.doesNotMatch(core, /getPublicUrl/u);
  assert.match(core, /createSignedUrls/u);
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

test('las listas operativas muestran la foto compartida del producto', () => {
  const source = html();
  const casos = [
    ['cambio de precios', sliceBetween(source, 'function pintarPreviewPrecios(ov){', '\nfunction aplicarPrecios('), /celdaProductoConFoto\(f\.p,/],
    ['carga de factura', sliceBetween(source, 'function pintarRemito(){', '\nfunction resumenCostos('), /celdaProductoConFoto\(p,/],
    ['búsqueda de stock', sliceBetween(source, 'function resumenStockBusquedaHtml(', '\nfunction verVentasTurno('), /celdaProductoConFoto\(r\.producto,/],
    ['movimientos de stock', sliceBetween(source, 'function pintarMovimientosDia(){', '\nfunction vMovimientos('), /celdaProductoConFoto\(r\.producto,/],
    ['vencimientos', sliceBetween(source, 'function tablaVence(l){', '\nfunction wireVence('), /celdaProductoConFoto\(p,/],
    ['resumen de ventas', sliceBetween(source, 'function pintarDetalleResumen(d){', '\nfunction f6CierresResumenHtml('), /celdaProductoConFoto\(pr,/],
  ];

  casos.forEach(([nombre, bloque, patron]) => {
    assert.match(bloque, patron, `${nombre} debe reutilizar la miniatura del producto`);
  });
});

test('el editor encierra la foto existente sin superponer los campos siguientes', async () => {
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
  `);
  await context.f6PrepararFotosProductos([{ fotoPath: 'comercio/p1.jpg' }]);
  vm.runInContext("formProducto('p1'); this.body=captured.cuerpo;", context);

  assert.match(context.body, /id="f_fotoVista" class="product-photo-preview"/);
  assert.match(context.body, /class="thumb product-thumb product-thumb-editor"/);
  assert.ok(context.body.indexOf('id="f_fotoVista"') < context.body.indexOf('for="f_vence"'));
  assert.match(source, /\.product-thumb-editor img\{[^}]*object-fit/u);
});
