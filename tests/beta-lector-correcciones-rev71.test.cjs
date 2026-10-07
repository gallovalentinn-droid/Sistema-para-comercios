// REV71: contraejemplos de la revisión del paquete REV70 (R70-01, R70-02, R70-03), con la expectativa correcta.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'beta/index.html'), 'utf8').replace(/\r\n/g, '\n');
const bloques = html.slice(html.indexOf('/* REV70_EMPAREJADOR_START */'), html.indexOf('/* REV70_MEMORIA_END */'));
function contexto() {
  const ctx = vm.createContext({console: {warn() {}}, setTimeout, clearTimeout,
    localStorage: {getItem: () => null, setItem() {}},
    numFactura: v => (typeof v === 'number' ? v : Number(v) || 0), detectarBulto: () => 1});
  vm.runInContext(bloques, ctx);
  return ctx;
}
let n = 0;
const P = nombre => ({id: `p${++n}`, _v4id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, nombre, costo: 1000});
// El mismo catálogo sintético que usa la prueba REV70 (y la revisión).
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
  P('Actron Ibuprofeno 600 mg'), P('Actron Ibuprofeno 400 mg'), P('Ibu 600'),
  {...P('Coca Cola 2,25L'), archivadoAt: '2026-09-01'},
];
const ctx = contexto();
const idx = ctx.rev70Indice(catalogo);
const emp = (texto, descripcion) => ctx.rev70Emparejar(texto, idx, descripcion ? {descripcion} : {});
const nombres = r => [...r.candidatos].map(c => c.producto.nombre + (c.incompatible ? ' *' : ''));

test('R70-01: la descripción no promueve un producto de otro tamaño ni de otra marca', () => {
  const arroz = emp('ARROZ MOLINOS ALA 250G', 'Arroz Largo Fino Molinos Ala 1kg');
  assert.equal(arroz.estado, 'dudoso');
  assert.equal(arroz.producto, null);
  assert.ok(arroz.candidatos.find(c => c.producto.nombre === 'Arroz Largo Fino Molinos Ala 1kg').incompatible, 'el de 1 kg queda marcado como otra presentación');
  const quilmes = emp('CERV.QUILMES LATA 473', 'Lata Cerveza Isenbeck 473ml');
  assert.equal(quilmes.estado, 'dudoso');
  assert.equal(quilmes.producto, null);
  // Un texto impreso tan vago que solo la descripción aporta la marca tampoco alcanza.
  assert.notEqual(emp('LATA 473', 'Lata Cerveza Isenbeck 473ml').estado, 'seguro');
  // Otra medida en la descripción también queda para elegir.
  assert.notEqual(emp('ARROZ MOLINOS ALA 250G', 'Arroz Molinos 500 g').estado, 'seguro');
});

test('R70-01: si el impreso es seguro y la descripción apunta a otro producto, se pregunta', () => {
  const r = emp('FERNET BRANCA 750CC', 'Vodka Skyy Raspberry 750ml');
  assert.equal(r.estado, 'dudoso');
  assert.deepEqual(nombres(r).slice(0, 1), ['Fernet Branca 750ml']);
  const vodka = r.candidatos.find(c => c.producto.nombre === 'Vodka Skyy Raspberry 750ml');
  assert.ok(vodka, 'la propuesta de la descripción se ve entre las opciones');
  assert.equal(vodka.soloDescripcion, true, 'y se marca que no sale de lo impreso');
  assert.equal(emp('FERNET BRANCA 750CC', 'Fernet Branca 1 L').estado, 'dudoso');
  // Si la descripción coincide o no dice nada nuevo, se mantiene.
  assert.equal(emp('FERNET BRANCA 750CC', 'Fernet Branca 750 ml').producto.nombre, 'Fernet Branca 750ml');
  assert.equal(emp('FERNET BRANCA 750CC', 'Fernet').producto.nombre, 'Fernet Branca 750ml');
});

test('R70-01: la descripción todavía resuelve cuando es compatible con lo impreso', () => {
  const r = emp('SPEED LATA', 'Lata Speed 473 ml');
  assert.equal(r.estado, 'seguro');
  assert.equal(r.producto.nombre, 'Lata Speed 473ml');
});

test('R70-02: un atado distinto no queda como Coincide', () => {
  const marlboro = emp('CIG.MARLB.BOX X10');
  assert.equal(marlboro.estado, 'dudoso');
  assert.equal(marlboro.producto, null);
  assert.ok(marlboro.candidatos.find(c => c.producto.nombre === 'Cigarrillo Marlboro Box x20').incompatible);
  const salchicha = emp('SALCHICHA VIENA X12');
  assert.notEqual(salchicha.estado, 'seguro');
  assert.ok(salchicha.candidatos.every(c => c.incompatible));
  assert.equal(emp('CIG.MARLB.BOX X10', 'Cigarrillo Marlboro Box x20').estado, 'dudoso', 'ni con la descripción');
  // El embalaje del mayorista no choca con un producto sin atado ni con el atado correcto.
  assert.equal(emp('CIG.MARLB.BOX 20').producto.nombre, 'Cigarrillo Marlboro Box x20');
  assert.equal(emp('MARLBORO BOX 20 X10').producto.nombre, 'Cigarrillo Marlboro Box x20');
  assert.equal(emp('SALCHICHA VIENA X6 X12').producto.nombre, 'Salchicha Viena x6');
  assert.equal(emp('CERV.ISENBECK LAT 473CC X24').producto.nombre, 'Lata Cerveza Isenbeck 473ml');
  assert.equal(emp('PEPSI 2LT X6').producto.nombre, 'Pepsi 2L');
});

