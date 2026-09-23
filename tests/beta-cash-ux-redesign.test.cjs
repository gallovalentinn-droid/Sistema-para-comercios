const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.resolve(__dirname, '../beta/index.html');
const swPath = path.resolve(__dirname, '../beta/sw.js');
const source = () => fs.readFileSync(htmlPath, 'utf8').replace(/\r\n/g, '\n');

function sliceBetween(text, start, end) {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `no se encontró ${start}`);
  assert.ok(to > from, `no se encontró ${end} después de ${start}`);
  return text.slice(from, to);
}

test('todas las tablas alinean y estabilizan las cifras numéricas', () => {
  const text = source();
  assert.match(text, /table th\.r,table td\.r\{[^}]*text-align:right[^}]*font-variant-numeric:tabular-nums[^}]*font-feature-settings:"tnum" 1/s);
  assert.match(text, /\.value-primary\{[^}]*font-weight:600/);
  assert.match(text, /\.value-reference\{[^}]*color:var\(--muted\)/);
  assert.match(text, /\.value-empty\{[^}]*color:var\(--muted\)/);

  const numericalHeadings = /Costo|Venta|Margen|Stock|Cantidad|Precio|Total|Monto|Saldo|Debe|Pag[oó]|Vendidas|Inicial|Final|Contado|Dif\./i;
  const missingAlignment = [...text.matchAll(/<th([^>]*)>([^<]+)/g)]
    .filter((match) => numericalHeadings.test(match[2]))
    .filter((match) => !/class="[^"]*r/.test(match[1]) && !/product-number/.test(match[1]));
  assert.deepEqual(missingAlignment.map((match) => match[0]), []);
});

test('Caja separa turno, cierre e historial y reúne sus cinco indicadores', () => {
  const text = source();
  const caja = sliceBetween(text, 'function vCaja(m){', '\n/* ═══════════════════════════════════════════════════════\n   MOVIMIENTOS EN CUENTAS');

  assert.match(caja, /data-caja-tab="turno"[^>]*>Turno actual/);
  assert.match(caja, /data-caja-tab="cierre"[^>]*>Cierre de caja/);
  assert.match(caja, /data-caja-tab="historial"[^>]*>Historial/);
  assert.match(caja, /data-caja-panel="turno"/);
  assert.match(caja, /data-caja-panel="cierre"/);
  assert.match(caja, /data-caja-panel="historial"/);
  for (const label of ['Vendido en el turno', 'Vendido en cigarrillos', 'Egresos del turno', 'Fiado del turno', 'Ganancia estimada']) {
    assert.match(caja, new RegExp(label));
  }
  assert.doesNotMatch(caja, /Egresos del turno<\/span><b style="color:var\(--rojo\)"/);
  assert.match(caja, /class="btn" id="bEgreso">Registrar egreso/);
});

test('el cierre destaca el único dato manual y permite plegar cigarrillos', () => {
  const text = source();
  const caja = sliceBetween(text, 'function vCaja(m){', '\n/* ═══════════════════════════════════════════════════════\n   MOVIMIENTOS EN CUENTAS');

  assert.match(caja, /class="cash-count-box"[\s\S]*id="contadoG"/);
  assert.match(caja, /id="difG" class="cash-difference[^\"]*"[\s\S]*Diferencia[\s\S]*—/);
  assert.match(caja, /data-caja-cig-toggle/);
  assert.match(caja, /data-caja-cig-content/);
  assert.match(caja, /const aplicarVistaCaja=/);
  assert.match(caja, /const actualizarDiferencia=/);
  assert.match(caja, /d<-0\.009\?'negative':d>0\.009\?'positive':'ok'/);
});

test('Registrar egreso es una acción operativa azul y usa el modal rediseñado', () => {
  const text = source();
  const form = sliceBetween(text, 'function formEgreso(){', '\n/* F6_TURNOS_CORE_START */');

  assert.match(form, /class="btn" id="okEg">Registrar egreso/);
  assert.doesNotMatch(form, /class="btn rojo" id="okEg"/);
  assert.match(form, /classList\.add\('expense-modal'\)/);
  assert.match(text, /\.expense-modal/);
});

test('el rediseño de Caja publica una identidad de caché nueva y alineada', () => {
  const text = source();
  const sw = fs.readFileSync(swPath, 'utf8');
  const identity = text.match(/const MICOMERCIO_BUILD=Object\.freeze\((\{[\s\S]*?\})\);/);
  assert.ok(identity, 'falta la identidad del build');
  const build = vm.runInNewContext(`(${identity[1]})`);
  assert.equal(build.packageRevision, 34);
  assert.match(sw, /micomercio-beta-6\.0\.0-f6-rc2-rev34/);
});
