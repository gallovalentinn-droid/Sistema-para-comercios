const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.resolve(__dirname, '../beta/index.html');
const rootPath = path.resolve(__dirname, '../index.html');
const swPath = path.resolve(__dirname, '../beta/sw.js');
const manifestPath = path.resolve(__dirname, '../integrity-manifest.json');
const legacyPath = path.resolve(__dirname, '../clientes/index.html');
const source = () => fs.readFileSync(htmlPath, 'utf8').replace(/\r\n/g, '\n');

function block(text, start, end) {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `no se encontró ${start}`);
  assert.ok(to > from, `no se encontró ${end}`);
  return text.slice(from, to);
}

test('los importes argentinos y las cantidades fraccionarias usan parsers distintos', () => {
  const text = source();
  const helpers = block(text, 'function numeroArgentino(', '\nconst esc=');
  const context = {};
  vm.runInNewContext(`${helpers};result={miles:num('14.000'),mixto:num('1.500,50'),decimal:num('1,5'),cantidadPunto:numCantidad('1.250'),cantidadComa:numCantidad('1,250')}`, context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.result)), {miles:14000,mixto:1500.5,decimal:1.5,cantidadPunto:1.25,cantidadComa:1.25});
  assert.match(text, /numCantidad\(\$\('#f_stk'/);
});

test('el cobro conserva el comprobante y bloquea un segundo cierre durante la animación', () => {
  const text = source();
  const payment = block(text, 'function pintarPagoModal(ov){', '\nfunction pintarMixtoFilas(');
  const close = block(text, 'function cerrarVenta(forma){', '\nfunction ticketImpreso(');
  const shortcuts = block(text, '/* ═══════════════════════════════════════════════════════\n   10. ATAJOS + ARRANQUE', '/* ==========================================================================\n   MI COMERCIO — F4.3');
  assert.doesNotMatch(payment, /cerrarVenta\([^)]*\)\)\s*cerrarModal\(\)/);
  assert.match(close, /ventaEnProceso/);
  assert.match(close, /if\(ventaEnProceso\|\|!ticket\.length\) return false/);
  assert.ok(close.indexOf('ticket=[]') < close.indexOf('setTimeout'));
  assert.match(shortcuts, /!ventaEnProceso/);
});

test('el cierre exige conteos escritos y describe la diferencia como falta o sobra', () => {
  const cash = block(source(), 'function vCaja(m){', '\n/* ═══════════════════════════════════════════════════════\n   MOVIMIENTOS EN CUENTAS');
  assert.match(cash, /function conteosCajaCompletos\(/);
  assert.match(cash, /cerrarCaja\.disabled=!conteosCajaCompletos\(\)/);
  assert.match(cash, /inpG\.value\.trim\(\)===''/);
  assert.match(cash, /dG<0\?'Falta':'Sobra'/);
});

test('Caja usa el mismo criterio de costos y egresos operativos que Resumen', () => {
  const text = source();
  const turn = block(text, 'function calcularTotalesTurno(', '\n/* ── anular una venta');
  const cash = block(text, 'function vCaja(m){', '\n/* ═══════════════════════════════════════════════════════\n   MOVIMIENTOS EN CUENTAS');
  assert.match(turn, /costosIncompletos/);
  assert.match(text, /function esEgresoOperativo\(/);
  assert.match(cash, /t\.costosIncompletos\?null/);
  assert.match(cash, /egresosOperativos/);
  assert.match(cash, /gananciaEstimada===null\?'—'/);
});

test('el efectivo de pagos divididos se imputa primero a cigarrillos y se redondea a centavos', () => {
  const text = source();
  const helper = block(text, 'function efectivoCigarrillosVenta(', '\nfunction calcularTotalesTurno(');
  const context = {};
  vm.runInNewContext(`${helper};result=[efectivoCigarrillosVenta(9000,8000,5000),efectivoCigarrillosVenta(9000,8000,9000)]`, context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.result)), [5000,8000]);
  assert.match(text, /cigEfectivo\+=efectivoCigarrillosVenta\(v\.total,cig,efectivoMixto\)/);
});

test('deshacer un cambio masivo sólo revierte el campo que no fue editado después', () => {
  const prices = block(source(), 'function aplicarPrecios(ov){', '\n/* ═══════════════════════════════════════════════════════\n   IMPORTAR PRODUCTOS');
  assert.match(prices, /campo:pxConf\.campo/);
  assert.match(prices, /cambios\.push\(\{id:p\.id,campo:'precio',anterior,aplicado\}\)/);
  assert.match(prices, /cambios\.push\(\{id:p\.id,campo:'costo',anterior,aplicado\}\)/);
  assert.match(prices, /Math\.abs\(Number\(p\[item\.campo\]\)-item\.aplicado\)<=0\.001/);
  assert.match(prices, /costoAnterior:item\.aplicado,costoNuevo:item\.anterior/);
  assert.match(prices, /omitidos/);
});

