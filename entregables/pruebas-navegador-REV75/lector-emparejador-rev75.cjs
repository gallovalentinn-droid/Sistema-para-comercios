// REV75 (base REV70 + correcciones R70-01/02/03, R71-01/02/03, R72-01, R73-01 y R74-01/02) · Lector de facturas: renglones abreviados, opciones cuando hay dudas, aviso de costo y memoria por proveedor.
// Recorrido real de la beta en Chromium: foto -> revisión -> carga -> confirmación, y una segunda lectura del mismo proveedor.
// Sin Supabase: la IA y la tabla factura_alias_producto se simulan dentro de la página.
// Uso (desde esta carpeta): PW=<ruta de playwright> [CHROME=<chromium>] node lector-emparejador-rev75.cjs
const assert = require('node:assert/strict');
const {openShadow} = require('../pruebas-navegador-REV58/shadow.cjs');
const log = (...a) => console.log(...a);

const productos = [
  ['Fernet Branca 750ml', 14000, 20000], ['Fernet Branca 1L', 17000, 24000], ['Fernet Branca 450ml', 9000, 13000],
  ['Lata Speed 473ml', 1958, 2700], ['Lata Speed 250ml', 1200, 1800],
  ['Vodka Smirnoff Green Apple 700ml', 8000, 11000], ['Vodka Smirnoff Raspberry 700 ml', 8000, 11000],
  ['Manaos Cola 2,25 L', 1433, 1900], ['Manaos Cola 1L', 1316, 1900],
  ['Lata Cerveza Isenbeck 473ml', 1166, 1600], ['Lata Cerveza Brahma 473ml', 1200, 1600],
  ['Vodka Skyy Raspberry 750ml', 8700, 12000], ['Cigarrillo Marlboro Box x20', 6350, 6800], ['Cigarrillo Marlboro x10', 3850, 4400],
  ['Suplemento Vitamina 500mg', 5000, 8000], ['Salchicha Viena x6', 1500, 2200],
  ['Ibuprofeno Suspension 200mg 60ml', 3000, 4500], ['Actron Ibuprofeno 600', 4000, 6000],
  ['Fertilizante Universal 20g 500ml x10', 2500, 3800],
  ['Pack Nivea Crema 125g Jabon 75g', 6000, 9000], ['Fideos Luchetti Codito 500gr', 1200, 1800],
];
const leida = {proveedor: 'Limón Autoservicio Mayorista', nroComprobante: '0002-00012345', total: 0, descuentoGlobal: 0, items: [
  {producto: 'FERNET BRANCA 750CC', codigo: '10233', descripcion: 'Fernet Branca 750 ml', cantidad: 6, unidadesPorBulto: 1, precioUnit: 14666.67, descuento: 0},
  {producto: 'SPEEDXLUNLIMITEDX473CCX6U-SP', codigo: '20511', descripcion: 'Lata Speed Unlimited 473 ml', cantidad: 4, unidadesPorBulto: 6, precioUnit: 11750, descuento: 0},
  {producto: 'CERV.ISENBECK LAT 473CC X24', codigo: '30110', descripcion: 'Cerveza Isenbeck lata 473 ml', cantidad: 1, unidadesPorBulto: 24, precioUnit: 28000, descuento: 0},
  {producto: 'VODKA SMIRNOFF 700CC', codigo: '40007', descripcion: 'Vodka Smirnoff 700 ml', cantidad: 6, unidadesPorBulto: 1, precioUnit: 8000, descuento: 0},
  // El caso de septiembre: la IA toma el precio por botella como si fuera por pack de 6.
  {producto: 'GAS.MANAOS COLA 2,25LTX6', codigo: '50021', descripcion: 'Gaseosa Manaos Cola 2,25 L', cantidad: 6, unidadesPorBulto: 6, precioUnit: 1433.33, descuento: 0},
  {producto: 'SALSA LISTA ARCOR 340G', codigo: '60400', descripcion: 'Salsa Lista Arcor 340 g', cantidad: 12, unidadesPorBulto: 1, precioUnit: 900, descuento: 0},
]};

