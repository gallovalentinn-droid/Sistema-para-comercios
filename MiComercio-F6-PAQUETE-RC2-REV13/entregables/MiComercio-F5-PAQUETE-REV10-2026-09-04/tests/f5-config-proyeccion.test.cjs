const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const artefacto = require('./lib/artefacto.cjs');

// Extrae del artefacto real las piezas del contrato de configuración.
// No se re-declara nada acá: si el cliente cambia, estas pruebas ven el cambio.
function cargarPiezas() {
  const html = artefacto.readArtifact();
  const js = html.slice(html.indexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'));
  const tomar = (re, nombre) => {
    const m = js.match(re);
    assert.ok(m, `no se encontró ${nombre} en el artefacto`);
    return m[0];
  };
  const src = [
    tomar(/const VACIA=\(\)=>\(\{[\s\S]*?\n\}\);/, 'VACIA'),
    tomar(/const F5_CONFIG_MAPA=Object\.freeze\(\{[\s\S]*?\n\}\);/, 'F5_CONFIG_MAPA'),
    tomar(/const F5_CONFIG_LEGACY_ONLY_KEYS=Object\.freeze\(\[[\s\S]*?\]\);/, 'F5_CONFIG_LEGACY_ONLY_KEYS'),
    tomar(/function f32MapConfig\(row\)\{[\s\S]*?\n\}/, 'f32MapConfig'),
    tomar(/function f32MapConfigParcial\(row\)\{[\s\S]*?\n\}/, 'f32MapConfigParcial'),
  ].join('\n');
  const ctx = { module: { exports: {} } };
  vm.runInNewContext(
    `${src}\nmodule.exports={VACIA,F5_CONFIG_MAPA,F5_CONFIG_LEGACY_ONLY_KEYS,f32MapConfig,f32MapConfigParcial};`,
    ctx,
    { filename: artefacto.artifactPath() }
  );
  return ctx.module.exports;
}

// Config local de un comercio en uso: ninguno de estos valores es el default.
function configLocal(VACIA) {
  return {
    ...VACIA().config,
    nombre: 'Kiosco Valen',
    nroVenta: 842,
    fondoCaja: 15000,
    fondoCajaCigarros: 8000,
    ultBackup: '2026-09-01',
    whatsappDueno: '5491122334455',
    pinHash: `pbkdf2$150000$${'a'.repeat(32)}$${'b'.repeat(64)}`,
    pinDuenio: '',
    motivosEgresoExtra: ['Flete', 'Sueldo'],
    diasAvisoVence: 15,
    diasPlazoFiado: 45,
    recargoFiadoPct: 12,
    permisosEmpleado: { caja: false, resumen: false },
  };
}

// Fila V4 completa, con los mismos valores que el local.
const FILA_V4 = Object.freeze({
  comercio_id: 'c1',
  fondo_caja: 15000,
  fondo_caja_cigarros: 8000,
  whatsapp_dueno: '5491122334455',
  dias_aviso_vence: 15,
  dias_plazo_fiado: 45,
  recargo_fiado_pct: 12,
  modulo_fiado: true,
  modulo_vencimientos: true,
  modulo_cigarros: true,
  motivos_egreso_extra: ['Flete', 'Sueldo'],
  updated_at: '2026-09-04T00:00:00Z',
});

// Alcances que devuelve private.f5_colecciones_por_permisos para
// comercio_configuracion. Si el manifiesto del servidor cambia, esta prueba
// deja de representarlo: el gate real es la suite SQL de cobertura.
const ALCANCES = {
  'owner (10 permisos)': [
    'comercio_id', 'dias_aviso_vence', 'dias_plazo_fiado', 'fondo_caja',
    'fondo_caja_cigarros', 'modulo_cigarros', 'modulo_fiado', 'modulo_vencimientos',
    'motivos_egreso_extra', 'recargo_fiado_pct', 'updated_at', 'whatsapp_dueno',
  ],
  'empleado sólo-ventas': [
    'comercio_id', 'dias_aviso_vence', 'modulo_cigarros', 'modulo_fiado',
    'modulo_vencimientos', 'updated_at', 'whatsapp_dueno',
  ],
};

test('el reparto 10/6 se deriva del artefacto y no está tipeado', () => {
  const { VACIA, F5_CONFIG_MAPA, F5_CONFIG_LEGACY_ONLY_KEYS } = cargarPiezas();
  const canonicas = Object.keys(F5_CONFIG_MAPA);
  const derivadas = Object.keys(VACIA().config).filter((k) => !canonicas.includes(k));
  assert.equal(canonicas.length, 10);
  assert.deepEqual(
    [...derivadas].sort(),
    [...F5_CONFIG_LEGACY_ONLY_KEYS].sort(),
    'la lista legacy-only declarada no coincide con la que se deriva de VACIA(); ' +
      'si el cambio es deliberado hay que actualizar el contrato, no la prueba'
  );
});

test('pinHash y permisosEmpleado no viajan por V4 en ninguna dirección', () => {
  const { F5_CONFIG_MAPA, f32MapConfig } = cargarPiezas();
  // No tienen escritor en V4: leerlos de ahí devolvía siempre el default y
  // borraba la autoridad local. Son legacy-only hasta que F5.1 los mueva.
  const columnas = Object.values(F5_CONFIG_MAPA).map((m) => m.col);
  assert.equal(columnas.includes('pin_hash'), false);
  assert.equal(columnas.includes('permisos_empleado'), false);
  const mapeado = f32MapConfig({ ...FILA_V4, pin_hash: 'X', permisos_empleado: { caja: true } });
  assert.equal('pinHash' in mapeado, false);
  assert.equal('permisosEmpleado' in mapeado, false);
});

test('un pull recortado por el manifiesto no pisa ninguna clave local', () => {
  const { VACIA, f32MapConfigParcial } = cargarPiezas();
  for (const [perfil, campos] of Object.entries(ALCANCES)) {
    const local = configLocal(VACIA);
    const fila = {};
    for (const c of campos) if (c in FILA_V4) fila[c] = FILA_V4[c];
    const despues = { ...local, ...f32MapConfigParcial(fila) };
    const pisadas = Object.keys(local).filter(
      (k) => JSON.stringify(local[k]) !== JSON.stringify(despues[k])
    );
    assert.deepEqual(pisadas, [], `${perfil}: el pull pisó ${pisadas.join(', ')}`);
  }
});

test('f32MapConfig sobre fila completa sigue rindiendo las 10 canónicas', () => {
  const { f32MapConfig, F5_CONFIG_MAPA } = cargarPiezas();
  const mapeado = f32MapConfig(FILA_V4);
  assert.deepEqual(Object.keys(mapeado), Object.keys(F5_CONFIG_MAPA));
  assert.equal(mapeado.fondoCaja, 15000);
  assert.equal(mapeado.whatsappDueno, '5491122334455');
  assert.equal(mapeado.diasAvisoVence, 15);
});
