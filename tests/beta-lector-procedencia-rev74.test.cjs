// REV74: la procedencia de cada número (medida, número suelto, paquete) en la conciliación (R73-01)
// y un oráculo de mutación que se prueba a sí mismo con selecciones incorrectas conocidas (R73-02).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'beta/index.html'), 'utf8').replace(/\r\n/g, '\n');
const ctx = vm.createContext({});
vm.runInContext(html.slice(html.indexOf('/* REV70_EMPAREJADOR_START */'), html.indexOf('/* REV70_EMPAREJADOR_END */')), ctx);
const {correr, datos, explica, mutaciones} = require(path.join(root, 'entregables/evaluacion-emparejador-REV77/mutaciones.cjs'));
const trasplantes = require(path.join(root, 'entregables/evaluacion-emparejador-REV77/trasplantes.cjs'));

let n = 0;
const P = nombre => ({id: `p${++n}`, nombre});
const catalogo = [
  P('Fernet Branca 750ml'), P('Fernet Branca 1L'), P('Lata Speed 473ml'), P('Lata Speed 250ml'),
  P('Cigarrillo Marlboro Box x20'), P('Cigarrillo Marlboro x10'), P('Cigarrillo Chesterfield Comun x20'), P('Salchicha Viena x6'),
  P('Lata Cerveza Isenbeck 473ml'), P('Pepsi 2L'), P('Arroz Largo Fino Molinos Ala 1kg'),
  P('Ibuprofeno Suspension 200mg 60ml'), P('Ibuprofeno Suspension 200mg 60ml x100'), P('Actron Ibuprofeno 600'),
  P('Paracetamol 500mg 20 comprimidos'), P('Suplemento Vitamina 500mg'), P('Fertilizante Universal 20g 500ml x10'),
  P('Fertilizante Universal 5g 500ml x20'), P('Chizitos Krachitos 240g'), P('chizitos krachitos'),
];
const idx = ctx.rev70Indice(catalogo);
const emp = t => ctx.rev70Emparejar(t, idx);
const noEligeSolo = (t, nombre) => { const r = emp(t); assert.ok(!(r.estado === 'seguro' && r.producto.nombre === nombre), `${t} -> ${nombre}`); return r; };

test('R73-01: un número de paquete no tapa una contradicción entre medidas', () => {
  const r = noEligeSolo('Fertilizante Universal 10g 500ml x20', 'Fertilizante Universal 20g 500ml x10');
  assert.ok(r.candidatos.every(c => c.producto.nombre !== 'Fertilizante Universal 20g 500ml x10' || c.incompatible));
  noEligeSolo('Ibuprofeno Suspension 100mg 60ml x200', 'Ibuprofeno Suspension 200mg 60ml x100');
  // Con solo los dos fertilizantes en el catálogo tampoco se elige ninguno solo.
  const dos = [P('Fertilizante Universal 5g 500ml x20'), P('Fertilizante Universal 20g 500ml x10')];
  assert.notEqual(ctx.rev70Emparejar('Fertilizante Universal 10g 500ml x20', ctx.rev70Indice(dos)).estado, 'seguro');
  // Un paquete no explica una medida ni al revés.
  noEligeSolo('CIGARRILLO CHESTERFIELD COMUN X20MG', 'Cigarrillo Chesterfield Comun x20');
});

test('R73-01: la conciliación guarda de dónde viene cada número', () => {
  const r = ctx.rev74Conciliar(ctx.rev74Items({medidas: ctx.rev73Medidas('10g 500ml'), numeros: [], packs: [20]}),
    ctx.rev74Items({medidas: ctx.rev73Medidas('20g 500ml'), numeros: [], packs: [10]}));
  assert.equal(r.contradiccion, true);
  assert.equal(r.medidas, 1);
  const ok = ctx.rev74Conciliar(ctx.rev74Items({medidas: ctx.rev73Medidas('60ml'), numeros: [200], packs: []}),
    ctx.rev74Items({medidas: ctx.rev73Medidas('200mg 60ml'), numeros: [], packs: []}));
  assert.equal(ok.contradiccion, false);
  assert.equal(ok.sinExplicar.length + ok.faltantes.length, 0, '200 sin unidad con 200mg');
});

test('REV74: el orden de las medidas no importa y los controles siguen', () => {
  // Sin la variante x100, que hace ambiguo un renglón sin paquete.
  const sinX100 = catalogo.filter(p => p.nombre !== 'Ibuprofeno Suspension 200mg 60ml x100');
  const emp2 = t => ctx.rev70Emparejar(t, ctx.rev70Indice(sinX100));
  assert.equal(emp2('IBUPROFENO SUSPENSION 60ML 200MG').producto?.nombre, 'Ibuprofeno Suspension 200mg 60ml');
  assert.equal(emp2('IBUPROFENO SUSPENSION 200 60ML').producto?.nombre, 'Ibuprofeno Suspension 200mg 60ml');
  // Con la variante x100 presente, el mismo renglón queda para elegir entre las dos (no se adivina).
  assert.notEqual(emp('IBUPROFENO SUSPENSION 60ML 200MG').estado, 'seguro');
  noEligeSolo('IBUPROFENO SUSPENSION 200MG 60ML X200MG', 'Ibuprofeno Suspension 200mg 60ml');
  const casos = [
    ['FERTILIZANTE UNIVERSAL 20G 500ML X10', 'Fertilizante Universal 20g 500ml x10'],
    ['FERTILIZANTE UNIVERSAL 20G 500ML X10 X24', 'Fertilizante Universal 20g 500ml x10'],
    ['ACTRON IBUPROFENO 600MG', 'Actron Ibuprofeno 600'], ['MARLBORO BOX 20 X10', 'Cigarrillo Marlboro Box x20'],
    ['SALCHICHA VIENA X6 X12', 'Salchicha Viena x6'], ['CERV.ISENBECK LAT 473CC X24', 'Lata Cerveza Isenbeck 473ml'],
    ['SUPLEMENTO VITAMINA 0,5 G', 'Suplemento Vitamina 500mg'], ['PARACETAMOL 500MGX20', 'Paracetamol 500mg 20 comprimidos'],
  ];
  for (const [t, esperado] of casos) assert.equal(emp(t).producto?.nombre, esperado, t);
  noEligeSolo('Actron Ibuprofeno 400mg', 'Actron Ibuprofeno 600');
  noEligeSolo('Ibuprofeno Suspension 100mg 60ml', 'Ibuprofeno Suspension 200mg 60ml');
});