test('R70-02: un número propio distinto (400 contra 600) es otra presentación', () => {
  const r = emp('ACTRON 400');
  assert.equal(r.candidatos[0].producto.nombre, 'Actron Ibuprofeno 400 mg');
  assert.ok(!r.candidatos.some(c => c.producto.nombre === 'Actron Ibuprofeno 600 mg' && !c.incompatible), 'el de 600 nunca aparece como compatible');
  assert.ok(!(r.producto && r.producto.nombre === 'Actron Ibuprofeno 600 mg'));
  const r6 = emp('ACTRON IBUPROFENO 600');
  assert.equal(r6.producto && r6.producto.nombre, 'Actron Ibuprofeno 600 mg');
  assert.equal(emp('LATA FERNET 1882 473').producto.nombre, 'Lata Fernet 1882 473ml');
});

test('R70-03: la memoria de otro proveedor no transfiere el bulto y no depende del orden', () => {
  const speed = catalogo.find(p => p.nombre === 'Lata Speed 473ml');
  for (const orden of [[6, 12], [12, 6]]) {
    const mem = ctx.rev70MemoriaVacia();
    ctx.rev70Recordar(mem, {proveedor: 'Mayorista Alfa', texto: 'SPEED 473CC', ref: speed._v4id, upb: orden[0]});
    ctx.rev70Recordar(mem, {proveedor: 'Mayorista Beta', texto: 'SPEED 473CC', ref: speed._v4id, upb: orden[1]});
    const [f] = ctx.rev70PrepararFilas({proveedor: 'Mayorista Gamma', items: [
      {producto: 'SPEED 473CC', cantidad: 2, unidadesPorBulto: 24, precioUnit: 24000, descuento: 0}]}, catalogo, mem);
    assert.equal(f.estado, 'recordado');
    assert.equal(f.via, 'otro-proveedor');
    assert.equal(f.prodId, speed.id);
    assert.equal(f.porBulto, 24, `orden ${orden}: usa el bulto leído`);
    assert.equal(f.cantidad * f.porBulto, 48);
    assert.equal(f.costoU * f.cantidad / (f.cantidad * f.porBulto), 1000);
  }
  // Del mismo proveedor sí se usa el bulto recordado (corrige lecturas repetidas de la IA) y se avisa la diferencia.
  const mem = ctx.rev70MemoriaVacia();
  ctx.rev70Recordar(mem, {proveedor: 'Mayorista Alfa', texto: 'SPEED 473CC', ref: speed._v4id, upb: 6});
  const [f] = ctx.rev70PrepararFilas({proveedor: 'Mayorista Alfa', items: [
    {producto: 'SPEED 473CC', cantidad: 2, unidadesPorBulto: 24, precioUnit: 24000, descuento: 0}]}, catalogo, mem);
  assert.equal(f.via, 'texto');
  assert.equal(f.porBulto, 6);
  assert.equal(f.porBultoIa, 24);
  // Si otro proveedor recordó otro producto para el mismo texto, no se adivina.
  const otro = catalogo.find(p => p.nombre === 'Lata Speed 250ml');
  ctx.rev70Recordar(mem, {proveedor: 'Mayorista Beta', texto: 'SPEED 473CC', ref: otro._v4id, upb: 6});
  const [g] = ctx.rev70PrepararFilas({proveedor: 'Mayorista Gamma', items: [
    {producto: 'SPEED 473CC', cantidad: 2, unidadesPorBulto: 24, precioUnit: 24000, descuento: 0}]}, catalogo, mem);
  assert.notEqual(g.estado, 'recordado');
});

test('R70-03: la revisión distingue lo recordado de otro proveedor y avisa el bulto distinto', () => {
  const ui = html.slice(html.indexOf('function rev70EstadoFila('), html.indexOf('function recomputeLinea'));
  const c = vm.createContext({$m: v => `$${v}`});
  vm.runInContext(html.slice(html.indexOf('function rev70EstadoFila('), html.indexOf('function rev70AvisoCosto(')), c);
  assert.equal(c.rev70EstadoFila({prodId: 'p', origen: 'memoria', via: 'otro-proveedor'}).texto, 'Recordado de otro proveedor');
  assert.equal(c.rev70EstadoFila({prodId: 'p', origen: 'memoria', via: 'texto'}).texto, 'Recordado');
  assert.match(ui, /<span class="pill warn rev70-costo">La IA leyó \$\{r\.porBultoIa\}\. Revisá el bulto<\/span>/);
  assert.match(ui, /\(solo según la descripción de la IA\)/);
});
