// Manual browser regression fixture. Run: node tests/notebook-preview.cjs
// Uses the beta's actual CSS and renderers with synthetic data; no backend calls.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const sourcePath = path.join(__dirname, '../beta/index.html');
function page() {
  const source = fs.readFileSync(sourcePath, 'utf8');
  function between(start, end) {
    const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
    if (from < 0 || to < 0) throw new Error(`Missing renderer: ${start}`);
    return source.slice(from, to);
  }
  function fn(name) {
    const from = source.indexOf(`function ${name}(`);
    return source.slice(from, source.indexOf('\n}', from) + 2);
  }
  const nodes = new Map();
  const makeNode = () => ({
    innerHTML:'', textContent:'', hidden:false, onclick:null,
    setAttribute(){}, focus(){}, querySelector(){return null;},
    classList:{add(){},remove(){},toggle(){}}, style:{}
  });
  const sampleNames = ['7UP 2L', 'Aceite de Girasol Cocinero 900ml', 'Acondicionador Sedal Brillo Ceramidas 10ml'];
  const sampleNumbers = [
    { costo:0, precio:3300, stock:0 },
    { costo:2900, precio:4400, stock:6 },
    { costo:1100, precio:2000, stock:12 }
  ];
  const products = Array.from({length:18}, (_, i) => ({
    nombre: sampleNames[i%sampleNames.length]+(i>=sampleNames.length?` ${i+1}`:''),
    id: `p${i}`, ean: '7791234567890', rubro: 'Higiene Personal', proveedor: 'Proveedor de ejemplo',
    ...sampleNumbers[i%sampleNumbers.length], stockMin: 4, stockDeseado: 12, unidad: 'unidad', fotoPath: '', vence: ''
  }));
  let capturedModal;
  const context = {
    db: { productos: products, config: {}, cierres: [{ id:'c1', hasta:'15/09/26 12:16', cantVentas:1, total:1300, contadoGeneral:1300, diferenciaGeneral:0, contadoCigarros:0, diferenciaCigarros:0, nota:'Turno de ejemplo' }] },
    fProd:{q:'',rubro:'',orden:'nombre'}, pedido:{}, repOrden:'rubro',
    document:{addEventListener(){},body:{contains:()=>true}},
    $: (s) => { if (!nodes.has(s)) nodes.set(s,makeNode()); return nodes.get(s); }, $$:()=>[],
    esc: v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
    listaFiltrada:()=>products, esSuelto:()=>false, alertaVence:()=>false, bajo:()=>true,
    rubros:()=>['Higiene Personal'], opcionesRubroProducto:()=>['Higiene Personal'], proveedores:()=>[],
    fmtCant:(_p,n)=>String(n), deseado:p=>p.stockDeseado, faltante:p=>p.stockDeseado-p.stock,
    $m:n=>'$'+Number(n).toLocaleString('es-AR',{minimumFractionDigits:2}), fFH:v=>v,
    nfM:{format:String}, num:n=>Number(n)||0,
    normalizarBusqueda:v=>String(v||'').toLowerCase(), modal:options=>{capturedModal=options;}
  };
  vm.createContext(context);
  const ventas=[{id:'v1',nro:123,fecha:'12:16',forma:'fiado',clienteId:'cliente1',total:1900,items:[{prodId:'p1',cant:1,nombre:products[1].nombre}]}];
  Object.assign(context,{
    f3Estado:{session:{id:'s1',estado:'abierta'}},f5SesionIds:()=>({effectiveId:'s1'}),f3Activo:()=>true,
    turnoActual:()=>({desde:'15/09/26 09:00',ventas,ventasTodas:ventas,total:1900,costo:1250,porForma:{efectivo:0,transferencia:0,tarjeta:0,fiado:1900},cigTotal:0,genEfectivo:0,cigEfectivo:0,cobEfectivo:0,egrGeneral:100,egrCigarros:0,egrOtros:0,egresos:[{id:'e1',fecha:'12:00',motivo:'Pago a proveedor de ejemplo',forma:'efectivo',caja:'cigarrillos',monto:100}]}),
    FORMAS:{efectivo:'Efectivo',transferencia:'Transferencia',tarjeta:'Tarjeta'},busCajaTurno:'',
    enlazarCierresAnteriores:()=>{},fHora:v=>v,formaKey:v=>v,detalleForma:()=> 'Fiado',
    cli:()=>({nombre:'María del Carmen Rodríguez'}),prod:()=>products[0],
    pintarVentasCajaActual:()=>{context.$('#ventasCajaTurno').innerHTML=context.tablaVentasBusqueda(ventas,{permitirAnular:true});},
    filtrosMovimientos:{q:'',rubro:''},
    datosMovimientosDia:()=>({
      total:products.map((producto,i)=>({producto,inicio:10+i,vendidas:2,otros:i?0:1,final:9+i,llegadasTardias:0})),
      filtrados:products.map((producto,i)=>({producto,inicio:10+i,vendidas:2,otros:i?0:1,final:9+i,llegadasTardias:0}))
    })
  });
  vm.runInContext([
    between('const ICONS={','\n\n\nconst $='),
    between('/* F6_PRODUCT_IMAGES_UI_CORE_START */','/* F6_PRODUCT_IMAGES_UI_CORE_END */'),
    between('function cerrarMenuProductos(','\nfunction listaFiltrada'),
    between('function tablaProductos(){','\nfunction formProducto('),
    between('function formProducto(id,pre={},luego){','\n/* ═══════════════════════════════════════════════'),
    between('let remito=[];','\nfunction addRemito('),
    between('function tablaRep(l){','\n/* ── armador de pedido ── */'),
    between('function pintarMovimientosDia(){','\nfunction vMovimientos('),
    fn('htmlCierresAnteriores'), fn('vCaja'), fn('detalleVentaTexto'), fn('tablaVentasBusqueda'), fn('f33Css'), fn('f34Css')
  ].join('\n'),context);
  const productMain={innerHTML:''}; context.vProductos(productMain); context.formProducto();
  const productForm=capturedModal;
  const productsHtml=productMain.innerHTML.replace(/<div id="tabProd"[^>]*>/,tag=>tag+nodes.get('#tabProd').innerHTML);
  const productsMenuHtml=productsHtml
    .replace('aria-expanded="false"','aria-expanded="true"')
    .replace('id="menuProductos" role="menu" hidden','id="menuProductos" role="menu"');
  context.db.productos=[];nodes.set('#tabProd',makeNode());
  const emptyMain={innerHTML:''};context.vProductos(emptyMain);
  const emptyHtml=emptyMain.innerHTML.replace(/<div id="tabProd"[^>]*>/,tag=>tag+nodes.get('#tabProd').innerHTML);
  context.db.productos=products;context.panelIngreso();const invoiceForm=capturedModal;
  const css=source.match(/<style>([\s\S]*?)<\/style>/)[1]+context.f33Css()+context.f34Css();
  const activeMain={innerHTML:''};context.vCaja(activeMain);
  const activeHtml=activeMain.innerHTML.replace(/<div id="ventasCajaTurno"[^>]*>/,tag=>tag+nodes.get('#ventasCajaTurno').innerHTML);
  context.pintarMovimientosDia();
  const movimientosHtml='<h1>Movimientos de stock</h1><div class="card"><div class="card-h"><h2>Detalle del día</h2><span class="pill mute">'+nodes.get('#cuentaMovimientos').textContent+'</span></div>'+nodes.get('#tablaMovimientos').innerHTML+'</div>';
  const views={productos:productsHtml,menu:productsMenuHtml,vacio:emptyHtml,caja:'<h1>Caja</h1>'+context.htmlCierresAnteriores(),activa:activeHtml,pedir:'<h1>Para pedir</h1><div class="card">'+context.tablaRep(products)+'</div>',movimientos:movimientosHtml};
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prueba visual de notebooks</title>
    <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet"><style>${css}</style>
    <div class="app"><aside class="rail"><div class="brand">Prueba visual</div><nav class="nav"><button data-view="productos">Productos</button><button data-view="menu">Menú abierto</button><button data-view="vacio">Catálogo vacío</button><button id="invoice">Cargar factura</button><button data-view="caja">Caja</button><button data-view="activa">Caja abierta</button><button data-view="pedir">Para pedir</button><button data-view="movimientos">Movimientos de stock</button><button id="collapse">Contraer / expandir</button><button id="form">Nuevo producto</button><button id="check">Comprobar diseño</button></nav><output id="result" style="padding:12px;font-size:12px;overflow-wrap:anywhere"></output></aside><main class="main"></main></div>
    <button id="f33-status">Licencia activa</button>
    <script>const views=${JSON.stringify(views)}, form=${JSON.stringify(productForm)}, invoice=${JSON.stringify(invoiceForm)};
    if(new URLSearchParams(location.search).has('fullscreen')) document.documentElement.classList.add('modo-pantalla-completa');
    const main=document.querySelector('main'); main.innerHTML=views.productos;
    document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{main.innerHTML=views[b.dataset.view]});
    document.querySelector('#collapse').onclick=()=>document.querySelector('.app').classList.toggle('colapsado');
    document.querySelector('#form').onclick=()=>{const ov=document.createElement('div');ov.className='ov';ov.innerHTML='<div class="mod wide"><div class="mod-h"><h3>'+form.titulo+'</h3><button id="close">Cerrar</button></div><div class="mod-b">'+form.cuerpo+'</div><div class="mod-f"><button class="btn">Guardar</button></div></div>';document.body.append(ov);ov.querySelector('#close').onclick=()=>ov.remove();};
    document.querySelector('#invoice').onclick=()=>{const ov=document.createElement('div');ov.className='ov';ov.innerHTML='<div class="mod invoice-modal"><div class="mod-h"><h3>'+invoice.titulo+'</h3><button id="closeInvoice">Cerrar</button></div><div class="mod-b">'+invoice.cuerpo+'</div><div class="mod-f">'+invoice.pie+'</div></div>';document.body.append(ov);ov.querySelector('#closeInvoice').onclick=()=>ov.remove();const toggle=ov.querySelector('#facManualToggle'),content=ov.querySelector('#facManualContent');toggle.onclick=()=>{content.hidden=!content.hidden;toggle.setAttribute('aria-expanded',String(!content.hidden));};};
    document.querySelector('#check').onclick=()=>{
      const failures=[]; if(document.documentElement.scrollWidth>document.documentElement.clientWidth+1) failures.push('La página desborda');
      if(main.innerHTML===views.productos&&!main.querySelector('table')) failures.push('Falta la tabla de prueba');
      if([...main.querySelectorAll('.pos table')].some(e=>!e.closest('.table-scroll')&&e.getBoundingClientRect().right>e.closest('.card').getBoundingClientRect().right+1)) failures.push('Tabla invade Caja general');
      if(innerWidth>760) {
        if([...main.querySelectorAll('.product-cell-copy')].some(e=>e.textContent.length>30&&e.getBoundingClientRect().width<160)) failures.push('Nombres demasiado estrechos');
        if([...main.querySelectorAll('.rep-table th')].some(e=>e.scrollWidth>e.clientWidth+1)) failures.push('Encabezados de pedido superpuestos');
      }
      document.querySelector('#result').textContent=failures.length?'FALLA: '+failures.join(' · '):'OK: página contenida y textos legibles';
    };</script></html>`;
}
const previewPort=Number(process.env.MICOMERCIO_PREVIEW_PORT)||4175;
http.createServer((req,res)=>{
  try {res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(page());}
  catch(e) {res.writeHead(500);res.end(e.stack);}
}).listen(previewPort,'127.0.0.1',()=>console.log(`Notebook fixture: http://127.0.0.1:${previewPort}`));
