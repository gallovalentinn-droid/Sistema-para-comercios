const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../beta/index.html'), 'utf8');
function catalogRules() {
  const block = html.match(/\/\* REV31_CATALOG_RULES_START \*\/([\s\S]*?)\/\* REV31_CATALOG_RULES_END \*\//);
  assert.ok(block, 'faltan las reglas compartidas del catálogo');
  return vm.runInNewContext(`${block[1]};({filtrarCatalogoRev31,filtrarRubrosRev31,actividadProductoRev31,productoArchivadoRev31,estadoTurnoRev31,ajusteStockRev31})`);
}

test('los rubros múltiples se combinan por unión con búsqueda y actividad', () => {
  const {filtrarCatalogoRev31,filtrarRubrosRev31} = catalogRules();
  const productos = [
    {id:'a',nombre:'Agua',rubro:'Aguas'},
    {id:'b',nombre:'Gaseosa',rubro:'Gaseosas'},
    {id:'c',nombre:'Jugo',rubro:'Jugos'}
  ];
  assert.deepEqual(Array.from(filtrarRubrosRev31(productos,['Aguas','Jugos']).map(p=>p.id)),['a','c']);
  assert.deepEqual(Array.from(filtrarCatalogoRev31(productos,[],{rubros:['Aguas','Jugos'],q:'ju',estado:'activos'},new Date('2026-09-23')).map(p=>p.id)),['c']);
  assert.deepEqual(Array.from(filtrarRubrosRev31([...productos,{id:'d',nombre:'Sin categoría',rubro:''}],['Sin rubro']).map(p=>p.id)),['d']);
});

test('actividad contempla ventas directas y componentes de combos, sin anuladas', () => {
  const {actividadProductoRev31,filtrarCatalogoRev31} = catalogRules();
  const hoy = new Date('2026-09-23T12:00:00Z');
  const productos = [{id:'a',nombre:'Agua',rubro:'Aguas'},{id:'b',nombre:'Jugo',rubro:'Jugos'},{id:'c',nombre:'Té',rubro:'Jugos'}];
  const ventas = [
    {fecha:'2026-09-15T12:00:00Z',items:[{tipo:'combo',componentes:[{prodId:'a'}]}]},
    {fecha:'2026-06-01T12:00:00Z',items:[{tipo:'producto',prodId:'b'}]},
    {fecha:'2026-09-20T12:00:00Z',anulada:true,items:[{tipo:'producto',prodId:'c'}]}
  ];
  assert.equal(actividadProductoRev31('a',ventas,hoy),'ultimos30');
  assert.equal(actividadProductoRev31('b',ventas,hoy),'sin90');
  assert.equal(actividadProductoRev31('c',ventas,hoy),'nunca');
  assert.deepEqual(Array.from(filtrarCatalogoRev31(productos,ventas,{actividad:'nunca',estado:'activos'},hoy).map(p=>p.id)),['c']);
});

test('archivar conserva el producto y lo excluye de activos y pedidos', () => {
  const {filtrarCatalogoRev31,productoArchivadoRev31} = catalogRules();
  const p={id:'a',nombre:'Agua',rubro:'Aguas',archivadoAt:'2026-09-23T12:00:00Z'};
  assert.equal(productoArchivadoRev31(p),true);
  assert.equal(filtrarCatalogoRev31([p],[],{estado:'activos'},new Date()).length,0);
  assert.equal(filtrarCatalogoRev31([p],[],{estado:'archivados'},new Date()).length,1);
  assert.ok(/const seRepone=p=>!productoArchivadoRev31\(p\)/.test(html));
  assert.ok(/function buscarProductos[\s\S]*?productoArchivadoRev31\(p\)/.test(html));
  assert.ok(/archivado_at:p\.archivadoAt/.test(html));
  assert.ok(/archivadoAt:row\.archivado_at/.test(html));
});

test('archivar registra quién y cuándo sin borrar ventas ni movimientos', () => {
  const block=html.match(/function archivarProductoRev31\([^]*?\n\}/);
  assert.ok(block);
  const p={id:'a',nombre:'Agua',archivoHistorial:[]};
  const venta={id:'v1',items:[{prodId:'a'}]},mov={id:'m1',prodId:'a'};
  const context={db:{productos:[p],ventas:[venta],movs:[mov]},pedido:{a:2},ticket:[{prodId:'a'}],
    prod:id=>id==='a'?p:null,productoArchivadoRev31:x=>!!x.archivadoAt,
    f5MembresiaActual:()=>({nombre_mostrado:'Cajera'}),guardar:()=>{},aviso:()=>{}};
  vm.createContext(context);
  vm.runInContext(`${block[0]};archivarProductoRev31('a',true)`,context);
  assert.ok(p.archivadoAt);
  assert.equal(p.archivoHistorial[0].actor,'Cajera');
  assert.equal(p.archivoHistorial[0].accion,'Archivado');
  assert.equal(context.db.ventas[0],venta);
  assert.equal(context.db.movs[0],mov);
  assert.equal(context.ticket.length,0);
  assert.equal(context.pedido.a,undefined);
});

test('el turno obligatorio exige apertura explícita y no acepta una sesión técnica', () => {
  const {estadoTurnoRev31} = catalogRules();
  assert.equal(estadoTurnoRev31({manejaTurnos:false},null).requiereApertura,false);
  assert.equal(estadoTurnoRev31({manejaTurnos:true},null).requiereApertura,true);
  assert.equal(estadoTurnoRev31({manejaTurnos:true},{estado:'abierta'}).requiereApertura,true);
  assert.equal(estadoTurnoRev31({manejaTurnos:true},{estado:'abierta',rev31AperturaExplicita:true}).requiereApertura,false);
  assert.equal(estadoTurnoRev31({manejaTurnos:true},{estado:'cerrada'}).requiereApertura,true);
  assert.ok(/if\(estadoTurnoRev31\(db\.config,[^)]*\)\.requiereApertura\)/.test(html));
  assert.ok(/s\.rev31AperturaExplicita=true/.test(html));
});

