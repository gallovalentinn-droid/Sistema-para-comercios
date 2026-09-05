const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const artefacto = require('./lib/artefacto.cjs');

const artifactPath = artefacto.artifactPath();

function loadArtifact() {
  return artefacto.readArtifact();
}

function loadConfigContract() {
  const html = loadArtifact();
  const startMarker = '/* F5_CONFIG_CONTRACT_START */';
  const endMarker = '/* F5_CONFIG_CONTRACT_END */';
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);
  assert.notEqual(start, -1, 'falta el contrato F5 de configuración');
  assert.ok(end > start, 'el contrato F5 de configuración está incompleto');

  const code = html.slice(start + startMarker.length, end);
  const context = { module: { exports: {} } };
  vm.runInNewContext(
    `${code}\nmodule.exports={F5_CONFIG_CANONICAL_KEYS,F5_CONFIG_LEGACY_ONLY_KEYS,f3PayloadConfig,f5SepararConfigPayload};`,
    context,
    { filename: artifactPath }
  );
  return context.module.exports;
}

function configFixture() {
  return {
    fondoCaja: 10,
    fondoCajaCigarros: 5,
    whatsappDueno: '5491100000000',
    pinHash: 'NO_DEBE_VIAJAR',
    diasAvisoVence: 8,
    diasPlazoFiado: 31,
    recargoFiadoPct: 12,
    moduloFiado: true,
    moduloVencimientos: false,
    moduloCigarros: true,
    permisosEmpleado: { caja: true },
    motivosEgresoExtra: ['Flete'],
  };
}

function loadLegacyTurnGuard(turno) {
  const html = loadArtifact();
  const source = html.match(/function f3TurnoLegacyLimpio\(\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(source, 'falta el guard de turno legacy');
  const context = {
    turnoActual: () => turno,
    result: null,
  };
  vm.runInNewContext(`${source};result=f3TurnoLegacyLimpio();`, context, {
    filename: artifactPath,
  });
  return context.result;
}

function loadAuthorityCore() {
  const html = loadArtifact();
  const startMarker = '/* F5_AUTHORITY_CORE_START */';
  const endMarker = '/* F5_AUTHORITY_CORE_END */';
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);
  assert.notEqual(start, -1, 'falta el core cliente de autoridad F5');
  assert.ok(end > start, 'el core cliente de autoridad F5 está incompleto');
  const code = html.slice(start + startMarker.length, end);
  const context = { module: { exports: {} }, structuredClone };
  vm.runInNewContext(
    `${code}\nmodule.exports={F5_PERMISSION_CATALOG,f5EstadoInicial,f5InstalarLease,f5CapturarLeaseOperacion,f5EvaluarAutoridad,f5AplicarChequeoAutoridad,f5RegistrarFallaChequeo,f5AssertWritable,f5VistaPermitida};`,
    context,
    { filename: artifactPath }
  );
  return context.module.exports;
}

function loadSessionCore() {
  const html = loadArtifact();
  const startMarker = '/* F5_SESSION_CORE_START */';
  const endMarker = '/* F5_SESSION_CORE_END */';
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);
  assert.notEqual(start, -1, 'falta el core cliente de sesiones F5');
  assert.ok(end > start, 'el core cliente de sesiones F5 está incompleto');
  const code = html.slice(start + startMarker.length, end);
  const context = { module: { exports: {} } };
  vm.runInNewContext(
    `${code}\nmodule.exports={f5SesionIds,f5CamposSesionLocal,f5EstamparSesionLocal,f5SesionDesdeObjeto,f5SessionKey,f5FiltrarPorSesion,f5EsLlegadaTardia,f5GruposLegacyResumen,f5TicketRef};`,
    context,
    { filename: artifactPath }
  );
  return context.module.exports;
}

