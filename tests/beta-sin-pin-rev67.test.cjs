const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'beta', 'index.html'), 'utf8');

test('REV67: al abrir la app no se pide ni se crea PIN del dispositivo', () => {
  const i = html.indexOf('async function f6AsegurarProteccionDispositivo(){');
  const cuerpo = html.slice(i, html.indexOf('\n}\n', i));
  assert.match(cuerpo, /interfazProtegida=false;/);
  assert.doesNotMatch(cuerpo, /modal\(|f6SolicitarCambioPinDispositivo|interfazProtegida=true/);
  assert.match(cuerpo, /localStorage\.removeItem\(f6DevicePinKey/);
});

test('REV67: no hay botón Bloquear, ni PIN en Configuración, ni sección de bloqueo de mostrador', () => {
  assert.doesNotMatch(html, /id="btnBloqueoVisual"/);
  assert.doesNotMatch(html, /function alternarBloqueoVisual/);
  assert.doesNotMatch(html, /id="cambiarPinDispositivo"/);
  assert.doesNotMatch(html, /id="cf-empleado"/);
  assert.doesNotMatch(html, /interfazProtegida=true/);
});
