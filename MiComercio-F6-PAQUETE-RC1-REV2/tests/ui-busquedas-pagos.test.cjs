const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Esta suite valida que F5 no haya roto las funciones UX aprobadas antes de F5.
// Debe leer el artefacto F5, no el baseline: apuntada al baseline, pasaría
// igual aunque F5 hubiera eliminado buscadores, rubros o Movimientos.
const artefacto = require('./lib/artefacto.cjs');
const artifactPath = artefacto.artifactPath();

function loadFeatureHelpers() {
  // movimientosProductosPeriodo usa f5EsLlegadaTardia, definida en F5_SESSION_CORE.
  // Se componen los dos bloques en un mismo realm porque así conviven en el
  // artefacto real; inyectar un stub ocultaría una dependencia que existe.
  const code = artefacto.composeBlocks([
    ['/* F5_SESSION_CORE_START */', '/* F5_SESSION_CORE_END */'],
    ['/* UX_BUSQUEDAS_PAGOS_HELPERS_START */', '/* UX_BUSQUEDAS_PAGOS_HELPERS_END */']
  ]);
  const context = { module: { exports: {} } };
  vm.runInNewContext(
    `${code}\nmodule.exports = { productoCoincideFiltro, ventaCoincideBusqueda, formaPagoAgrupada, resumenStockProductoPeriodo, filtrarProductosPorBusqueda, filtrarVentasPorBusqueda, resumenesStockBusqueda, movimientosProductosPeriodo: typeof movimientosProductosPeriodo === 'function' ? movimientosProductosPeriodo : undefined, opcionesRubroProducto: typeof opcionesRubroProducto === 'function' ? opcionesRubroProducto : undefined, resolverRubroProducto: typeof resolverRubroProducto === 'function' ? resolverRubroProducto : undefined };`,
    context,
    { filename: artifactPath }
  );
  return context.module.exports;
}

function loadArtifact() {
  return fs.readFileSync(artifactPath, 'utf8');
}

test('el HTML conecta los buscadores en Para pedir, Caja, cierres y Resumen', () => {
  const html = loadArtifact();

  for (const id of ['qRep', 'rRep', 'qCajaTurno', 'qCajaCierre', 'qResumen']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `falta el control ${id}`);
  }
});

test('la interfaz ofrece una sola opción Transferencia / QR', () => {
  const html = loadArtifact();

  assert.equal((html.match(/data-fp="transferencia"/g) || []).length, 1);
  assert.equal((html.match(/data-fp="qr"/g) || []).length, 0);
  assert.match(html, /data-fp="transferencia">Transferencia \/ QR</);
});

test('Movimientos en cuentas queda disponible como sección diaria independiente', () => {
  const html = loadArtifact();

  assert.match(html, /id:'movimientos'.*txt:'Movimientos en cuentas'/);
  assert.match(html, /id="fechaMovimientos"/);
  assert.match(html, /id="tablaMovimientos"/);
  assert.doesNotMatch(html, /id="stockCajaTurno"|id="stockCajaCierre"|id="stockResumen"/);
});

test('Nuevo producto usa un desplegable real y permite escribir un rubro nuevo', () => {
  const html = loadArtifact();

  assert.match(html, /<select id="f_rub" class="inp">/);
  assert.match(html, /id="f_rub_nuevo"/);
  assert.doesNotMatch(html, /<input id="f_rub"[^>]*\blist=/);
});

test('todos los scripts embebidos del artefacto tienen sintaxis válida', () => {
  const html = loadArtifact();
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1])
    .filter(code => code.trim());

  assert.ok(scripts.length > 0, 'el artefacto debe contener al menos un script embebido');
  scripts.forEach((code, index) => assert.doesNotThrow(
    () => new vm.Script(code, { filename: `${artifactPath}#script-${index + 1}` })
  ));
});

