const assert = require('node:assert/strict');
const path = require('node:path');
const {openShadow, abrirTurno} = require('../pruebas-navegador-REV58/shadow.cjs');

async function check(width) {
  const env = await openShadow({width, height: 850});
  try {
    const {page} = env;
    await page.evaluate(() => {
      db.config.moduloCigarros = false;
      db.config.separaCigarrillosAlCierre = true;
    });
    assert.equal(await abrirTurno(page, '50000', '0', 'QA'), true);
    await page.evaluate(() => {
      const venta = {
        id: 'qa63-venta', nro: 1, fecha: new Date().toISOString(), total: 1000, subtotal: 1000,
        forma: 'mixto', pagos: [{forma: 'efectivo', monto: 400}, {forma: 'qr', monto: 600}],
        items: [
          {nombre: 'Cigarrillos QA', rubro: 'Cigarrillos', precio: 600, cant: 1, neto: 600, costo: 300},
          {nombre: 'Otro QA', rubro: 'Almacén', precio: 400, cant: 1, neto: 400, costo: 200},
        ],
      };
      f5EstamparSesionLocal(venta, f3Estado.session);
      db.ventas.push(venta);
      vista = 'caja';
      render();
    });
    assert.match(await page.locator('.cash-box-amount').first().innerText(), /50[.,]400/);
    await page.locator('#irCierreCaja').click();
    await page.locator('#contadoG').fill('50400');
    await page.locator('#pasoCajaSiguiente').click();
    await page.locator('#pasoCajaFinalizar').click();
    const card = page.locator('.cash-cigarette-separation');
    assert.match(await card.innerText(), /Sugerencia por ventas de cigarrillos ya cobradas/);
    assert.match(await card.innerText(), /Transferencia \/ QR/);
    assert.equal(await page.locator('#apartadoCigarrillos').inputValue(), '');
    await page.locator('#usarSugerenciaCigarrillos').click();
    assert.equal(await page.locator('#apartadoCigarrillos').inputValue(), '600');
    await page.locator('[data-destino-caja="dejar"]').click();
    assert.equal(await page.locator('#quedaCajaGeneral').inputValue(), '49800');
    assert.equal(await page.locator('#cerrarCaja').isEnabled(), true);
    if (process.env.SCREENSHOTS) await page.locator('[data-caja-paso="finalizar"]').screenshot({
      path: path.join(process.env.TEMP || __dirname, `micomercio-rev63-cierre-${width}.png`),
    });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(overflow <= 2, `desborde horizontal ${overflow}px a ${width}px`);
    assert.deepEqual(env.errors.filter(e => !/ERR_FAILED|Failed to fetch|OFFLINE/.test(e)), []);
    console.log(`OK ${width}px: sugerencia $600, efectivo esperado $50.400, quedan $49.800`);
  } finally {
    await env.close();
  }
}

(async () => { await check(1366); await check(390); })().catch(e => { console.error(e); process.exitCode = 1; });
