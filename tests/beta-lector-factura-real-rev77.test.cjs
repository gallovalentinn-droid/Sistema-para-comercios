// REV77: la factura real de MAYORISTA MI BARRIO (diagnóstico del 30/09) — cigarrillos con nombres del proveedor,
// una fila con cantidad 0 y una fila de DEUDA anterior incluida en el total.
// El catálogo es sintético: usa los nombres reales de esos productos y los que aparecían como opciones ajenas.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {pathToFileURL} = require('node:url');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'beta/index.html'), 'utf8').replace(/\r\n/g, '\n');
const ctx = vm.createContext({console: {warn() {}}, setTimeout, clearTimeout, localStorage: {getItem: () => null, setItem() {}},
  numFactura: v => (typeof v === 'number' ? v : Number(v) || 0), detectarBulto: () => 1});
vm.runInContext(html.slice(html.indexOf('/* REV70_EMPAREJADOR_START */'), html.indexOf('/* REV70_MEMORIA_END */')), ctx);
vm.runInContext(html.slice(html.indexOf('function rev70EstadoFila('), html.indexOf('\nfunction rev70AvisoCosto(')), ctx);
const {mutaciones, explica, correr} = require(path.join(root, 'entregables/evaluacion-emparejador-REV77/mutaciones.cjs'));
const edge = () => import(pathToFileURL(path.join(root, 'supabase/functions/_shared/f6-invoice-reader.mjs')).href);

let n = 0;
const P = nombre => ({id: `p${++n}`, _v4id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, nombre, costo: 1000});
const catalogo = [
  'chester suelto', 'Cigarrillo Chesterfield Comun x10', 'Cigarrillo Chesterfield Comun x20', 'Cigarrillo Chesterfield Convertible Box',
  'Cigarrillo Chesterfield Convertible x10', 'Cigarrillo Lucky Strike Convertible x10', 'Cigarrillo Lucky Strike Origen Convertible x20  trucho',
  'Cigarrillo Lucky Strike red  x20  trucho', 'Cigarrillo Lucky Strike XL Box x20', 'Cigarrillo Marlboro Box x20', 'Cigarrillo Marlboro Comun x20',
  'Cigarrillo Marlboro Crafted Box', 'Cigarrillo Marlboro Crafted Comun x20', 'Cigarrillo Marlboro Purple Fusion Box  x20',
  'Cigarrillo Marlboro Purple Fusion x10', 'Cigarrillo Marlboro x10', 'Cigarrillo philip comun SUELTO', 'Cigarrillo Philip Morris Box x20',
  'Cigarrillo Philip Morris Comun x20', 'Cigarrillo Philip Morris mentolado Box x20', 'Cigarrillo Philip Morris mentolado x10',
  'Cigarrillo Philip Morris Red Select Comun x20  trucho', 'Cigarrillo Philip Morris x10', 'Lucky Strike Convertible 12', 'lucky suelto',
  'marlboro crafted mentolado', 'Philip Morris Mentolado Blue Select x20 (trucho)', 'Philip Morris Mentolado Blue Select x20 (trucho)',
  // Productos que aparecían como opciones ajenas en el diagnóstico, y relleno para que el catálogo no sea solo de cigarrillos.
  'Frizze Blue 1L', 'Alfajor B&N Negro 73,5gr', 'Alfajor B&N Blanco 73,5gr', 'Alfajor Guaymallen Triple Chocolate 70gr',
  'Coca Cola 2,25L', 'Fernet Branca 750ml', 'Yerba Playadito 500gr', 'Lata Speed 473ml', 'Galletita Media Tarde Clasicas 315gr',
  'Agua Villamanaos 500 ml', 'Arroz Largo Fino Molinos Ala 1kg', 'Vino Santa Julia 750ml', 'Pepsi 2L', 'Salchicha Viena x6',
].map(P);
const idx = ctx.rev70Indice(catalogo);
const emp = t => ctx.rev70Emparejar(t, idx);
const opciones = r => [...r.candidatos].map(c => c.producto.nombre);