function loadProjectionCore() {
  const html = loadArtifact();
  const startMarker = '/* F5_PROJECTION_CORE_START */';
  const endMarker = '/* F5_PROJECTION_CORE_END */';
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);
  assert.notEqual(start, -1, 'falta el core cliente de proyección F5');
  assert.ok(end > start, 'el core cliente de proyección F5 está incompleto');
  const code = html.slice(start + startMarker.length, end);
  const context = { module: { exports: {} } };
  vm.runInNewContext(
    `${code}\nmodule.exports={F5_PROJECTION_CONTRACT,f5ProjectionCoverage,f5ProjectionSelect,f5ProjectionScope,f5ProjectionAllows};`,
    context,
    { filename: artifactPath }
  );
  return context.module.exports;
}

function loadUxCore() {
  const html = loadArtifact();
  const startMarker = '/* UX_BUSQUEDAS_PAGOS_HELPERS_START */';
  const endMarker = '/* UX_BUSQUEDAS_PAGOS_HELPERS_END */';
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);
  assert.notEqual(start, -1, 'falta el core de reportes diarios');
  assert.ok(end > start, 'el core de reportes diarios está incompleto');
  const code = html.slice(start + startMarker.length, end);
  const context = { module: { exports: {} } };
  vm.runInNewContext(
    `${code}\nmodule.exports={resumenStockProductoPeriodo};`,
    context,
    { filename: artifactPath }
  );
  return context.module.exports;
}

function leaseFixture(overrides = {}) {
  return {
    lease_id: '11111111-1111-4111-8111-111111111111',
    lease_family_id: '22222222-2222-4222-8222-222222222222',
    comercio_id: '33333333-3333-4333-8333-333333333333',
    user_id: '44444444-4444-4444-8444-444444444444',
    device_id: '55555555-5555-4555-8555-555555555555',
    rol: 'empleado',
    permisos: { ventas_registrar: true },
    operation_types: ['registrar_venta_v4'],
    permission_version: 1,
    issued_at: '2026-09-02T12:00:00.000Z',
    valid_until: '2026-09-09T12:00:00.000Z',
    aceptacion_hasta: '2026-10-09T12:00:00.000Z',
    ...overrides,
  };
}

test('el contrato de configuración queda cerrado en 10 canónicas y 6 legacy-only', () => {
  const { F5_CONFIG_CANONICAL_KEYS, F5_CONFIG_LEGACY_ONLY_KEYS } = loadConfigContract();
  assert.deepEqual(Array.from(F5_CONFIG_CANONICAL_KEYS), [
    'fondo_caja', 'fondo_caja_cigarros', 'whatsapp_dueno', 'dias_aviso_vence',
    'dias_plazo_fiado', 'recargo_fiado_pct', 'modulo_fiado',
    'modulo_vencimientos', 'modulo_cigarros', 'motivos_egreso_extra',
  ]);
  assert.deepEqual(Array.from(F5_CONFIG_LEGACY_ONLY_KEYS), [
    'nombre', 'nroVenta', 'ultBackup', 'pinDuenio', 'pinHash', 'permisosEmpleado',
  ]);
});

test('f3PayloadConfig emite 10 keys y nunca autoridad legacy', () => {
  const { f3PayloadConfig } = loadConfigContract();
  const payload = f3PayloadConfig(configFixture());
  assert.equal(Object.keys(payload).length, 10);
  assert.equal('pin_hash' in payload, false);
  assert.equal('permisos_empleado' in payload, false);
  assert.equal('comercio_id' in payload, false);
});

test('la separación para las dos RPC no pierde ni duplica keys', () => {
  const { f3PayloadConfig, f5SepararConfigPayload } = loadConfigContract();
  const payload = f3PayloadConfig(configFixture());
  const parts = f5SepararConfigPayload(payload);
  assert.deepEqual(Object.keys(parts.operativa).sort(), [
    'dias_aviso_vence', 'dias_plazo_fiado', 'fondo_caja', 'fondo_caja_cigarros',
    'motivos_egreso_extra', 'recargo_fiado_pct',
  ]);
  assert.deepEqual(Object.keys(parts.privilegiada).sort(), [
    'modulo_cigarros', 'modulo_fiado', 'modulo_vencimientos', 'whatsapp_dueno',
  ]);
  assert.equal(Object.keys(parts.operativa).length + Object.keys(parts.privilegiada).length, 10);
});