test('filtra productos por nombre, código y rubro sin depender de mayúsculas o tildes', () => {
  const { productoCoincideFiltro } = loadFeatureHelpers();
  const producto = { nombre: 'Café molido', ean: '779123', rubro: 'Almacén' };

  assert.equal(productoCoincideFiltro(producto, 'cafe', ''), true);
  assert.equal(productoCoincideFiltro(producto, '7791', ''), true);
  assert.equal(productoCoincideFiltro(producto, '', 'almacen'), true);
  assert.equal(productoCoincideFiltro(producto, 'yerba', ''), false);
});

test('filtra el listado de Para pedir combinando texto y rubro', () => {
  const { filtrarProductosPorBusqueda } = loadFeatureHelpers();
  const productos = [
    { id: 'p1', nombre: 'Café molido', ean: '111', rubro: 'Almacén' },
    { id: 'p2', nombre: 'Café frío', ean: '222', rubro: 'Bebidas' },
    { id: 'p3', nombre: 'Yerba', ean: '333', rubro: 'Almacén' }
  ];

  assert.deepEqual(
    filtrarProductosPorBusqueda(productos, 'cafe', 'almacen').map(p => p.id),
    ['p1']
  );
});

test('filtra ventas por el producto buscado sin ocultar coincidencias dentro de combos', () => {
  const { filtrarVentasPorBusqueda } = loadFeatureHelpers();
  const ventas = [
    { id: 'v1', items: [{ prodId: 'p1', nombre: 'Café', cant: 1 }] },
    { id: 'v2', items: [{ tipo: 'combo', nombre: 'Desayuno', cant: 1, componentes: [{ prodId: 'p2', nombre: 'Yerba', cant: 1 }] }] },
    { id: 'v3', items: [{ prodId: 'p3', nombre: 'Azúcar', cant: 1 }] }
  ];

  assert.deepEqual(filtrarVentasPorBusqueda(ventas, 'yerba').map(v => v.id), ['v2']);
});

test('genera el resumen temporal solamente para los productos encontrados', () => {
  const { resumenesStockBusqueda } = loadFeatureHelpers();
  const productos = [
    { id: 'p1', nombre: 'Yerba suave', rubro: 'Almacén', stockBase: 8 },
    { id: 'p2', nombre: 'Azúcar', rubro: 'Almacén', stockBase: 12 }
  ];
  const movimientos = [{ prodId: 'p1', fecha: '2026-08-31T10:00:00.000Z', cant: -2, tipo: 'venta' }];
  const ventas = [{ anulada: false, items: [{ prodId: 'p1', nombre: 'Yerba suave', cant: 2 }] }];

  const resultados = resumenesStockBusqueda({
    productos,
    movimientos,
    ventas,
    desde: '2026-08-31T09:00:00.000Z',
    hasta: '2026-08-31T11:00:00.000Z',
    q: 'yerba'
  });

  assert.equal(resultados.length, 1);
  assert.equal(resultados[0].producto.id, 'p1');
  assert.deepEqual(
    { inicio: resultados[0].inicio, vendidas: resultados[0].vendidas, final: resultados[0].final },
    { inicio: 8, vendidas: 2, final: 6 }
  );
});

test('encuentra un producto vendido tanto suelto como dentro de un combo', () => {
  const { ventaCoincideBusqueda } = loadFeatureHelpers();
  const venta = {
    items: [
      { nombre: 'Gaseosa cola', prodId: 'gaseosa', cant: 1 },
      {
        nombre: 'Combo merienda',
        tipo: 'combo',
        cant: 1,
        componentes: [{ nombre: 'Yerba suave', prodId: 'yerba', cant: 1 }]
      }
    ]
  };

  assert.equal(ventaCoincideBusqueda(venta, 'gaseosa'), true);
  assert.equal(ventaCoincideBusqueda(venta, 'yerba'), true);
  assert.equal(ventaCoincideBusqueda(venta, 'galletitas'), false);
});

test('agrupa cobros QR históricos junto con transferencia', () => {
  const { formaPagoAgrupada } = loadFeatureHelpers();

  assert.equal(formaPagoAgrupada('qr'), 'transferencia');
  assert.equal(formaPagoAgrupada('transferencia'), 'transferencia');
  assert.equal(formaPagoAgrupada('debito'), 'tarjeta');
  assert.equal(formaPagoAgrupada('efectivo'), 'efectivo');
});

