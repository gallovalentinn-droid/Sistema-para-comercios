const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../beta/index.html'), 'utf8');
const ctx = vm.createContext({numFactura: v => Number(v) || 0, detectarBulto: () => 1});
vm.runInContext(html.slice(html.indexOf('/* REV70_EMPAREJADOR_START */'), html.indexOf('/* REV70_MEMORIA_END */')), ctx);
const catalogo = nombres => nombres.map((nombre, i) => ({id: `qa-${i}`, nombre}));

test('el talle impreso impide asignar otro talle aunque sea el único disponible', () => {
  for (const [texto, producto] of [
    ['PANALES HUGGIES CLASIC M X8U', 'pañales huggies clasic G x8u'],
    ['PAÑAL SUELTO M', 'pañal suelto g'],
    ['PANALES HUGGIES CLASIC P X8U', 'pañales huggies clasic M x8u'],
    ['PANALES HUGGIES CLASIC XG X8U', 'pañales huggies clasic XXG x8u'],
  ]) {
    const idx = ctx.rev70Indice(catalogo([producto]));
    const r = ctx.rev70Emparejar(texto, idx);
    assert.notEqual(r.estado, 'seguro', texto);
    assert.equal(r.producto, null, texto);
    assert.equal(r.evaluar(idx.items[0].p).incompatible, true, 'el candidato es otra presentación');
    assert.notEqual(ctx.rev70Emparejar(texto, idx, {descripcion: producto}).estado, 'seguro', 'la IA no borra el talle impreso');
  }
});

test('cada talle exacto se elige también cuando conviven los otros talles', () => {
  const productos = catalogo(['p', 'm', 'g', 'xg', 'xxg'].map(t => `Pañales Huggies Clasic ${t} x8u`));
  const idx = ctx.rev70Indice(productos);
  for (const [i, t] of ['P', 'M', 'G', 'XG', 'XXG'].entries()) {
    assert.equal(ctx.rev70Emparejar(`PANALES HUGGIES CLASIC ${t} X8U`, idx).producto?.id, `qa-${i}`, t);
  }
});

test('un talle explícito no se confirma con un producto de talle sin identificar', () => {
  assert.notEqual(ctx.rev70Emparejar('PANALES HUGGIES CLASIC M X8U',
    ctx.rev70Indice(catalogo(['Pañales Huggies Clasic x8u']))).estado, 'seguro');
});

test('un nombre abreviado no borra el talle cuando el catálogo identifica pañales', () => {
  const idx = ctx.rev70Indice(catalogo(['Pañales Huggies Clasic G x8u']));
  for (const texto of ['PAÑ HUGGIES CLASIC M X8U', 'HUGGIES CLASIC M X8U']) {
    assert.notEqual(ctx.rev70Emparejar(texto, idx).estado, 'seguro', texto);
    assert.notEqual(ctx.rev70Emparejar(texto, idx, {descripcion: 'Pañales Huggies Clasic G x8u'}).estado, 'seguro', texto);
  }
});

test('pañ abreviado en ambos nombres también identifica talles distintos', () => {
  const idx = ctx.rev70Indice(catalogo(['Pañ Huggies Clasic G x8u']));
  assert.notEqual(ctx.rev70Emparejar('PAÑ HUGGIES CLASIC M X8U', idx).estado, 'seguro');
  assert.equal(ctx.rev70Emparejar('PAÑ HUGGIES CLASIC G X8U', idx).producto?.id, 'qa-0');
});

test('el talle pegado al paquete no se pierde ni en el impreso ni en el catálogo', () => {
  for (const texto of ['PANALES HUGGIES CLASIC MX8U', 'PANALES HUGGIES CLASIC MX8']) {
    const idx = ctx.rev70Indice(catalogo(['Pañales Huggies Clasic G x8u']));
    assert.notEqual(ctx.rev70Emparejar(texto, idx).estado, 'seguro', texto);
    assert.notEqual(ctx.rev70Emparejar(texto, idx, {descripcion: 'Pañales Huggies Clasic G x8u'}).estado, 'seguro');
  }
  const idx = ctx.rev70Indice(catalogo(['Pañales Huggies Clasic MX8U']));
  assert.notEqual(ctx.rev70Emparejar('PANALES HUGGIES CLASIC G X8U', idx).estado, 'seguro');
  assert.equal(ctx.rev70Emparejar('PANALES HUGGIES CLASIC M X8U', idx).producto?.id, 'qa-0');
});

test('las unidades de peso equivalentes siguen eligiendo el mismo producto', () => {
  const idx = ctx.rev70Indice(catalogo(['Crema Huggies 500g', 'Pañales Huggies Clasic G x8u']));
  assert.equal(ctx.rev70Emparejar('CREMA HUGGIES 0,5 KG', idx).producto?.id, 'qa-0');
  assert.equal(ctx.rev70Emparejar('PANALES HUGGIES CLASIC G X8U', idx).producto?.id, 'qa-1');
});

test('MX20 fuera de pañales sigue siendo un código sin confirmar y no embalaje', () => {
  const idx = ctx.rev70Indice(catalogo(['Adaptador USB Negro']));
  for (const texto of ['ADAPTADOR USB NEGRO MX20', 'ADAPTADOR USB NEGRO GX20']) {
    assert.notEqual(ctx.rev70Emparejar(texto, idx).estado, 'seguro', texto);
  }
});