test('el cliente F5 ya no escribe comercio_configuracion de forma directa', () => {
  const html = loadArtifact();
  assert.doesNotMatch(html, /\.from\(['"]comercio_configuracion['"]\)\.upsert\(/);
  assert.match(html, /\.rpc\(['"]f5_actualizar_config_operativa['"]/);
  assert.match(html, /\.rpc\(['"]f5_actualizar_config_privilegiada['"]/);
});

test('la comparación F3.4 usa el mismo universo canónico de 10 keys', () => {
  const html = loadArtifact();
  const source = html.match(/function f34ConfigLocal\(c\)\{[^\n]+\}/)?.[0];
  assert.ok(source, 'falta el normalizador F3.4 de configuración');
  const context = {
    f34Round: value => Number(value) || 0,
    f34Str: value => String(value ?? ''),
    f34Num: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
  };
  const sandbox = { ...context, input: configFixture(), result: null };
  vm.runInNewContext(`${source};result=f34ConfigLocal(input);`, sandbox);
  assert.equal(Object.keys(sandbox.result).length, 10);
  assert.equal('pin_hash' in sandbox.result, false);
  assert.equal('permisos_empleado' in sandbox.result, false);
});

test('un turno con una venta viva no se considera legacy limpio', () => {
  const limpio = loadLegacyTurnGuard({
    ventas: [{ id: 'venta-viva-1', anulada: false }],
    pagos: [],
    egresos: [],
  });
  assert.equal(limpio, false);
});

test('la autoridad ya no se puede elevar escribiendo un rol en localStorage', () => {
  const html = loadArtifact();
  assert.doesNotMatch(html, /\bLROLE\b|guardarRolLocal|cargarRolLocal/);
});

test('un reemplazo de lease gobierna operaciones nuevas sin reescribir una captura previa', () => {
  const { f5EstadoInicial, f5InstalarLease, f5CapturarLeaseOperacion } = loadAuthorityCore();
  const oldLease = leaseFixture();
  const installed = f5InstalarLease(
    f5EstadoInicial(),
    { server_now: oldLease.issued_at, lease: oldLease },
    { nowMs: Date.parse(oldLease.issued_at) }
  );
  const captured = f5CapturarLeaseOperacion(installed, 'registrar_venta_v4');
  const nextLease = leaseFixture({
    lease_id: '66666666-6666-4666-8666-666666666666',
    issued_at: '2026-09-03T12:00:00.000Z',
    valid_until: '2026-09-10T12:00:00.000Z',
    aceptacion_hasta: '2026-10-10T12:00:00.000Z',
  });
  const replaced = f5InstalarLease(
    installed,
    { server_now: nextLease.issued_at, lease: nextLease },
    { nowMs: Date.parse(nextLease.issued_at) }
  );
  assert.equal(captured.lease_id, oldLease.lease_id);
  assert.equal(replaced.lease.lease_id, nextLease.lease_id);
  assert.equal(captured.lease_id, oldLease.lease_id);
});

test('assertWritable informa juntas las tres causas de sólo lectura', () => {
  const { f5AssertWritable } = loadAuthorityCore();
  const result = f5AssertWritable('registrar_venta_v4', {
    frozen: true,
    license: { puedeOperar: false },
    authority: { writable: false },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(Array.from(result.causas), [
    'F43_DEVICE_FROZEN',
    'F33_LICENSE_NOT_OPERABLE',
    'F5_LEASE_EXPIRED_OR_REVOKED',
  ]);
});

test('timeout conserva el lease y una revocación explícita corta escritura', () => {
  const {
    f5EstadoInicial, f5InstalarLease, f5AplicarChequeoAutoridad,
    f5RegistrarFallaChequeo, f5EvaluarAutoridad,
  } = loadAuthorityCore();
  const lease = leaseFixture();
  const installed = f5InstalarLease(
    f5EstadoInicial(),
    { server_now: lease.issued_at, lease },
    { nowMs: Date.parse(lease.issued_at) }
  );
  const timedOut = f5RegistrarFallaChequeo(installed, new Error('timeout'), {
    nowMs: Date.parse(lease.issued_at) + 60_000,
  });
  assert.equal(timedOut.lease.lease_id, lease.lease_id);
  assert.equal(timedOut.lease.valid_until, lease.valid_until);
  assert.equal(f5EvaluarAutoridad(timedOut, { nowMs: Date.parse(lease.issued_at) + 60_000 }).writable, true);

  const revoked = f5AplicarChequeoAutoridad(timedOut, {
    writable: false,
    causas: ['F5_MEMBERSHIP_REVOKED'],
    server_now: '2026-09-02T12:02:00.000Z',
    membership: null,
  }, { nowMs: Date.parse('2026-09-02T12:02:00.000Z') });
  assert.equal(f5EvaluarAutoridad(revoked, { nowMs: Date.parse('2026-09-02T12:02:01.000Z') }).writable, false);
});

test('el reloj usa el último desfase validado y falla cerrado ante retroceso', () => {
  const { f5EstadoInicial, f5InstalarLease, f5EvaluarAutoridad } = loadAuthorityCore();
  const lease = leaseFixture();
  const checkedAt = Date.parse('2026-09-02T15:00:00.000Z');
  const state = f5InstalarLease(
    f5EstadoInicial(),
    { server_now: lease.issued_at, lease },
    { nowMs: checkedAt }
  );
  const plusHour = f5EvaluarAutoridad(state, { nowMs: checkedAt + 3_600_000 });
  assert.equal(plusHour.writable, true);
  assert.equal(plusHour.serverEstimadoMs, Date.parse(lease.issued_at) + 3_600_000);
  const rollback = f5EvaluarAutoridad(state, { nowMs: checkedAt - 10 * 60_000 });
  assert.equal(rollback.writable, false);
});

test('la navegación del empleado usa permisos canónicos explícitos', () => {
  const { f5VistaPermitida } = loadAuthorityCore();
  const membership = { rol: 'empleado', permisos: { ventas_registrar: true, resumen_ver: false } };
  assert.equal(f5VistaPermitida('vender', membership), true);
  assert.equal(f5VistaPermitida('resumen', membership), false);
  assert.equal(f5VistaPermitida('productos', membership), false);
  assert.equal(f5VistaPermitida('config', membership), false);
  assert.equal(f5VistaPermitida('config', { rol: 'admin', permisos: {} }), true);
});

test('cada objeto local conserva raíz y segmento antes de entrar en db', () => {
  const { f5EstamparSesionLocal, f5SesionDesdeObjeto } = loadSessionCore();
  const session = {
    id: 'segmento-2', rootSessionId: 'raiz-1', sessionSegmentId: 'segmento-2',
    cajaId: 'caja-1', deviceId: 'device-1', openedAtDevice: '2026-09-02T10:00:00.000Z',
  };
  for (const tipo of ['venta', 'pago', 'egreso', 'movimiento', 'cierre']) {
    const row = f5EstamparSesionLocal({ tipo }, session);
    assert.equal(row._v4cajaSesionId, 'raiz-1');
    assert.equal(row._v4sessionSegmentId, 'segmento-2');
    assert.equal(f5SesionDesdeObjeto(row).id, 'segmento-2');
  }
  const html = loadArtifact();
  for (const coleccion of ['ventas', 'pagos', 'egresos', 'movs', 'cierres']) {
    assert.match(
      html,
      new RegExp(`f5EstamparSesionLocal\\([^\\n]+\\);\\s*db\\.${coleccion}\\.push`),
      `${coleccion} debe sellarse antes del push local`
    );
  }
});

test('el constructor recupera la sesión capturada por el objeto y no la sesión corriente', () => {
  const { f5SesionDesdeObjeto } = loadSessionCore();
  const row = { _v4cajaSesionId: 'raiz-vieja', _v4sessionSegmentId: 'segmento-viejo' };
  const snapshot = f5SesionDesdeObjeto(row);
  assert.equal(snapshot.rootSessionId, 'raiz-vieja');
  assert.equal(snapshot.sessionSegmentId, 'segmento-viejo');
  const html = loadArtifact();
  for (const name of ['f3OperacionVenta', 'f3OperacionPagoFiado', 'f3OperacionEgreso', 'f3OperacionMovimiento', 'f3OperacionCierre']) {
    const source = html.match(new RegExp(`function ${name}\\([^)]*\\)\\{[\\s\\S]*?\\n\\}`))?.[0] || '';
    assert.match(source, /f5SesionDesdeObjeto\(/, `${name} debe leer la sesión del objeto`);
    assert.doesNotMatch(source, /f3AsegurarSesionLocal\(|f3Estado\.session/, `${name} no debe inferir la sesión actual`);
  }
});

test('dos turnos superpuestos por fecha nunca mezclan sus operaciones', () => {
  const { f5FiltrarPorSesion } = loadSessionCore();
  const rows = [
    { id: 'a1', fecha: '2026-09-02T10:00:00Z', _v4cajaSesionId: 'raiz', _v4sessionSegmentId: 'turno-a' },
    { id: 'b1', fecha: '2026-09-02T10:00:00Z', _v4cajaSesionId: 'raiz', _v4sessionSegmentId: 'turno-b' },
    { id: 'legacy', fecha: '2026-09-02T10:00:00Z' },
  ];
  assert.deepEqual(Array.from(f5FiltrarPorSesion(rows, 'turno-a'), x => x.id), ['a1']);
  assert.deepEqual(Array.from(f5FiltrarPorSesion(rows, 'turno-b'), x => x.id), ['b1']);
  assert.deepEqual(Array.from(f5FiltrarPorSesion(rows, 'raiz'), x => x.id), []);
});

test('sin sesión abierta Caja no inventa un turno por ventana de fechas', () => {
  const html = loadArtifact();
  assert.match(html, /function turnoActual\(sessionId\)/);
  assert.match(html, /if\(!sessionId\) return null/);
  assert.match(html, /No hay un turno abierto/);
});

test('una venta anulada al día siguiente no reescribe el informe del día vendido', () => {
  const { resumenStockProductoPeriodo } = loadUxCore();
  const producto = { id: 'coca', stockBase: 10 };
  const venta = {
    fecha: '2026-09-02T10:00:00.000Z', anulada: true,
    anuladaFecha: '2026-09-03T09:00:00.000Z', items: [{ prodId: 'coca', cant: 3 }],
  };
  const movimientos = [
    { prodId: 'coca', fecha: venta.fecha, cant: -3, tipo: 'venta' },
    { prodId: 'coca', fecha: venta.anuladaFecha, cant: 3, tipo: 'ajuste' },
  ];
  const diaVenta = resumenStockProductoPeriodo({
    producto, movimientos, ventas: [venta],
    desde: '2026-09-02T00:00:00.000Z', hasta: '2026-09-02T23:59:59.999Z',
  });
  const diaAnulacion = resumenStockProductoPeriodo({
    producto, movimientos, ventas: [],
    desde: '2026-09-03T00:00:00.000Z', hasta: '2026-09-03T23:59:59.999Z',
  });
  assert.deepEqual({ vendidas: diaVenta.vendidas, otros: diaVenta.otros }, { vendidas: 3, otros: 0 });
  assert.deepEqual({ vendidas: diaAnulacion.vendidas, otros: diaAnulacion.otros }, { vendidas: 0, otros: 3 });
});

test('la llegada tardía se detecta por recepción posterior sin cambiar el día de negocio', () => {
  const { f5EsLlegadaTardia } = loadSessionCore();
  assert.equal(f5EsLlegadaTardia({ fecha: '2026-09-02T22:00:00Z', _v4receivedAt: '2026-09-04T08:00:00Z' }), true);
  assert.equal(f5EsLlegadaTardia({ fecha: '2026-09-02T10:00:00Z', _v4receivedAt: '2026-09-02T10:01:00Z' }), false);
});

test('las filas legacy quedan en sesiones sintéticas de Resumen y fuera de sesiones reales', () => {
  const { f5GruposLegacyResumen, f5FiltrarPorSesion } = loadSessionCore();
  const ventas = [
    { id: 'v-legacy-1', fecha: '2026-09-01T10:00:00Z' },
    { id: 'v-legacy-2', fecha: '2026-09-02T10:00:00Z' },
    { id: 'v-real', fecha: '2026-09-01T10:00:00Z', _v4cajaSesionId: 'real', _v4sessionSegmentId: 'real' },
  ];
  const grupos = f5GruposLegacyResumen({
    ventas, pagos: [], egresos: [],
    cierres: [{ id: 'c1', hasta: '2026-09-01T23:00:00Z' }],
  });
  assert.equal(grupos.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(grupos.map(g => g.ventas.map(v => v.id)))), [['v-legacy-1'], ['v-legacy-2']]);
  assert.deepEqual(Array.from(f5FiltrarPorSesion(ventas, 'real'), v => v.id), ['v-real']);
  assert.match(loadArtifact(), /Histórico sin sesión/);
});

test('el artefacto F5 completo conserva sintaxis JavaScript válida', () => {
  const scripts = [...loadArtifact().matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1]).filter(code => code.trim());
  assert.ok(scripts.length > 0);
  scripts.forEach((code, index) => assert.doesNotThrow(
    () => new vm.Script(code, { filename: `${artifactPath}#script-${index + 1}` })
  ));
});

test('el cliente agota el roster paginado y no supone un máximo de 32 personas', () => {
  const html = loadArtifact();
  assert.match(html, /async function f5ListarMiembrosTodos\(\)/);
  assert.match(html, /accion:'listar'/);
  assert.match(html, /while\(cursor\)/);
  assert.doesNotMatch(html, /slice\(0,\s*32\)|limit\(32\)|\.range\(0,\s*31\)/);
});

test('la referencia visible de ticket distingue ventas con igual secuencia', () => {
  const { f5TicketRef } = loadSessionCore();
  const a = f5TicketRef('CAJA-01', 42, '11111111-1111-4111-8111-111111111111');
  const b = f5TicketRef('CAJA-01', 42, '22222222-2222-4222-8222-222222222222');
  assert.equal(a, 'CAJA-01-000042-11111111');
  assert.equal(b, 'CAJA-01-000042-22222222');
  assert.notEqual(a, b);
});

test('la cobertura de proyección falla cerrado si se reduce una colección o campo', () => {
  const { f5ProjectionCoverage } = loadProjectionCore();
  const collections = {
    productos: { fields: ['id', 'stock_base'], scope: 'comercio' },
    movimientos_stock: { fields: ['id', 'producto_id', 'cantidad', 'tipo', 'occurred_at_device'], scope: 'comercio' },
  };
  const manifest = { id: 'f5p-test', hash: 'md5:test', version: 1, collections };
  assert.equal(f5ProjectionCoverage(manifest, collections).status, 'PASS');
  assert.throws(
    () => f5ProjectionCoverage(manifest, { productos: collections.productos }),
    /F34_COVERAGE_FAILURE/
  );
  const missingField = JSON.parse(JSON.stringify(collections));
  missingField.movimientos_stock.fields.pop();
  assert.throws(() => f5ProjectionCoverage(manifest, missingField), /F34_COVERAGE_FAILURE/);
});

test('el pull usa sólo campos y alcance declarados por el manifiesto del servidor', () => {
  const { f5ProjectionSelect, f5ProjectionScope, f5ProjectionAllows } = loadProjectionCore();
  const manifest = { collections: {
    ventas: { fields: ['id', 'device_id', 'received_at_server'], scope: 'device' },
  } };
  assert.equal(f5ProjectionAllows(manifest, 'ventas'), true);
  assert.equal(f5ProjectionAllows(manifest, 'clientes'), false);
  assert.equal(f5ProjectionSelect(manifest, 'ventas'), 'device_id,id,received_at_server');
  assert.equal(f5ProjectionScope(manifest, 'ventas'), 'device');
});

test('cada pull refresca el manifiesto normativo y F3.4 registra cobertura', () => {
  const html = loadArtifact();
  assert.match(html, /\.rpc\(['"]f5_obtener_proyeccion['"]/);
  assert.match(html, /async function f5RefrescarProyeccion/);
  assert.match(html, /async function f5ValidarCoberturaServidor/);
  assert.match(html, /f5ProjectionSelect\(manifest,spec\.tabla/);
  assert.match(html, /const projection=await f5RefrescarProyeccion\(\)/);
  assert.match(html, /coverage:projection\.coverage/);
});
