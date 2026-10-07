// REV72: números y unidades de la presentación (hallazgos R71-01, R71-02 y R71-03 de la revisión de REV71).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'beta/index.html'), 'utf8').replace(/\r\n/g, '\n');
const ctx = vm.createContext({});
vm.runInContext(html.slice(html.indexOf('/* REV70_EMPAREJADOR_START */'), html.indexOf('/* REV70_EMPAREJADOR_END */')), ctx);

let n = 0;
const P = nombre => ({id: `p${++n}`, nombre, costo: 1000});
// Catálogo sintético de la prueba REV70 más los artículos de la revisión de REV71.
const base = [
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
];
const conBox20 = [...base, P('Cigarrillo Marlboro Box 20')].filter(p => p.nombre !== 'Cigarrillo Marlboro Box x20');
const conActron = [...base, P('Ibuprofeno Actron 600 20 comprimidos')];
const conVitamina = [...base, P('Suplemento Vitamina 500mg')];
const catalogoExtra = [...base, P('Harina Favorita 000 de Trigo 1kg'), P('Tulipan Clasico (1 gel + 3 preservativos)'),
  P('Cafe Arlistan 50gr'), P('Coca Cola 2,25L'), P('Lata Coca Cola 354ml'), P('Rinde 2 Naranja 13 g'), P('Pilas Energizer AA x4')];
const emp = (cat, texto) => ctx.rev70Emparejar(texto, ctx.rev70Indice(cat));
const noEligeSolo = (r, nombre, msg) => assert.ok(!(r.estado === 'seguro' && r.producto.nombre === nombre), msg);

test('R71-01: un atado sin X no se empareja solo con otra presentación, en ninguna de las dos notaciones', () => {
  const a = emp(base, 'CIG.MARLB.BOX 10');
  assert.notEqual(a.estado, 'seguro');
  assert.ok(a.candidatos.find(c => c.producto.nombre === 'Cigarrillo Marlboro Box x20')?.incompatible, 'Box x20 marcado como otra presentación');
  noEligeSolo(emp(conBox20, 'Cigarrillo Marlboro Box x10'), 'Cigarrillo Marlboro Box 20', 'catálogo sin X, factura con X');
  noEligeSolo(emp(base, 'SALCHICHA VIENA 12'), 'Salchicha Viena x6');
  noEligeSolo(emp(base, 'SALCHICHA VIENA 12 U'), 'Salchicha Viena x6');
  // Controles que tienen que seguir eligiéndose solos: el embalaje del mayorista no choca.
  assert.equal(emp(base, 'MARLBORO BOX 20 X10').producto?.nombre, 'Cigarrillo Marlboro Box x20');
  assert.equal(emp(base, 'SALCHICHA VIENA X6 X12').producto?.nombre, 'Salchicha Viena x6');
  assert.equal(emp(base, 'CERV.ISENBECK LAT 473CC X24').producto?.nombre, 'Lata Cerveza Isenbeck 473ml');
  assert.equal(emp(base, 'CIG.MARLB.BOX 20').producto?.nombre, 'Cigarrillo Marlboro Box x20');
  assert.equal(emp(conBox20, 'Cigarrillo Marlboro Box x20').producto?.nombre, 'Cigarrillo Marlboro Box 20', 'x20 y 20 son lo mismo');
  assert.equal(emp(base, 'AGUA V.MANAOS S/GAS 500X12').producto?.nombre, 'Agua Villamanaos 500 ml');
  // Producto sin número en el catálogo: si otro candidato sí tiene el 10 leído, ese número decide y se pregunta.
  const sinNumero = [...base, P('Cigarrillos Marlboro box')];
  noEligeSolo(emp(sinNumero, 'CIG.MARLB.BOX 10'), 'Cigarrillos Marlboro box');
  assert.equal(emp(sinNumero, 'MARLBORO BOX 20 X10').producto?.nombre, 'Cigarrillo Marlboro Box x20', 'el 20 confirma; el X10 es embalaje');
});