test('calcula stock inicial, vendido, otros movimientos y stock final del período', () => {
  const { resumenStockProductoPeriodo } = loadFeatureHelpers();
  const producto = { id: 'p1', nombre: 'Yerba', stockBase: 10 };
  // La venta anulada de las 11:30 lleva su movimiento de venta (-5) y el ajuste
  // de reposición (+5). Sin ambos, el escenario no representa una anulación real.
  const movimientos = [
    { prodId: 'p1', fecha: '2026-08-31T09:00:00.000Z', cant: 5, tipo: 'ingreso' },
    { prodId: 'p1', fecha: '2026-08-31T10:00:00.000Z', cant: -2, tipo: 'venta' },
    { prodId: 'p1', fecha: '2026-08-31T10:30:00.000Z', cant: -1, tipo: 'venta' },
    { prodId: 'p1', fecha: '2026-08-31T11:00:00.000Z', cant: 3, tipo: 'ingreso' },
    { prodId: 'p1', fecha: '2026-08-31T11:30:00.000Z', cant: -5, tipo: 'venta' },
    { prodId: 'p1', fecha: '2026-08-31T11:45:00.000Z', cant: 5, tipo: 'ajuste' },
    { prodId: 'p1', fecha: '2026-08-31T14:00:00.000Z', cant: -4, tipo: 'venta' }
  ];
  const ventas = [
    {
      fecha: '2026-08-31T10:00:00.000Z',
      anulada: false,
      items: [{ prodId: 'p1', nombre: 'Yerba', cant: 2 }]
    },
    {
      fecha: '2026-08-31T10:30:00.000Z',
      anulada: false,
      items: [{ tipo: 'combo', cant: 1, componentes: [{ prodId: 'p1', nombre: 'Yerba', cant: 1 }] }]
    },
    {
      fecha: '2026-08-31T11:30:00.000Z',
      anulada: true,
      items: [{ prodId: 'p1', nombre: 'Yerba', cant: 5 }]
    }
  ];

  const resumen = resumenStockProductoPeriodo({
    producto,
    movimientos,
    ventas,
    desde: '2026-08-31T09:30:00.000Z',
    hasta: '2026-08-31T12:00:00.000Z'
  });

  // vendidas = 2 + 1 (combo) + 5 (la anulada cuenta en su día) = 8.
  // otros = +3 ingreso +5 ajuste = 8.
  assert.deepEqual(
    { inicio: resumen.inicio, vendidas: resumen.vendidas, otros: resumen.otros, final: resumen.final },
    { inicio: 15, vendidas: 8, otros: 8, final: 15 }
  );
});

test('una anulación al día siguiente no reescribe el reporte del día de la venta', () => {
  const { resumenStockProductoPeriodo } = loadFeatureHelpers();
  const producto = { id: 'p1', nombre: 'Yerba', stockBase: 10 };
  const movimientos = [
    { prodId: 'p1', fecha: '2026-08-31T14:00:00.000Z', cant: -3, tipo: 'venta' },
    { prodId: 'p1', fecha: '2026-09-01T11:00:00.000Z', cant: 3, tipo: 'ajuste' }
  ];
  const ventaAnuladaDespues = [
    { fecha: '2026-08-31T14:00:00.000Z', anulada: true, items: [{ prodId: 'p1', cant: 3 }] }
  ];

  const diaVenta = resumenStockProductoPeriodo({
    producto, movimientos, ventas: ventaAnuladaDespues,
    desde: '2026-08-31T03:00:00.000Z', hasta: '2026-09-01T02:59:59.999Z'
  });
  const diaAnulacion = resumenStockProductoPeriodo({
    producto, movimientos, ventas: [],
    desde: '2026-09-01T03:00:00.000Z', hasta: '2026-09-02T02:59:59.999Z'
  });

  assert.deepEqual(
    { vendidas: diaVenta.vendidas, otros: diaVenta.otros, final: diaVenta.final },
    { vendidas: 3, otros: 0, final: 7 }
  );
  assert.deepEqual(
    { vendidas: diaAnulacion.vendidas, otros: diaAnulacion.otros, final: diaAnulacion.final },
    { vendidas: 0, otros: 3, final: 10 }
  );
});

