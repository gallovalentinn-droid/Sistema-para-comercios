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
const bloques = section('/* REV70_EMPAREJADOR_START */', '/* REV70_MEMORIA_END */') + '/* REV70_MEMORIA_END */';

function almacen() {
  const datos = new Map();
  return {getItem: k => (datos.has(k) ? datos.get(k) : null), setItem: (k, v) => datos.set(k, String(v)), datos};
}
function contexto(extra = {}) {
  const ctx = vm.createContext({
    console: {warn() {}, log() {}}, setTimeout, clearTimeout, Promise, JSON, Math, Number, String, Object, Set, Map, Array, Date, Error,
    localStorage: almacen(),
    numFactura: v => (typeof v === 'number' ? v : Number(String(v || '').replace(',', '.')) || 0),
    detectarBulto: () => 1,
    ...extra,
  });
  vm.runInContext(bloques, ctx);
  return ctx;
}

// Catálogo sintético con los casos difíciles de un kiosco: mismo producto en varios tamaños,
// variantes de sabor, atados de 10 y de 20, y un duplicado cargado dos veces.
let n = 0;
const P = nombre => ({id: `p${++n}`, _v4id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, nombre, costo: 1000});
const catalogo = [
  P('Fernet Branca 750ml'), P('Fernet Branca 1L'), P('Fernet Branca 450ml'),
  P('Manaos Cola 2,25 L'), P('Manaos Naranja 2,25 L'), P('Manaos Cola 1L'), P('Agua Villamanaos 500 ml'), P('Agua Villa Manaos 2 L'),
  P('Lata Cerveza Isenbeck 473ml'), P('Lata Cerveza Brahma 473ml'), P('Laton Cerveza Brahma 710ml'),
  P('Lata Speed 473ml'), P('Lata Speed 250ml'),
  P('Vodka Skyy Raspberry 750ml'), P('Vodka Skyy Cosmic 750ml'),
  P('Vodka Smirnoff Green Apple 700ml'), P('Vodka Smirnoff Raspberry 700 ml'),
  P('Cigarrillo Marlboro Box x20'), P('Cigarrillo Marlboro x10'), P('Cigarrillo Marlboro Comun x20'),
  P('Cigarrillo Chesterfield Comun x10'), P('Cigarrillo Chesterfield Comun x20'),
  P('Galletita Media Tarde Clasicas 315gr'), P('Galletita Media Tarde Sandwich 321gr'),
  P('Alfajor Guaymallen Triple Chocolate 70gr'), P('Alfajor Guaymallen Triple Leche 70gr'),
  P('Vino Santa Julia 750ml'), P('Pepsi 2L'), P('Lata Pepsi 354ml'), P('Salchicha Viena x6'),
  P('Lata Fernet 1882 473ml'), P('Lata Fernet con Pomelo 1882 473ml'),
  P('7UP 2L'), P('7up 2l'), P('Yerba Playadito 500gr'), P('Arroz Largo Fino Molinos Ala 1kg'), P('Arroz Largo Fino Molinos Ala 500gr'),
  {...P('Coca Cola 2,25L'), archivadoAt: '2026-09-01'},
];
const nombre = (ctx, id) => catalogo.find(p => p.id === id)?.nombre;

test('REV70 entiende presentaciones escritas de distintas formas', () => {
  const ctx = contexto();
  // REV72: la presentación guarda además el número tal cual (crudo); acá se compara la medida.
  const pres = t => { const r = ctx.rev70Presentacion(t); return r ? {tipo: r.tipo, valor: r.valor} : null; };
  assert.deepEqual(pres('FERNET BRANCA 750CC'), {tipo: 'ml', valor: 750});
  assert.deepEqual(pres('GAS.MANAOS COLA 2,25LTX6'), {tipo: 'ml', valor: 2250});
  assert.deepEqual(pres('brahma porron 340cm´3'), {tipo: 'ml', valor: 340});
  assert.deepEqual(pres('SPEEDXLUNLIMITEDX473CCX6U-SP'), {tipo: 'ml', valor: 473});
  assert.deepEqual(pres('ARROZ 1KG'), {tipo: 'g', valor: 1000});
  assert.deepEqual(pres('Yerba Playadito 500gr'), {tipo: 'g', valor: 500});
  assert.equal(ctx.rev70Presentacion('MARLBORO BOX 20'), null);
});