test('REV77: los ocho cigarrillos de la factura', () => {
  // Se eligen solos los que el texto y el catálogo confirman.
  for (const [t, e] of [['MARLBORO COMUN', 'Cigarrillo Marlboro Comun x20'], ['MARLBORO FUSION2 DE 10', 'Cigarrillo Marlboro Purple Fusion x10'],
    ['MARLBORO FUSION2 DE 20', 'Cigarrillo Marlboro Purple Fusion Box  x20']]) {
    const r = emp(t);
    assert.equal(r.estado, 'seguro', t);
    assert.equal(r.producto.nombre, e, t);
  }
  // Los que usan palabras del proveedor (NEGRO = Convertible, BCO = común, SELET = Red Select) quedan para elegir,
  // con el producto correcto entre las opciones. La memoria del proveedor los resuelve desde la segunda factura.
  for (const [t, e] of [['LUCKY DE 20 NEGRO XL', 'Cigarrillo Lucky Strike XL Box x20'], ['PHILIP SELET', 'Cigarrillo Philip Morris Red Select Comun x20  trucho'],
    ['PHILLIP SELEC BLUE', 'Philip Morris Mentolado Blue Select x20 (trucho)'], ['CHESTER 10 NEGRO', 'Cigarrillo Chesterfield Convertible x10'],
    ['PHILLP DE 10 BCO', 'Cigarrillo Philip Morris x10']]) {
    const r = emp(t);
    assert.notEqual(r.estado, 'seguro', t);
    assert.ok(opciones(r).includes(e), `${t}: ${opciones(r)}`);
  }
});

test('REV77: las opciones tienen que parecerse al renglón', () => {
  for (const t of ['LUCKY DE 20 NEGRO XL', 'PHILLIP SELEC BLUE', 'PHILLP DE 10 BCO', 'CHESTER 10 NEGRO', 'PHILIP SELET']) {
    const ajenas = opciones(emp(t)).filter(x => /Frizze|Alfajor/.test(x));
    assert.deepEqual(ajenas, [], t);
  }
  // Los dos «Blue Select» son productos distintos con el mismo nombre: nunca se elige uno solo.
  assert.notEqual(emp('PHILIP MORRIS MENTOLADO BLUE SELECT X20 TRUCHO').estado, 'seguro');
  // B&N es una marca: no se parte en dos letras sueltas (antes «Alfajor B&N Blanco 69gr» se elegía como Aguila).
  assert.deepEqual([...ctx.rev70Tokens('Alfajor B&N Negro 73,5gr').palabras], ['alfajor', 'byn', 'negro']);
  const alfajores = ctx.rev70Indice([...catalogo, P('Alfajor Aguila Blanco 69gr'), P('Alfajor Rasta Negro 70gr')]);
  for (const [t, otro] of [['Alfajor B&N Blanco 69gr', 'Alfajor Aguila Blanco 69gr'], ['ALFAJOR B&N NEGRO 70GR', 'Alfajor Rasta Negro 70gr']]) {
    const r = ctx.rev70Emparejar(t, alfajores);
    assert.ok(!(r.estado === 'seguro' && r.producto.nombre === otro), `${t} -> ${otro}`);
  }
  assert.equal(ctx.rev70Emparejar('ALF B & N BLANCO 73.5G', alfajores).producto?.nombre, 'Alfajor B&N Blanco 73,5gr');
  // Las opciones que ya funcionaban siguen: otro producto parecido se ve.
  assert.ok(opciones(emp('MARLBORO COMUN')).includes('Cigarrillo Marlboro Crafted Comun x20'));
});

test('REV77: una letra de diferencia en palabras largas', () => {
  for (const [a, b] of [['phillip', 'philip'], ['phillp', 'philip'], ['selet', 'select'], ['marlbro', 'marlboro'], ['chesterfiled', 'chesterfield']])
    assert.equal(ctx.rev70Credito(a, b), 0.85, `${a} / ${b}`);
  // No se aplica con palabras cortas, con otra inicial ni con dos letras de diferencia.
  for (const [a, b] of [['lata', 'lato'], ['gold', 'golf'], ['philip', 'chilip'], ['phlp', 'philip'], ['select', 'selenio']])
    assert.ok(ctx.rev70Credito(a, b) < 0.85, `${a} / ${b}`);
});