test('muestra solamente los productos con movimientos en el día elegido', () => {
  const { movimientosProductosPeriodo } = loadFeatureHelpers();
  assert.equal(typeof movimientosProductosPeriodo, 'function', 'falta el cálculo diario de movimientos');
  const productos = [
    { id: 'coca', nombre: 'Coca Cola', rubro: 'Bebidas', stockBase: 10 },
    { id: 'agua', nombre: 'Agua', rubro: 'Bebidas', stockBase: 2 },
    { id: 'yerba', nombre: 'Yerba', rubro: 'Almacén', stockBase: 8 }
  ];
  const movimientos = [
    { prodId: 'yerba', fecha: '2026-08-30T15:00:00.000Z', cant: -1, tipo: 'venta' },
    { prodId: 'coca', fecha: '2026-08-31T10:00:00.000Z', cant: -5, tipo: 'venta' },
    { prodId: 'agua', fecha: '2026-08-31T12:00:00.000Z', cant: 3, tipo: 'ingreso' }
  ];
  const ventas = [{
    fecha: '2026-08-31T10:00:00.000Z', anulada: false,
    items: [{ prodId: 'coca', nombre: 'Coca Cola', cant: 5 }]
  }];

  const resultado = movimientosProductosPeriodo({
    productos, movimientos, ventas,
    desde: '2026-08-31T00:00:00.000Z', hasta: '2026-08-31T23:59:59.999Z'
  });

  assert.deepEqual(resultado.map(r => r.producto.id), ['agua', 'coca']);
  const coca = resultado.find(r => r.producto.id === 'coca');
  assert.deepEqual(
    { inicio: coca.inicio, vendidas: coca.vendidas, otros: coca.otros, final: coca.final },
    { inicio: 10, vendidas: 5, otros: 0, final: 5 }
  );
});

test('filtra los movimientos diarios por texto y rubro', () => {
  const { movimientosProductosPeriodo } = loadFeatureHelpers();
  assert.equal(typeof movimientosProductosPeriodo, 'function', 'falta el filtro diario de movimientos');
  const productos = [
    { id: 'coca', nombre: 'Coca Cola', ean: '7791', rubro: 'Bebidas', stockBase: 10 },
    { id: 'cafe', nombre: 'Café', ean: '7792', rubro: 'Almacén', stockBase: 4 }
  ];
  const movimientos = productos.map((p,ix)=>({prodId:p.id,fecha:`2026-08-31T1${ix}:00:00.000Z`,cant:-1,tipo:'venta'}));

  const resultado = movimientosProductosPeriodo({
    productos, movimientos, ventas:[], desde:'2026-08-31T00:00:00.000Z', hasta:'2026-08-31T23:59:59.999Z',
    q:'7791', rubro:'bebidas'
  });

  assert.deepEqual(resultado.map(r => r.producto.id), ['coca']);
});

test('el selector de rubros permite elegir uno existente o crear uno nuevo', () => {
  const { opcionesRubroProducto, resolverRubroProducto } = loadFeatureHelpers();
  assert.equal(typeof opcionesRubroProducto, 'function', 'falta el modelo del desplegable de rubros');
  assert.equal(typeof resolverRubroProducto, 'function', 'falta resolver el rubro nuevo');

  assert.deepEqual(
    Array.from(opcionesRubroProducto(['Bebidas', 'Almacén', 'bebidas'], 'Fiambres')),
    ['Almacén', 'Bebidas', 'Fiambres']
  );
  assert.equal(resolverRubroProducto('Bebidas', ''), 'Bebidas');
  assert.equal(resolverRubroProducto('__nuevo__', '  Limpieza  '), 'Limpieza');
});
