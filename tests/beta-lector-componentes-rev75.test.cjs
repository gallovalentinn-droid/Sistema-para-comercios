// REV75: hallazgos de la revisión de REV74.
// R74-01: en un pack con dos medidas del mismo tipo, cada medida tiene que ser la de su componente.
// R74-02: la descripción de la IA no puede saltear los datos que lo impreso no confirma.
// R74-03: el oráculo no deja que números sueltos tapen dos medidas contradictorias.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'beta/index.html'), 'utf8').replace(/\r\n/g, '\n');
const ctx = vm.createContext({});
vm.runInContext(html.slice(html.indexOf('/* REV70_EMPAREJADOR_START */'), html.indexOf('/* REV70_EMPAREJADOR_END */')), ctx);
const evaluador = path.join(root, 'entregables/evaluacion-emparejador-REV75');
const {correr, explica, mutaciones} = require(path.join(evaluador, 'mutaciones.cjs'));
const trasplantes = require(path.join(evaluador, 'trasplantes.cjs'));

let n = 0;
const P = nombre => ({id: `p${++n}`, nombre});
const catalogo = [
  P('Fernet Branca 750ml'), P('Fernet Branca 1L'), P('Lata Speed 473ml'), P('Lata Speed 250ml'),
  P('Cigarrillo Marlboro Box x20'), P('Cigarrillo Marlboro x10'), P('Cigarrillos Marlboro box'), P('Salchicha Viena x6'),
  P('Lata Cerveza Isenbeck 473ml'), P('Ibuprofeno Suspension 200mg 60ml'), P('Actron Ibuprofeno 600'), P('Vodka Skyy Raspberry 750ml'),
  P('Pack Nivea Crema 125g Jabon 75g'), P('Combo Jugo Naranja 1L Jugo Manzana 2L'),
  P('Fideos Luchetti Codito 500gr'), P('Gomitas Sueltas'), P('Queso Dambo Punta del Agua'),
];
const idx = ctx.rev70Indice(catalogo);
const emp = (t, descripcion) => ctx.rev70Emparejar(t, idx, descripcion ? {descripcion} : {});
const noSolo = (t, nombre, descripcion) => {
  const r = emp(t, descripcion);
  assert.ok(!(r.estado === 'seguro' && r.producto.nombre === nombre), `${t}${descripcion ? ' | ' + descripcion : ''} -> ${nombre}`);
  return r;
};
const elige = (t, nombre, descripcion) => assert.equal(emp(t, descripcion).producto?.nombre, nombre, t);
const PACK = 'Pack Nivea Crema 125g Jabon 75g', COMBO = 'Combo Jugo Naranja 1L Jugo Manzana 2L';

test('R74-01: los tamaños de los componentes de un pack no se intercambian', () => {
  const r = noSolo('Pack Nivea Crema 75g Jabon 125g', PACK);
  assert.ok(r.candidatos.find(c => c.producto.nombre === PACK)?.incompatible, 'el pack queda marcado como otra presentación');
  noSolo('Combo Jugo Naranja 2L Jugo Manzana 1L', COMBO);
  noSolo('PACK NIVEA CREMA 75G 125G', PACK);
  noSolo('COMBO NARANJA 2L MANZANA 1L', COMBO);
  noSolo('NIVEA CREMA 75G', PACK, undefined);
  // Sin palabras que digan cuál es cuál, el orden distinto no alcanza para decidir.
  noSolo('PACK NIVEA 75G 125G', PACK);
  noSolo('COMBO JUGO 2L 1L', COMBO);
  // Un solo componente puede ser el producto suelto.
  noSolo('JABON NIVEA 75G', PACK);
  // Ni la descripción de la IA lo cambia.
  noSolo('Pack Nivea Crema 75g Jabon 125g', PACK, PACK);
});

test('R74-01: controles que siguen eligiéndose solos', () => {
  elige('PACK NIVEA CREMA 125G JABON 75G', PACK);
  elige('PACK NIVEA JABON 75G CREMA 125G', PACK, undefined);
  elige('PACK NIVEA CREMA 125G 75G', PACK);
  elige('COMBO JUGO NARANJA 1L JUGO MANZANA 2L X6', COMBO);
  elige('COMBO JUGO MANZANA 2L NARANJA 1L', COMBO);
  elige('COMBO JUGO 1L 2L', COMBO);
  // Medidas de distinto tipo (dosis y volumen) siguen valiendo en cualquier orden.
  elige('IBUPROFENO SUSPENSION 60ML 200MG', 'Ibuprofeno Suspension 200mg 60ml');
  elige('IBUPROFENO SUSPENSION 200MG 60ML', 'Ibuprofeno Suspension 200mg 60ml');
  elige('MARLBORO BOX 20 X10', 'Cigarrillo Marlboro Box x20');
  elige('SALCHICHA VIENA X6 X12', 'Salchicha Viena x6');
  elige('CERV.ISENBECK LAT 473CC X24', 'Lata Cerveza Isenbeck 473ml');
});

