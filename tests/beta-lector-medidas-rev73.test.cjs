// REV73: todas las medidas del texto (hallazgo R72-01 de la revisión de REV72) y mutación ampliada con oráculo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'beta/index.html'), 'utf8').replace(/\r\n/g, '\n');
const ctx = vm.createContext({});
vm.runInContext(html.slice(html.indexOf('/* REV70_EMPAREJADOR_START */'), html.indexOf('/* REV70_EMPAREJADOR_END */')), ctx);
const {correr, datos} = require(path.join(root, 'entregables/evaluacion-emparejador-REV77/mutaciones.cjs'));

let n = 0;
const P = nombre => ({id: `p${++n}`, nombre, costo: 1000});
const catalogo = [
  P('Fernet Branca 750ml'), P('Fernet Branca 1L'), P('Lata Speed 473ml'), P('Lata Speed 250ml'),
  P('Cigarrillo Marlboro Box x20'), P('Cigarrillo Marlboro x10'), P('Salchicha Viena x6'), P('Pepsi 2L'),
  P('Lata Cerveza Isenbeck 473ml'), P('Arroz Largo Fino Molinos Ala 1kg'), P('Arroz Largo Fino Molinos Ala 500gr'),
  P('Ibuprofeno Suspension 200mg 60ml'), P('Ibuprofeno Suspension 100mg 120ml'), P('Actron Ibuprofeno 600'),
  P('Paracetamol 500mg 20 comprimidos'), P('Suplemento Vitamina 500mg'), P('Harina Favorita 000 de Trigo 1kg'),
  P('Chizitos Krachitos 240g'), P('chizitos krachitos'), P('Aceite de Girasol Cocinero 900ml'), P('7UP 2L'),
  P('Tulipan Clasico (1 gel + 3 preservativos)'), P('Rinde 2 Naranja 13 g'),
];
const idx = ctx.rev70Indice(catalogo);
const emp = t => ctx.rev70Emparejar(t, idx);
const noEligeSolo = (t, nombre) => { const r = emp(t); assert.ok(!(r.estado === 'seguro' && r.producto.nombre === nombre), `${t} -> ${nombre}`); return r; };

test('R72-01: se leen todas las medidas, no solo la última', () => {
  assert.deepEqual([...ctx.rev73Medidas('Ibuprofeno Suspension 200mg 60ml')].map(m => [m.tipo, m.valor, m.crudo]), [['g', 0.2, 200], ['ml', 60, 60]]);
  assert.deepEqual([...ctx.rev73Medidas('Fernet Branca 750ml')].map(m => [m.tipo, m.valor]), [['ml', 750]]);
  assert.equal(ctx.rev73Medidas('Cigarrillo Marlboro Box x20').length, 0);
});

test('R72-01 variante A: una dosis distinta con el mismo volumen no coincide', () => {
  const r = noEligeSolo('Ibuprofeno Suspension 100mg 60ml', 'Ibuprofeno Suspension 200mg 60ml');
  assert.ok(r.candidatos.every(c => c.producto.nombre !== 'Ibuprofeno Suspension 200mg 60ml' || c.incompatible));
  noEligeSolo('IBUPROFENO SUSPENSION 200MG 120ML', 'Ibuprofeno Suspension 200mg 60ml');
  noEligeSolo('IBUPROFENO SUSPENSION 100 60ML', 'Ibuprofeno Suspension 200mg 60ml');
  assert.equal(emp('IBUPROFENO SUSPENSION 200MG 60ML').producto?.nombre, 'Ibuprofeno Suspension 200mg 60ml');
  assert.equal(emp('IBUPROFENO SUSPENSION 200 60ML').producto?.nombre, 'Ibuprofeno Suspension 200mg 60ml', 'la dosis sin unidad también');
  assert.equal(emp('IBUPROFENO SUSPENSION 0,2G 60ML').producto?.nombre, 'Ibuprofeno Suspension 200mg 60ml', 'misma dosis en gramos');
});

test('R72-01 variante B: la unidad solo en la factura no borra el número', () => {
  const r = noEligeSolo('Actron Ibuprofeno 400mg', 'Actron Ibuprofeno 600');
  assert.ok(r.candidatos.every(c => c.producto.nombre !== 'Actron Ibuprofeno 600' || c.incompatible));
  assert.equal(emp('ACTRON IBUPROFENO 600MG').producto?.nombre, 'Actron Ibuprofeno 600', 'mismo número con unidad sí coincide');
  noEligeSolo('PARACETAMOL 500MG 10 COMP', 'Paracetamol 500mg 20 comprimidos');
  noEligeSolo('PARACETAMOL 1G 20 COMP', 'Paracetamol 500mg 20 comprimidos');
  assert.equal(emp('PARACETAMOL 500MG 20 COMP').producto?.nombre, 'Paracetamol 500mg 20 comprimidos');
});

test('REV73: un producto sin tamaño no se elige solo si el catálogo distingue tamaños y la factura trae otro', () => {
  noEligeSolo('CHIZITOS KRACHITOS 480G', 'chizitos krachitos');
  noEligeSolo('CHIZITOS KRACHITOS 241', 'chizitos krachitos');
  assert.equal(emp('CHIZITOS KRACHITOS 240G').producto?.nombre, 'Chizitos Krachitos 240g');
  noEligeSolo('HARINA FAVORITA 0MG 1KG', 'Harina Favorita 000 de Trigo 1kg');
});

test('REV73: controles de embalaje y equivalencias que tienen que seguir eligiéndose solos', () => {
  const casos = [
    ['MARLBORO BOX 20 X10', 'Cigarrillo Marlboro Box x20'], ['SALCHICHA VIENA X6 X12', 'Salchicha Viena x6'],
    ['CERV.ISENBECK LAT 473CC X24', 'Lata Cerveza Isenbeck 473ml'], ['PEPSI 2LT X6', 'Pepsi 2L'],
    ['FERNET BRANCA 750CC', 'Fernet Branca 750ml'], ['ACEITE GIRASOL COCINERO 900CC', 'Aceite de Girasol Cocinero 900ml'],
    ['SUPLEMENTO VITAMINA 0,5 G', 'Suplemento Vitamina 500mg'], ['ARROZ MOLINOS ALA 1000G', 'Arroz Largo Fino Molinos Ala 1kg'],
  ];
  for (const [t, esperado] of casos) assert.equal(emp(t).producto?.nombre, esperado, t);
});

test('REV73: mutación ampliada — ni el original ni otro producto sin esos números quedan elegidos solos', () => {
  const r = correr(ctx, catalogo);
  assert.ok(r.total > 120, `mutaciones: ${r.total}`);
  assert.deepEqual(r.original, []);
  assert.deepEqual(r.otro, []);
  // El oráculo es independiente del emparejador: reconoce números y unidades con una expresión propia (REV74: con procedencia).
  assert.deepEqual(JSON.parse(JSON.stringify(datos('Ibuprofeno 200mg 60ml x6'))), [{k: 'm', dim: 'g', valor: 0.2, n: 200}, {k: 'm', dim: 'ml', valor: 60, n: 60}, {k: 'p', n: 6}]);
});
