const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(process.env.REV80_HTML || path.join(__dirname, '../beta/index.html'), 'utf8');
const catalogo = [{id: 'yerba', nombre: 'Yerba Playadito'}];

function entorno() {
  const botones = {'#okRev': {}, '#volverFotoFac': {}};
  const ctx = vm.createContext({
    numFactura: v => Number(v) || 0, detectarBulto: () => 1, $m: v => '$' + v,
    f5RolActual:()=>'',
    db: {productos: catalogo}, facturaIA: null, revisionFactura: [], remito: [],
    remitoHeader: {total: '', proveedor: '', nroComprobante: ''}, productosFacturaPendientes: [],
    copiaFactura: () => ({}), pasosFacturaIA: () => '', pintarRevision: () => {},
    volverAFotoFactura: () => {}, cerrarModal: () => {}, panelIngreso: () => {},
    huellaFactura: () => '', recomputeLinea: () => {}, uid: () => 'nuevo-qa',
    aviso: (mensaje, tipo) => {ctx.resultadoAviso = {mensaje, tipo};},
    $: selector => selector === '.mod' ? {classList: {add() {}}} : botones[selector],
    modal: opciones => opciones.alAbrir({}),
  });
  vm.runInContext(html.slice(html.indexOf('/* REV70_EMPAREJADOR_START */'), html.indexOf('/* REV70_MEMORIA_END */')), ctx);
  const inicio = html.indexOf('function abrirRevisionFactura(');
  const fin = html.indexOf('function rev70EstadoFila(', inicio);
  assert.ok(inicio > 0 && fin > inicio, 'se ejecuta el recorrido real de revisión');
  vm.runInContext(html.slice(inicio, fin), ctx);
  ctx.cargar = parsed => {
    ctx.abrirRevisionFactura(parsed);
    Object.assign(ctx.revisionFactura[0], {prodId: 'yerba', origen: 'manual'});
    botones['#okRev'].onclick();
  };
  return ctx;
}

function factura(financiero, extra = {}) {
  return {proveedor: 'QA', total: 9500, saldoAnterior: 0, pagosACuenta: 0, descuentoGlobal: 0, ...extra,
    items: [{producto: 'Yerba Playadito', cantidad: 1, precioUnit: 10000, unidadesPorBulto: 1, descuento: 0},
      {producto: financiero, cantidad: 1, precioUnit: 500, unidadesPorBulto: 1, descuento: 0}]};
}

test('saldo a favor conserva el total leído y exige revisar el signo', () => {
  const ctx = entorno(), parsed = factura('SALDO A FAVOR');
  const filas = ctx.rev70PrepararFilas(parsed, catalogo, ctx.rev70MemoriaVacia());
  const cuenta = ctx.rev78CuentaTicket(parsed, filas);
  assert.equal(cuenta.totalMercaderia, 9500);
  assert.equal(cuenta.ajuste, 0);
  assert.equal(cuenta.revisar, true);
  assert.match(ctx.rev78NotaCuentaTicket(parsed, filas), /notice warn/);
});

test('créditos y ajustes a favor no se emparejan como productos ni deciden su signo', () => {
  const ctx = entorno();
  for (const nombre of ['CRÉDITO', 'CREDITOS ANTERIORES', 'AJUSTE A FAVOR', 'SALDO A FAVOR PAGO']) {
    const parsed = factura(nombre), filas = ctx.rev70PrepararFilas(parsed, catalogo, ctx.rev70MemoriaVacia());
    assert.equal(filas[1].noMercaderia, true, nombre);
    assert.equal(filas[1].prodId, '', nombre);
    assert.equal(ctx.rev78CuentaTicket(parsed, filas).revisar, true, nombre);
  }
});

test('un saldo a favor duplicado en saldoAnterior también exige revisión', () => {
  const ctx = entorno(), parsed = factura('SALDO A FAVOR', {saldoAnterior: 500});
  const filas = ctx.rev70PrepararFilas(parsed, catalogo, ctx.rev70MemoriaVacia());
  assert.equal(ctx.rev78CuentaTicket(parsed, filas).totalMercaderia, 9500);
  assert.equal(ctx.rev78CuentaTicket(parsed, filas).revisar, true);
});