test('las mejoras operativas evitan liquidar vencidos y reducen ruido visual', () => {
  const text = source();
  assert.match(text, /tablaVence\(vencidos,\{vencidos:true\}\)/);
  assert.match(text, /vencidos\?'Dar de baja'/);
  assert.match(text, /if\(modo==='99'&&n<100\)/);
  assert.match(text, /pxConf\.modo!=='bajar'\|\|v<=90/);
  assert.match(text, /while\(contenedor\.children\.length>=3\)/);
  assert.match(text, /delete p\.cursores\.cierre_ajustes_created/);
  assert.match(text, /delete p\.cursores\.cierre_ajustes_resueltos/);
  assert.match(fs.readFileSync(rootPath, 'utf8'), /href="\.\/beta\/" class="ingresar"/);
});

test('la dependencia Supabase está fijada localmente y su ausencia muestra recuperación', () => {
  const text = source();
  const sw = fs.readFileSync(swPath, 'utf8');
  assert.match(text, /<script src="\.\/vendor\/supabase-js-2\.112\.3\.min\.js"><\/script>/);
  assert.match(sw, /\.\/vendor\/supabase-js-2\.112\.3\.min\.js/);
  assert.match(text, /function mostrarErrorDependencia\(/);
  assert.match(text, /No pudimos cargar los componentes necesarios/);
  assert.match(text, /Reintentar/);
});

test('anular una venta cerrada puede registrar el reintegro de efectivo en el turno abierto', () => {
  const text = source();
  const cancellation = block(text, 'function montoEfectivoVenta(', '\nfunction ventasDeCierre(');
  assert.match(cancellation, /function ventaPerteneceTurnoAbierto\(/);
  assert.match(cancellation, /registrarReintegro/);
  assert.match(cancellation, /Devolución de venta Nº/);
  assert.match(cancellation, /f5EstamparSesionLocal\(egreso/);
  assert.match(cancellation, /f3OperacionEgreso\(egreso\)/);
  assert.match(cancellation, /an_registrar_reintegro/);
  assert.match(cancellation, /an_caja_reintegro/);
});

test('anular un fiado pagado conserva el pago y muestra el crédito a favor', () => {
  const text = source();
  const derived = block(text, 'function recalcularDerivados(', '\nfunction marcarCambiosSync(');
  const context = {ordenarCronologia: value => value};
  vm.runInNewContext(`${derived};obj={productos:[],movs:[],clientes:[{id:'c1',saldoBase:0}],ventas:[{id:'v1',clienteId:'c1',forma:'fiado',total:100,anulada:true}],pagos:[{id:'p1',clienteId:'c1',monto:40}],ajustesFiado:[],config:{nroVenta:1}};recalcularDerivados(obj);result={saldo:obj.clientes[0].saldo,credito:obj.clientes[0].credito,pagos:obj.pagos.length}`, context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.result)), {saldo:0,credito:40,pagos:1});
  assert.match(text, /Crédito a favor/);
});

test('los datos locales de Configuración se pueden guardar sin conexión si el nombre no cambia', () => {
  const remote = block(source(), 'async function f5GuardarNombreComercioRemoto(', '\nconst f5GuardarDatosComercio=');
  assert.ok(remote.indexOf("if(nombre===f3Estado.comercioNombre)") < remote.indexOf("if(!enLinea)"));
});

test('el paquete incluye verificación de integridad y la ruta anterior ya no carga otro sistema', () => {
  assert.ok(fs.existsSync(manifestPath));
  assert.ok(fs.existsSync(path.resolve(__dirname, '../verificar.sh')));
  assert.ok(fs.existsSync(path.resolve(__dirname, '../verificar.ps1')));
  assert.ok(fs.existsSync(path.resolve(__dirname, '../tools/verificar-integridad.cjs')));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.packageRevision, 30);
  assert.equal(manifest.algorithm, 'sha256');
  assert.ok(manifest.files['beta/index.html']);
  assert.ok(manifest.files['beta/vendor/supabase-js-2.112.3.min.js']);
  const legacy = fs.readFileSync(legacyPath, 'utf8');
  assert.match(legacy, /\.\.\/beta\//);
  assert.doesNotMatch(legacy, /SUPABASE_(?:URL|ANON_KEY)/);
});

test('la identidad de la corrección queda alineada en REV30', () => {
  const text = source();
  const sw = fs.readFileSync(swPath, 'utf8');
  assert.match(text, /packageRevision:30/);
  assert.match(sw, /micomercio-beta-6\.0\.0-f6-rc2-rev30/);
});
