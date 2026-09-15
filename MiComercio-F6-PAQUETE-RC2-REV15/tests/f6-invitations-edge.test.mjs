import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { clientIp } from '../supabase/functions/_shared/f5-auth-core.mjs';
import {
  F6_GENERIC_INVITATION,
  authorizeInvitationAction,
  hashInvitationDimensions,
  invitationPreviewResponse,
  limitedResponse,
  validateInvitationRequest,
} from '../supabase/functions/_shared/f6-contracts.mjs';

const UUID = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFG_1234567890-xyz';
const edgeSource = () => readFileSync(
  new URL('../supabase/functions/f6-invitations/index.ts', import.meta.url),
  'utf8',
);

test('acepta sólo las cinco acciones y los campos definidos para cada una', () => {
  assert.equal(validateInvitationRequest({ action: 'preview', token: TOKEN }).ok, true);
  assert.equal(validateInvitationRequest({ action: 'consume', token: TOKEN, idempotencyKey: UUID }).ok, true);
  assert.equal(validateInvitationRequest({ action: 'unknown', token: TOKEN }).ok, false);
  assert.equal(validateInvitationRequest({ action: 'preview', token: TOKEN, comercio: 'filtrado' }).ok, false);
  assert.match(edgeSource(), /validateInvitationRequest/);
});

test('rechaza tokens ausentes, cortos o con caracteres fuera de base64url', () => {
  assert.equal(validateInvitationRequest({ action: 'preview' }).ok, false);
  assert.equal(validateInvitationRequest({ action: 'preview', token: 'corto' }).ok, false);
  assert.equal(validateInvitationRequest({ action: 'preview', token: `${TOKEN}!` }).ok, false);
});

test('preview devuelve la misma respuesta pública para toda invitación no disponible', async () => {
  const missing = invitationPreviewResponse({ ok: false, code: 'MISSING' });
  const expired = invitationPreviewResponse({ ok: false, code: 'EXPIRED', comercio: 'No filtrar' });
  const revoked = invitationPreviewResponse({ ok: false, code: 'REVOKED', invitation_id: UUID });
  assert.deepEqual(await missing.json(), F6_GENERIC_INVITATION);
  assert.deepEqual(await expired.json(), F6_GENERIC_INVITATION);
  assert.deepEqual(await revoked.json(), F6_GENERIC_INVITATION);
  assert.equal(missing.status, expired.status);
});

test('consume exige una identidad Auth válida', () => {
  assert.deepEqual(authorizeInvitationAction('consume', { userId: null, isSupport: false }), {
    ok: false,
    status: 401,
    code: 'SESION_REQUERIDA',
  });
  assert.equal(authorizeInvitationAction('consume', { userId: UUID, isSupport: false }).ok, true);
  assert.match(edgeSource(), /getClaims/);
  assert.match(edgeSource(), /f6_service_consumir_invitacion/);
});

test('issue, regenerate y revoke exigen operador de soporte', () => {
  for (const action of ['issue', 'regenerate', 'revoke']) {
    assert.equal(authorizeInvitationAction(action, { userId: UUID, isSupport: false }).status, 403);
    assert.equal(authorizeInvitationAction(action, { userId: UUID, isSupport: true }).ok, true);
    assert.deepEqual(authorizeInvitationAction(action, { userId: UUID }), {
      ok: true,
      requiresSupport: true,
    });
  }
  assert.equal(authorizeInvitationAction('preview', { userId: null, isSupport: false }).ok, true);
  assert.match(edgeSource(), /F6_SUPPORT_FORBIDDEN/);
});

test('traduce el preflight limitado a HTTP 429 y Retry-After', async () => {
  const response = limitedResponse({ limited: true, retry_after: 321 });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '321');
  assert.deepEqual(await response.json(), { code: 'RATE_LIMITED', retry_after: 321 });
  assert.match(edgeSource(), /f6_service_rate_limit_preflight/);
});

test('reutiliza clientIp de F5 y toma el extremo derecho de XFF', () => {
  const request = new Request('https://qa.example/f6-invitations', {
    headers: { 'x-forwarded-for': '1.1.1.1, 203.0.113.8' },
  });
  assert.equal(clientIp(request), '203.0.113.8');
  assert.match(edgeSource(), /clientIp\(request\)/);
  assert.doesNotMatch(edgeSource(), /x-forwarded-for/i);
});

test('envía token, contacto e IP a SQL sólo como SHA-256 con pepper y separación de dominio', async () => {
  const dimensions = await hashInvitationDimensions({
    token: TOKEN,
    contact: ' Dueño@Ejemplo.COM ',
    ip: '203.0.113.8',
    pepper: 'secreto-servidor',
  });
  assert.deepEqual(Object.keys(dimensions).sort(), ['contactoHash', 'ipHash', 'tokenHash']);
  for (const value of Object.values(dimensions)) assert.match(value, /^[0-9a-f]{64}$/);
  assert.notEqual(dimensions.tokenHash, dimensions.contactoHash);
  assert.equal(JSON.stringify(dimensions).includes(TOKEN), false);
  assert.equal(JSON.stringify(dimensions).includes('dueño@ejemplo.com'), false);
  assert.equal(JSON.stringify(dimensions).includes('203.0.113.8'), false);
  assert.match(edgeSource(), /hashInvitationDimensions/);
});