test('REV70 empareja renglones abreviados con el producto correcto', () => {
  const ctx = contexto();
  const idx = ctx.rev70Indice(catalogo);
  const casos = [
    ['FERNET BRANCA 750CC', 'Fernet Branca 750ml'],
    ['FERNET BRANCA 1LT', 'Fernet Branca 1L'],
    ['GAS.MANAOS COLA 2,25LTX6', 'Manaos Cola 2,25 L'],
    ['CERV.ISENBECK LAT 473CC X24', 'Lata Cerveza Isenbeck 473ml'],
    ['SPEEDXLUNLIMITEDX473CCX6U-SP', 'Lata Speed 473ml'],
    ['VDKA SKYY RASPB 750', 'Vodka Skyy Raspberry 750ml'],
    ['CIG.MARLB.BOX 20', 'Cigarrillo Marlboro Box x20'],
    ['MARLBORO X10', 'Cigarrillo Marlboro x10'],
    ['CHESTERFIELD COMUN X10', 'Cigarrillo Chesterfield Comun x10'],
    ['GALL.MEDIA TARDE CLAS.315G', 'Galletita Media Tarde Clasicas 315gr'],
    ['ALF.GUAYMALLEN TRIP.CHOC', 'Alfajor Guaymallen Triple Chocolate 70gr'],
    ['VINO STA JULIA 750', 'Vino Santa Julia 750ml'],
    ['AGUA V.MANAOS S/GAS 500X12', 'Agua Villamanaos 500 ml'],
    ['PEPSI 2LT X6', 'Pepsi 2L'],
    ['LATA FERNET 1882 473', 'Lata Fernet 1882 473ml'],
    ['ARROZ MOLINOS ALA L.FINO 1KG', 'Arroz Largo Fino Molinos Ala 1kg'],
  ];
  for (const [leido, esperado] of casos) {
    const r = ctx.rev70Emparejar(leido, idx);
    assert.equal(r.estado, 'seguro', `${leido}: ${r.estado} ${r.candidatos.map(c => c.producto.nombre).join(' / ')}`);
    assert.equal(r.producto.nombre, esperado, leido);
  }
});

test('REV70 no elige a ciegas: empates, variantes y productos que no están quedan para elegir', () => {
  const ctx = contexto();
  const idx = ctx.rev70Indice(catalogo);
  // Duplicado del catálogo: se muestran los dos.
  const dup = ctx.rev70Emparejar('7UP 2LT X 6', idx);
  assert.equal(dup.estado, 'dudoso');
  assert.equal(dup.producto, null);
  assert.deepEqual(dup.candidatos.slice(0, 2).map(c => c.producto.nombre).sort(), ['7UP 2L', '7up 2l']);
  // Falta el sabor: no se sabe si es Raspberry o Green Apple.
  assert.equal(ctx.rev70Emparejar('VODKA SMIRNOFF 700CC', idx).estado, 'dudoso');
  // Variante conocida en el catálogo (POMELO existe) sin el producto exacto: no se acepta sola.
  const lata = ctx.rev70Emparejar('FERNET BRANCA POMELO 750', idx);
  assert.notEqual(lata.estado, 'seguro');
  // Marca o producto que no está en el catálogo.
  for (const t of ['CERV.QUILMES LATA 473', 'MARLBORO GOLD BOX 20', 'MANAOS COLA 3LT', 'SALSA LISTA ARCOR 340G', 'VINO NORTON MALBEC 750']) {
    assert.notEqual(ctx.rev70Emparejar(t, idx).estado, 'seguro', t);
  }
  // Palabra que el catálogo no tiene: se pregunta, con el producto probable primero.
  const unl = ctx.rev70Emparejar('SPEED UNLIMITED LATA 250CC', idx);
  assert.equal(unl.estado, 'dudoso');
  assert.equal(unl.candidatos[0].producto.nombre, 'Lata Speed 250ml');
  // Otro tamaño: se ofrece como candidato marcado, nunca como seguro.
  const tam = ctx.rev70Emparejar('ARROZ MOLINOS ALA 250G', idx);
  assert.notEqual(tam.estado, 'seguro');
  assert.ok(tam.candidatos.every(c => c.incompatible));
  // Productos archivados no se proponen.
  assert.ok(!ctx.rev70Emparejar('COCA COLA 2.25LT', idx).candidatos.some(c => c.producto.nombre === 'Coca Cola 2,25L'));
  // Textos vacíos o solo ruido.
  assert.equal(ctx.rev70Emparejar('', idx).estado, 'ninguno');
  assert.equal(ctx.rev70Emparejar('X 6 CC', idx).estado, 'ninguno');
});

