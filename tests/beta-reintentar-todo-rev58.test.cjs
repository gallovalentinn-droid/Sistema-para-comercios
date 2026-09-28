const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'beta/index.html'), 'utf8').replace(/\r\n/g, '\n');
function section(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `Falta ${start} / ${end}`);
  return html.slice(a, b);
}

test('el panel ofrece «Reintentar todo» y la barra lateral también reintenta la cola', () => {
  assert.match(html, /id="f33-process"[^>]*>Reintentar todo<\/button>/);
  assert.match(html, /r=await f33ReintentarTodo\(\);/);
  const barra = section("const bs=$('#btnSync');", "function ");
  assert.match(barra, /f33ReintentarTodo\(\)/);
  assert.match(barra, /subirALaNube\(\)/);
});

test('reintentar todo reencola en orden sólo las operaciones reintentables del comercio actual', async () => {
  const code = section('async function f33ReintentarTodo(', 'async function f33ReintentarOperacion(');
  const guardadas = [];
  let procesadas = 0;
  const filas = [
    { operationId: 'b', comercioId: 'c1', estado: 'dead_letter_v4', localSeq: 2, opOrder: 0, intentos: 5, ultimoError: 'PGRST303 | JWT expired' },
    { operationId: 'a', comercioId: 'c1', estado: 'dead_letter_v4', localSeq: 1, opOrder: 0, intentos: 5, ultimoError: 'PGRST303 | JWT expired' },
    { operationId: 'c', comercioId: 'c1', estado: 'confirmado_v4', localSeq: 3, opOrder: 0 },
    { operationId: 'd', comercioId: 'otro', estado: 'dead_letter_v4', localSeq: 1, opOrder: 0 },
    { operationId: 'e', comercioId: 'c1', estado: 'pausado_licencia_v4', localSeq: 4, opOrder: 0 },
  ];
  const ctx = vm.createContext({
    f3Estado: { comercioId: 'c1' },
    f33EstadoLicencia: () => ({ puedeOperar: false }),
    f33LeerOutboxRuntime: async () => filas,
    f33GuardarOperacion: async op => { guardadas.push(op); return op; },
    f3ProcesarOutbox: async () => { procesadas++; },
    f33ContarOutbox: () => ({ pendientes: 0, problemas: 0, licencia: 0 }),
    f33UIActualizar: async () => {},
    f33Num: n => Number(n) || 0,
    f33Clone: o => JSON.parse(JSON.stringify(o)),
  });
  vm.runInContext(`${section('function f33PuedeReintentar(', 'function f33PuedeDescartar(')}\n${code}\nthis.run=f33ReintentarTodo;this.msg=f33MensajeReintentoTodo;`, ctx);
  const r = await ctx.run();
  assert.deepEqual(guardadas.map(o => o.operationId), ['a', 'b']);
  assert.ok(guardadas.every(o => o.estado === 'pendiente_v4' && o.intentos === 0 && o.ultimoError === null));
  assert.equal(procesadas, 1);
  assert.equal(r.reintentadas, 2);
  assert.equal(ctx.msg(r), 'Reintentamos 2 operaciones. Todo sincronizado.');
  assert.match(ctx.msg({ reintentadas: 1, pendientes: 0, problemas: 3 }), /quedan 3 con problemas/);
  assert.match(ctx.msg({ reintentadas: 4, pendientes: 4, problemas: 0 }), /pendientes de envío.*sesión válida/i);
});

