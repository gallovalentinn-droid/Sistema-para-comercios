const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../beta/index.html'), 'utf8');
const between = (start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `No se encontró bloque ${start}`);
  return source.slice(a, b);
};
const reglaCode = between('function reglaPromoCantidad(modalidad){', '\n// Se aplica un solo descuento');

function calcular(promociones, cant, producto) {
  const ctx = {
    db: {promociones}, ticket: [{id: 'l1', tipo: 'producto', prodId: 'p1', precio: 100, cant}],
    hoy: () => '2026-09-26', num: value => Number(value) || 0,
    prod: id => id === 'p1' ? (producto || {id: 'p1', unidad: 'unidad', rubro: 'Bebidas'}) : null,
    formaKey: x => x, pago: '', subtotalTicket: () => 100*cant, montoDescuento: () => 0
  };
  return vm.runInNewContext(`${between('function vigentePromo(pr){', '\nlet rev31ReabrirTrasCierre')}\n({detalle:detallePromoAuto(),descuento:descuentoPromoAuto()})`, ctx);
}

test('2x1 y 3x2 bonifican una unidad por grupo completo del mismo producto', () => {
  const pr = modalidad => ({tipo:'producto', objetivoId:'p1', modalidad, porcentaje:0, activa:true});
  for (const [cant, esperado] of [[1,0],[2,100],[3,100],[4,200],[5,200]]) {
    assert.equal(calcular([pr('2x1')], cant).descuento, esperado);
  }
  for (const [cant, esperado] of [[1,0],[2,0],[3,100],[4,100],[6,200]]) {
    assert.equal(calcular([pr('3x2')], cant).descuento, esperado);
  }
  assert.equal(calcular([pr('2x1')], 2).detalle[0].modalidad, '2x1');
});

test('una promoción personalizada permite llevar cuatro y pagar dos sin bonificar grupos incompletos', () => {
  const pr={tipo:'producto',objetivoId:'p1',modalidad:'4x2',porcentaje:0,activa:true};
  assert.equal(calcular([pr],3).descuento,0);
  assert.equal(calcular([pr],4).descuento,200);
  assert.equal(calcular([pr],9).descuento,400);
  assert.equal(calcular([{...pr,modalidad:'4x4'}],4).descuento,0);
  assert.equal(calcular([{...pr,modalidad:'1x0'}],4).descuento,0);
});

test('no apila promociones: elige mayor beneficio y respeta vigencia, producto y unidad', () => {
  const cantidad={tipo:'producto',objetivoId:'p1',modalidad:'2x1',porcentaje:0,activa:true};
  const porcentaje={tipo:'producto',objetivoId:'p1',porcentaje:60,activa:true};
  assert.equal(calcular([cantidad,porcentaje],2).descuento,120);
  assert.equal(calcular([cantidad,{...porcentaje,porcentaje:20}],2).descuento,100);
  assert.equal(calcular([{...cantidad,objetivoId:'p2'}],2).descuento,0);
  assert.equal(calcular([{...cantidad,activa:false}],2).descuento,0);
  assert.equal(calcular([{...cantidad,hasta:'2026-09-25'}],2).descuento,0);
  assert.equal(calcular([cantidad],2,{id:'p1',unidad:'kg',rubro:'Bebidas'}).descuento,0);
});

test('el neto de la venta usa el importe real de una promoción por cantidad', () => {
  const code=between('function asignarNetosVenta(v){','\nfunction netoItemVenta(');
  const result=vm.runInNewContext(`${code}\nasignarNetosVenta({total:100,items:[{tipo:'producto',lineId:'l1',cant:2,precio:100,promoPct:0}],promoAutoDetalle:[{itemId:'l1',modalidad:'2x1',monto:100}]})`);
  assert.equal(result.items[0].neto,100);
});

test('la sincronización guarda y recupera la modalidad en objetivo_texto', () => {
  const payloadCode=source.match(/function f3PayloadPromocion\(p\)\{[^\n]+\}/)[0];
  const payload=vm.runInNewContext(`${reglaCode}\n${payloadCode}\nf3PayloadPromocion({id:'r1',tipo:'producto',objetivoId:'p1',modalidad:'3x2',porcentaje:0})`,{
    prod:()=>({id:'p1'}),f3AsegurarV4Id:x=>x.id,f3Estado:{comercioId:'c1'}
  });
  assert.equal(payload.objetivo_texto,'3x2');
  assert.equal(payload.producto_id,'p1');
  assert.equal(payload.porcentaje,0);
  const mapCode=between('function f32MapPromocion(row,base=db){','\n// Fila V4 completa');
  const mapped=vm.runInNewContext(`${reglaCode}\n${mapCode}\nf32MapPromocion({id:'r1',tipo:'producto',producto_id:'p1',objetivo_texto:'3x2',porcentaje:0})`,{
    db:{},f32LocalParaRemoto:()=>({actual:null,id:'r1'}),f32ResolverIdLocal:()=> 'p1'
  });
  assert.equal(mapped.modalidad,'3x2');
  assert.equal(mapped.objetivoId,'p1');
});

test('la sincronización conserva una promoción por cantidad personalizada', () => {
  const payloadCode=source.match(/function f3PayloadPromocion\(p\)\{[^\n]+\}/)[0];
  const payload=vm.runInNewContext(`${reglaCode}\n${payloadCode}\nf3PayloadPromocion({id:'r1',tipo:'producto',objetivoId:'p1',modalidad:'4x2',porcentaje:0})`,{
    prod:()=>({id:'p1'}),f3AsegurarV4Id:x=>x.id,f3Estado:{comercioId:'c1'}
  });
  assert.equal(payload.objetivo_texto,'4x2');
  const mapCode=between('function f32MapPromocion(row,base=db){','\n// Fila V4 completa');
  const mapped=vm.runInNewContext(`${reglaCode}\n${mapCode}\nf32MapPromocion({id:'r1',tipo:'producto',producto_id:'p1',objetivo_texto:'4x2',porcentaje:0})`,{
    db:{},f32LocalParaRemoto:()=>({actual:null,id:'r1'}),f32ResolverIdLocal:()=> 'p1'
  });
  assert.equal(mapped.modalidad,'4x2');
});