const filas = p => p.evaluate(() => revisionFactura.map(r => ({
  leido: r.original, estado: r.estado, origen: r.origen, producto: r.prodId === '__nuevo__' ? 'NUEVO' : (prod(r.prodId)?.nombre || ''),
  bulto: r.porBulto, opciones: (r.candidatos || []).map(c => c.nombre),
})));
const pills = p => p.evaluate(() => [...document.querySelectorAll('#revTabla tbody tr')].map(tr => tr.querySelector('td .pill')?.innerText));

async function leer(p) {
  await p.evaluate(() => { document.querySelectorAll('.ov').forEach(o => o.remove()); comprasTab = 'factura'; vista = 'compras'; render(); });
  await p.waitForTimeout(150);
  await p.click('#comprasIA'); await p.waitForTimeout(200);
  await p.evaluate(async () => {
    const foto = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'factura.jpg', {type: 'image/jpeg'});
    await leerFacturaFoto(foto, document.querySelector('#ov'));
  });
  await p.waitForTimeout(250);
}

(async () => {
  const h = await openShadow();
  const p = h.page;
  await p.evaluate(({productos, leida}) => {
    cargarDemo('kiosco');
    productos.forEach(([nombre, costo, precio], i) => db.productos.push({id: `rev70-${i}`, ean: '', nombre, rubro: 'Bebidas', proveedor: '', costo, precio, stock: 10, stockMin: 3, unidad: 'unidad'}));
    guardar();
    // IA simulada: devuelve siempre la misma lectura.
    window.__leida = leida; window.__lecturas = 0;
    sb.functions.invoke = async (nombre) => { window.__lecturas++; return {data: JSON.parse(JSON.stringify(window.__leida)), error: null}; };
    // Tabla factura_alias_producto simulada, con la misma clave primaria que la migración.
    window.__nube = new Map(); window.__llamadas = [];
    const original = sb.from.bind(sb);
    sb.from = tabla => {
      if (tabla !== 'factura_alias_producto') return original(tabla);
      return {
        upsert: async (rows, opts) => { window.__llamadas.push(['upsert', rows.length, opts.onConflict]);
          rows.forEach(r => window.__nube.set(`${r.comercio_id}|${r.proveedor_clave}|${r.texto_clave}`, {...r})); return {error: null}; },
        select: () => ({eq: (col, cid) => ({limit: async () => { window.__llamadas.push(['select', cid]);
          return {data: [...window.__nube.values()].filter(r => r.comercio_id === cid), error: null}; }})}),
      };
    };
  }, {productos, leida});

  // ---------- 1. Primera lectura ----------
  await leer(p);
  const f1 = await filas(p);
  log('1 primera lectura', JSON.stringify(f1));
  assert.equal(f1[0].producto, 'Fernet Branca 750ml'); assert.equal(f1[0].origen, 'auto');
  assert.equal(f1[1].producto, 'Lata Speed 473ml'); assert.equal(f1[1].origen, 'auto');
  assert.equal(f1[2].producto, 'Lata Cerveza Isenbeck 473ml');
  assert.equal(f1[3].producto, '', 'Smirnoff sin sabor: no elige solo'); assert.equal(f1[3].estado, 'dudoso');
  assert.deepEqual([...f1[3].opciones].sort(), ['Vodka Smirnoff Green Apple 700ml', 'Vodka Smirnoff Raspberry 700 ml']);
  assert.equal(f1[4].producto, 'Manaos Cola 2,25 L');
  assert.equal(f1[5].producto, ''); assert.equal(f1[5].estado, 'ninguno');
  const p1 = await pills(p);
  log('  estados:', JSON.stringify(p1), '| resumen:', await p.evaluate(() => document.querySelector('.rev70-resumen').innerText));
  assert.deepEqual(p1, ['Coincide', 'Coincide', 'Coincide', 'Elegí cuál es', 'Coincide', 'Sin coincidencia']);
  const aviso = await p.evaluate(() => document.querySelectorAll('#revTabla tbody tr')[4].querySelector('.rev70-costo')?.innerText);
  log('  aviso Manaos:', aviso);
  assert.match(aviso, /Antes costaba .*1\.433.*¿El precio es por unidad y no por bulto\?/);
  await p.screenshot({path: 'rev75_1_revision_1366.png'});
  const verFila = n => p.evaluate(n => document.querySelectorAll('#revTabla tbody tr')[n].scrollIntoView({block: 'start'}), n);
  await verFila(3); await p.waitForTimeout(150);
  await p.screenshot({path: 'rev75_1b_dudas_y_costo_1366.png'});
  await p.setViewportSize({width: 390, height: 844}); await p.waitForTimeout(200);
  await verFila(3); await p.waitForTimeout(150);
  const desborde = await p.evaluate(() => { const b = document.querySelector('.mod-b'); return b.scrollWidth > b.clientWidth + 1; });
  log('  390 px, desborde lateral:', desborde); assert.equal(desborde, false);
  await p.screenshot({path: 'rev75_1_revision_390.png'});
  await p.setViewportSize({width: 1366, height: 800}); await p.waitForTimeout(200);

  // ---------- 2. La persona resuelve: opción de Smirnoff, corrige el bulto de Manaos, crea la salsa ----------
  await p.click('[data-rev-cand="3:0"]');
  const elegido = await p.evaluate(() => prod(revisionFactura[3].prodId).nombre);
  await p.fill('[data-rev-bulto="4"]', '1'); await p.dispatchEvent('[data-rev-bulto="4"]', 'change');
  await p.selectOption('[data-rev-prod="5"]', '__nuevo__'); await p.waitForTimeout(150);
  const p2 = await pills(p);
  const avisoDespues = await p.evaluate(() => !!document.querySelectorAll('#revTabla tbody tr')[4].querySelector('.rev70-costo'));
  log('2 resuelto', JSON.stringify(p2), '| Smirnoff elegido:', elegido, '| aviso Manaos después de corregir:', avisoDespues);
  assert.equal(p2[3], 'Elegido a mano'); assert.equal(p2[5], 'Producto nuevo'); assert.equal(avisoDespues, false);
  await p.screenshot({path: 'rev75_2_resuelto_1366.png'});
  await p.click('#okRev'); await p.waitForTimeout(600);
  const mem = await p.evaluate(() => JSON.parse(localStorage.getItem('micomercio.rev70.alias.' + f3Estado.comercioId)));
  const nube = await p.evaluate(() => [...window.__nube.values()].map(r => `${r.proveedor_clave} | ${r.texto_clave} -> ${r.producto_ref} x${r.unidades_por_bulto}`));
  log('3 memoria local:', Object.keys(mem.filas).length, 'claves, pendientes:', Object.values(mem.filas).filter(f => f.pend).length);
  log('  nube:', JSON.stringify(nube, null, 1));
  assert.equal(Object.keys(mem.filas).length, 12, '6 filas x (texto + código)');
  assert.equal(Object.values(mem.filas).filter(f => f.pend).length, 0, 'todo subió');
  assert.equal(nube.length, 12);
  assert.ok(nube.some(l => /^limon autoservicio mayorista \| gas manaos cola 2 25ltx6 -> .* x1$/.test(l)), 'recuerda el bulto corregido');

  // ---------- 3. Confirmar la factura ----------
  const ix = await p.evaluate(() => remito.findIndex(l => productosFacturaPendientes.some(x => x.id === l.prodId)));
  await p.fill(`[data-rprecio="${ix}"]`, '1500'); await p.dispatchEvent(`[data-rprecio="${ix}"]`, 'change');
  await p.click('#okIng'); await p.waitForTimeout(500);
  const salsa = await p.evaluate(() => db.productos.filter(x => /SALSA LISTA/i.test(x.nombre)).map(x => [x.nombre, x.stock]));
  log('4 confirmada, producto nuevo:', JSON.stringify(salsa));
  assert.equal(salsa.length, 1);

  // ---------- 4. Segunda factura del mismo proveedor ----------
  await leer(p);
  const f2 = await filas(p);
  log('5 segunda lectura', JSON.stringify(f2));
  assert.ok(f2.every(r => r.estado === 'recordado'), 'todas recordadas');
  assert.equal(f2[3].producto, elegido);
  assert.equal(f2[4].bulto, 1, 'usa el bulto recordado');
  assert.match(f2[5].producto, /SALSA LISTA/i);
  const nota = await p.evaluate(() => document.querySelectorAll('#revTabla tbody tr')[4].innerText);
  assert.match(nota, /La IA leyó 6/);
  assert.deepEqual(await pills(p), Array(6).fill('Recordado'));
  await p.screenshot({path: 'rev75_3_recordado_1366.png'});

  // ---------- 5. Otra computadora del comercio (sin copia local): la memoria viene de la nube ----------
  await p.evaluate(() => localStorage.removeItem('micomercio.rev70.alias.' + f3Estado.comercioId));
  await leer(p);
  const f3 = await filas(p);
  log('6 sin copia local, desde la nube', JSON.stringify(f3.map(r => r.estado)));
  assert.ok(f3.every(r => r.estado === 'recordado'));

  // ---------- 6. Otro proveedor con otro texto: no usa la memoria de Limón ----------
  await p.evaluate(() => { window.__leida = {...window.__leida, proveedor: 'Mayorista Mi Barrio', items: [
    {producto: 'FERNET BRANCA X 750', codigo: '10233', descripcion: '', cantidad: 1, unidadesPorBulto: 1, precioUnit: 14000, descuento: 0}]}; });
  await leer(p);
  const f4 = await filas(p);
  log('7 otro proveedor, mismo código:', JSON.stringify(f4));
  assert.equal(f4[0].estado, 'seguro', 'el código es propio de cada proveedor; empareja por texto');
  assert.equal(f4[0].producto, 'Fernet Branca 750ml');

  // ---------- 7. R70-03: tercer proveedor con el texto de Limón y otro bulto ----------
  await p.evaluate(() => { window.__leida = {...window.__leida, proveedor: 'Mayorista Gamma', items: [
    {producto: 'SPEEDXLUNLIMITEDX473CCX6U-SP', codigo: '', descripcion: '', cantidad: 2, unidadesPorBulto: 24, precioUnit: 24000, descuento: 0}]}; });
  await leer(p);
  const f5 = await filas(p);
  const p5 = await pills(p);
  const carga5 = await p.evaluate(() => document.querySelector('#revTabla tbody td[data-label="Se carga"]').innerText.replace(/\s+/g, ' '));
  log('8 otro proveedor con otro bulto:', JSON.stringify(f5), JSON.stringify(p5), '|', carga5);
  assert.equal(f5[0].producto, 'Lata Speed 473ml');
  assert.equal(f5[0].bulto, 24, 'no hereda el bulto 6 de Limón');
  assert.equal(p5[0], 'Recordado de otro proveedor');
  assert.match(carga5, /48 unidades a \$1\.000,00 c\/u/);

  // ---------- 8. R70-01 y R70-02: descripción contradictoria y atado distinto ----------
  await p.evaluate(() => { window.__leida = {...window.__leida, proveedor: 'Mayorista Delta', items: [
    {producto: 'FERN.BRANCA 750CC', codigo: '', descripcion: 'Vodka Skyy Raspberry 750ml', cantidad: 1, unidadesPorBulto: 1, precioUnit: 14000, descuento: 0},
    {producto: 'CIG.MARLB.BOX X10', codigo: '', descripcion: 'Cigarrillo Marlboro Box x20', cantidad: 1, unidadesPorBulto: 1, precioUnit: 40000, descuento: 0}]}; });
  await leer(p);
  const f6 = await filas(p);
  log('9 descripción contradictoria y atado distinto:', JSON.stringify(f6), JSON.stringify(await pills(p)));
  assert.deepEqual(f6.map(r => r.producto), ['', ''], 'ninguna se elige sola');
  assert.deepEqual(await pills(p), ['Elegí cuál es', 'Elegí cuál es']);
  assert.ok(f6[0].opciones.includes('Fernet Branca 750ml') && f6[0].opciones.includes('Vodka Skyy Raspberry 750ml'));
  const rotulo = await p.evaluate(() => [...document.querySelectorAll('[data-rev-cand^="1:"]')].map(b => b.innerText.replace(/\s+/g, ' ')));
  log('  opciones del Marlboro:', JSON.stringify(rotulo));
  assert.ok(rotulo.some(t => /Box x20 \(otra presentación\)/.test(t)));
  const rotuloFernet = await p.evaluate(() => [...document.querySelectorAll('[data-rev-cand^="0:"]')].map(b => b.innerText.replace(/\s+/g, ' ')));
  log('  opciones del Fernet:', JSON.stringify(rotuloFernet));
  assert.ok(rotuloFernet.some(t => /Vodka Skyy Raspberry 750ml \(solo según la descripción de la IA\)/.test(t)));
  await p.screenshot({path: 'rev75_4_contradiccion_1366.png'});

  // ---------- 9. R71-01/03: atado sin X y mcg contra mg ----------
  await p.evaluate(() => { window.__leida = {...window.__leida, proveedor: 'Mayorista Epsilon', items: [
    {producto: 'CIG.MARLB.BOX 10', codigo: '', descripcion: '', cantidad: 1, unidadesPorBulto: 1, precioUnit: 40000, descuento: 0},
    {producto: 'SALCHICHA VIENA 12', codigo: '', descripcion: '', cantidad: 1, unidadesPorBulto: 1, precioUnit: 3000, descuento: 0},
    {producto: 'Suplemento Vitamina 500mcg', codigo: '', descripcion: '', cantidad: 1, unidadesPorBulto: 1, precioUnit: 5000, descuento: 0},
    {producto: 'SUPLEMENTO VITAMINA 500 MG', codigo: '', descripcion: '', cantidad: 1, unidadesPorBulto: 1, precioUnit: 5000, descuento: 0}]}; });
  await leer(p);
  const f7 = await filas(p);
  const p7 = await pills(p);
  log('10 números y unidades:', JSON.stringify(f7.map(r => [r.leido, r.estado, r.producto, r.opciones])), JSON.stringify(p7));
  assert.deepEqual(f7.slice(0, 3).map(r => r.producto), ['', '', ''], 'ninguna de las tres se elige sola');
  assert.deepEqual(p7.slice(0, 3).map(x => x === 'Coincide'), [false, false, false]);
  assert.equal(f7[3].producto, 'Suplemento Vitamina 500mg', 'la misma medida sí coincide');
  await p.screenshot({path: 'rev75_5_numeros_1366.png'});

  // ---------- 10. R72-01: dosis distinta con el mismo volumen, y unidad solo en la factura ----------
  await p.evaluate(() => { window.__leida = {...window.__leida, proveedor: 'Droguería Zeta', items: [
    {producto: 'Ibuprofeno Suspension 100mg 60ml', codigo: '', descripcion: '', cantidad: 1, unidadesPorBulto: 1, precioUnit: 3000, descuento: 0},
    {producto: 'Actron Ibuprofeno 400mg', codigo: '', descripcion: '', cantidad: 1, unidadesPorBulto: 1, precioUnit: 4000, descuento: 0},
    {producto: 'IBUPROFENO SUSPENSION 200MG 60ML', codigo: '', descripcion: '', cantidad: 1, unidadesPorBulto: 1, precioUnit: 3000, descuento: 0},
    {producto: 'ACTRON IBUPROFENO 600MG', codigo: '', descripcion: '', cantidad: 1, unidadesPorBulto: 1, precioUnit: 4000, descuento: 0}]}; });
  await leer(p);
  const f8 = await filas(p);
  const p8 = await pills(p);
  log('11 medidas:', JSON.stringify(f8.map(r => [r.leido, r.estado, r.producto])), JSON.stringify(p8));
  assert.deepEqual(f8.slice(0, 2).map(r => r.producto), ['', ''], 'las dos variantes quedan para elegir');
  assert.deepEqual(p8.slice(0, 2), ['Elegí cuál es', 'Elegí cuál es']);
  assert.deepEqual(f8.slice(2).map(r => r.producto), ['Ibuprofeno Suspension 200mg 60ml', 'Actron Ibuprofeno 600'], 'los controles sí coinciden');
  const rotulos = await p.evaluate(() => [...document.querySelectorAll('[data-rev-cand^="0:"],[data-rev-cand^="1:"]')].map(b => b.innerText.replace(/\s+/g, ' ')));
  log('  opciones:', JSON.stringify(rotulos));
  assert.ok(rotulos.some(t => /Ibuprofeno Suspension 200mg 60ml \(otra presentación\)/.test(t)));
  assert.ok(rotulos.some(t => /Actron Ibuprofeno 600 \(otra presentación\)/.test(t)));
  await p.screenshot({path: 'rev75_6_medidas_1366.png'});

  // ---------- 12. R73-01: el número del paquete no explica una medida ----------
  await p.evaluate(() => { window.__leida = {...window.__leida, proveedor: 'Vivero Eta', items: [
    {producto: 'Fertilizante Universal 10g 500ml x20', codigo: '', descripcion: '', cantidad: 1, unidadesPorBulto: 1, precioUnit: 2500, descuento: 0},
    {producto: 'FERTILIZANTE UNIVERSAL 20G 500ML X10', codigo: '', descripcion: '', cantidad: 1, unidadesPorBulto: 1, precioUnit: 2500, descuento: 0},
    {producto: 'FERT.UNIVERSAL 20GR 500CC', codigo: '', descripcion: '', cantidad: 1, unidadesPorBulto: 1, precioUnit: 2500, descuento: 0}]}; });
  await leer(p);
  const f9 = await filas(p);
  const p9 = await pills(p);
  log('12 paquete y medida:', JSON.stringify(f9.map(r => [r.leido, r.estado, r.producto])), JSON.stringify(p9));
  assert.equal(f9[0].producto, '', 'el de 10g x20 no se elige solo');
  assert.equal(p9[0], 'Elegí cuál es');
  assert.deepEqual(f9.slice(1).map(r => r.producto), ['Fertilizante Universal 20g 500ml x10', 'Fertilizante Universal 20g 500ml x10'], 'los controles sí coinciden');
  const rot9 = await p.evaluate(() => [...document.querySelectorAll('[data-rev-cand^="0:"]')].map(b => b.innerText.replace(/\s+/g, ' ')));
  log('  opciones:', JSON.stringify(rot9));
  assert.ok(rot9.some(t => /Fertilizante Universal 20g 500ml x10 \(otra presentación\)/.test(t)));
  await p.screenshot({path: 'rev75_7_paquete_medida_1366.png'});

  // ---------- 13. R74-01: componentes de un pack; R74-02: la descripción no tapa un dato impreso ----------
  await p.evaluate(() => { window.__leida = {...window.__leida, proveedor: 'Distribuidora Theta', items: [
    {producto: 'Pack Nivea Crema 75g Jabon 125g', codigo: '', descripcion: '', cantidad: 1, unidadesPorBulto: 1, precioUnit: 6000, descuento: 0},
    {producto: 'Fideos Luchetti Codito 45 500gr', codigo: '', descripcion: 'Fideos Luchetti Codito 500gr', cantidad: 1, unidadesPorBulto: 1, precioUnit: 1200, descuento: 0},
    {producto: 'PACK NIVEA JABON 75G CREMA 125G', codigo: '', descripcion: '', cantidad: 1, unidadesPorBulto: 1, precioUnit: 6000, descuento: 0},
    {producto: 'FID.LUCH.COD 500GR X20', codigo: '', descripcion: 'Fideos Luchetti Codito 500gr', cantidad: 1, unidadesPorBulto: 20, precioUnit: 24000, descuento: 0}]}; });
  await leer(p);
  const f10 = await filas(p);
  const p10 = await pills(p);
  log('13 componentes y descripción:', JSON.stringify(f10.map(r => [r.leido, r.estado, r.producto])), JSON.stringify(p10));
  assert.deepEqual(f10.slice(0, 2).map(r => r.producto), ['', ''], 'el pack con los tamaños cambiados y el 45 no se eligen solos');
  assert.deepEqual(p10.slice(0, 2), ['Elegí cuál es', 'Elegí cuál es']);
  assert.deepEqual(f10.slice(2).map(r => r.producto), ['Pack Nivea Crema 125g Jabon 75g', 'Fideos Luchetti Codito 500gr'], 'los controles sí coinciden');
  const rot10 = await p.evaluate(() => [...document.querySelectorAll('[data-rev-cand^="0:"]')].map(b => b.innerText.replace(/\s+/g, ' ')));
  log('  opciones del pack:', JSON.stringify(rot10));
  assert.ok(rot10.some(t => /Pack Nivea Crema 125g Jabon 75g \(otra presentación\)/.test(t)));
  await p.screenshot({path: 'rev75_8_componentes_1366.png'});

  const errores = h.errors.filter(e => !/ERR_FAILED|Failed to fetch|OFFLINE/.test(e));
  log('lecturas de IA:', await p.evaluate(() => window.__lecturas), '| llamadas a la nube:', JSON.stringify(await p.evaluate(() => window.__llamadas)));
  log('errores:', JSON.stringify(errores));
  assert.deepEqual(errores, []);
  log('REV75 navegador: recorrido completo aprobado');
  await h.close();
})().catch(async e => { console.error('FALLÓ:', e.message); process.exit(1); });