test('REV77: un número de un dígito pegado al nombre (FUSION2) no es un dato de presentación', () => {
  // Pero sigue contando para detectar otra presentación: si el producto tiene su propio número, tiene que coincidir.
  const dosis = [P('Actron Ibuprofeno'), P('Actron Ibuprofeno 600 mg'), P('Fideos Matarazzo Penne Rigate N45 500gr'), P('Rinde 2 Naranja 13 g'), ...catalogo];
  const i2 = ctx.rev70Indice(dosis);
  // Con dos o más dígitos sigue siendo un dato estricto: puede ser una dosis.
  for (const t of ['ACTRON400', 'ACTRON IBUPROFENO400', 'MATARAZZO PENNE N46 500GR', 'RINDE3 NARANJA 13G'])
    assert.notEqual(ctx.rev70Emparejar(t, i2).estado, 'seguro', t);
  assert.equal(ctx.rev70Emparejar('MATARAZZO PENNE N45 500GR', i2).producto?.nombre, 'Fideos Matarazzo Penne Rigate N45 500gr');
  assert.equal(ctx.rev70Emparejar('RINDE2 NARANJA 13G', i2).producto?.nombre, 'Rinde 2 Naranja 13 g');
  // El oráculo aplica la misma regla.
  assert.equal(explica('MARLBORO FUSION2 DE 10', 'Cigarrillo Marlboro Purple Fusion x10'), true);
  assert.equal(explica('MARLBORO FUSION2 DE 20', 'Cigarrillo Marlboro Purple Fusion x10'), false);
  assert.equal(explica('IBU400', 'Ibuprofeno'), false);
  assert.equal(explica('ACTRON2', 'Actron 600'), false);
});

const factura = {proveedor: 'MAYORISTA MI BARRIO', total: 462000, saldoAnterior: 0, items: [
  // Cantidades y precios ilustrativos: suman los $270.400 de cigarrillos del ticket, no son los de cada fila.
  ['MARLBORO COMUN', 10, 3800], ['LUCKY DE 20 NEGRO XL', 10, 7200], ['PHILIP SELET', 10, 3600], ['PHILLIP SELEC BLUE', 10, 3600],
  ['CHESTER 10 NEGRO', 10, 2400], ['PHILLP DE 10 BCO', 10, 2200], ['MARLBORO FUSION2 DE 10', 5, 2600], ['MARLBORO FUSION2 DE 20', 6, 4900],
  ['ALF MATILDA', 0, 0], ['ALF MATILDA', 1, 1750], ['DEUDA', 1, 189850],
].map(([producto, cantidad, precioUnit]) => ({producto, codigo: '', descripcion: '', cantidad, unidadesPorBulto: 1, precioUnit, descuento: 0}))};

