const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const test=require('node:test');
const vm=require('node:vm');

const html=readFileSync(require('node:path').join(__dirname,'../beta/index.html'),'utf8');
const block=(from,to)=>html.slice(html.indexOf(from),html.indexOf(to));

test('buscar helado ofrece los tamaños directos antes de peso libre, incluso con un solo resultado',()=>{
  const helado={id:'h',nombre:'Helado',unidad:'kg',precio:22000,stock:3,
    preciosPorPeso:[{nombre:'Helado de cuarto',gramos:250,precio:8000},
      {nombre:'Helado de kilo',gramos:1000,precio:22000}]};
  const ctx=vm.createContext({db:{productos:[helado]},productoArchivadoRev31:()=>false});
  vm.runInContext([
    block('function normalizarBusqueda(', 'function productoCoincideFiltro('),
    block('function nombrePresentacionPeso(', 'function agregarAlTicket('),
    "this.resultados=buscarProductosVenta('helado');this.primero=buscarProductosVenta('helado',1);"
  ].join('\n'),ctx);
  assert.deepEqual(Array.from(ctx.resultados,r=>r.presentacion?.gramos||'libre'),[250,1000,'libre']);
  assert.equal(ctx.primero[0].presentacion?.gramos,250);
});

test('ocho tamaños no ocultan peso libre y el tamaño omitido sigue encontrándose por nombre',()=>{
  const helado={id:'h',nombre:'Helado',unidad:'kg',precio:22000,stock:10,
    preciosPorPeso:[100,125,150,200,250,500,750,1000].map(gramos=>({nombre:'Helado tamaño '+gramos,gramos,precio:8000}))};
  const ctx=vm.createContext({db:{productos:[helado]},productoArchivadoRev31:()=>false});
  vm.runInContext([
    block('function normalizarBusqueda(', 'function productoCoincideFiltro('),
    block('function nombrePresentacionPeso(', 'function agregarAlTicket('),
    "this.resultados=buscarProductosVenta('helado');this.libre=buscarProductosVenta('helado peso libre');this.ultimo=buscarProductosVenta('helado tamaño 1000');this.ambiguos=buscarProductosVenta('helado',2);"
  ].join('\n'),ctx);
  assert.equal(ctx.resultados.length,8);
  assert.equal(ctx.resultados[7].presentacion,undefined);
  assert.equal(ctx.libre.length,1);
  assert.equal(ctx.libre[0].presentacion,undefined);
  assert.equal(ctx.ultimo[0].presentacion.gramos,1000);
  assert.equal(ctx.ambiguos.length,2);
});

test('un tamaño que dejó de estar disponible avisa y no cambia el ticket',()=>{
  const mensajes=[];
  const ctx=vm.createContext({
    prod:id=>id==='helado'?{id,unidad:'kg',preciosPorPeso:[]}:undefined,
    productoArchivadoRev31:()=>false,
    aviso:(...args)=>mensajes.push(args),
    agregarAlTicket:()=>assert.fail('Se agregó un tamaño que ya no existe'),
    seleccionarProducto:()=>assert.fail('Se cambió a venta por peso libre')
  });
  vm.runInContext(block('function elegirResultado(', 'function codigoDesconocido(')+
    "elegirResultado('producto','helado',250); elegirResultado('producto','borrado',250);",ctx);
  assert.deepEqual(mensajes,Array(2).fill(['Este tamaño ya no está disponible.','bad']));
});

test('cuartos de helado conservan su precio al venderse junto con kilos y peso libre',()=>{
  const helado={id:'helado',nombre:'Helado',unidad:'kg',precio:22000,stock:2.5,
    preciosPorPeso:[{gramos:250,precio:8000}]};
  let siguienteId=0;
  const avisos=[];
  const ctx=vm.createContext({
    helado,ticket:[],uid:()=>String(++siguienteId),
    pintarPOS(){},mostrarFeedbackProducto(){},fmtCant:(_,n)=>String(n),aviso:m=>avisos.push(m)
  });
  vm.runInContext([
    block('function nombrePresentacionPeso(', 'function buscarProductosVenta('),
    block('function agregarAlTicket(', 'function comboStockDisponible('),
    block('function pedirPeso(', '/* descuento de la venta:'),
    'agregarAlTicket(helado,0.25,helado.preciosPorPeso[0]); agregarAlTicket(helado,1);',
    'agregarAlTicket(helado,0.25,helado.preciosPorPeso[0]); agregarAlTicket(helado,0.3);',
    'agregarAlTicket(helado,0.25);',
    'this.total=subtotalTicket();'
  ].join('\n'),ctx);
  assert.equal(ctx.total,50100);
  assert.equal(ctx.ticket.length,2);
  assert.equal(ctx.ticket[0].cant,0.5);
  assert.equal(ctx.ticket[1].cant,1.55);
  assert.ok(ctx.ticket.every(linea=>linea.prodId===helado.id));
  assert.equal(avisos.length,0);

  vm.runInContext('agregarAlTicket(helado,1);',ctx);
  assert.equal(avisos.length,1);
});

test('la búsqueda de caja agrega el cuarto como producto directo y contabiliza cada envase',()=>{
  const helado={id:'helado',nombre:'Helado',unidad:'kg',precio:22000,costo:11000,stock:3,
    preciosPorPeso:[{gramos:250,precio:8000,nombre:'Helado de cuarto',costoEnvase:700},
      {gramos:1000,precio:22000,nombre:'Helado de kilo',costoEnvase:1150}]};
  const alfajor={id:'alfajor',nombre:'Alfajor',unidad:'unidad',precio:1500,costo:500,stock:10};
  let lineId=0;
  const ctx=vm.createContext({
    db:{productos:[helado,alfajor]},ticket:[],uid:()=>String(++lineId),
    prod:id=>[helado,alfajor].find(p=>p.id===id),
    productoArchivadoRev31:p=>!!p.archivadoAt,promoParaProducto:()=>0,
    seleccionarProducto:p=>vm.runInContext('agregarAlTicket(db.productos[1])',ctx),
    pintarPOS(){},mostrarFeedbackProducto(){},aviso(){}
  });
  vm.runInContext([
    block('function normalizarBusqueda(', 'function productoCoincideFiltro('),
    block('function buscarProductos(', 'function comboStockDisponible('),
    block('function elegirResultado(', 'function codigoDesconocido('),
    block('function buildVentaItem(', '// Asigna el neto real por línea.'),
    `const cuarto=buscarProductosVenta('1 / 4 helado')[0];
     elegirResultado('producto',cuarto.producto.id,cuarto.presentacion?.gramos);
     elegirResultado('producto',cuarto.producto.id,cuarto.presentacion?.gramos);
     const kilo=buscarProductosVenta('helado de kilo')[0];
     elegirResultado('producto',kilo.producto.id,kilo.presentacion?.gramos);
     const alfajor=buscarProductosVenta('alfajor')[0];
     elegirResultado('producto',alfajor.producto.id);
     this.lineas=ticket.map(buildVentaItem);
     this.coincidencias=buscarProductosVenta('helado').length;`
  ].join('\n'),ctx);
  assert.equal(ctx.coincidencias,3);
  assert.deepEqual(Array.from(ctx.lineas,i=>[i.nombre,i.prodId,i.cant,i.precio*i.cant,i.costo*i.cant]),[
    ['Helado de cuarto','helado',0.5,16000,6900],
    ['Helado de kilo','helado',1,22000,12150],
    ['Alfajor','alfajor',1,1500,500]
  ]);
});