test('el lote conserva un cierre que requiere excepción y no cuenta operaciones de otro comercio', async () => {
  const code = section('async function f33ReintentarTodo(', 'async function f33ReintentarOperacion(');
  const filas = [
    { operationId: 'venta', comercioId: 'c1', estado: 'dead_letter_v4', operationType: 'registrar_venta_v4', streamKey: 'caja', localSeq: 1 },
    { operationId: 'descartada', comercioId: 'c1', estado: 'descartada_v4', operationType: 'registrar_venta_v4', streamKey: 'caja', localSeq: 2 },
    { operationId: 'cierre', comercioId: 'c1', estado: 'esperando_excepcion_v4', operationType: 'cerrar_sesion_caja_v4', streamKey: 'caja', localSeq: 3 },
    { operationId: 'ajena', comercioId: 'c2', estado: 'pendiente_v4', operationType: 'registrar_venta_v4', streamKey: 'otra', localSeq: 4 },
  ];
  const guardadas = [];
  const ctx = vm.createContext({
    f3Estado: { comercioId: 'c1' },
    F33_DISCARDED_STATE: 'descartada_v4',
    f33MismaCorrienteAnterior: (a, b) => a.streamKey === b.streamKey && a.localSeq < b.localSeq,
    f33EstadoLicencia: () => ({ puedeOperar: true }),
    f33LeerOutboxRuntime: async () => filas,
    f33GuardarOperacion: async op => { guardadas.push(op.operationId); filas[filas.findIndex(x => x.operationId === op.operationId)] = op; },
    f3ProcesarOutbox: async () => { filas.find(x => x.operationId === 'venta').estado = 'confirmado_v4'; },
    f33ContarOutbox: rows => ({ pendientes: rows.filter(x => x.estado === 'pendiente_v4').length,
      problemas: rows.filter(x => x.estado === 'esperando_excepcion_v4').length, licencia: 0 }),
    f33UIActualizar: async () => {}, f33Num: n => Number(n) || 0, f33Clone: o => JSON.parse(JSON.stringify(o)),
  });
  vm.runInContext(`${section('function f33PuedeReintentar(', 'function f33PuedeDescartar(')}\n${code}\nthis.run=f33ReintentarTodo;`, ctx);
  const r = await ctx.run();
  assert.deepEqual(guardadas, ['venta']);
  assert.equal(filas.find(x => x.operationId === 'cierre').estado, 'esperando_excepcion_v4');
  assert.equal(r.pendientes, 0);
  assert.equal(r.problemas, 1);
});

test('sin comercio resuelto no se reencola ninguna operación', async () => {
  const code = section('async function f33ReintentarTodo(', 'async function f33ReintentarOperacion(');
  const guardadas = [];
  const ctx = vm.createContext({
    f3Estado: { comercioId: '' }, f33EstadoLicencia: () => ({ puedeOperar: true }),
    f33LeerOutboxRuntime: async () => [{ operationId: 'sin-comercio', comercioId: '', estado: 'dead_letter_v4' }],
    f33GuardarOperacion: async op => guardadas.push(op), f33Num: n => Number(n) || 0,
    f33Clone: o => JSON.parse(JSON.stringify(o)),
  });
  vm.runInContext(`${section('function f33PuedeReintentar(', 'function f33PuedeDescartar(')}\n${code}\nthis.run=f33ReintentarTodo;`, ctx);
  await assert.rejects(ctx.run(), /F33_COMERCIO_NO_RESUELTO/);
  assert.equal(guardadas.length, 0);
});

test('si falla la lectura final no informa que todo está sincronizado', async () => {
  const code = section('async function f33ReintentarTodo(', 'async function f33ReintentarOperacion(');
  let lecturas = 0;
  const ctx = vm.createContext({
    f3Estado: { comercioId: 'c1' }, f33EstadoLicencia: () => ({ puedeOperar: true }),
    f33LeerOutboxRuntime: async () => { if(++lecturas === 1)return []; throw new Error('F33_OUTBOX_READ_FAILED'); },
    f3ProcesarOutbox: async () => {}, f33ContarOutbox: () => ({ pendientes: 0, problemas: 0, licencia: 0 }),
    f33UIActualizar: async () => {}, f33Num: n => Number(n) || 0,
  });
  vm.runInContext(`${section('function f33PuedeReintentar(', 'function f33PuedeDescartar(')}\n${code}\nthis.run=f33ReintentarTodo;`, ctx);
  await assert.rejects(ctx.run(), /F33_OUTBOX_READ_FAILED/);
});

test('el acceso rápido no anuncia éxito si falló el reintento del outbox', async () => {
  const code = section("const bs=$('#btnSync');", '\n}\nasync function alternarBloqueoVisual');
  const button = { disabled: false };
  const notices = [];
  const ctx = vm.createContext({
    $: () => button, f3Activo: () => true,
    f33ReintentarTodo: async () => { throw new Error('OUTBOX_INDISPONIBLE'); },
    subirALaNube: async () => true,
    aviso: (message, tone) => notices.push({ message, tone }),
    console: { error: () => {} },
  });
  vm.runInContext(code, ctx);
  await button.onclick();
  assert.equal(button.disabled, false);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].tone, 'bad');
  assert.match(notices[0].message, /No pudimos reintentar/i);
  assert.doesNotMatch(notices[0].message, /Todo sincronizado/i);
});

