// REV68 · El turno abierto no se pierde al volver a cargar la app.
// Antes, f3Inicializar() -> f3MigrarPlaceholderSesionLocal() borraba en cada arranque el turno abierto normal
// (serverOpened nunca pasa a true y las ventas nuevas no son «legacy»), y sus ventas quedaban fuera de cualquier cierre.
const assert = require('node:assert/strict');
const { openShadow, abrirTurno } = require('../pruebas-navegador-REV58/shadow.cjs');

(async () => {
  const env = await openShadow({ rol: 'duenio' });
  try {
    const { page } = env;
    assert.equal(await abrirTurno(page, '8500', '0', 'Agus'), true);
    const r = await page.evaluate(() => {
      const s = f3Estado.session;
      for (let i = 0; i < 10; i++) {
        const v = { id: 'qa68-' + i, nro: i + 1, fecha: new Date().toISOString(), total: 3215, subtotal: 3215, forma: 'efectivo',
          items: [{ nombre: 'X', rubro: 'Almacén', precio: 3215, cant: 1, neto: 3215, costo: 1 }] };
        f5EstamparSesionLocal(v, s); db.ventas.push(v);
      }
      const conVentas = { borrada: f3MigrarPlaceholderSesionLocal(), sigue: f3Estado.session && f3Estado.session.estado };
      // turno abierto a mano, todavía sin ventas: tampoco se borra
      const segmento = f3Estado.session.sessionSegmentId;
      db.ventas = db.ventas.filter(v => v._v4sessionSegmentId !== segmento);
      const sinVentas = { borrada: f3MigrarPlaceholderSesionLocal(), sigue: f3Estado.session && f3Estado.session.estado };
      // marcador viejo (pre-FIX4): nadie lo abrió y no tiene movimientos -> sí se limpia
      f3Estado.session = { id: 'viejo', sessionSegmentId: 'viejo', rootSessionId: 'viejo', estado: 'abierta', serverOpened: false };
      const marcador = { borrada: f3MigrarPlaceholderSesionLocal(), sigue: f3Estado.session };
      return { conVentas, sinVentas, marcador };
    });
    assert.deepEqual(r.conVentas, { borrada: false, sigue: 'abierta' }, 'un turno con ventas no se borra al arrancar');
    assert.deepEqual(r.sinVentas, { borrada: false, sigue: 'abierta' }, 'un turno abierto a mano no se borra al arrancar');
    assert.deepEqual(r.marcador, { borrada: true, sigue: null }, 'el marcador viejo sin movimientos se sigue limpiando');
    assert.deepEqual(env.errors.filter(e => e.startsWith('pageerror:')), []);
    console.log('OK REV68: el turno abierto sobrevive al arranque; el marcador viejo se limpia', JSON.stringify(r));
  } finally { await env.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
