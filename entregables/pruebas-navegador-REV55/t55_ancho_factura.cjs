// Reproduce el desborde del formulario de factura a 320 px con Chromium real.
const assert = require('node:assert/strict');
const { openShadow } = require('../pruebas-navegador-REV54/shadow.cjs');

(async () => {
  const h = await openShadow({ width: 320, height: 740 });
  try {
    const p = h.page;
    await p.evaluate(() => { cargarDemo('kiosco'); guardar(); comprasTab = 'factura'; vista = 'compras'; render(); });
    await p.click('#comprasIA');
    await p.evaluate(() => {
      cerrarModal();
      abrirRevisionFactura({
        proveedor: 'Prueba', nroComprobante: 'A-1', total: 1200, descuentoGlobal: 0,
        items: [{ producto: 'Producto de prueba', cantidad: 2, unidadesPorBulto: 1, precioUnit: 600, descuento: 0 }]
      });
    });
    await p.click('#okRev');
    const sizes = await p.evaluate(() => {
      const measure = selector => {
        const el = document.querySelector(selector);
        return el && { client: el.clientWidth, scroll: el.scrollWidth };
      };
      return {
        body: measure('.mod-b'),
        manual: measure('.invoice-manual-content'),
        scan: measure('.invoice-manual-content .scan'),
        quantity: measure('#iTabla td[data-label="Cantidad"]')
      };
    });
    for (const [name, size] of Object.entries(sizes)) {
      assert.ok(size, `Falta ${name}`);
      assert.ok(size.scroll <= size.client + 1, `${name} desborda: ${JSON.stringify(size)}`);
    }
    assert.deepEqual(h.errors.filter(e => !/ERR_FAILED|Failed to fetch|OFFLINE/.test(e)), []);
    console.log('Factura sin desborde a 320 px:', sizes);
  } finally {
    await h.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
