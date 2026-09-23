const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../beta/index.html'), 'utf8');

function functionSource(name) {
  const inline = html.match(new RegExp(`(?:^|\\n)(function ${name}\\([^\\n]*\\)\\{[^\\n]*\\})(?:\\r?\\n|$)`));
  const match = inline || html.match(new RegExp(`(?:^|\\n)(function ${name}\\([^\\n]*\\)\\{[\\s\\S]*?\\n\\})`));
  assert.ok(match, `${name} debe existir`);
  return match[1];
}

test('Resumen descarga CSV regional con importes numéricos y texto seguro', () => {
  const context = vm.createContext({prod: id => id === 'p1' ? {rubro:'Almacén'} : null});
  vm.runInContext(`${functionSource('csvSeguro')}\n${functionSource('csvProductosVendidos')}`, context);
  const csv = context.csvProductosVendidos({productos:[
    {pid:'p1',nombre:'Arroz, fino',cant:2.5,importe:4501.5},
    {pid:'',nombre:'=SUM(1;2)',rubro:'Otros',cant:1,importe:3},
  ]});
  assert.equal(csv, '\ufeff"Producto";"Rubro";"Cantidad";"Facturado"\r\n"Arroz, fino";"Almacén";"2,5";"4501,5"\r\n"\'=SUM(1;2)";"Otros";"1";"3"\r\n');
});

test('las cantidades muestran singular y el pie cuenta sólo productos activos', () => {
  const context = vm.createContext({});
  vm.runInContext(`${functionSource('pluralProductos')}\n${functionSource('contarProductosActivos')}`, context);
  assert.equal(context.pluralProductos(1), '1 producto');
  assert.equal(context.pluralProductos(0), '0 productos');
  assert.equal(context.pluralProductos(2), '2 productos');
  assert.equal(context.contarProductosActivos([{id:'a'},{id:'b',archivadoAt:'2026-09-01T10:00:00Z'},{id:'c'}]), 2);
});

test('la acción de archivo en lote usa singular cuando hay un seleccionado', () => {
  const context = vm.createContext({});
  vm.runInContext(functionSource('etiquetaArchivoLoteRev34'), context);
  assert.equal(context.etiquetaArchivoLoteRev34(1, true), 'Archivar 1 seleccionado');
  assert.equal(context.etiquetaArchivoLoteRev34(2, true), 'Archivar 2 seleccionados');
  assert.equal(context.etiquetaArchivoLoteRev34(1, false), 'Desarchivar 1 seleccionado');
});

test('la fecha de archivado exportada es legible y no ISO crudo', () => {
  const dates = html.match(/const fFecha=[^\n]+\nconst fHora=[^\n]+\nconst fFH=[^\n]+/);
  assert.ok(dates);
  const context = vm.createContext({});
  vm.runInContext(`${dates[0]}\n${functionSource('filasCatalogoExportacion')}`, context);
  const rows = context.filasCatalogoExportacion([{nombre:'Agua',archivadoAt:'2026-09-01T10:00:00.000Z'}]);
  assert.match(rows[1][12], /^\d{2}\/\d{2}\/\d{2} \d{2}:\d{2}/);
  assert.ok(!rows[1][12].includes('T'));
});

test('el historial identifica con pesos las diferencias positivas y negativas', () => {
  const context = vm.createContext({});
  vm.runInContext(`const nfM=new Intl.NumberFormat('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}); const $m=n=>'$'+nfM.format(Number(n)||0); ${functionSource('montoDiferenciaCaja')}`, context);
  assert.equal(context.montoDiferenciaCaja(1200.5), '+$1.200,50');
  assert.equal(context.montoDiferenciaCaja(-10), '−$10,00');
  assert.equal(context.montoDiferenciaCaja(0), '$0,00');
});

test('el cierre informa cuál efectivo falta contar antes de habilitar el botón', () => {
  const context = vm.createContext({});
  vm.runInContext(functionSource('motivoCierrePendiente'), context);
  assert.match(context.motivoCierrePendiente('', '', false), /caja general/i);
  assert.match(context.motivoCierrePendiente('0', '', true), /cigarrillos/i);
  assert.equal(context.motivoCierrePendiente('0', '0', true), '');
});

test('archivar varios productos espera confirmación y cancelar conserva los datos', () => {
  const products = [{id:'a',nombre:'Agua',archivoHistorial:[]},{id:'b',nombre:'Jugo',archivoHistorial:[]}];
  const selectedProductosRev31 = new Set(['a','b']);
  let accept, saves=0, renders=0;
  const context = vm.createContext({
    db:{productos:products},pedido:{a:1,b:2},ticket:[],selectedProductosRev31,
    prod:id=>products.find(p=>p.id===id),productoArchivadoRev31:p=>!!p?.archivadoAt,
    f5MembresiaActual:()=>({nombre_mostrado:'Dueño'}),
    confirmar:(title,body,onAccept)=>{assert.match(title,/Archivar/);assert.match(body,/2 productos/);accept=onAccept;},
    guardar:()=>saves++,render:()=>renders++,aviso:()=>{},
  });
  vm.runInContext(`${functionSource('pluralProductos')}\n${functionSource('archivarProductoRev31')}\n${functionSource('procesarArchivoLoteRev34')}`, context);
  context.procesarArchivoLoteRev34(['a','b'], true);
  assert.equal(products.some(p=>p.archivadoAt), false);
  assert.equal(saves, 0);
  assert.equal(selectedProductosRev31.size, 2);
  accept();
  assert.equal(products.every(p=>!!p.archivadoAt), true);
  assert.equal(saves, 1);
  assert.equal(renders, 1);
  assert.equal(selectedProductosRev31.size, 0);
});
