const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'beta/index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'beta/sw.js'), 'utf8');

function importRules() {
  const block = html.match(/\/\* CATALOG_IMPORT_RULES_START \*\/([\s\S]*?)\/\* CATALOG_IMPORT_RULES_END \*\//);
  assert.ok(block, 'deben existir reglas aisladas de lectura e importación');
  return vm.runInNewContext(`${block[1]};({parsearCSV,detectarMapa})`, {
    normalizarTexto: value => String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
  });
}

test('CSV regional conserva códigos con cero, separadores, saltos de línea y decimales', () => {
  const {parsearCSV} = importRules();
  const rows = parsearCSV('\ufeff"Nombre";"Código de barras";"Precio de venta"\r\n"Queso; fresco";"0779312345678";"1500,50"\r\n"Pan\ndel día";"000123";"300"\r\n');
  assert.deepEqual(Array.from(rows[1]), ['Queso; fresco', '0779312345678', '1500,50']);
  assert.equal(rows[2][0], 'Pan\ndel día');
  assert.equal(rows[2][1], '000123');
});

test('importación mapea unidad y vencimiento del catálogo exportado', () => {
  const {detectarMapa,filaAProducto} = importRules();
  const headings = ['Nombre','Código de barras','Precio de venta','Stock','Unidad','Vencimiento'];
  const map = detectarMapa(headings);
  const source = html.match(/function filaAProducto\(f,ix\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(source);
  const body = source.replace('function filaAProducto(f,ix){', '').replace(/\n\}$/, '');
  const make = vm.runInNewContext(`(function(f,ix){${body}})`, {
    celdaTexto:(row,key) => map[key] >= 0 ? String(row[map[key]] ?? '').trim() : '',
    celdaNumero:(row,key) => ({blank:map[key] < 0 || row[map[key]] === '',ok:true,value:map[key] < 0 ? null : Number(row[map[key]])}),
    CAMPOS_IMPORT:[{k:'precio',txt:'Precio de venta'},{k:'stock',txt:'Stock'}],
  });
  const product = make(['Queso','0779312345678','12000','2.5','kg','2026-10-05'],0);
  assert.equal(product.unidad, 'kg');
  assert.equal(product.vence, '2026-10-05');
  assert.equal(product.ean, '0779312345678');
});

test('los cursores de ajustes de cierre se revisan con un indicador nuevo', () => {
  assert.match(html, /if\(!p\.cierreAjustesRevisadosRev33\)\{[\s\S]*?delete p\.cursores\.cierre_ajustes_created;[\s\S]*?delete p\.cursores\.cierre_ajustes_resueltos;/);
});

test('fondo inicial acepta importes argentinos y el menú lateral puede desplazarse', () => {
  assert.match(html, /id="rev31Fondo" type="text"/);
  assert.match(html, /const fondoTxt=\$\('#rev31Fondo',m\)\.value/);
  assert.match(html, /\.nav\{[^}]*min-height:0;[^}]*overflow-y:auto/);
});

test('la biblioteca Excel está en el paquete local y en la caché de la beta', () => {
  assert.ok(fs.existsSync(path.join(root, 'beta/vendor/xlsx-0.18.5.full.min.js')));
  assert.match(html, /<script src="\.\/vendor\/xlsx-0\.18\.5\.full\.min\.js"><\/script>/);
  assert.match(sw, /\.\/vendor\/xlsx-0\.18\.5\.full\.min\.js/);
});

test('la planilla Excel conserva un código con cero inicial al volver a leerla', () => {
  const XLSX=require('../beta/vendor/xlsx-0.18.5.full.min.js');
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
    ['Nombre','Código de barras','Unidad','Vencimiento'],
    ['Queso','0779312345678','kg','2026-10-05'],
  ]),'Productos');
  const binary=XLSX.write(wb,{bookType:'xlsx',type:'buffer'});
  const read=XLSX.read(binary,{type:'buffer'});
  const rows=XLSX.utils.sheet_to_json(read.Sheets.Productos,{header:1,blankrows:false,defval:'',raw:false});
  assert.equal(rows[1][1],'0779312345678');
  assert.equal(rows[1][2],'kg');
  assert.equal(rows[1][3],'2026-10-05');
});