test('R74-02: la descripción de la IA no saltea los datos que lo impreso no confirma', () => {
  for (const [t, d] of [
    ['Fideos Luchetti Codito 45 500gr', 'Fideos Luchetti Codito 500gr'],
    ['Gomitas Sueltas 620gr', 'Gomitas Sueltas'],
    ['Queso Dambo Punta del Agua 35gr', 'Queso Dambo Punta del Agua'],
    ['CIG.MARLB.BOX X10', 'Cigarrillos Marlboro box'],
  ]) {
    noSolo(t, d);
    noSolo(t, d, d);
  }
  // La descripción sigue sirviendo cuando aclara sin tapar datos.
  elige('SPEED LATA', 'Lata Speed 473ml', 'Lata Speed 473 ml');
  elige('FERNET BRANCA 750CC', 'Fernet Branca 750ml', 'Fernet Branca 750 ml');
  elige('FID.LUCH.COD 500GR X20', 'Fideos Luchetti Codito 500gr', 'Fideos Luchetti Codito 500gr');
  elige('GOMITAS SUELT', 'Gomitas Sueltas', 'Gomitas Sueltas');
  // Y lo que ya se preguntaba por la descripción se sigue preguntando.
  assert.equal(emp('FERNET BRANCA 750CC', 'Vodka Skyy Raspberry 750ml').estado, 'dudoso');
});

test('R74-03: el oráculo no deja que números sueltos tapen medidas contradictorias', () => {
  const malas = [
    ['Fertilizante Universal 10g 500ml 20', 'Fertilizante Universal 20g 500ml 10'],
    ['Fertilizante Universal 10g 500ml x20', 'Fertilizante Universal 20g 500ml x10'],
    ['Pack Nivea Crema 75g Jabon 125g', PACK], ['Combo Jugo Naranja 2L Jugo Manzana 1L', COMBO],
    ['PACK NIVEA 75G 125G', PACK], ['JABON NIVEA 75G', PACK],
  ];
  for (const [t, x] of malas) assert.equal(explica(t, x), false, `${t} | ${x}`);
  const buenas = [
    ['ACTRON 600', 'Actron Ibuprofeno 600mg'], ['ACTRON 600MG', 'Actron 600'], ['SUSPENSION 60ML 200MG', 'Suspension 200mg 60ml'],
    ['PACK NIVEA CREMA 125G JABON 75G', PACK], ['PACK NIVEA JABON 75G CREMA 125G', PACK], ['PACK NIVEA CREMA 125G 75G', PACK],
    ['MARLBORO BOX 20 X10', 'Cigarrillo Marlboro Box x20'], ['SALCHICHA VIENA X6 X12', 'Salchicha Viena x6'],
  ];
  for (const [t, x] of buenas) assert.equal(explica(t, x), true, `${t} | ${x}`);
});

test('REV75: el generador intercambia componentes y la mutación con y sin descripción da cero', () => {
  assert.ok(mutaciones({nombre: PACK}).includes('Pack Nivea Crema 75g Jabon 125g'));
  assert.ok(mutaciones({nombre: COMBO}).includes('Combo Jugo Naranja 2L Jugo Manzana 1L'));
  const r = correr(ctx, catalogo);
  assert.ok(r.total > 150, `pruebas: ${r.total}`);
  assert.deepEqual(r.original, []);
  assert.deepEqual(r.otro, []);
});

test('REV75: los trasplantes conservan la cantidad del donante y se prueban también con descripción', () => {
  const ts = trasplantes.textos([{nombre: 'Ibuprofeno Actron 400mg 20 comprimidos'}, {nombre: 'Ibuprofeno Bago 600mg 10 comprimidos'}]);
  assert.deepEqual(ts.map(t => t.texto).sort(), ['Ibuprofeno Actron 600mg 10 comprimidos', 'Ibuprofeno Bago 400mg 20 comprimidos']);
  const cat = [...catalogo, P('Fideos Matarazzo Penne Rigate N45 500gr'), P('Gomitas Arcor Tubitos Frutilla 620gr'),
    P('Queso Cremoso Punta del Agua 35gr'), P('Pack Nivea Crema 75g Jabon 125g Promo')];
  const r = trasplantes.correr(ctx, cat);
  assert.equal(r.total, 2 * r.textos);
  assert.ok(r.textos > 10, `textos: ${r.textos}`);
  assert.deepEqual(r.malos, []);
});
