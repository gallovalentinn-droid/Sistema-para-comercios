const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const artifact = path.resolve(__dirname, '../beta/index.html');
const source = () => fs.readFileSync(artifact, 'utf8');

function block(text, start, end) {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `no se encontró ${start}`);
  assert.ok(to > from, `no se encontró ${end}`);
  return text.slice(from, to);
}

test('cambio masivo exige alcance deliberado, excluye Los dos y permite deshacer', () => {
  const text = source();
  const prices = text;
  assert.doesNotMatch(prices, /data-pxc="ambos"/);
  assert.match(prices, /px_alcance/);
  assert.match(prices, /ultimoCambioPrecios/);
  assert.match(prices, /deshacerUltimoCambioPrecios/);
  assert.match(prices, /precio promedio/i);
});

test('Vender advierte faltantes antes de sumar y confirma cerca del buscador', () => {
  const text = source();
  const selling = block(text, 'function agregarAlTicket(', '/* ── modal de medio de pago:');
  assert.match(selling, /confirmarProductoSinStock/);
  assert.match(selling, /posFeedback/);
  assert.match(selling, /data-deshacer-agregado/);
  assert.match(selling, /stock-state/);
});

test('Vender protege la cancelación y los atajos abren el flujo visible', () => {
  const text = source();
  const pos = block(text, 'function vVender(m){', '/* ── modal de medio de pago:');
  const shortcuts = block(text, "document.addEventListener('keydown',e=>{", '/* ==========================================================================\n   MI COMERCIO — F4.3');
  assert.match(pos, /confirmarCancelacionVenta/);
  assert.match(pos, /Atajos:/);
  assert.match(shortcuts, /e\.key==='F1'/);
  assert.match(shortcuts, /abrirModalPago\(\)/);
  assert.doesNotMatch(shortcuts, /e\.key==='Escape'[\s\S]{0,120}ticket=\[\]/);
});

test('el cobro en efectivo ofrece montos rápidos y exige monto recibido', () => {
  const text = source();
  const payment = block(text, 'function pintarPagoModal(ov){', '\nfunction pintarMixtoFilas(');
  assert.match(payment, /data-cash-quick/);
  assert.match(payment, /Justo/);
  assert.match(payment, /recibido&&num\(recibido\)>=t/);
  assert.match(payment, /!recibido\?'vacio'/);
});

test('Fiado permite operar desde la lista y diferencia saldo abierto de todos', () => {
  const text = source();
  const credit = block(text, 'function vFiado(m){', '\nfunction formCliente(');
  assert.match(credit, /Registrar fiado/);
  assert.match(credit, /fiadoFiltro/);
  assert.match(credit, /Con saldo/);
  assert.match(credit, /Sin pagar hace/);
  assert.match(credit, /data-fiar/);
  assert.match(credit, /monto vencido/);
});

test('Para pedir usa una sola selección, confirma Vaciar y explica proveedores', () => {
  const text = source();
  const order = block(text, 'let repOrden=', '\nfunction vVencimientos(');
  assert.match(order, /pedidoInicializado/);
  assert.match(order, /data-ped-sel/);
  assert.match(order, /data-ped-lista/);
  assert.match(order, /Agrupamos por proveedor/);
  assert.match(order, /pedido-provider-head/);
  assert.match(order, /Vaciar pedido/);
});

test('Resumen no calcula ganancia con costos faltantes y espera datos suficientes', () => {
  const text = source();
  const summary = block(text, 'function datosPeriodo(', '\nconst SOPORTE_WA=');
  assert.match(summary, /costosIncompletos/);
  assert.match(summary, /resumen-cost-warning/);
  assert.match(summary, /INSIGHTS_MIN_VENTAS/);
  assert.match(summary, /período anterior/i);
});

test('Combos muestra precios y stock y exige confirmar un precio inconveniente', () => {
  const text = source();
  const combos = block(text, 'function pintarCombos(){', '\nfunction formAjuste(');
  assert.match(combos, /combo-cost-warning/);
  assert.match(combos, /confirmarPrecioCombo/);
  assert.match(combos, /Precio unitario/);
  assert.match(combos, /Stock/);
  assert.match(combos, /combo-result/);
});