test('saldo a favor con cantidad cero no activa una advertencia por un ajuste inexistente', () => {
  const ctx = entorno(), parsed = factura('SALDO A FAVOR', {total: 10000});
  parsed.items[1].cantidad = 0;
  const filas = ctx.rev70PrepararFilas(parsed, catalogo, ctx.rev70MemoriaVacia());
  assert.equal(ctx.rev78CuentaTicket(parsed, filas).totalMercaderia, 10000);
  assert.equal(ctx.rev78CuentaTicket(parsed, filas).revisar, false);
});

test('deuda y pagos conocidos mantienen los importes conciliados', () => {
  const ctx = entorno();
  for (const [nombre, total] of [['SALDO ANTERIOR', 10500], ['PAGO A CUENTA', 9500]]) {
    const parsed = factura(nombre, {total});
    const filas = ctx.rev70PrepararFilas(parsed, catalogo, ctx.rev70MemoriaVacia());
    assert.equal(ctx.rev78CuentaTicket(parsed, filas).totalMercaderia, 10000, nombre);
    assert.equal(ctx.rev78CuentaTicket(parsed, filas).revisar, false, nombre);
  }
});

test('cargar productos con filas financieras omitidas termina con aviso correcto', () => {
  const ctx = entorno();
  ctx.cargar(factura('DEUDA', {total: 10500}));
  assert.equal(ctx.remito.length, 1);
  assert.equal(ctx.remito[0].prodId, 'yerba');
  assert.equal(ctx.resultadoAviso.tipo, 'ok');
  assert.doesNotMatch(ctx.resultadoAviso.mensaje, /sin elegir/);
});

test('cargar saldo a favor mantiene la advertencia de total y no lo cuenta sin elegir', () => {
  const ctx = entorno();
  ctx.cargar(factura('SALDO A FAVOR'));
  assert.equal(ctx.remitoHeader.revisarTicket, true);
  assert.equal(ctx.remitoHeader.total, '9500.00');
  assert.equal(ctx.resultadoAviso.tipo, 'ok');
  assert.doesNotMatch(ctx.resultadoAviso.mensaje, /sin elegir/);
});

test('un producto de cantidad positiva sin elegir sigue generando aviso rojo', () => {
  const ctx = entorno();
  ctx.cargar(factura('PRODUCTO DESCONOCIDO'));
  assert.equal(ctx.remito.length, 1);
  assert.equal(ctx.resultadoAviso.tipo, 'bad');
  assert.match(ctx.resultadoAviso.mensaje, /1 sin elegir/);
});

test('un producto de cantidad cero no se cuenta entre los sin elegir', () => {
  const ctx = entorno(), parsed = factura('PRODUCTO DESCONOCIDO', {total: 10000});
  parsed.items[1].cantidad = 0;
  ctx.cargar(parsed);
  assert.equal(ctx.resultadoAviso.tipo, 'ok');
  assert.doesNotMatch(ctx.resultadoAviso.mensaje, /sin elegir/);
});

test('una fila financiera convertida manualmente en producto sigue cargándose', () => {
  const ctx = entorno(), parsed = factura('CRÉDITO', {total: 10500});
  ctx.abrirRevisionFactura(parsed);
  Object.assign(ctx.revisionFactura[0], {prodId: 'yerba', origen: 'manual'});
  Object.assign(ctx.revisionFactura[1], {prodId: 'yerba', origen: 'manual', noMercaderia: false});
  // El botón conserva el recorrido real con la elección humana ya presente.
  ctx.$('#okRev').onclick();
  assert.equal(ctx.remito.length, 1);
  assert.equal(ctx.remito[0].cant, 2);
  assert.equal(ctx.resultadoAviso.tipo, 'ok');
  assert.equal(ctx.remitoHeader.revisarTicket, false);
});
