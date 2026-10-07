const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../beta/index.html'), 'utf8');

function exportRules() {
  const serializer = html.match(/function csvSeguro\(v,decimalComa=false\)\{[\s\S]*?\n\}/);
  const block = html.match(/\/\* CATALOG_EXPORT_START \*\/([\s\S]*?)\/\* CATALOG_EXPORT_END \*\//);
  assert.ok(serializer && block, 'deben existir el serializador y las reglas de exportación');
  const dates = html.match(/const fFecha=[^\n]+\nconst fHora=[^\n]+\nconst fFH=[^\n]+/);
  assert.ok(dates, 'debe existir el formato de fecha visible');
  return vm.runInNewContext(`${dates[0]};${serializer[0]};${block[1]};({filasCatalogoExportacion,csvCatalogoExportacion})`);
}

test('exporta todos los productos, incluidos los archivados, sin aplicar filtros de pantalla', () => {
  const {filasCatalogoExportacion} = exportRules();
  const filas = filasCatalogoExportacion([
    {nombre:'Agua',ean:'00077901',rubro:'Bebidas',proveedor:'Sur',costo:100,precio:180,stock:6,stockMin:2,stockDeseado:12,unidad:'unidad'},
    {nombre:'Jabón',ean:'',rubro:'Higiene',costo:0,precio:500,stock:-2,stockMin:1,stockDeseado:4,unidad:'unidad',archivadoAt:'2026-09-23T12:00:00Z',archivadoPor:'Cajera'}
  ]);
  assert.equal(filas.length, 3);
  assert.deepEqual(Array.from(filas[0]), ['Nombre','Código de barras','Rubro','Proveedor','Precio de costo','Precio de venta','Stock','Stock mínimo','Stock deseado','Unidad','Vencimiento','Estado','Archivado el','Archivado por']);
  assert.equal(filas[1][1], '00077901');
  assert.equal(filas[1][11], 'Activo');
  assert.equal(filas[2][6], -2);
  assert.equal(filas[2][11], 'Archivado');
  assert.equal(filas[2][13], 'Cajera');
});

test('el CSV usa UTF-8, protege fórmulas y conserva números negativos como números', () => {
  const {csvCatalogoExportacion} = exportRules();
  const csv = csvCatalogoExportacion([
    {nombre:'=1+1',ean:'0001',rubro:'Niños, juegos',proveedor:'"Sur"',costo:20,precio:30,stock:-2,stockMin:0,stockDeseado:1,unidad:'unidad'}
  ]);
  assert.ok(csv.startsWith('\ufeff"Nombre";'));
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('"Niños, juegos"'));
  assert.ok(csv.includes('"20";"30";"-2"'));
  assert.ok(csv.includes('"""Sur"""'));
  assert.ok(csv.includes('"-2"'));
  assert.ok(!csv.includes('"\'-2"'));
  assert.equal(csv.trimEnd().split('\r\n').length, 2);
});
