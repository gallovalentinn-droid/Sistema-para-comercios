// Comprobación de solo lectura de la beta pública con datos sintéticos.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PW || 'playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 740 }, locale: 'es-AR' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`https://micomercio.ar/beta/?rev55=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof cargarDemo === 'function', null, { timeout: 15000 });
    const revision = await page.evaluate(() => MICOMERCIO_BUILD.packageRevision);
    assert.equal(revision, 55);
    await page.evaluate(() => { cargarDemo('kiosco'); comprasTab = 'factura'; vista = 'compras'; render(); });
    await page.evaluate(() => document.querySelector('#comprasIA').click());
    await page.evaluate(() => {
      cerrarModal();
      abrirRevisionFactura({
        proveedor: 'Prueba', nroComprobante: 'A-1', total: 1200, descuentoGlobal: 0,
        items: [{ producto: 'Producto de prueba', cantidad: 2, unidadesPorBulto: 1, precioUnit: 600, descuento: 0 }]
      });
    });
    await page.evaluate(() => document.querySelector('#okRev').click());
    const sizes = await page.evaluate(() => {
      const measure = selector => {
        const el = document.querySelector(selector);
        return { client: el.clientWidth, scroll: el.scrollWidth };
      };
      return { body: measure('.mod-b'), scan: measure('.invoice-manual-content .scan'), quantity: measure('#iTabla td[data-label="Cantidad"]') };
    });
    for (const [name, size] of Object.entries(sizes))
      assert.ok(size.scroll <= size.client + 1, `${name} desborda: ${JSON.stringify(size)}`);
    assert.deepEqual(errors, []);
    console.log('Beta pública REV55: factura sin desborde a 320 px', sizes);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
