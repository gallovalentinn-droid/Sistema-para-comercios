const assert = require('node:assert/strict');
const path = require('node:path');
const { open } = require('../pruebas-navegador-REV58/harness.cjs');

async function check(width) {
  const env = await open({ width, height: 900 });
  try {
    const { page } = env;
    await page.evaluate(() => {
      db.productos = Array.from({ length: 50 }, (_, i) => ({
        id: `qa65-${i}`,
        nombre: i % 2 ? 'Acondicionador Sedal Crema Balance 190ml' : 'Aceite de girasol Cañuelas 900 ml',
        ean: i === 1 ? '7791293045812345678' : `77912930458${String(i).padStart(2, '0')}`,
        rubro: i === 0 ? 'CIGARRILLOS Y ACCESORIOS DE TABAQUERÍA' : i % 2 ? 'Higiene Personal' : 'ACEITES Y VINAGRES',
        proveedor: 'Vital', costo: i === 2 ? 966667 : 2900, precio: i === 3 ? 26000 : 4400, stock: 3,
        stockMin: 6, stockDeseado: i === 4 ? 990 : 12, unidad: 'unidad', origenId: i === 0 ? 'qa-parent' : '', porAtado: 0, vence: '',
      }));
      vista = 'productos'; render();
    });
    const metrics = await page.evaluate(() => {
      const pane = document.querySelector('#tabProd');
      const row = pane.querySelector('tbody tr');
      const product = row.querySelector('[data-label="Producto"]');
      const actions = row.lastElementChild;
      const visibleActions = [...actions.querySelectorAll('button')].filter(button => {
        const box = button.getBoundingClientRect();
        const viewport = pane.getBoundingClientRect();
        return box.left >= viewport.left && box.right <= viewport.right;
      }).length;
      return {
        innerWidth: window.innerWidth,
        compactMedia: matchMedia('(max-width:1904px) and (min-width:761px)').matches,
        paneWidth: pane.clientWidth,
        tableWidth: pane.querySelector('table').getBoundingClientRect().width,
        scrollWidth: pane.scrollWidth,
        productWidth: product.getBoundingClientRect().width,
        actionCount: actions.querySelectorAll('button').length,
        visibleActions,
        firstActionWidth: actions.querySelector('button').getBoundingClientRect().width,
        codeDisplay: getComputedStyle(row.querySelector('[data-label="Código"]')).display,
        categoryDisplay: getComputedStyle(row.querySelector('[data-label="Rubro"]')).display,
        costDisplay: getComputedStyle(row.querySelector('[data-label="Costo"]')).display,
        marginDisplay: getComputedStyle(row.querySelector('[data-label="Margen"]')).display,
        stockDisplay: getComputedStyle(row.querySelector('[data-label="Stock"]')).display,
        productAlign: getComputedStyle(product).textAlign,
        columns: [...row.children].map(cell => [cell.getAttribute('data-label') || 'acciones', Math.round(cell.getBoundingClientRect().width)]),
      };
    });
    assert.ok(metrics.scrollWidth <= metrics.paneWidth + 2,
      `Productos necesita desplazamiento horizontal a ${width}px: ${JSON.stringify(metrics)}`);
    assert.equal(metrics.visibleActions, metrics.actionCount,
      `Hay acciones cortadas a ${width}px: ${JSON.stringify(metrics)}`);
    assert.ok(metrics.productWidth >= 260,
      `El nombre queda demasiado estrecho a ${width}px: ${JSON.stringify(metrics)}`);
    assert.notEqual(metrics.productAlign, 'center', `El nombre no debe quedar centrado a ${width}px`);
    if (width <= 1904) {
      assert.equal(metrics.codeDisplay, 'none', `Código debe ceder espacio a ${width}px`);
      assert.equal(metrics.categoryDisplay, 'none', `Rubro debe ceder espacio a ${width}px`);
      assert.equal(metrics.costDisplay, width <= 1100 ? 'none' : 'table-cell',
        `Costo debe adaptarse al espacio a ${width}px`);
    }
    if (width <= 1100) {
      assert.equal(metrics.marginDisplay, 'none', `Margen debe ceder espacio a ${width}px`);
      assert.equal(metrics.stockDisplay, 'table-cell', `Stock debe seguir visible a ${width}px`);
    }
    if (process.env.SCREENSHOTS) {
      await page.screenshot({ path: path.join(process.env.TEMP || __dirname, `micomercio-rev65-productos-${width}.png`) });
    }
    await page.locator('#seleccionarFiltrados').click();
    const selected = await page.evaluate(() => {
      const pane = document.querySelector('#tabProd');
      const row = pane.querySelector('tbody tr');
      return {
        paneWidth: pane.clientWidth,
        scrollWidth: pane.scrollWidth,
        selectWidth: row.querySelector('.product-select').getBoundingClientRect().width,
        productAlign: getComputedStyle(row.querySelector('.product-main')).textAlign,
      };
    });
    if (width >= 1366) {
      assert.ok(selected.scrollWidth <= selected.paneWidth + 2,
        `La selección corta acciones a ${width}px: ${JSON.stringify(selected)}`);
    } else {
      const lastActionReachable = await page.evaluate(() => {
        const pane = document.querySelector('#tabProd');
        pane.scrollLeft = pane.scrollWidth;
        return pane.querySelector('tbody tr:last-child td:last-child button:last-child').getBoundingClientRect().right
          <= pane.getBoundingClientRect().right + 2;
      });
      assert.ok(lastActionReachable, `El desplazamiento no alcanza la última acción a ${width}px`);
    }
    assert.ok(selected.selectWidth <= 54, `La casilla ocupa demasiado a ${width}px: ${JSON.stringify(selected)}`);
    assert.notEqual(selected.productAlign, 'center', `El nombre queda centrado al seleccionar a ${width}px`);
    assert.deepEqual(env.errors.filter(error => !error.includes('Failed to load resource: net::ERR_FAILED')), []);
    console.log(`OK Productos ${width}px: nombre y acciones visibles sin desplazamiento horizontal`);
  } finally {
    await env.close();
  }
}

async function checkMobile() {
  const env = await open({ width: 390, height: 800 });
  try {
    await env.page.evaluate(() => {
      db.productos = [{ id: 'qa65-mobile', nombre: 'Producto de prueba', ean: '7790000000001', rubro: 'Almacén',
        proveedor: 'QA', costo: 100, precio: 200, stock: 1, stockMin: 2, stockDeseado: 4,
        unidad: 'unidad', origenId: '', porAtado: 0, vence: '' }];
      vista = 'productos'; render();
    });
    await env.page.locator('[data-expand-producto]').click();
    const secondarySize = await env.page.locator('[data-hi]').evaluate(button => getComputedStyle(button).fontSize);
    assert.notEqual(secondarySize, '0px', 'En celular, Historial conserva una etiqueta legible');
    assert.equal(await env.page.locator('[data-hi]').isVisible(), true);
    assert.equal(await env.page.locator('[data-archivar]').isVisible(), true);
    console.log('OK Productos 390px: las acciones secundarias conservan sus nombres');
  } finally {
    await env.close();
  }
}

(async () => { await check(1366); await check(1919); await check(1024); await checkMobile(); })().catch(error => {
  console.error(error); process.exitCode = 1;
});