test('Descuentos usa un nombre único y previsualiza alcance y rentabilidad', () => {
  const text = source();
  const discounts = block(text, 'const TIPOS_PROMO=', '\nfunction pintarCombos(){');
  assert.match(discounts, /pr_nombre/);
  assert.match(discounts, /pr_obj_buscar/);
  assert.match(discounts, /pr_impacto/);
  assert.match(discounts, /Qué va a pasar/);
  assert.match(discounts, /Descuento/);
  assert.match(discounts, /no se aplican a combos/i);
});

test('Movimientos separa ingresos y ajustes y permite auditar negativos', () => {
  const text = source();
  const movements = text;
  assert.match(movements, /movRango/);
  assert.match(movements, />Ingresos</);
  assert.match(movements, />Ajustes</);
  assert.match(movements, /stock-negative/);
  assert.match(movements, /data-mov-detalle/);
  assert.match(movements, /Totales del período/);
});

test('Vencimientos informa cobertura y permite cargar o liquidar', () => {
  const text = source();
  const expiry = text;
  assert.match(expiry, /expiry-coverage/);
  assert.match(expiry, /Todavía no podemos avisarte/);
  assert.match(expiry, /data-liquidar/);
  assert.match(expiry, /Esta semana/);
  assert.match(expiry, /Cargar fechas/);
});

test('Configuración usa switches, explica precedencia y protege restauraciones', () => {
  const text = source();
  const config = text;
  assert.match(config, /permission-order/);
  assert.match(config, /role="switch"/);
  assert.match(config, /secciones ocultas/);
  assert.match(config, /Confirmá escribiendo RESTAURAR/);
  assert.match(config, /backupAuto\(\)/);
  assert.match(config, /Copiar código/);
});

test('Soporte prepara el contacto con diagnóstico técnico de solo lectura', () => {
  const text = source();
  const support = text;
  assert.match(support, /supportTema/);
  assert.match(support, /supportMensaje/);
  assert.match(support, /MICOMERCIO_BUILD\.version/);
  assert.match(support, /navigator\.userAgent/);
  assert.match(support, /Abrir WhatsApp con todo cargado/);
  assert.doesNotMatch(support, /Productos:.*Ventas:.*Clientes:/s);
});

test('Productos compacta columnas y acciones en notebooks de hasta 1440 px', () => {
  const text = source();
  assert.match(text, /@media\(max-width:1440px\) and \(min-width:761px\)/);
  assert.match(text, /#tabProd th:nth-child\(2\).*#tabProd td:nth-child\(3\)\{display:none\}/s);
  assert.match(text, /#tabProd td:last-child \.btn\{width:38px/);
  assert.match(text, /@media\(max-width:1100px\) and \(min-width:761px\)[\s\S]*#tabProd th:nth-child\(6\)/);
});

test('Para pedir y Movimientos contienen sus tablas en notebooks angostas', () => {
  const text = source();
  assert.match(text, /@media\(max-width:1440px\) and \(min-width:761px\)[\s\S]*\.rep-table\{min-width:0;width:calc\(100% - 2px\)\}/);
  assert.match(text, /\.rep-table col:nth-child\(4\).*\.rep-table td:nth-child\(5\)\{display:none\}/s);
  assert.match(text, /\.rep-table th,\.rep-table td\{padding-left:5px/);
  assert.match(text, /\.rep-table col:nth-child\(2\),\.rep-table th:nth-child\(2\),\.rep-table td:nth-child\(2\)\{display:none\}/);
  assert.match(text, /aria-label="Movimientos de stock"[^>]*><table class="mtable mov-table"/);
  assert.match(text, /#tablaMovimientos \.mov-table th,#tablaMovimientos \.mov-table td/);
  assert.match(text, /#tablaMovimientos \.mov-table th:last-child,#tablaMovimientos \.mov-table td:last-child\{display:none\}/);
  assert.match(text, /data-mov-fila/);
});
