const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const test=require('node:test');
const vm=require('node:vm');

const html=readFileSync(require('node:path').join(__dirname,'../beta/index.html'),'utf8');
const block=(from,to)=>html.slice(html.indexOf(from),html.indexOf(to));

test('el detalle incluye el envase en el margen y no inventa margen para costo pendiente',()=>{
  const ctx=vm.createContext({nfKg:new Intl.NumberFormat('es-AR'),esc:String,$m:n=>String(n)});
  vm.runInContext(block('function nombrePresentacionPeso(', 'function buscarProductosVenta(')+
    "this.conCosto=detallePresentacionesPeso({nombre:'Helado',costo:11000},[{gramos:250,precio:8000,costoEnvase:700}]);this.sinCosto=detallePresentacionesPeso({nombre:'Nuevo',costo:0},[{gramos:500,precio:7000,costoEnvase:100}]);",ctx);
  assert.match(ctx.conCosto,/56,9%/);
  assert.match(ctx.sinCosto,/Sin costo/);
  assert.doesNotMatch(ctx.sinCosto,/%/);
});

test('seleccionar un producto con una sola presentación no pregunta gramos',()=>{
  const p={id:'nuevo',unidad:'kg',preciosPorPeso:[{nombre:'Helado medio',gramos:500,precio:7000,costoEnvase:100}]};
  const elegidas=[];
  const ctx=vm.createContext({p,productoArchivadoRev31:()=>false,
    pedirPeso:()=>assert.fail('Se abrió la pregunta de gramos'),
    elegirResultado:(...args)=>elegidas.push(args)});
  vm.runInContext(block('function seleccionarProducto(', 'function ofrecerAbrirAtado(')+'seleccionarProducto(p);',ctx);
  assert.deepEqual(elegidas,[['producto','nuevo',500]]);
});

test('sin presentaciones conserva gramos; con varias pide un tamaño, no un peso',()=>{
  const pesos=[],tamanos=[];
  const ctx=vm.createContext({productoArchivadoRev31:()=>false,
    pedirPeso:p=>pesos.push(p.id),seleccionarPresentacionPeso:p=>tamanos.push(p.id)});
  vm.runInContext(block('function seleccionarProducto(', 'function ofrecerAbrirAtado(')+
    "seleccionarProducto({id:'libre',unidad:'kg'});seleccionarProducto({id:'varios',unidad:'kg',preciosPorPeso:[{gramos:250},{gramos:500}]});",ctx);
  assert.deepEqual(pesos,['libre']);assert.deepEqual(tamanos,['varios']);
});

test('buscar helado ofrece tamaños directos y peso libre solo cuando se pide expresamente',()=>{
  const helado={id:'h',nombre:'Helado',unidad:'kg',precio:22000,stock:3,
    preciosPorPeso:[{nombre:'Helado de cuarto',gramos:250,precio:8000},
      {nombre:'Helado de kilo',gramos:1000,precio:22000}]};
  const ctx=vm.createContext({db:{productos:[helado]},productoArchivadoRev31:()=>false});
  vm.runInContext([
    block('function normalizarBusqueda(', 'function productoCoincideFiltro('),
    block('function nombrePresentacionPeso(', 'function agregarAlTicket('),
    "this.resultados=buscarProductosVenta('helado');this.primero=buscarProductosVenta('helado',1);"
  ].join('\n'),ctx);
  assert.deepEqual(Array.from(ctx.resultados,r=>r.presentacion?.gramos||'libre'),[250,1000]);
  assert.equal(ctx.primero[0].presentacion?.gramos,250);
});

test('ocho tamaños se muestran sin confundirlos con peso libre, que sigue siendo buscable',()=>{
  const helado={id:'h',nombre:'Helado',unidad:'kg',precio:22000,stock:10,
    preciosPorPeso:[100,125,150,200,250,500,750,1000].map(gramos=>({nombre:'Helado tamaño '+gramos,gramos,precio:8000}))};
  const ctx=vm.createContext({db:{productos:[helado]},productoArchivadoRev31:()=>false});
  vm.runInContext([
    block('function normalizarBusqueda(', 'function productoCoincideFiltro('),
    block('function nombrePresentacionPeso(', 'function agregarAlTicket('),
    "this.resultados=buscarProductosVenta('helado');this.libre=buscarProductosVenta('helado peso libre');this.ultimo=buscarProductosVenta('helado tamaño 1000');this.ambiguos=buscarProductosVenta('helado',2);"
  ].join('\n'),ctx);
  assert.equal(ctx.resultados.length,8);
  assert.equal(ctx.resultados[7].presentacion.gramos,1000);
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
  assert.equal(ctx.coincidencias,2);
  assert.deepEqual(Array.from(ctx.lineas,i=>[i.nombre,i.prodId,i.cant,i.precio*i.cant,i.costo*i.cant]),[
    ['Helado de cuarto','helado',0.5,16000,6900],
    ['Helado de kilo','helado',1,22000,12150],
    ['Alfajor','alfajor',1,1500,500]
  ]);
});
