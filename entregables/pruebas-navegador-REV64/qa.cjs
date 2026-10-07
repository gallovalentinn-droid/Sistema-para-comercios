const assert = require('node:assert/strict');
const {openShadow, abrirTurno} = require('../pruebas-navegador-REV58/shadow.cjs');

async function probarEscaner() {
  const env = await openShadow({width: 1366, height: 850});
  try {
    const {page} = env;
    assert.equal(await abrirTurno(page, '1000', '0', 'QA'), true);
    await page.evaluate(() => {
      db.productos = [
        {id:'qa64-coca',nombre:'Coca QA',ean:'7790000000001',precio:1500,costo:800,stock:10,rubro:'Bebidas',unidad:'unidad'},
        {id:'qa64-oreo',nombre:'Oreo QA',ean:'7622300869229',precio:500,costo:200,stock:10,rubro:'Golosinas',unidad:'unidad'},
      ];
      vista='vender';render();agregarAlTicket(db.productos[0]);
    });
    await page.keyboard.press('F2');
    assert.equal(await page.locator('#rec').evaluate(el => document.activeElement === el), true);
    await page.keyboard.type('7622300869229', {delay: 5});
    await page.keyboard.press('Enter');
    const trasEscaner = await page.evaluate(() => ({ventas: db.ventas.length, ticket: ticket.map(i => i.nombre), recibido}));
    assert.equal(trasEscaner.ventas, 0);
    assert.deepEqual(trasEscaner.ticket, ['Coca QA', 'Oreo QA']);
    assert.equal(trasEscaner.recibido, '');
    assert.equal(await page.locator('#ov').count(), 0);

    await page.keyboard.press('F2');
    await page.locator('#rec').fill('2500');
    await page.locator('#rec').press('Enter');
    const venta = await page.evaluate(() => db.ventas.at(-1));
    assert.equal(venta.total, 2000);
    assert.equal(venta.recibido, 2500);
    assert.equal(venta.vuelto, 500);
    assert.equal(venta.items.length, 2);

    await page.evaluate(() => {cerrarModal();agregarAlTicket(db.productos[0]);});
    await page.keyboard.press('F2');
    await page.keyboard.type('7799999999999', {delay: 5});
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => db.ventas.length), 1);
    assert.equal(await page.locator('#cobrar').isDisabled(), true);
    assert.deepEqual(env.errors.filter(e => !/ERR_FAILED|Failed to fetch|OFFLINE/.test(e)), []);
    console.log('OK lector: agrega el producto al ticket y no cobra; Enter con importe normal conserva el vuelto');
  } finally {
    await env.close();
  }
}

async function probarSesionCerrada() {
  const env = await openShadow({width: 1366, height: 850});
  try {
    await env.page.evaluate(() => {
      f61MarcarSesionCerrada();
      enLinea=true;
      vista='vender';render();
    });
    assert.match(await env.page.locator('#rev31Estado').innerText(), /Tu sesión se cerró\. Volvé a ingresar/);
    assert.equal(await env.page.locator('#rev31Ingresar').isVisible(), true);
    assert.equal(await env.page.locator('#rev31Reintentar').isVisible(), false);
    assert.equal(await env.page.locator('#rev31Abrir').isDisabled(), true);
    console.log('OK apertura: la sesión cerrada guía a volver a ingresar');
  } finally {
    await env.close();
  }
}

(async () => { await probarEscaner(); await probarSesionCerrada(); })().catch(e => {console.error(e);process.exitCode=1;});
