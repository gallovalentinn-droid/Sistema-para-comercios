'use strict';
process.env.PW ||= 'C:/Users/valen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
process.env.CHROME ||= 'C:/Program Files/Google/Chrome/Application/chrome.exe';
// UI y persistencia reales con clientes ficticios; shadow bloquea toda red externa.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {openShadow, abrirTurno} = require('./browser-fixture/shadow.cjs');

async function main() {
  const width = Number(process.env.WIDTH) || 1366, out = process.env.UX_OUTPUT_DIR;
  const h = await openShadow({width, height: width < 600 ? 1000 : 1050}), p = h.page;
  let paso = 'apertura';
  const captura = async nombre => {
    if (out) {
      fs.mkdirSync(out, {recursive: true});
      await p.screenshot({path: path.join(out, `${width}-${nombre}.png`), fullPage: true});
    }
  };
  const cerrar = async () => p.locator('#ov [data-cerrar]').first().click();
  const filas = () => p.locator('[data-fiado-cliente]');
  const juan = () => p.locator('[data-fiado-cliente="ju"]');
  const ids = async () => filas().evaluateAll(rows => rows.map(row => row.dataset.fiadoCliente));
  const volver = async () => p.evaluate(() => {vista = 'fiado'; render();});
  const ajustes = async () => {
    await juan().locator('[data-cta]').click();
    await p.locator('.fiado-account-tools > summary').click();
    await p.click('#ajC');
  };
  const caja = async () => p.evaluate(() => {
    const t = turnoActual(f5SesionIds(f3Estado.session).effectiveId);
    return {cobros: t.cobEfectivo, ventas: t.total};
  });
  try {
    assert.equal(await abrirTurno(p, '0', '0', 'Valen'), true);
    await p.evaluate(async () => {
      const actual = new Date(), anterior = new Date(); anterior.setDate(anterior.getDate() - 35);
      db.config.diasPlazoFiado = 30; db.config.recargoFiadoPct = 10;
      db.clientes = [
        {id: 'ju', nombre: 'Juan', tel: '1122589426', saldoBase: 1200, alta: anterior.toISOString()},
        {id: 'an', nombre: 'Ana', tel: '5491122334455', saldoBase: 2500, alta: actual.toISOString()},
        {id: 'br', nombre: 'Bruno', tel: '', saldoBase: 0, alta: actual.toISOString()},
        {id: 'la', nombre: 'Laura', tel: '', saldoBase: 0, alta: actual.toISOString()},
      ];
      db.ventas = []; db.ajustesFiado = []; db.egresos = [];
      db.pagos = [{id: 'credito-la', clienteId: 'la', monto: 100, fecha: actual.toISOString(), forma: 'efectivo'}];
      recalcularDerivados(db); await guardar();
      fiadoFiltro = 'saldo'; fiadoBusqueda = ''; fiadoOrden = 'deuda';
      fiadoAvisoCobro = null; ticket = []; clienteFiado = ''; vista = 'fiado'; render();
    });
    await p.waitForFunction(() => !document.querySelector('.toast'));
    paso = 'filtros, orden y vencimiento';
    assert.deepEqual(await ids(), ['an', 'ju']);
    assert.equal(await p.getByRole('columnheader', {name: 'Vencimiento', exact: true, includeHidden: true}).count(), 1);
    assert.match(await juan().locator('.fiado-days').innerText(), /Vencido hace 5 días/);
    assert.match(await p.locator('[data-fiado-cliente="an"] .fiado-days').innerText(), /Vence el/);
    await p.click('#fiadoFiltrarMora');
    assert.deepEqual(await ids(), ['ju']);
    assert.equal(await p.locator('[data-fiado-filtro="mora"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await p.locator('#fiadoFiltrarMora').getAttribute('aria-pressed'), 'true');
    await p.click('[data-fiado-filtro="todos"]');
    assert.equal(await filas().count(), 4);
    assert.equal(await p.locator('#fiadoFiltrarMora').getAttribute('aria-pressed'), 'false');
    assert.match(await p.locator('[data-fiado-cliente="la"]').innerText(), /Crédito/);
    assert.match(await p.locator('[data-fiado-cliente="br"] .fiado-days').innerText(), /Al día/);
    await p.selectOption('#fiadoOrden', 'nombre'); assert.deepEqual(await ids(), ['an', 'br', 'ju', 'la']);
    await p.selectOption('#fiadoOrden', 'atraso'); assert.equal((await ids())[0], 'ju');
    await p.selectOption('#fiadoOrden', 'deuda'); assert.equal((await ids())[0], 'an');
    await p.fill('#qc', '11 2258-9426'); assert.deepEqual(await ids(), ['ju']);
    await p.fill('#qc', 'Juan'); await volver(); assert.equal(await p.inputValue('#qc'), 'Juan');
    assert.deepEqual(await ids(), ['ju']); await captura('fiado-vencimiento');

    paso = 'recargo sin ingreso de caja';
    await juan().locator('.fiado-more > summary').click(); await juan().locator('[data-rec]').click();
    assert.match(await p.locator('#ov h3').innerText(), /Aplicar recargo/);
    assert.match(await p.locator('#rc_queda').innerText(), /Nueva deuda[\s\S]*1\.320,00/);
    assert.match(await p.locator('#rc_queda').innerText(), /No registra dinero recibido/);
    await cerrar(); assert.equal(await p.evaluate(() => db.ajustesFiado.length), 0);

    paso = 'cuenta y deuda inicial';
    await juan().locator('[data-cta]').click();
    assert.equal(await p.locator('#pagC').count(), 0);
    assert.match(await p.locator('.fiado-ledger').innerText(), /Deuda inicial/);
    assert.equal(await p.getByRole('columnheader', {name: 'Saldo después', exact: true, includeHidden: true}).count(), 1);
    assert.match(await p.locator('[data-fiado-mov="base:ju"]').innerText(), /1\.200,00/);
    assert.equal(await p.locator('#ajC').isVisible(), false);
    await captura('fiado-cuenta'); await cerrar();

    paso = 'cobro durable y protección de doble envío';
    await juan().locator('[data-pago]').click(); assert.equal(await p.inputValue('#p_monto'), '1.200,00');
    await p.fill('#p_monto', '200,00');
    assert.match(await p.locator('#p_queda').innerText(), /Recibís[\s\S]*200,00[\s\S]*Le queda[\s\S]*1\.000,00/);
    await p.evaluate(async () => {
      await esperarPersistenciaLocal();
      // Demora únicamente la próxima escritura; al liberar sigue la transacción real.
      const original = persistirCambiosIdb;
      persistirCambiosIdb = async cambios => {
        persistirCambiosIdb = original;
        await new Promise(resolve => {window.__fiadoLiberarGuardado = resolve;});
        return original(cambios);
      };
    });
    await p.click('#okP');
    await p.waitForFunction(() => typeof window.__fiadoLiberarGuardado === 'function');
    assert.equal(await p.locator('#okP').isDisabled(), true);
    assert.equal(await p.locator('#okP').getAttribute('aria-busy'), 'true');
    assert.match(await p.locator('#okP').innerText(), /Guardando pago/);
    await p.evaluate(() => {document.querySelector('#okP').onclick(); document.querySelector('#okP').onclick();});
    assert.equal(await p.evaluate(() => db.pagos.filter(x => x.clienteId === 'ju').length), 1);
    assert.equal(await p.locator('#fiadoVerComprobante').count(), 0);
    assert.equal(await p.evaluate(async () => {
      const d = await abrirIdb(), tx = d.transaction('pagos', 'readonly');
      return (await idbReq(tx.objectStore('pagos').getAll())).filter(x => x.clienteId === 'ju').length;
    }), 0);
    await captura('fiado-guardando');
    await p.evaluate(() => window.__fiadoLiberarGuardado());
    await p.waitForSelector('#fiadoVerComprobante');
    assert.equal(await p.inputValue('#qc'), 'Juan');
    assert.match(await p.locator('.fiado-result[role="status"]').innerText(), /Juan: le quedan \$\s*1\.000,00/);
    assert.equal(await p.evaluate(() => cli('ju').saldo), 1000);
    assert.match(await juan().locator('.fiado-days').innerText(), /Vencido hace 5 días/);
    const durable = await p.evaluate(async () => {
      const local = await leerLocalIdb();
      return {pagos: local.db.pagos.filter(x => x.clienteId === 'ju').map(x => x.monto), saldo: local.db.clientes.find(x => x.id === 'ju').saldo};
    });
    assert.deepEqual(durable, {pagos: [200], saldo: 1000});
    await p.click('#fiadoVerComprobante');
    assert.match(await p.locator('#ov').innerText(), /Comprobante de pago[\s\S]*Recibido[\s\S]*200,00[\s\S]*Saldo posterior[\s\S]*1\.000,00/);
    await captura('fiado-comprobante'); await cerrar();
    assert.deepEqual(await caja(), {cobros: 200, ventas: 0});

    paso = 'perdonar deuda y corregir a cero sin mover caja';
    await ajustes(); await p.selectOption('#as_intencion', 'perdonar');
    await p.fill('#as_monto', '1001'); assert.equal(await p.locator('#okAS').isDisabled(), true);
    await p.fill('#as_monto', '-300'); assert.equal(await p.locator('#okAS').isDisabled(), true);
    await p.fill('#as_monto', '300'); await p.fill('#as_mot', ''); assert.equal(await p.locator('#okAS').isDisabled(), true);
    await p.fill('#as_mot', 'Acuerdo de perdón');
    assert.match(await p.locator('#as_queda').innerText(), /Se descuenta[\s\S]*300,00[\s\S]*Después[\s\S]*700,00/);
    await captura('fiado-perdonar'); await p.click('#okAS');
    assert.equal(await p.evaluate(() => cli('ju').saldo), 700);
    assert.equal(await p.evaluate(() => db.ajustesFiado.at(-1).monto), -300);
    assert.deepEqual(await caja(), {cobros: 200, ventas: 0});
    await ajustes(); await p.selectOption('#as_intencion', 'corregir'); await p.fill('#as_monto', '0');
    assert.equal(await p.locator('#okAS').isDisabled(), false); await p.click('#okAS');
    assert.equal(await p.evaluate(() => cli('ju').saldo), 0);
    assert.equal(await p.evaluate(() => db.ajustesFiado.at(-1).monto), -700);
    assert.equal(await p.inputValue('#qc'), 'Juan');
    assert.deepEqual(await caja(), {cobros: 200, ventas: 0});
    await p.evaluate(() => {vista = 'caja'; globalThis.__miCajaVista = 'turno'; render();});
    assert.equal(await p.locator('.cash-box-ledger').count(),0,'el conteo ciego no revela el cálculo de caja');
    await volver();

    paso = 'nueva venta buscable y contexto del cliente';
    await p.click('#nuevoFiado'); await p.fill('#fiadoBuscarCliente', 'Juan');
    assert.equal(await p.locator('[data-selector-valor]').count(), 1);
    assert.equal(await p.locator('#okFiadoCli').isDisabled(), true);
    await p.locator('[data-selector-valor="ju"]').click(); await p.click('#okFiadoCli');
    assert.equal(await p.locator('#fiadoPOSContexto').isVisible(), true);
    assert.match(await p.locator('#fiadoPOSContexto').innerText(), /Fiando a Juan/);
    assert.equal(await p.evaluate(() => clienteFiado), 'ju');

    paso = 'ticket existente: cancelar preserva y confirmar cambia solo cliente';
    const antes = await p.evaluate(() => {
      ticket = [{id: 'ux-ticket', tipo: 'producto', nombre: 'Producto de prueba', cant: 2, precio: 50, costo: 20, rubro: 'Almacén', unidad: 'u'}];
      clienteFiado = 'an'; pago = 'fiado'; vista = 'fiado'; render();
      return JSON.stringify(ticket);
    });
    await juan().locator('.fiado-more > summary').click(); await juan().locator('[data-fiar]').click();
    assert.match(await p.locator('#ov h3').innerText(), /Ya hay una venta en curso/);
    await cerrar();
    assert.equal(await p.evaluate(() => JSON.stringify(ticket)), antes);
    assert.equal(await p.evaluate(() => clienteFiado), 'an');
    await juan().locator('.fiado-more > summary').click(); await juan().locator('[data-fiar]').click();
    await p.click('#okC');
    assert.equal(await p.evaluate(() => JSON.stringify(ticket)), antes);
    assert.equal(await p.evaluate(() => clienteFiado), 'ju');
    assert.match(await p.locator('#fiadoPOSContexto').innerText(), /Fiando a Juan/);
    await captura('fiado-pos');

    paso = 'crear cliente desde nueva venta y continuar';
    await p.evaluate(() => {ticket = []; clienteFiado = ''; vista = 'fiado'; render();});
    await p.click('#nuevoFiado'); await p.click('#fiadoCrearCliente');
    await p.fill('#c_nom', 'Cliente nuevo de prueba'); await p.fill('#c_tel', '1123456789'); await p.click('#okC');
    await p.waitForFunction(() => vista === 'vender' && cli(clienteFiado)?.nombre === 'Cliente nuevo de prueba');
    assert.match(await p.locator('#fiadoPOSContexto').innerText(), /Fiando a Cliente nuevo de prueba/);
    assert.equal(await p.evaluate(() => db.clientes.length), 5);
    assert.equal(await p.evaluate(() => cli(clienteFiado).saldo || 0), 0);
    await p.evaluate(async () => {await esperarPersistenciaLocal();});
    await volver();
    const dimensiones = await p.evaluate(() => ({ancho: innerWidth, scroll: document.documentElement.scrollWidth}));
    assert.ok(dimensiones.scroll <= dimensiones.ancho + 1, JSON.stringify(dimensiones));
    assert.deepEqual(h.errors.filter(e => e.startsWith('pageerror:')), []);
    console.log(JSON.stringify({ok: true, width, filtros: true, cobroDurable: 200, pagoUnico: true, perdon: 300, correccionCero: true, caja: 200, ticketConservado: true, altaYContinuacion: true}));
  } catch (error) {
    error.stack = `Paso: ${paso}\n${error.stack || error.message}`;
    await captura('fiado-fallo').catch(() => {});
    throw error;
  } finally {await h.close();}
}
main().catch(error => {console.error(error.stack || error); process.exitCode = 1;});
