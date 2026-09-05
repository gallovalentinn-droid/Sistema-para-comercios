import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { clientIp } from '../supabase/functions/_shared/f5-auth-core.mjs';
import {
  F6_SUPPORT_ACTIONS,
  authorizeSupportRequest,
  isRedactedSupportPanel,
  limitedResponse,
  validateSupportRequest,
} from '../supabase/functions/_shared/f6-contracts.mjs';

const USER = '11111111-1111-4111-8111-111111111111';
const COMMERCE = '22222222-2222-4222-8222-222222222222';
const CORRELATION = '33333333-3333-4333-8333-333333333333';
const source = () => readFileSync(
  new URL('../supabase/functions/f6-support/index.ts', import.meta.url),
  'utf8',
);

test('toda acción de soporte exige JWT válido', () => {
  assert.deepEqual(authorizeSupportRequest({ userId: null, isSupport: false }), {
    ok: false, status: 401, code: 'SESION_REQUERIDA',
  });
  assert.match(source(), /getClaims/);
  assert.match(source(), /bearerToken/);
});

test('la autorización exige un operador de soporte activo', () => {
  assert.deepEqual(authorizeSupportRequest({ userId: USER, isSupport: false }), {
    ok: false, status: 403, code: 'SIN_PERMISO',
  });
  assert.equal(authorizeSupportRequest({ userId: USER, isSupport: true }).ok, true);
  assert.match(source(), /F6_SUPPORT_FORBIDDEN/);
  assert.match(source(), /f6_service_panel/);
});

test('el panel falla cerrado si SQL devuelve secretos o payload comercial completo', () => {
  assert.equal(isRedactedSupportPanel({ ok: true, licencia: { estado_efectivo: 'activa' } }), true);
  for (const forbidden of [
    { token_hash: 'x' }, { contacto_hash: 'x' }, { pin_hash: 'x' },
    { encrypted_password: 'x' }, { db: { ventas: [] } }, { email: 'tecnico@example.invalid' },
  ]) assert.equal(isRedactedSupportPanel({ ok: true, dato: forbidden }), false);
  assert.match(source(), /isRedactedSupportPanel/);
});

test('acepta sólo siete acciones externas y traduce comandos a la allowlist SQL cerrada', () => {
  assert.deepEqual(F6_SUPPORT_ACTIONS, [
    'panel','license','invite','device_revoke','sync_retry','diagnostic_export','reconciliation_note',
  ]);
  const valid = validateSupportRequest({
    action: 'license', comercioId: COMMERCE, command: 'extend', payload: { dias: 2 },
    reason: 'Extensión aprobada', correlationId: CORRELATION, build: '5.0.0-f5-rc2',
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.sqlAction, 'license_extend');
  assert.equal(validateSupportRequest({ ...valid, action: 'ventas_edit' }).ok, false);
  assert.equal(validateSupportRequest({ ...valid, payload: { dias: 2, tabla: 'ventas' } }).ok, false);
  assert.doesNotMatch(source(), /p_table|p_sql|fromTable|\.from\(input/i);
});

test('reutiliza clientIp de F5 y conserva el extremo derecho de XFF', () => {
  const request = new Request('https://qa.example/f6-support', {
    headers: { 'x-forwarded-for': '198.51.100.4, 203.0.113.19' },
  });
  assert.equal(clientIp(request), '203.0.113.19');
  assert.match(source(), /clientIp\(request\)/);
  assert.doesNotMatch(source(), /x-forwarded-for/i);
});

test('traduce el límite SQL a HTTP 429 literal con Retry-After', async () => {
  const response = limitedResponse({ limited: true, retry_after: 77 });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '77');
  assert.deepEqual(await response.json(), { code: 'RATE_LIMITED', retry_after: 77 });
  assert.match(source(), /f6_service_rate_limit_preflight/);
  assert.match(source(), /limitedResponse/);
});
