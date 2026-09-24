const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../beta/index.html'), 'utf8').replace(/\r\n/g, '\n');

function between(start, end) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `faltó bloque ${start}`);
  return html.slice(from, to);
}

test('el alta inicial pide nombre y zona horaria sin exponer el corte del día', () => {
  const fields = {
    '#f6Nombre': { value: '  Almacén Norte  ' },
    '#f6Timezone': { value: 'America/Argentina/Buenos_Aires' },
  };
  const context = { $: selector => fields[selector] };
  vm.createContext(context);
  vm.runInContext(`${between('const F6_WIZARD_COPY=', 'function f6PasoKey')}\nthis.api={F6_WIZARD_COPY,f6CamposPaso,f6PayloadPaso};`, context);
  const form = context.api.f6CamposPaso('datos_comercio');
  assert.match(form, /id="f6Nombre"/);
  assert.match(form, /id="f6Timezone"/);
  assert.doesNotMatch(form, /Corte del día|f6Cutoff/);
  assert.doesNotMatch(context.api.F6_WIZARD_COPY.datos_comercio[1], /corte del día/i);
  assert.deepEqual(JSON.parse(JSON.stringify(context.api.f6PayloadPaso('datos_comercio'))), {
    nombre: 'Almacén Norte',
    timezone: 'America/Argentina/Buenos_Aires',
    business_day_cutoff: '00:00',
  });
});

function turnoFixture(moduloCigarros, cigarrillos = '75,50') {
  const session = { fondoCigarros: 50 };
  const messages = [];
  const fields = {
    '#rev31Abrir': { onclick: null },
    '#rev31Fondo': { value: '120,25' },
    '#rev31FondoCig': { value: cigarrillos },
    '#rev31Responsable': { value: ' Ana ' },
  };
  let saved = 0;
  const context = {
    db: { config: { fondoCaja: 100, fondoCajaCigarros: 50, moduloCigarros } },
    f5MembresiaActual: () => ({ nombre_mostrado: 'Ana', user_id: 'u1' }),
    esc: value => value,
    $: selector => fields[selector],
    numImportacion: value => ({ ok: /^\d+(?:[,.]\d+)?$/.test(value), blank: value === '', value: Number(value.replace(',', '.')) }),
    f5ExigirEscritura: () => {},
    f3AsegurarSesionLocal: () => session,
    f3GuardarEstadoLocal: async () => { saved += 1; },
    render: () => {},
    aviso: (message, kind) => messages.push([message, kind]),
  };
  vm.createContext(context);
  vm.runInContext(`${between('let rev31ReabrirTrasCierre=false;', 'function mostrarAvisoTurnoRev31')}\nthis.open=vAbrirTurnoRev31;`, context);
  const main = { innerHTML: '' };
  context.open(main);
  return { main, fields, session, messages, saved: () => saved };
}

test('la apertura separa ambos fondos cuando está activa la caja de cigarrillos', async () => {
  const ui = turnoFixture(true);
  assert.match(ui.main.innerHTML, /id="rev31FondoCig"/);
  assert.match(ui.main.innerHTML, /Fondo inicial de cigarrillos/);
  await ui.fields['#rev31Abrir'].onclick();
  assert.equal(ui.session.fondoGeneral, 120.25);
  assert.equal(ui.session.fondoCigarros, 75.5);
  assert.equal(ui.session.rev31AperturaExplicita, true);
  assert.equal(ui.saved(), 1);
});

test('la apertura no muestra caja de cigarrillos si la función está apagada', async () => {
  const ui = turnoFixture(false);
  assert.doesNotMatch(ui.main.innerHTML, /id="rev31FondoCig"/);
  await ui.fields['#rev31Abrir'].onclick();
  assert.equal(ui.session.fondoGeneral, 120.25);
  assert.equal(ui.session.fondoCigarros, 50);
  assert.equal(ui.saved(), 1);
});

test('un fondo de cigarrillos negativo impide abrir el turno', async () => {
  const ui = turnoFixture(true, '-1');
  await ui.fields['#rev31Abrir'].onclick();
  assert.equal(ui.saved(), 0);
  assert.equal(ui.session.rev31AperturaExplicita, undefined);
  assert.ok(ui.messages.some(([, kind]) => kind === 'bad'));
});