test('el ajuste usa cantidad positiva y calcula dirección y stock resultante', () => {
  const {ajusteStockRev31} = catalogRules();
  assert.deepEqual(JSON.parse(JSON.stringify(ajusteStockRev31(6,'descontar',2))),{delta:-2,resultante:4,valido:true});
  assert.deepEqual(JSON.parse(JSON.stringify(ajusteStockRev31(6,'agregar',2))),{delta:2,resultante:8,valido:true});
  assert.equal(ajusteStockRev31(6,'descontar',-2).valido,false);
  assert.equal(ajusteStockRev31(6,'descontar',8).resultante,-2);
});

test('el selector múltiple aparece en Productos y Para pedir con teclado y URL', () => {
  assert.ok(/function montarFiltroRubrosRev31\(/.test(html));
  assert.ok(/montarFiltroRubrosRev31\('frRev31'/.test(html));
  assert.ok(/montarFiltroRubrosRev31\('rRepRev31'/.test(html));
  assert.ok(/e\.key==='Escape'/.test(html));
  assert.ok(/e\.key==='ArrowDown'/.test(html));
  assert.ok(/e\.key===' '/.test(html));
  assert.ok(/history\.replaceState/.test(html));
});

test('la barra empieza expandida y su control queda visible al colapsar', () => {
  assert.ok(/return v===null\?false:v==='1'/.test(html));
  assert.ok(!/\.app\.colapsado \.brand-txt,\.app\.colapsado \.toggleRail\{display:none\}/.test(html));
  assert.ok(/railColapsado\?['"]Expandir menú/.test(html));
});

test('la tabla de notebooks conserva el nombre al agregar la selección en lote', () => {
  assert.ok(/#tabProd th:nth-child\(3\),#tabProd td:nth-child\(3\),#tabProd th:nth-child\(4\),#tabProd td:nth-child\(4\)\{display:none\}/.test(html));
  assert.ok(!/#tabProd th:nth-child\(2\)[^\n]*display:none/.test(html));
});

test('la migración incluye el contrato de sincronización de archivos y turnos', () => {
  const sql=fs.readFileSync(path.join(__dirname,'../REV31-MIGRACION.sql'),'utf8');
  for(const field of ['archivado_at','archivo_historial','maneja_turnos','aviso_turno_horas','f31_actualizar_preferencias_turno','f5_colecciones_por_permisos'])assert.ok(sql.includes(field),field);
  assert.match(sql,/revoke all on function public\.f31_actualizar_preferencias_turno\(uuid,boolean,integer\) from public, anon, authenticated;/);
  assert.match(sql,/revoke all on function private\.f5_colecciones_por_permisos\(text\[\]\) from public, anon, authenticated;/);
});