test('el panel cuenta y muestra solamente las operaciones del comercio actual', async () => {
  const code = section('async function f33UIRenderPanel(', 'function f33UIOpHtml(');
  const box = { innerHTML: '', querySelectorAll: () => [] };
  const nodes = { 'f33-content': box, 'f33-refresh': {}, 'f33-process': {} };
  const ctx = vm.createContext({
    f3Estado: { comercioId: 'c1' },
    f33UIAsegurarDom: () => {}, document: { getElementById: id => nodes[id] },
    f33LeerOutboxRuntime: async () => [
      { operationId: 'propia', comercioId: 'c1', estado: 'pendiente_v4', localSeq: 1 },
      { operationId: 'ajena', comercioId: 'c2', estado: 'dead_letter_v4', localSeq: 2 },
    ],
    f33EstadoLicencia: () => ({ estado: 'activa' }), f33EstadoTexto: () => 'Activa', f33Esc: text => String(text),
    f33ContarOutbox: rows => ({ pendientes: rows.filter(x => x.estado === 'pendiente_v4').length,
      problemas: rows.filter(x => x.estado === 'dead_letter_v4').length, licencia: 0 }),
    f33EsVisible: () => true, f33UIOpHtml: op => `<div>${op.operationId}</div>`,
    f33Num: n => Number(n) || 0,
  });
  vm.runInContext(`${code}\nthis.renderPanel=f33UIRenderPanel;`, ctx);
  await ctx.renderPanel();
  assert.match(box.innerHTML, /Pendientes<\/span><b>1<\/b>/);
  assert.match(box.innerHTML, /Problemas<\/span><b>0<\/b>/);
  assert.match(box.innerHTML, />propia</);
  assert.doesNotMatch(box.innerHTML, />ajena</);
});

test('el panel avisa como pendiente cuando el lote aún no llegó al servidor', async () => {
  const code = section('async function f33UIRenderPanel(', 'function f33UIOpHtml(');
  const box = { innerHTML: '', querySelectorAll: () => [] };
  const nodes = { 'f33-content': box, 'f33-refresh': {}, 'f33-process': {} };
  const notices = [];
  const ctx = vm.createContext({
    f3Estado: { comercioId: 'c1' }, f33UIAsegurarDom: () => {},
    document: { getElementById: id => nodes[id] },
    f33LeerOutboxRuntime: async () => [], f33EstadoLicencia: () => ({ estado: 'activa' }),
    f33EstadoTexto: () => 'Activa', f33Esc: text => String(text),
    f33ContarOutbox: () => ({ pendientes: 0, problemas: 0, licencia: 0 }),
    f33EsVisible: () => true, f33Num: n => Number(n) || 0,
    f33ReintentarTodo: async () => ({ reintentadas: 4, pendientes: 4, problemas: 0 }),
    f33MensajeReintentoTodo: () => 'Quedan 4 pendientes de envío',
    aviso: (message, tone) => notices.push({ message, tone }),
    console: { error: () => {} },
  });
  vm.runInContext(`${code}\nthis.renderPanel=f33UIRenderPanel;`, ctx);
  await ctx.renderPanel();
  await nodes['f33-process'].onclick({ currentTarget: nodes['f33-process'] });
  assert.equal(notices[0].tone, 'bad');
  assert.match(notices[0].message, /pendientes de envío/);
});

test('un cierre con descarte anterior ofrece únicamente cierre con excepción', () => {
  const code = section('function f33UIOpHtml(', 'async function f33UIActualizar(');
  const previa = { operationId: 'descartada', estado: 'descartada_v4', streamKey: 'caja', localSeq: 1 };
  const cierre = { operationId: 'cierre', estado: 'esperando_excepcion_v4',
    operationType: 'cerrar_sesion_caja_v4', streamKey: 'caja', localSeq: 2, opOrder: 0 };
  const ctx = vm.createContext({
    F33_DISCARDED_STATE: 'descartada_v4',
    f33MismaCorrienteAnterior: (a, b) => a.streamKey === b.streamKey && a.localSeq < b.localSeq,
    f33CierreRequiereExcepcion: (op, rows) => op.operationType === 'cerrar_sesion_caja_v4' && rows.some(x => x.estado === 'descartada_v4' && x.streamKey === op.streamKey && x.localSeq < op.localSeq),
    f33PuedeReintentar: () => ({ ok: true }), f33EstadoLicencia: () => ({}),
    f33PuedeDescartar: () => ({ ok: false }), f5RolActual: () => 'duenio',
    f33ConstruirCierreExcepcion: () => ({}), f33Esc: value => String(value),
    f33OperacionLabel: () => 'Cierre', f33Num: n => Number(n) || 0,
  });
  vm.runInContext(`${code}\nthis.html=f33UIOpHtml;`, ctx);
  const rendered = ctx.html(cierre, [previa, cierre]);
  assert.doesNotMatch(rendered, /data-f33-retry/);
  assert.match(rendered, /data-f33-close-ex/);
});