test('crear empleado despliega el formulario y cancelarlo conserva la lista visible', () => {
  const elements = new Map();
  const $ = selector => {
    if (!elements.has(selector)) elements.set(selector, { hidden: false, onclick: null, value: '', textContent: '', setAttribute() {}, focus() {} });
    return elements.get(selector);
  };
  const main = { set innerHTML(markup) {
    this.markup = markup;
    for (const match of markup.matchAll(/<[^>]+\bid="(f5CrearEmpleadoPanel|f5AbrirCrearEmpleado|f5CancelarCrearEmpleado|f5EmpleadosLista)"[^>]*>/g)) {
      $(`#${match[1]}`).hidden = /\bhidden\b/.test(match[0]);
    }
  } };
  const context = {
    db: { config: { nombre: 'Comercio', nroVenta: 1, permisosEmpleado: {}, fondoCaja: 0, fondoCajaCigarros: 0 } },
    SECCIONES_PERMISO: [],
    F5_EMPLOYEE_PERMISSION_KEYS: ['ventas_registrar'],
    F5_PERMISO_EMPLEADO_UI: { ventas_registrar: ['Vender', 'Registrar ventas'] },
    TXT_PERMISO: {}, DESC_PERMISO: {},
    moduloActivo: () => true,
    esc: value => value,
    $, $$: () => [],
    descargarBackup: () => {},
    f5PuedeGestionarEmpleados: () => false,
  };
  vm.createContext(context);
  vm.runInContext(`${between('function vConfig(m){', '\n/* ═══════════════════════════════════════════════════════\n   COMERCIOS DE EJEMPLO')}\nthis.show=vConfig;`, context);
  context.show(main);
  assert.match(main.markup, /id="f5EmpleadosLista"/);
  assert.equal($('#f5EmpleadosLista').hidden, false);
  assert.equal($('#f5CrearEmpleadoPanel').hidden, true);
  $('#f5AbrirCrearEmpleado').onclick();
  assert.equal($('#f5CrearEmpleadoPanel').hidden, false);
  assert.equal($('#f5AbrirCrearEmpleado').hidden, true);
  $('#f5CancelarCrearEmpleado').onclick();
  assert.equal($('#f5CrearEmpleadoPanel').hidden, true);
  assert.equal($('#f5AbrirCrearEmpleado').hidden, false);
  assert.equal($('#f5EmpleadosLista').hidden, false);
});

test('tras guardar un empleado el próximo formulario vuelve a los permisos mínimos', async () => {
  const elements = new Map();
  const $ = selector => {
    if (!elements.has(selector)) elements.set(selector, { hidden: false, onclick: null, value: '', setAttribute() {}, focus() {} });
    return elements.get(selector);
  };
  const permissions = [
    { dataset: { f5NewPerm: 'ventas_registrar' }, checked: false },
    { dataset: { f5NewPerm: 'productos_editar' }, checked: true },
  ];
  const context = {
    db: { config: { nombre: 'Comercio', nroVenta: 1, permisosEmpleado: {} } },
    SECCIONES_PERMISO: [], F5_EMPLOYEE_PERMISSION_KEYS: ['ventas_registrar', 'productos_editar'],
    F5_PERMISO_EMPLEADO_UI: { ventas_registrar: ['Vender', 'Registrar'], productos_editar: ['Productos', 'Editar'] },
    TXT_PERMISO: {}, DESC_PERMISO: {}, moduloActivo: () => true, esc: value => value,
    $, $$: selector => selector === '[data-f5-new-perm]' ? permissions : [],
    descargarBackup: () => {}, f5PuedeGestionarEmpleados: () => false,
    f5PayloadCrearEmpleado: (values, perms) => ({ ...values, perms }),
    f5MembersRequest: async () => ({}), f5CargarGestionEmpleados: async () => {}, aviso: () => {},
  };
  vm.createContext(context);
  vm.runInContext(`${between('function vConfig(m){', '\n/* ═══════════════════════════════════════════════════════\n   COMERCIOS DE EJEMPLO')}\nthis.show=vConfig;`, context);
  context.show({ innerHTML: '' });
  $('#f5EmpleadoNombre').value = 'Ana';
  $('#f5EmpleadoUsuario').value = 'ana';
  $('#f5EmpleadoClave').value = 'clave temporal de prueba';
  await $('#f5CrearEmpleado').onclick();
  assert.deepEqual(permissions.map(item => item.checked), [true, false]);
  assert.equal($('#f5CrearEmpleadoPanel').hidden, true);
});
