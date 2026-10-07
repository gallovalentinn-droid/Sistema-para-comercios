// REV67 · El dueño entra sin PIN y no hay botón «Bloquear».
// Corre el arranque real (sin reemplazar f6AsegurarProteccionDispositivo) con un PIN viejo guardado en el equipo.
const assert = require('node:assert/strict');
const path = require('node:path');
const { openShadow } = require('../pruebas-navegador-REV58/shadow.cjs');

(async () => {
  const env = await openShadow({ rol: 'duenio', conPin: true, width: 1366, height: 850 });
  try {
    const { page } = env;
    const r = await page.evaluate(async () => {
      localStorage.setItem(f6DevicePinKey(sesion.user.id, deviceId), 'pbkdf2$viejo');
      await f6AsegurarProteccionDispositivo(); render();
      const pie = document.querySelector('#railFoot')?.textContent || '';
      ir('config');
      const cfg = document.querySelector('#main').innerText;
      return {
        modalAbierto: !!document.getElementById('ov'),
        protegida: interfazProtegida, esDuenio: esDuenio(),
        pinGuardado: localStorage.getItem(f6DevicePinKey(sesion.user.id, deviceId)),
        botonBloquear: !!document.getElementById('btnBloqueoVisual') || /Bloquear/.test(pie),
        configPin: /PIN de este dispositivo/.test(cfg), configBloqueo: /Bloqueo de mostrador/.test(cfg),
        vistas: vistasVisibles().map(v => v.id),
      };
    });
    assert.equal(r.modalAbierto, false, 'no debe abrirse ningún pedido de PIN');
    assert.equal(r.protegida, false);
    assert.equal(r.esDuenio, true);
    assert.equal(r.pinGuardado, null, 'el PIN viejo guardado en el equipo se borra');
    assert.equal(r.botonBloquear, false);
    assert.equal(r.configPin, false);
    assert.equal(r.configBloqueo, false);
    assert.ok(r.vistas.includes('config') && r.vistas.includes('caja'));
    await page.screenshot({ path: path.join(__dirname, 'configuracion-sin-pin.png'), fullPage: false });
    assert.deepEqual(env.errors.filter(e => e.startsWith('pageerror:')), []);
    console.log('OK REV67: entra sin PIN, sin Bloquear, sin PIN ni bloqueo en Configuración', JSON.stringify(r.vistas));
  } finally { await env.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