test('un reintento individual tampoco salta la resolución por excepción', async () => {
  const code = section('async function f33ReintentarOperacion(', 'async function f33DescartarOperacion(');
  const rows = [
    { operationId: 'descartada', estado: 'descartada_v4', streamKey: 'caja', localSeq: 1 },
    { operationId: 'cierre', estado: 'esperando_excepcion_v4', operationType: 'cerrar_sesion_caja_v4', streamKey: 'caja', localSeq: 2 },
  ];
  let guardadas = 0;
  const ctx = vm.createContext({
    F33_DISCARDED_STATE: 'descartada_v4',
    f33MismaCorrienteAnterior: (a, b) => a.streamKey === b.streamKey && a.localSeq < b.localSeq,
    f33CierreRequiereExcepcion: (op, rows) => op.operationType === 'cerrar_sesion_caja_v4' && rows.some(x => x.estado === 'descartada_v4' && x.streamKey === op.streamKey && x.localSeq < op.localSeq),
    f33LeerOutboxRuntime: async () => rows, f33EstadoLicencia: () => ({}),
    f33PrepararReintento: op => op, f33GuardarOperacion: async () => { guardadas++; },
    f3ProcesarOutbox: async () => {}, f33UIActualizar: async () => {},
  });
  vm.runInContext(`${code}\nthis.reintentar=f33ReintentarOperacion;`, ctx);
  await assert.rejects(ctx.reintentar('cierre'), /F33_CIERRE_REQUIERE_EXCEPCION/);
  assert.equal(guardadas, 0);
});

test('el indicador no alerta por problemas de otro comercio', async () => {
  const code = section('async function f33UIActualizar(', 'function f33UIAbrirPanel(');
  const status = { dataset: {}, hidden: false };
  const banner = { style: {} };
  const label = { textContent: '' };
  const nodes = { 'f33-status': status, 'f33-banner': banner, 'f33-status-text': label };
  const ctx = vm.createContext({
    f3Estado: { comercioId: 'c1' }, f33PanelAbierto: false,
    document: { getElementById: id => nodes[id], documentElement: { removeAttribute: () => {} } },
    f33UIAsegurarDom: () => {}, f33EstadoLicencia: () => ({ estado: 'activa', online: true }),
    f33LeerOutboxRuntime: async () => [{ comercioId: 'c2', estado: 'dead_letter_v4' }],
    f33ContarOutbox: rows => ({ pendientes: 0, problemas: rows.length, licencia: 0 }),
    assertWritable: () => ({ ok: true }), f33EstadoTexto: () => 'Activa',
  });
  vm.runInContext(`${code}\nthis.actualizar=f33UIActualizar;`, ctx);
  await ctx.actualizar();
  assert.equal(status.hidden, true);
  assert.equal(status.dataset.warn, '0');
  assert.doesNotMatch(label.textContent, /excepción/i);
});

test('el indicador queda visible si no se pudieron leer las operaciones', async () => {
  const code = section('async function f33UIActualizar(', 'function f33UIAbrirPanel(');
  const status = { dataset: {}, hidden: true };
  const banner = { style: {} };
  const label = { textContent: '' };
  const nodes = { 'f33-status': status, 'f33-banner': banner, 'f33-status-text': label };
  const ctx = vm.createContext({
    f3Estado: { comercioId: 'c1' }, f33PanelAbierto: false,
    document: { getElementById: id => nodes[id], documentElement: { removeAttribute: () => {} } },
    f33UIAsegurarDom: () => {}, f33EstadoLicencia: () => ({ estado: 'activa', online: true }),
    f33LeerOutboxRuntime: async () => { throw new Error('IDB no disponible'); },
    f33ContarOutbox: () => ({ pendientes: 0, problemas: 0, licencia: 0 }),
    assertWritable: () => ({ ok: true }), f33EstadoTexto: () => 'Activa',
  });
  vm.runInContext(`${code}\nthis.actualizar=f33UIActualizar;`, ctx);
  await ctx.actualizar();
  assert.equal(status.hidden, false);
  assert.equal(status.dataset.warn, '1');
  assert.match(label.textContent, /sin verificar/i);
});

test('el arnés de navegador sirve esta beta por defecto', async () => {
  const harnessPath = path.join(root, 'entregables/pruebas-navegador-REV58/harness.cjs');
  const code = fs.readFileSync(harnessPath, 'utf8');
  const module = { exports: {} };
  const ctx = vm.createContext({
    __dirname: path.dirname(harnessPath), module, process: { env: {} },
    require: name => name === 'playwright' ? { chromium: {} } : require(name),
  });
  vm.runInContext(code, ctx);
  const server = await module.exports.serve();
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/beta/`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /MICOMERCIO_BUILD/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