test('R71-02: compartir un número no oculta otro número contradictorio', () => {
  const r = emp(conActron, 'Ibuprofeno Actron 400 20 comprimidos');
  noEligeSolo(r, 'Ibuprofeno Actron 600 20 comprimidos');
  assert.ok(r.candidatos.every(c => c.producto.nombre !== 'Ibuprofeno Actron 600 20 comprimidos' || c.incompatible));
  noEligeSolo(emp(conActron, 'IBUPROFENO ACTRON 600 10 COMP'), 'Ibuprofeno Actron 600 20 comprimidos', 'mismo 600, otra cantidad');
  assert.equal(emp(conActron, 'IBUPROFENO ACTRON 600 20 COMP').producto?.nombre, 'Ibuprofeno Actron 600 20 comprimidos');
  noEligeSolo(emp(catalogoExtra, 'TULIPAN CLASICO 3 GEL 3 PRESERVATIVOS'), 'Tulipan Clasico (1 gel + 3 preservativos)', 'los números se comparan como multiconjunto');
  noEligeSolo(emp(catalogoExtra, 'HARINA FAVORITA 0000 1KG'), 'Harina Favorita 000 de Trigo 1kg');
  noEligeSolo(emp(catalogoExtra, 'HARINA FAVORITA 1 1KG'), 'Harina Favorita 000 de Trigo 1kg');
  assert.equal(emp(catalogoExtra, 'HARINA FAVORITA 000 1KG').producto?.nombre, 'Harina Favorita 000 de Trigo 1kg');
});

test('R71-03: mg y mcg se interpretan y se comparan, no se descartan', () => {
  assert.deepEqual({...ctx.rev70Presentacion('500MG')}, {tipo: 'g', valor: 0.5, crudo: 500});
  assert.deepEqual({...ctx.rev70Presentacion('500 mcg')}, {tipo: 'g', valor: 0.0005, crudo: 500});
  assert.deepEqual({...ctx.rev70Presentacion('500µg')}, {tipo: 'g', valor: 0.0005, crudo: 500});
  noEligeSolo(emp(conVitamina, 'Suplemento Vitamina 500mcg'), 'Suplemento Vitamina 500mg');
  noEligeSolo(emp(conVitamina, 'SUPLEMENTO VITAMINA 500UG'), 'Suplemento Vitamina 500mg');
  noEligeSolo(emp(conVitamina, 'SUPLEMENTO VITAMINA 500 G'), 'Suplemento Vitamina 500mg');
  assert.equal(emp(conVitamina, 'SUPLEMENTO VITAMINA 500 MG').producto?.nombre, 'Suplemento Vitamina 500mg');
  assert.equal(emp(conVitamina, 'SUPLEMENTO VITAMINA 0,5 G').producto?.nombre, 'Suplemento Vitamina 500mg', 'misma masa en otra unidad');
});

test('REV72: medidas sin tolerancia (500 y 501 ml son distintas)', () => {
  noEligeSolo(emp(base, 'AGUA VILLAMANAOS 501 ML'), 'Agua Villamanaos 500 ml');
  noEligeSolo(emp(catalogoExtra, 'COCA COLA LATA 355'), 'Lata Coca Cola 354ml');
  assert.equal(emp(base, 'MANAOS COLA 2250 CC').producto?.nombre, 'Manaos Cola 2,25 L', 'la conversión exacta sí coincide');
});

test('REV72: cambiar cualquier número o unidad del nombre nunca deja elegido solo al producto original', () => {
  const cat = catalogoExtra.concat(conActron.slice(-1), conVitamina.slice(-1), conBox20.slice(-1));
  const idx = ctx.rev70Indice(cat);
  const mutaciones = [];
  for (const p of cat) {
    const re = /\d+(?:[.,]\d+)?/g; let m;
    while ((m = re.exec(p.nombre))) {
      const v = parseFloat(m[0].replace(',', '.'));
      for (const nv of [v * 2, v + 1, v > 1 ? Math.max(1, Math.round(v / 2)) : v + 2]) {
        if (nv === v) continue;
        mutaciones.push([p, p.nombre.slice(0, m.index) + String(nv).replace('.', ',') + p.nombre.slice(m.index + m[0].length)]);
      }
    }
    for (const [a, b] of [[/(\d)\s*mg\b/i, '$1mcg'], [/(\d)\s*ml\b/i, '$1 L'], [/(\d)\s*(gr|g)\b/i, '$1kg'], [/(\d)\s*kg\b/i, '$1gr'], [/(\d)\s*(l|lt)\b/i, '$1ml']]) {
      if (a.test(p.nombre)) mutaciones.push([p, p.nombre.replace(a, b)]);
    }
  }
  assert.ok(mutaciones.length > 80, `mutaciones: ${mutaciones.length}`);
  const malas = mutaciones.filter(([p, txt]) => { const r = ctx.rev70Emparejar(txt, idx); return r.estado === 'seguro' && r.producto === p; })
    .map(([p, txt]) => `${txt} -> ${p.nombre}`);
  assert.deepEqual(malas, []);
});
