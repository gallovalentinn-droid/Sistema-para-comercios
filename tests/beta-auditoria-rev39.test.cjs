const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../beta/index.html'), 'utf8').replace(/\r\n/g, '\n');
function block(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `falta el bloque ${start}`);
  return html.slice(a, b);
}
function run(code, ctx) {
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx;
}

test('una solicitud de arranque colgada termina por tiempo máximo; las posteriores conservan fetch normal', async () => {
  let aborted = false;
  const ctx = run(`${block('let f6ArranqueActivo=', 'const sb =')}\nthis.fetchInicio=f6FetchArranque;this.terminar=f6TerminarArranque;`, {
    fetch: (_input, init) => new Promise((resolve, reject) => {
      if (!init.signal) { resolve({ ok: true }); return; }
      init.signal.addEventListener('abort', () => { aborted = true; reject(new Error('AbortError')); }, { once: true });
    }),
    AbortController, setTimeout: callback => { queueMicrotask(callback); return 1; },
    clearTimeout: () => {},
  });
  await assert.rejects(ctx.fetchInicio('/rpc/estado_f43', {}), /NETWORK_TIMEOUT/);
  assert.equal(aborted, true);
  ctx.terminar();
  assert.equal((await ctx.fetchInicio('/rpc/estado_f43', {})).ok, true);
});

test('abrir la pantalla no reinicia el plazo de un arranque ya iniciado', async () => {
  const elements = Object.fromEntries(['#loginWrap', '#onboardingWrap', '#appWrap', '#btnColapsar', '#brandMk', '#main', '#reintentarInicio'].map(k => [k, {}]));
  let resets = 0;
  const ctx = run(`${block('async function mostrarApp(){', '/* ═══════════════════════════════════════════════════════\n   2. UTILIDADES')}\nthis.abrir=mostrarApp;`, {
    $: selector => elements[selector], document: { getElementById: () => ({}) },
    cargar: async () => { throw new Error('NETWORK_TIMEOUT'); },
    f3Inicializar: async () => {}, f6AsegurarProteccionDispositivo: async () => {}, render: () => {},
    f6ArranqueActivo: true, f6IniciarArranque: () => { resets++; }, f6TerminarArranque: () => {},
    console: { error: () => {} }, toggleColapso: () => {}, railColapsado: false,
  });
  await ctx.abrir();
  assert.equal(resets, 0);
});

test('no se puede cambiar la separación de cigarrillos con una caja abierta', () => {
  const button = { dataset: { mod: 'moduloCigarros' } };
  const notices = []; let saves = 0;
  const ctx = run(block("  $$('[data-mod]').forEach", '  const avisoTurno='), {
    $$: () => [button], db: { config: { moduloCigarros: false } },
    f3Estado: { session: { estado: 'abierta' } },
    aviso: message => notices.push(message), guardar: () => { saves++; }, render: () => {},
  });
  button.onclick();
  assert.equal(ctx.db.config.moduloCigarros, false);
  assert.equal(saves, 0);
  assert.match(notices[0], /Cerrá la caja/i);
  ctx.f3Estado.session.estado = 'cerrada';
  button.onclick();
  assert.equal(ctx.db.config.moduloCigarros, true);
  assert.equal(saves, 1);
});

test('la importación rechaza un producto nuevo sin precio y conserva el precio existente si la celda está vacía', () => {
  const ctx = run(`${block('function filaAProducto(f,ix){', 'function pintarPreview(ov){')}\nthis.analizar=analizarImportacion;`, {
    impFilas: [
      { nombre: 'Nuevo sin precio', precio: '', stock: '5' },
      { nombre: 'Existente', precio: '', stock: '5' },
      { nombre: 'Nuevo gratuito', precio: '0', stock: '5' },
    ],
    impMapa: { precio: 1 }, impResoluciones: {},
    db: { productos: [{ id: 'existente', nombre: 'Existente', precio: 120 }] },
    celdaTexto: (row, key) => String(row[key] ?? ''),
    celdaNumero: (row, key) => ({ blank: row[key] == null || row[key] === '', ok: true, value: Number(row[key] || 0) }),
    normalizarTexto: value => String(value || '').toLowerCase(),
    CAMPOS_IMPORT: ['costo', 'precio', 'stock', 'stockMin', 'stockDeseado'].map(k => ({ k, txt: k })),
  });
  const rows = ctx.analizar();
  assert.match(rows[0]._errores.join(' '), /Precio.*completalo.*0/i);
  assert.equal(rows[1]._errores.length, 0);
  assert.equal(rows[1]._existente.precio, 120);
  assert.equal(rows[2]._errores.length, 0);
  assert.equal(rows[2].precio, 0);
});

test('un rechazo de sesión ofrece volver a ingresar y no culpa a la conexión', async () => {
  const elements = Object.fromEntries(['#loginWrap', '#onboardingWrap', '#appWrap', '#btnColapsar', '#brandMk', '#main', '#reintentarInicio'].map(k => [k, {}]));
  let returnedToLogin = false;
  const ctx = run(`${block('async function mostrarApp(){', '/* ═══════════════════════════════════════════════════════\n   2. UTILIDADES')}\nthis.abrir=mostrarApp;`, {
    $: selector => elements[selector], document: { getElementById: id => id === 'startupLoading' ? {} : elements['#onboardingWrap'] },
    cargar: async () => { const error = new Error('JWT expired'); error.code = 'PGRST301'; throw error; },
    f3Inicializar: async () => {}, f6AsegurarProteccionDispositivo: async () => {}, render: () => {},
    cerrarSesion: () => { returnedToLogin = true; }, console: { error: () => {} },
    toggleColapso: () => {}, railColapsado: false,
    f6ArranqueActivo: false, f6IniciarArranque: () => {}, f6TerminarArranque: () => {},
  });
  await ctx.abrir();
  assert.match(elements['#main'].innerHTML, /Volver a ingresar/);
  assert.doesNotMatch(elements['#main'].innerHTML, /Revisá la conexión/);
  elements['#reintentarInicio'].onclick();
  assert.equal(returnedToLogin, true);
});
