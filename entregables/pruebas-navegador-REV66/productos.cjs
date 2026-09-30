// REV66 · La lista de Productos vuelve a verse como antes de REV62.
// Comprueba a 1920, 1366 y 390 px: inicial en productos sin foto (nombres alineados), stock solo con la cantidad,
// Historial y Archivar con texto en pantallas anchas y sin desplazamiento horizontal.
const assert = require('node:assert/strict');
const path = require('node:path');
const { open } = require('../pruebas-navegador-REV58/harness.cjs');

const PRODUCTOS = [
  ['Aceite de girasol Cañuelas 900 ml', '', 'ACEITES Y VINAGRES', 0, 0, 0, 0, ''],
  ['Aceite de Girasol Cocinero 900ml', '', 'Almacen', 0, 4400, 6, 2, 'Vital'],
  ['Aceitunas verdes en salmuera SIP 300 g', '', 'TOMATES Y CONSERVAS', 0, 0, 0, 0, ''],
  ['Acondicionador Sedal Brillo Ceramidas 10ml', '77982728', 'Higiene Personal', 0, 300, 12, 4, 'Vital'],
  ['Acondicionador Sedal Crema Balance 10ml', '77982735', 'Higiene Personal', 0, 300, 3, 4, 'Vital'],
  ['Acondicionador Sedal Crema Balance 190ml', '7791293045863', 'Higiene Personal', 2500, 4000, 5, 2, 'Vital'],
  ['Actrón Ibuprofeno 400 mg', '', 'MEDICAMENTOS', 0, 0, 0, 0, ''],
];

async function check(width) {
  const env = await open({ width, height: 900 });
  try {
    const { page } = env;
    await page.evaluate(lista => {
      db.productos = lista.map(([nombre, ean, rubro, costo, precio, stock, stockMin, proveedor], i) => ({
        id: `qa66-${i}`, nombre, ean, rubro, costo, precio, stock, stockMin, stockDeseado: stockMin * 3,
        proveedor, unidad: 'unidad', origenId: '', porAtado: 0, vence: '' }));
      vista = 'productos'; render();
    }, PRODUCTOS);
    const m = await page.evaluate(() => {
      const filas = [...document.querySelectorAll('#tabProd tbody tr')];
      const nombres = filas.map(f => f.querySelector('.product-cell-copy b').getBoundingClientRect().left);
      const pane = document.querySelector('#tabProd');
      return {
        filas: filas.length,
        conMarcador: filas.filter(f => f.querySelector('.product-thumb')).length,
        nombresAlineados: Math.max(...nombres) - Math.min(...nombres) < 1,
        stocks: filas.map(f => f.querySelector('.product-stock .pill').textContent.trim()),
        historialTexto: getComputedStyle(filas[0].querySelector('[data-hi]')).fontSize,
        desborde: pane.scrollWidth - pane.clientWidth,
        paginaDesborde: document.documentElement.scrollWidth - innerWidth,
      };
    });
    assert.equal(m.conMarcador, m.filas, `todas las filas tienen foto o inicial a ${width}px`);
    assert.ok(m.nombresAlineados, `los nombres quedan alineados a ${width}px`);
    assert.deepEqual(m.stocks, ['0', '6', '0', '12', '3', '5', '0']);
    if (width >= 1905) assert.notEqual(m.historialTexto, '0px', 'Historial conserva su texto en pantallas anchas');
    assert.ok(m.desborde <= 2 && m.paginaDesborde <= 2, `sin desplazamiento horizontal a ${width}px: ${JSON.stringify(m)}`);
    await page.screenshot({ path: path.join(__dirname, `productos-${width}.png`), fullPage: false });
    assert.deepEqual(env.errors.filter(e => e.startsWith('pageerror:')), []);
    console.log(`OK Productos ${width}px: ${JSON.stringify(m)}`);
  } finally { await env.close(); }
}

(async () => { await check(1920); await check(1366); await check(390); })()
  .catch(e => { console.error(e); process.exitCode = 1; });