test('REV70 la descripción expandida solo confirma lo que el texto impreso ya proponía', () => {
  const ctx = contexto();
  const idx = ctx.rev70Indice(catalogo);
  // «x 750» es una medida sin unidad, no un pack de 750.
  assert.equal(ctx.rev70Emparejar('FERNET BRANCA X 750', idx).producto.nombre, 'Fernet Branca 750ml');
  // El texto impreso duda entre los dos Speed (falta el tamaño) y la descripción lo resuelve.
  const speed = ctx.rev70Emparejar('SPEED UNLIM LATA', idx, {descripcion: 'Lata Speed Unlimited 473 ml'});
  assert.equal(speed.estado, 'dudoso', 'UNLIMITED no está en el catálogo: igual se pregunta');
  const conf = ctx.rev70Emparejar('SPEED LATA', idx, {descripcion: 'Lata Speed 473 ml'});
  assert.equal(conf.estado, 'seguro');
  assert.equal(conf.producto.nombre, 'Lata Speed 473ml');
  // Si la descripción apunta a algo que el texto impreso no sugería, no se acepta sola.
  const raro = ctx.rev70Emparejar('SALSA LISTA ARCOR 340G', idx, {descripcion: 'Fernet Branca 750 ml'});
  assert.notEqual(raro.estado, 'seguro');
});

test('REV70 la compatibilidad coincidenciaProducto solo devuelve coincidencias seguras', () => {
  const ctx = contexto({db: {productos: catalogo}});
  vm.runInContext(section('// Compatibilidad: devuelve el producto solo cuando la coincidencia es segura (REV70).', 'function f6RegistrarUsoIa'), ctx);
  assert.equal(ctx.coincidenciaProducto('FERNET BRANCA 750CC').nombre, 'Fernet Branca 750ml');
  assert.equal(ctx.coincidenciaProducto('VODKA SMIRNOFF 700CC'), null);
});

