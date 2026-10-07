const test = require('node:test');
const assert = require('node:assert/strict');
const {fs, load, fixture, plain, candidatePath, vm} = require('./stock-perf-rev80-fixture.cjs');
const html = fs.readFileSync(candidatePath, 'utf8');
const ctx = load(html);
const start = html.indexOf('/* REV81_COMPARACION_START */'), end = html.indexOf('/* REV81_COMPARACION_END */');
if (start >= 0) vm.runInContext(html.slice(start, end), ctx);
const p = {id:'p', nombre:'Azúcar', stockBase:100};
const a = {id:'a', desde:'2026-10-01T08:00:00Z', hasta:'2026-10-01T12:00:00Z'};
const b = {id:'b', desde:'2026-10-01T13:00:00Z', hasta:'2026-10-01T16:00:00Z'};
const m = (id, cant, fecha, tipo='venta', extra={}) => ({prodId:'p', _v4sessionSegmentId:id, cant, fecha, tipo, ...extra});
const run = (movimientos, extra={}) => {
  assert.equal(typeof ctx.f81CompararStock, 'function', 'existe el modelo de la nueva comparación');
  return plain(ctx.f81CompararStock({productos:[p], movimientos, turnos:[b,a], ...extra}));
};
test('ordena cronológicamente la selección sin mutarla y conserva los saldos', () => {
  const input={productos:[p], movimientos:[m('a',-2,'2026-10-01T10:00:00Z')], turnos:[b,a]};
  const before=JSON.stringify(input), r=run(input.movimientos,input);
  assert.deepEqual(r.elegidos.map(t=>t.id),['a','b']);
  assert.deepEqual(r.filas[0].turnos.map(t=>[t.inicio,t.final]),[[100,98],[98,98]]);
  assert.equal(JSON.stringify(input),before);
});
test('entre turnos excluye exactamente el cierre y la apertura e incluye ventas de otra caja', () => {
  const r=run([m('a',-1,a.hasta),m('otra',24,'2026-10-01T12:15:00Z','ingreso'),m('otra',-2,'2026-10-01T12:30:00Z'),m('b',-3,b.desde)]);
  assert.deepEqual(r.filas[0].entre.movs.map(m=>m.cant),[24,-2]);
  assert.equal(r.filas[0].entre.neto,22);
  assert.deepEqual(r.filas[0].turnos.map(t=>[t.inicio,t.final]),[[100,99],[121,118]]);
});
test('no inventa un intervalo entre turnos superpuestos ni consecutivos', () => {
  const r=run([m('a',-1,'2026-10-01T10:00:00Z')],{turnos:[a,{...b,desde:'2026-10-01T11:00:00Z'}]});
  assert.equal(r.superpuestos,true); assert.deepEqual(r.filas[0].entre.movs,[]);
  const same=run([m('a',-1,a.hasta)],{turnos:[a,{...b,desde:a.hasta}]});
  assert.equal(same.superpuestos,false); assert.equal(same.sinIntervalo,true);
});
test('otra caja con movimientos que se compensan sigue teniendo aviso y detalle', () => {
  const r=run([m('otra',-2,'2026-10-01T09:00:00Z'),m('otra',2,'2026-10-01T10:00:00Z','ajuste')]);
  assert.equal(r.filas[0].turnos[0].externos,0);
  assert.equal(r.filas[0].turnos[0].externosMovs.length,2);
  assert.ok(r.filas[0].avisos.includes('Otra caja o sin turno'));
});
test('la cuenta global excluye movimientos propios fuera del horario pero los conserva para revisar', () => {
  const r=run([m('a',-3,'2026-10-01T10:00:00Z'),m('a',-7,'2026-10-01T17:00:00Z'),m('otra',5,'2026-10-01T11:00:00Z','ingreso')]);
  const t=r.filas[0].turnos[0];
  assert.equal(t.vendidas,10); assert.equal(t.cuenta.vendidas,3);
  assert.equal(t.inicio-t.cuenta.vendidas+t.cuenta.ingresos+t.cuenta.ajustes+t.externos,t.final);
  assert.equal(t.movs.length,2); assert.ok(r.filas[0].avisos.includes('Revisar fechas'));
});
test('no muestra un resultado calculado cuando faltan ventas del cierre', () => {
  const r=run([m('a',-3,'2026-10-01T10:00:00Z')],{turnos:[{...a,cantVentas:2},b],ventas:[]});
  assert.deepEqual(r.filas[0].turnos.map(t=>[t.inicio,t.final]),[[null,null],[null,null]]);
  assert.ok(r.filas[0].avisos.includes('Stock no disponible'));
});
test('solo con avisos filtra productos y mantiene el aviso de stock negativo', () => {
  const r=run([m('a',-101,'2026-10-01T10:00:00Z'),m('a',-1,'2026-10-01T10:00:00Z','venta',{prodId:'q'})],{productos:[p,{id:'q',nombre:'Otro',stockBase:10}],soloAvisos:true});
  assert.deepEqual(r.filas.map(r=>r.producto.id),['p']); assert.equal(r.cantidadAvisos,1);
});
test('las operaciones entre turnos de neto cero permanecen visibles y se conservan decimales', () => {
  const r=run([m('otra',0.125,'2026-10-01T12:10:00Z','ingreso'),m('otra',-0.125,'2026-10-01T12:20:00Z','ajuste')]);
  assert.equal(r.filas[0].entre.movs.length,2); assert.equal(r.filas[0].entre.neto,0);
});
test('la nueva presentación no recorre el historial entero por producto', () => {
  const input=fixture({products:40,shifts:12,movements:1200}); let reads=0;
  input.movimientos=input.movimientos.map(m=>{const id=m.prodId;return {...m,get prodId(){reads++;return id;}}});
  run(input.movimientos,input);
  assert.ok(reads<=1200*6,`${reads} lecturas para 1200 movimientos`);
});