test('R73-02: el oráculo lee números sin recortarlos y con su procedencia', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(datos('Ibuprofeno 400MGX20'))), [{k: 'm', dim: 'g', valor: 0.4, n: 400}, {k: 'p', n: 20}]);
  assert.deepEqual(JSON.parse(JSON.stringify(datos('Paracetamol 500mg 20 comprimidos'))), [{k: 'm', dim: 'g', valor: 0.5, n: 500}, {k: 'p', n: 20}]);
  assert.deepEqual(JSON.parse(JSON.stringify(datos('brahma porron 340cm´3'))), [{k: 'm', dim: 'ml', valor: 340, n: 340}]);
});

test('R73-02: el oráculo rechaza selecciones incorrectas conocidas y acepta las correctas', () => {
  const malas = [
    ['Fertilizante Universal 10g 500ml x20', 'Fertilizante Universal 20g 500ml x10'],
    ['Ibuprofeno 400MGX20', 'Ibuprofeno 40 20'],
    ['Tulipan 3 gel + 3 preservativos', 'Tulipan 3 gel + 1 preservativo'],
    ['ACTRON 400MG', 'Actron Ibuprofeno 600'], ['CIG BOX X10', 'Cigarrillo Marlboro Box x20'],
    ['CHESTERFIELD COMUN X20MG', 'Cigarrillo Chesterfield Comun x20'],
  ];
  for (const [t, x] of malas) assert.equal(explica(t, x), false, `${t} | ${x}`);
  const buenas = [
    ['MARLBORO BOX 20 X10', 'Cigarrillo Marlboro Box x20'], ['SALCHICHA VIENA X6 X12', 'Salchicha Viena x6'],
    ['IBUPROFENO 200 60ML', 'Ibuprofeno Suspension 200mg 60ml'], ['VITAMINA 0,5 G', 'Suplemento Vitamina 500mg'],
    ['ACTRON 600MG', 'Actron Ibuprofeno 600'], ['CERV 473CC X24', 'Lata Cerveza Isenbeck 473ml'],
    ['SUSPENSION 60ML 200MG', 'Suspension 200mg 60ml'],
  ];
  for (const [t, x] of buenas) assert.equal(explica(t, x), true, `${t} | ${x}`);
});

test('R73-02: el generador intercambia medida y paquete, y la mutación da cero en los dos criterios', () => {
  assert.ok(mutaciones({nombre: 'Fertilizante Universal 20g 500ml x10'}).includes('Fertilizante Universal 10g 500ml x20'));
  const r = correr(ctx, catalogo);
  assert.ok(r.total > 120, `mutaciones: ${r.total}`);
  assert.deepEqual(r.original, []);
  assert.deepEqual(r.otro, []);
});

test('REV74: trasplante de números entre productos de la misma familia — toda elección automática se explica', () => {
  const cat = [...catalogo, P('Fideos Luchetti Codito 500gr'), P('Fideos Matarazzo Penne Rigate N45 500gr'), P('Gomitas Sueltas'),
    P('Gomitas Arcor Tubitos Frutilla 620gr'), P('Gomitas Arcor Viboritas 30gr')];
  const r = trasplantes.correr(ctx, cat);
  assert.ok(r.total > 20, `textos: ${r.total}`);
  assert.deepEqual(r.malos, []);
  // Los casos que encontró esta prueba sobre el catálogo real, con datos sintéticos y sin otro producto de la
  // familia que tenga ese dato (así no los frena otra regla y la prueba falla sobre REV73):
  const cat2 = [...catalogo, P('Fideos Luchetti Codito 500gr'), P('Gomitas Sueltas'), P('Pan de combo pancho'), P('Queso Dambo Punta del Agua')];
  const idx2 = ctx.rev70Indice(cat2);
  const e2 = t => ctx.rev70Emparejar(t, idx2);
  assert.notEqual(e2('Fideos Luchetti Codito 45 500gr').estado, 'seguro', 'un número suelto sin explicar');
  assert.notEqual(e2('Gomitas Sueltas 620gr').estado, 'seguro', 'una medida que el producto no tiene');
  assert.notEqual(e2('Pan de combo pancho 500g').estado, 'seguro');
  assert.notEqual(e2('Queso Dambo Punta del Agua 35gr').estado, 'seguro');
  // Un paquete de más sí es embalaje, y el mismo nombre sin datos sigue coincidiendo.
  assert.equal(e2('FIDEOS LUCHETTI CODITO 500GR X20').producto?.nombre, 'Fideos Luchetti Codito 500gr');
  assert.equal(e2('GOMITAS SUELTAS').producto?.nombre, 'Gomitas Sueltas');
  assert.equal(e2('QUESO DAMBO PUNTA DEL AGUA X10').producto?.nombre, 'Queso Dambo Punta del Agua');
});