test('REV70 memoria: código, texto y otro nombre de proveedor', () => {
  const ctx = contexto();
  const mem = ctx.rev70MemoriaVacia();
  const speed = catalogo.find(p => p.nombre === 'Lata Speed 473ml');
  ctx.rev70Recordar(mem, {proveedor: 'Limón Autoservicio Mayorista S.A.', texto: 'SPEEDXLUNLIMITEDX473CCX6U-SP', codigo: '7790-123', ref: speed._v4id, upb: 6});
  assert.equal(Object.keys(mem.filas).length, 2, 'guarda texto y código');
  const porCodigo = ctx.rev70BuscarEnMemoria(mem, {proveedor: 'LIMON AUTOSERVICIO MAYORISTA', texto: 'otro texto', codigo: '7790123'}, catalogo);
  assert.equal(porCodigo.producto.id, speed.id);
  assert.equal(porCodigo.upb, 6);
  assert.equal(porCodigo.via, 'codigo');
  const porTexto = ctx.rev70BuscarEnMemoria(mem, {proveedor: 'Limón Autoservicio Mayorista', texto: 'speedxlunlimitedx473ccx6u sp'}, catalogo);
  assert.equal(porTexto.via, 'texto');
  const otro = ctx.rev70BuscarEnMemoria(mem, {proveedor: 'Chino Limón', texto: 'SPEEDXLUNLIMITEDX473CCX6U-SP'}, catalogo);
  assert.equal(otro.via, 'otro-proveedor');
  // El código es propio de cada proveedor.
  assert.equal(ctx.rev70BuscarEnMemoria(mem, {proveedor: 'Otro', texto: 'nada', codigo: '7790123'}, catalogo), null);
  // Si el mismo texto apunta a productos distintos según el proveedor, no se adivina.
  ctx.rev70Recordar(mem, {proveedor: 'Mayorista Mi Barrio', texto: 'SPEEDXLUNLIMITEDX473CCX6U-SP', ref: catalogo[0].id});
  assert.equal(ctx.rev70BuscarEnMemoria(mem, {proveedor: 'Tercero', texto: 'SPEEDXLUNLIMITEDX473CCX6U-SP'}, catalogo), null);
  // Producto archivado o borrado: la memoria se ignora.
  const archivado = catalogo.find(p => p.archivadoAt);
  ctx.rev70Recordar(mem, {proveedor: 'X', texto: 'COCA 2.25', ref: archivado.id});
  assert.equal(ctx.rev70BuscarEnMemoria(mem, {proveedor: 'X', texto: 'COCA 2.25'}, catalogo), null);
  // Recordar dos veces lo mismo suma usos; cambiar de producto reinicia.
  ctx.rev70Recordar(mem, {proveedor: 'X', texto: 'FERNET 750', ref: 'p1'});
  ctx.rev70Recordar(mem, {proveedor: 'X', texto: 'FERNET 750', ref: 'p1'});
  assert.equal(mem.filas['x|fernet 750'].usos, 2);
  ctx.rev70Recordar(mem, {proveedor: 'X', texto: 'FERNET 750', ref: 'p2'});
  assert.equal(mem.filas['x|fernet 750'].usos, 1);
});

test('REV70 las filas de la revisión usan primero la memoria y no preseleccionan dudas', () => {
  const ctx = contexto();
  const mem = ctx.rev70MemoriaVacia();
  const speed = catalogo.find(p => p.nombre === 'Lata Speed 473ml');
  ctx.rev70Recordar(mem, {proveedor: 'Limón', texto: 'SPEED UNL 473 X6', ref: speed._v4id, upb: 6});
  const filas = ctx.rev70PrepararFilas({proveedor: 'Limón', items: [
    {producto: 'SPEED UNL 473 X6', cantidad: 4, unidadesPorBulto: 1, precioUnit: 9000, descuento: 0},
    {producto: 'FERNET BRANCA 750CC', cantidad: 6, unidadesPorBulto: 1, precioUnit: 14666, descuento: 0, codigo: 'A1', descripcion: 'Fernet Branca 750 ml'},
    {producto: 'VODKA SMIRNOFF 700CC', cantidad: 6, unidadesPorBulto: 1, precioUnit: 8000, descuento: 0},
    {producto: 'SALSA LISTA ARCOR 340G', cantidad: 12, unidadesPorBulto: 1, precioUnit: 900, descuento: 0},
  ]}, catalogo, mem);
  assert.equal(filas[0].estado, 'recordado');
  assert.equal(filas[0].prodId, speed.id);
  assert.equal(filas[0].porBulto, 6, 'usa el bulto recordado');
  assert.equal(filas[0].porBultoIa, 1, 'y conserva lo que leyó la IA para mostrarlo');
  assert.equal(nombre(ctx, filas[1].prodId), 'Fernet Branca 750ml');
  assert.equal(filas[1].origen, 'auto');
  assert.equal(filas[1].codigo, 'A1');
  assert.equal(filas[2].estado, 'dudoso');
  assert.equal(filas[2].prodId, '');
  assert.ok(filas[2].candidatos.length >= 2);
  assert.equal(filas[3].prodId, '');
  // Recordar la revisión: solo filas con producto y cantidad; los nuevos con el id creado.
  const mem2 = ctx.rev70MemoriaVacia();
  filas[2].prodId = filas[2].candidatos[0].id;
  filas[3].prodId = '__nuevo__'; filas[3].refCreado = 'nuevo-1';
  filas.push({original: 'SIN CANTIDAD', prodId: 'p1', cantidad: 0, porBulto: 1});
  ctx.rev70RecordarRevision(mem2, filas, 'Limón', r => (r.prodId === '__nuevo__' ? r.refCreado || '' : r.prodId));
  const refs = Object.values(mem2.filas).map(f => f.ref).sort();
  assert.deepEqual(refs, [filas[1].prodId, filas[1].prodId, filas[2].prodId, speed.id, 'nuevo-1'].sort());
  assert.ok(Object.values(mem2.filas).every(f => f.pend === true));
});