test('REV77: la cantidad 0 impresa no se convierte en 1', () => {
  const filas = ctx.rev70PrepararFilas(factura, catalogo, ctx.rev70MemoriaVacia());
  const [cero, uno] = filas.filter(f => f.original === 'ALF MATILDA');
  assert.equal(cero.cantidad, 0);
  assert.equal(cero.prodId, '');
  assert.equal(ctx.rev70EstadoFila(cero).texto, 'Cantidad 0: no se carga');
  assert.equal(uno.cantidad, 1);
  assert.notEqual(ctx.rev70EstadoFila(uno).texto, 'Cantidad 0: no se carga');
  // La carga ya saltea las filas sin cantidad, y la memoria no aprende de ellas.
  assert.match(html, /revisionFactura\.forEach\(r=>\{\n {10}if\(!r\.cantidad\|\|r\.cantidad<=0\) return;/);
  assert.match(html, /if\(!r\|\|!r\.prodId\|\|!\(r\.cantidad>0\)\)return;/);
});

test('REV77: la deuda anterior no es mercadería y no se suma al total de los productos', () => {
  const filas = ctx.rev70PrepararFilas(factura, catalogo, ctx.rev70MemoriaVacia());
  const deuda = filas.find(f => f.original === 'DEUDA');
  assert.equal(deuda.noMercaderia, true);
  assert.equal(deuda.prodId, '');
  assert.deepEqual([...deuda.candidatos], []);
  assert.equal(ctx.rev70EstadoFila(deuda).texto, 'No es mercadería: no se carga');
  assert.equal(ctx.rev77DeudaDelTicket(factura, filas), 189850);
  const mercaderia = filas.filter(f => !f.noMercaderia).reduce((t, f) => t + f.cantidad * f.costoU, 0);
  assert.equal(mercaderia, 272150);
  assert.equal(factura.total - ctx.rev77DeudaDelTicket(factura, filas), mercaderia, 'el total del ticket menos la deuda es la mercadería');
  // Si la IA ya la sacó de los renglones y la informó aparte, se usa ese dato; si vino de las dos formas, no se resta dos veces.
  const sinFila = {...factura, saldoAnterior: 189850, items: factura.items.filter(i => i.producto !== 'DEUDA')};
  assert.equal(ctx.rev77DeudaDelTicket(sinFila, ctx.rev70PrepararFilas(sinFila, catalogo, ctx.rev70MemoriaVacia())), 189850);
  assert.equal(ctx.rev77DeudaDelTicket({...factura, saldoAnterior: 189850}, filas), 189850);
  for (const t of ['SALDO ANTERIOR', 'Pago a cuenta', 'ENTREGA', 'Deuda anterior', 'REDONDEO']) assert.equal(ctx.rev77NoEsMercaderia(t), true, t);
  for (const t of ['ALF MATILDA', 'MARLBORO COMUN', 'Pagoda', 'Saldos y retazos', 'Pagani']) assert.equal(ctx.rev77NoEsMercaderia(t), false, t);
  // La revisión y el formulario usan el total de la mercadería y lo explican.
  assert.match(html, /incluye \$\{\$m\(deuda\)\} que no es mercadería/);
  assert.match(html, /total: totalMercaderia>0\? totalMercaderia\.toFixed\(2\) : remitoHeader\.total,/);
  assert.match(html, /El ticket dice \$\{\$m\(remitoHeader\.totalTicket\)\}: le descontamos \$\{\$m\(remitoHeader\.deudaTicket\)\} de deuda o saldo anterior\./);
});

test('REV77: la lectura del servidor pide el saldo anterior aparte y conserva la cantidad 0', async () => {
  const m = await edge();
  const pedido = m.buildGeminiInvoiceRequest({imageBase64: 'AAAA', mediaType: 'image/jpeg'});
  const schema = pedido.response_format.schema;
  assert.deepEqual(schema.properties.saldoAnterior, {type: 'number'});
  assert.ok(schema.required.includes('saldoAnterior'));
  assert.match(pedido.input[0].text, /saldoAnterior: deuda o saldo anterior que el total incluye/);
  assert.match(pedido.input[0].text, /No pongas en items las filas de deuda, saldo anterior, pagos o entregas a cuenta/);
  assert.match(pedido.input[0].text, /si dice 0, devolvé 0/);
  const resp = d => ({status: 'completed', steps: [{type: 'model_output', content: [{type: 'text', text: JSON.stringify(d)}]}]});
  const base = {proveedor: 'MI BARRIO', nroComprobante: '1', total: 462000, descuentoGlobal: 0,
    items: [{producto: 'ALF MATILDA', codigo: '', descripcion: '', cantidad: 0, unidadesPorBulto: 1, precioUnit: 0, descuento: 0}]};
  assert.equal(m.extractGeminiInvoice(resp({...base, saldoAnterior: 189850})).saldoAnterior, 189850);
  assert.equal(m.extractGeminiInvoice(resp({...base, saldoAnterior: 189850})).items[0].cantidad, 0);
  // Si falta o viene mal, la lectura no se cae: queda en 0.
  assert.equal(m.extractGeminiInvoice(resp(base)).saldoAnterior, 0);
  assert.equal(m.extractGeminiInvoice(resp({...base, saldoAnterior: -5})).saldoAnterior, 0);
  assert.equal(m.extractGeminiInvoice(resp({...base, saldoAnterior: '189850'})).saldoAnterior, 0);
});

test('REV77: la mutación y el oráculo siguen en cero con el catálogo de cigarrillos', () => {
  const r = correr(ctx, catalogo);
  assert.ok(r.total > 150, `pruebas: ${r.total}`);
  assert.deepEqual(r.original, []);
  assert.deepEqual(r.otro, []);
  assert.ok(mutaciones({nombre: 'Cigarrillo Marlboro Purple Fusion x10'}).length > 3);
});