test('exportar e importar CSV conserva EAN, kg y vencimiento en productos nuevos y existentes', () => {
  const importBlock = html.match(/\/\* CATALOG_IMPORT_RULES_START \*\/([\s\S]*?)\/\* CATALOG_IMPORT_RULES_END \*\//)?.[1];
  const exportBlock = html.match(/\/\* CATALOG_EXPORT_START \*\/([\s\S]*?)\/\* CATALOG_EXPORT_END \*\//)?.[1];
  const serial = html.match(/function csvSeguro\(v,decimalComa=false\)\{[\s\S]*?\n\}/)?.[0];
  const make = html.match(/function filaAProducto\(f,ix\)\{[\s\S]*?\n\}/)?.[0];
  const commit = html.match(/function confirmarImportacion\(ov\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(importBlock && exportBlock && serial && make && commit);
  const original = {nombre:'Queso fresco',ean:'0779312345678',rubro:'Almacén',proveedor:'Sur',costo:3800,precio:7000.5,stock:2.5,stockMin:1,stockDeseado:4,unidad:'kg',vence:'2026-10-05'};
  const state = {db:{productos:[]},rows:[],messages:[],movements:0};
  const context = vm.createContext({
    ...state,
    normalizarTexto:value=>String(value??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''),
    confirmar:(title,message,action)=>action(),
    uid:()=> 'importado',
    movimiento:()=>state.movements++,
    guardar:()=>{},cerrarModal:()=>{},render:()=>{},aviso:message=>state.messages.push(message),
    analizarImportacion:()=>state.rows,
  });
  vm.runInContext(`${importBlock}\n${serial}\n${exportBlock}\n${make}\n${commit}`, context);
  context.original=original;
  const csv = vm.runInContext('csvCatalogoExportacion([original])',context);
  assert.ok(csv.includes('"7000,5"'));
  const rows = context.parsearCSV(csv);
  // Las variables léxicas del importador viven en el mismo contexto: asignarlas allí.
  context.headers=rows[0];context.cells=rows[1];
  vm.runInContext('impMapa=detectarMapa(headers)',context);
  const parsed=vm.runInContext('filaAProducto(cells,0)',context);
  assert.equal(parsed.ean,original.ean);
  assert.equal(parsed.unidad,'kg');
  assert.equal(parsed.vence,original.vence);
  state.rows=[parsed];context.confirmarImportacion(null);
  assert.equal(state.db.productos[0].ean,original.ean);
  assert.equal(state.db.productos[0].unidad,'kg');
  assert.equal(state.db.productos[0].vence,original.vence);
  assert.equal(state.db.productos[0].precio,original.precio);
  state.db.productos[0].unidad='unidad';state.db.productos[0].vence='';
  parsed._existente=state.db.productos[0];state.rows=[parsed];context.confirmarImportacion(null);
  assert.equal(state.db.productos[0].unidad,'kg');
  assert.equal(state.db.productos[0].vence,original.vence);
});

test('importar CSV funciona aunque la biblioteca Excel no esté disponible', async () => {
  const block=html.match(/\/\* CATALOG_IMPORT_RULES_START \*\/([\s\S]*?)\/\* CATALOG_IMPORT_RULES_END \*\//)?.[1];
  const reader=html.match(/async function leerPlanilla\(file,ov\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(block && reader);
  const label={innerHTML:'Elegir archivo',style:{}};let painted=false;const errors=[];
  const context=vm.createContext({
    normalizarTexto:value=>String(value??'').toLowerCase(),
    $:()=>label,document:{body:{contains:()=>false}},
    pintarImportacion:()=>{painted=true;},aviso:message=>errors.push(message),console:{error:()=>{}},XLSX:undefined,
  });
  vm.runInContext(`${block}\n${reader}`,context);
  await context.leerPlanilla({name:'catalogo.csv',size:120,text:async()=> 'Nombre;Código de barras\r\nQueso;0779312345678\r\n',arrayBuffer:async()=>{throw Error('CSV no debe pasar por Excel');}},{});
  assert.equal(painted,true);
  assert.equal(errors.length,0);
  assert.equal(vm.runInContext('impFilas[0][1]',context),'0779312345678');
});

test('un dispositivo que ya revisó cierres reabre sólo los cursores de ajustes una vez', () => {
  const source=html.match(/function f32bEstado\(\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(source);
  const pull={cierresPorUsuarioRevisados:true,cursores:{cierres_caja:{ts:'a'},cierre_ajustes_created:{ts:'b'},cierre_ajustes_resueltos:{ts:'c'}}};
  const context=vm.createContext({f32EstadoPull:()=>pull,F32B_VERSION:'test'});
  vm.runInContext(source,context);
  context.f32bEstado();
  assert.ok(pull.cursores.cierres_caja);
  assert.equal(pull.cursores.cierre_ajustes_created,undefined);
  assert.equal(pull.cursores.cierre_ajustes_resueltos,undefined);
  pull.cursores.cierre_ajustes_created={ts:'nuevo'};
  context.f32bEstado();
  assert.equal(pull.cursores.cierre_ajustes_created.ts,'nuevo');
});