test('REV70 sincroniza la memoria: sube lo pendiente, trae la nube y sigue sin conexión', async () => {
  const llamadas = [];
  const nube = [{proveedor_clave: 'limon', texto_clave: 'fernet branca 750cc', producto_ref: 'p1', unidades_por_bulto: 1, usos: 3}];
  const tabla = {
    upsert(filas, opts) { llamadas.push(['upsert', filas, opts]); filas.forEach(f => nube.push(f)); return Promise.resolve({error: null}); },
    select() { return {eq: (col, val) => ({limit: () => { llamadas.push(['select', col, val]); return Promise.resolve({data: nube.slice(), error: null}); }})}; },
  };
  const ctx = contexto({sb: {from: nombreTabla => { llamadas.push(['from', nombreTabla]); return tabla; }}, sesion: {user: {id: 'u'}}, navigator: {onLine: true}});
  const cid = 'c1';
  const mem = ctx.rev70MemoriaVacia();
  ctx.rev70Recordar(mem, {proveedor: 'Limón', texto: 'SPEED 473', ref: 'p12', upb: 6});
  ctx.rev70GuardarMemoria(cid, mem);
  const r = await ctx.rev70SincronizarMemoria(cid);
  assert.deepEqual(llamadas.filter(l => l[0] === 'from').map(l => l[1]), ['factura_alias_producto', 'factura_alias_producto']);
  const up = llamadas.find(l => l[0] === 'upsert');
  assert.equal(up[2].onConflict, 'comercio_id,proveedor_clave,texto_clave');
  assert.deepEqual(JSON.parse(JSON.stringify(up[1])), [{comercio_id: 'c1', proveedor_clave: 'limon', texto_clave: 'speed 473', producto_ref: 'p12', unidades_por_bulto: 6, usos: 1}]);
  assert.equal(r.filas['limon|fernet branca 750cc'].usos, 3);
  assert.equal(r.filas['limon|speed 473'].pend, undefined, 'lo subido deja de estar pendiente');
  assert.ok(ctx.rev70LeerMemoria(cid).sincronizado);

  // Sin conexión: devuelve la copia local sin llamar a la nube.
  const off = contexto({sb: {from() { throw new Error('no debería llamar'); }}, sesion: {}, navigator: {onLine: false}});
  const m2 = off.rev70MemoriaVacia(); off.rev70Recordar(m2, {proveedor: 'A', texto: 'B', ref: 'p1'}); off.rev70GuardarMemoria('c', m2);
  assert.equal(Object.keys((await off.rev70SincronizarMemoria('c')).filas).length, 1);

  // La nube tarda: a los pocos segundos sigue con lo local y conserva lo pendiente.
  const lenta = contexto({sb: {from: () => ({upsert: () => new Promise(() => {})})}, sesion: {}, navigator: {onLine: true}});
  const m3 = lenta.rev70MemoriaVacia(); lenta.rev70Recordar(m3, {proveedor: 'Alfa', texto: 'B', ref: 'p1'}); lenta.rev70GuardarMemoria('c', m3);
  const r3 = await lenta.rev70SincronizarMemoria('c', {timeoutMs: 30});
  assert.equal(r3.filas['alfa|b'].pend, true);

  // La nube rechaza (por ejemplo, sin permiso): no se pierde lo pendiente.
  const rechaza = contexto({sb: {from: () => ({upsert: () => Promise.resolve({error: {code: '42501', message: 'rls'}})})}, sesion: {}, navigator: {onLine: true}});
  const m4 = rechaza.rev70MemoriaVacia(); rechaza.rev70Recordar(m4, {proveedor: 'Alfa', texto: 'B', ref: 'p1'}); rechaza.rev70GuardarMemoria('c', m4);
  assert.equal((await rechaza.rev70SincronizarMemoria('c')).filas['alfa|b'].pend, true);
  assert.equal(JSON.parse(rechaza.localStorage.getItem('micomercio.rev70.alias.c')).filas['alfa|b'].pend, true);

  // localStorage roto: no rompe la lectura.
  const roto = contexto({localStorage: {getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); }}});
  assert.deepEqual(JSON.parse(JSON.stringify(roto.rev70LeerMemoria('c'))), {filas: {}});
});

