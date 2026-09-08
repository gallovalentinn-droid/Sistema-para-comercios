const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.resolve(__dirname, '../beta/index.html');
const html = () => fs.readFileSync(htmlPath, 'utf8');

function employeeCore(source) {
  const match = source.match(/\/\* F5_EMPLOYEE_UI_CORE_START \*\/([\s\S]*?)\/\* F5_EMPLOYEE_UI_CORE_END \*\//);
  assert.ok(match, 'no se encontró el núcleo real de gestión de empleados');
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${match[1]};this.api={f5PermisosEmpleadoIniciales,f5PayloadCrearEmpleado,f5ArgsActualizarEmpleado};`, context);
  return context.api;
}

function productImageCore(source) {
  const match = source.match(/\/\* F5_PRODUCT_IMAGE_CORE_START \*\/([\s\S]*?)\/\* F5_PRODUCT_IMAGE_CORE_END \*\//);
  assert.ok(match, 'no se encontró el contrato real de imágenes de productos');
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${match[1]};this.api={f5RutaImagenProducto};`, context);
  return context.api;
}

test('un empleado nuevo recibe sólo permiso de venta por defecto', () => {
  const { f5PermisosEmpleadoIniciales } = employeeCore(html());
  assert.deepEqual(JSON.parse(JSON.stringify(f5PermisosEmpleadoIniciales())), {
    ventas_registrar: true,
    productos_editar: false,
    reposicion_ver: false,
    vencimientos_ver: false,
    combos_editar: false,
    promociones_editar: false,
    fiado_operar: false,
    caja_operar: false,
    movimientos_ver: false,
    resumen_ver: false,
  });
});

test('el alta normaliza los datos visibles y conserva la contraseña sólo en el pedido', () => {
  const { f5PayloadCrearEmpleado } = employeeCore(html());
  const permisos = { ventas_registrar: true };
  assert.deepEqual(JSON.parse(JSON.stringify(f5PayloadCrearEmpleado({
    nombre: ' Ana ',
    usuario: ' CAJA_1 ',
    clave: '12345678',
  }, permisos))), {
    accion: 'crear',
    nombre: 'Ana',
    usuario: 'caja_1',
    clave: '12345678',
    permisos: { ventas_registrar: true },
  });
  assert.throws(() => f5PayloadCrearEmpleado({ nombre: '', usuario: 'caja', clave: '12345678' }, permisos), /F5_EMPLEADO_NOMBRE/);
  assert.throws(() => f5PayloadCrearEmpleado({ nombre: 'Ana', usuario: 'caja', clave: 'corta' }, permisos), /F5_EMPLEADO_CLAVE/);
});

test('la actualización fija rol empleado y el comercio recibido', () => {
  const { f5ArgsActualizarEmpleado } = employeeCore(html());
  assert.deepEqual(JSON.parse(JSON.stringify(f5ArgsActualizarEmpleado(
    '33333333-3333-4333-8333-333333333333',
    { user_id: '11111111-1111-4111-8111-111111111111' },
    { ventas_registrar: true },
    false,
  ))), {
    p_comercio_id: '33333333-3333-4333-8333-333333333333',
    p_target_user_id: '11111111-1111-4111-8111-111111111111',
    p_rol: 'empleado',
    p_permisos: { ventas_registrar: true },
    p_activo: false,
  });
});

test('la beta conserva todas las secciones funcionales del sistema completo', () => {
  const source = html();
  const match = source.match(/const VISTAS=(\[[\s\S]*?\]);\s*\/\/ las que el dueño/);
  assert.ok(match, 'no se encontró la navegación completa');
  const views = JSON.parse(JSON.stringify(vm.runInNewContext(match[1]))).map((view) => view.id);
  assert.deepEqual(views, [
    'vender', 'productos', 'reponer', 'vencimientos', 'combos', 'promociones',
    'fiado', 'caja', 'movimientos', 'resumen', 'config', 'soporte',
  ]);
});

test('Configuración ofrece empleados reales sin confundirlos con el bloqueo de mostrador', () => {
  const source = html();
  assert.match(source, /id="cf-empleados"/);
  assert.match(source, />Empleados</);
  assert.match(source, />Bloqueo de mostrador</);
  assert.match(source, /id="f5EmpleadoNombre"/);
  assert.match(source, /id="f5EmpleadoUsuario"/);
  assert.match(source, /id="f5EmpleadoClave"/);
  assert.match(source, /id="f5EmpleadosLista"/);
});

test('cada foto pertenece al comercio y al producto, no a la cuenta que la subió', () => {
  const { f5RutaImagenProducto } = productImageCore(html());
  assert.equal(
    f5RutaImagenProducto(
      '33333333-3333-4333-8333-333333333333',
      '11111111-1111-4111-8111-111111111111',
    ),
    '33333333-3333-4333-8333-333333333333/11111111-1111-4111-8111-111111111111.jpg',
  );
  assert.throws(() => f5RutaImagenProducto('', '11111111-1111-4111-8111-111111111111'), /F5_PRODUCT_IMAGE_CONTEXT_REQUIRED/);
});

test('la carga remota usa la ruta canónica del comercio', () => {
  const source = html();
  const upload = source.match(/async function subirFotoProducto\(file,id\)\{([\s\S]*?)\n\}/);
  assert.ok(upload, 'no se encontró la carga de fotos');
  assert.match(upload[1], /f5RutaImagenProducto\(f3Estado\.comercioId,id\)/);
  assert.doesNotMatch(upload[1], /sesion\.user\.id/);
});