test('REV70 la lectura con IA consulta la memoria antes de abrir la revisión y la guarda al cargar', () => {
  const lector = section('async function leerFacturaFoto(file,ov){', 'let revisionFactura=[];');
  assert.match(lector, /const memoria=await rev70SincronizarMemoria\(f3Estado\.comercioId\);\n\s*abrirRevisionFactura\(data,\{memoria\}\);/);
  const revision = section('function abrirRevisionFactura(', 'function rev70EstadoFila(');
  assert.match(revision, /revisionFactura=rev70PrepararFilas\(parsed,db\.productos,memoria\|\|rev70LeerMemoria\(comercioRev\)\)/);
  assert.match(revision, /pid=nuevo\.id; r\.refCreado=nuevo\.id; creados\+\+;/);
  assert.match(revision, /rev70RecordarRevision\(mem,revisionFactura,parsed\.proveedor,/);
  assert.match(revision, /rev70SincronizarMemoria\(comercioRev\)\.catch\(\(\)=>\{\}\);/);
  assert.doesNotMatch(revision, /coincidenciaProducto\(/, 'la revisión ya no usa el emparejador viejo');
});

test('REV70 la revisión muestra el estado, las opciones y el aviso de costo', () => {
  const ui = section('// REV70: estado de cada fila y aviso cuando el costo se aleja mucho del anterior.', 'function recomputeLinea');
  const ctx = vm.createContext({$m: v => `$${Number(v).toFixed(2)}`});
  vm.runInContext(section('function rev70EstadoFila(', 'function pintarRevision('), ctx);
  assert.deepEqual({...ctx.rev70EstadoFila({prodId: 'p1', origen: 'memoria'})}, {clase: 'ok', texto: 'Recordado'});
  assert.deepEqual({...ctx.rev70EstadoFila({prodId: 'p1', origen: 'auto'})}, {clase: 'ok', texto: 'Coincide'});
  assert.deepEqual({...ctx.rev70EstadoFila({prodId: 'p1', origen: 'manual'})}, {clase: '', texto: 'Elegido a mano'});
  assert.deepEqual({...ctx.rev70EstadoFila({prodId: '', candidatos: [{}]})}, {clase: 'warn', texto: 'Elegí cuál es'});
  assert.deepEqual({...ctx.rev70EstadoFila({prodId: '', candidatos: []})}, {clase: 'warn', texto: 'Sin coincidencia'});
  // Caso Manaos Cola 2,25 L de septiembre: costo seis veces menor con bulto de 6.
  assert.match(ctx.rev70AvisoCosto({porBulto: 6}, {costo: 1433}, 238.89), /Antes costaba \$1433\.00\. ¿El precio es por unidad y no por bulto\?/);
  assert.match(ctx.rev70AvisoCosto({porBulto: 1}, {costo: 1000}, 6000), /¿El precio es por caja\?/);
  assert.equal(ctx.rev70AvisoCosto({porBulto: 1}, {costo: 1000}, 1150), '', 'una suba normal no avisa');
  assert.equal(ctx.rev70AvisoCosto({porBulto: 1}, {costo: 0}, 100), '', 'sin costo anterior no hay con qué comparar');
  assert.match(ui, /data-rev-cand="\$\{ix\}:\$\{j\}"/);
  assert.match(ui, /¿No es alguno de estos\?/);
  assert.match(ui, /\(otra presentación\)/);
  assert.match(ui, /La IA leyó \$\{r\.porBultoIa\}\. Revisá el bulto/);
  assert.match(ui, /r\.prodId=k\.id;r\.origen='manual';pintarRevision\(ov2\);/);
  assert.match(ui, /r\.prodId=s\.value;r\.origen=s\.value\?'manual':'';pintarRevision\(ov2\);/);
  assert.match(ui, /const opciones=db\.productos\.filter\(p=>!p\.archivadoAt\)/);
});

test('REV71 migración: tabla con RLS, sin acceso anónimo ni TRUNCATE', () => {
  const sql = fs.readFileSync(path.join(root, 'REV71-ALIAS-FACTURA.sql'), 'utf8');
  assert.ok(!fs.existsSync(path.join(root, 'REV70-ALIAS-FACTURA.sql')), 'la migración REV70 (nunca aplicada) se reemplaza');
  assert.match(sql, /create table if not exists public\.factura_alias_producto/);
  assert.match(sql, /primary key \(comercio_id, proveedor_clave, texto_clave\)/);
  assert.match(sql, /alter table public\.factura_alias_producto enable row level security;/);
  assert.match(sql, /for select to authenticated\s+using \(\(select private\.es_miembro\(factura_alias_producto\.comercio_id\)\)\);/);
  // R70-04: la licencia se exige en USING (DELETE y fila anterior de UPDATE) y en WITH CHECK.
  const escritura = sql.slice(sql.indexOf('create policy factura_alias_producto_write'), sql.indexOf(';', sql.indexOf('create policy factura_alias_producto_write')));
  const using = escritura.slice(escritura.indexOf('using ('), escritura.indexOf('with check ('));
  const check = escritura.slice(escritura.indexOf('with check ('));
  for (const parte of [using, check]) {
    assert.match(parte, /private\.tiene_permiso\(factura_alias_producto\.comercio_id, 'productos_editar'\)/);
    assert.match(parte, /private\.licencia_activa\(factura_alias_producto\.comercio_id\)/);
  }
  assert.match(sql, /and \(select private\.licencia_activa\(factura_alias_producto\.comercio_id\)\)/);
  assert.match(sql, /revoke all on table public\.factura_alias_producto from public, anon, authenticated;/);
  assert.match(sql, /grant select, insert, update, delete on table public\.factura_alias_producto to authenticated;/);
  assert.match(sql, /REV71_PERMISOS_INSEGUROS/);
  assert.doesNotMatch(sql, /grant[^;]*truncate/i);
  const columnas = sql.slice(sql.indexOf('create table'), sql.indexOf('primary key'));
  assert.doesNotMatch(columnas, /importe|monto|precio|costo|cantidad/i, 'la memoria no guarda importes ni cantidades');
});

test('identidad del paquete (REV75)', () => {
  const sw = fs.readFileSync(path.join(root, 'beta/sw.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'integrity-manifest.json'), 'utf8'));
  assert.match(html, /packageRevision:75,/);
  assert.match(sw, /micomercio-beta-6\.0\.0-f6-rc2-rev75/);
  assert.equal(manifest.packageRevision, 75);
  assert.ok(manifest.files['REV71-ALIAS-FACTURA.sql']);
  assert.equal(manifest.files['REV70-ALIAS-FACTURA.sql'], undefined);
});
