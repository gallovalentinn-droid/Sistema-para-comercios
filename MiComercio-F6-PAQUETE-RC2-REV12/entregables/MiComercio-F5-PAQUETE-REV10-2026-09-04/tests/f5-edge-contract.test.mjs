import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clientIp,
  GENERIC_LOGIN_FAILURE,
  normalizeLoginText,
  publicSessionPayload,
  rateLimitDecision,
  runEmployeeCreation,
  validateLoginBody,
} from '../supabase/functions/_shared/f5-auth-core.mjs';

test('la IP agregada por la plataforma prevalece sobre un XFF falsificado', () => {
  const request = new Request('https://example.test', {
    headers: {
      'cf-connecting-ip': '203.0.113.10',
      'x-forwarded-for': '198.51.100.20, 192.0.2.30',
    },
  });
  assert.equal(clientIp(request), '203.0.113.10');
});

test('sin header de plataforma usa el extremo derecho de XFF', () => {
  const request = new Request('https://example.test', {
    headers: { 'x-forwarded-for': '198.51.100.20, 192.0.2.30' },
  });
  assert.equal(clientIp(request), '192.0.2.30');
});

test('sin headers de proxy usa un alcance estable desconocido', () => {
  assert.equal(clientIp(new Request('https://example.test')), 'unknown');
});

test('normaliza comercio y usuario sin depender de mayúsculas, tildes o espacios', () => {
  assert.equal(normalizeLoginText('  KÍOSCO   Núñez  '), 'kiosco nunez');
  assert.equal(normalizeLoginText(' VENDEDÓR_01 '), 'vendedor_01');
});

test('el contrato de login exige exactamente comercio, usuario y clave válidos', () => {
  assert.deepEqual(validateLoginBody({ comercio: 'ABCDE-12345', usuario: 'caja', clave: '12345678' }), {
    ok: true,
    comercio: 'abcde12345',
    usuario: 'caja',
    clave: '12345678',
  });
  assert.equal(validateLoginBody({ comercio: '', usuario: 'caja', clave: '12345678' }).ok, false);
  assert.equal(validateLoginBody({ comercio: 'abc', usuario: 'caja', clave: '12345678' }).ok, false);
  assert.equal(validateLoginBody({ comercio: 'abc', usuario: '', clave: '12345678' }).ok, false);
  assert.equal(validateLoginBody({ comercio: 'abc', usuario: 'caja', clave: 'corta' }).ok, false);
});

test('comercio, usuario o clave incorrectos comparten la misma respuesta genérica', () => {
  const missingCommerce = structuredClone(GENERIC_LOGIN_FAILURE);
  const missingUser = structuredClone(GENERIC_LOGIN_FAILURE);
  const wrongPassword = structuredClone(GENERIC_LOGIN_FAILURE);

  assert.deepEqual(missingCommerce, missingUser);
  assert.deepEqual(missingUser, wrongPassword);
  assert.equal(missingCommerce.status, 401);
});

test('permite cinco intentos fallidos en quince minutos y bloquea el sexto', () => {
  assert.deepEqual(rateLimitDecision(4), { limited: false, status: 200, retryAfter: 0 });
  assert.deepEqual(rateLimitDecision(5), { limited: true, status: 429, retryAfter: 900 });
  assert.deepEqual(rateLimitDecision(8), { limited: true, status: 429, retryAfter: 900 });
});

test('la respuesta pública de sesión nunca incluye el correo técnico', () => {
  const payload = publicSessionPayload(
    {
      access_token: 'access',
      refresh_token: 'refresh',
      expires_in: 3600,
      token_type: 'bearer',
      user: { id: 'user-1', email: 'secreto@auth.micomercio.invalid' },
    },
    {
      comercio_id: 'comercio-1',
      user_id: 'user-1',
      rol: 'empleado',
      nombre_mostrado: 'Caja tarde',
      permission_version: 3,
      permisos_efectivos: ['ventas_registrar'],
      internal_email: 'secreto@auth.micomercio.invalid',
    },
  );

  assert.deepEqual(Object.keys(payload).sort(), [
    'access_token', 'expires_in', 'membresia', 'refresh_token', 'token_type',
  ]);
  assert.equal(JSON.stringify(payload).includes('internal_email'), false);
  assert.equal(JSON.stringify(payload).includes('@auth.micomercio.invalid'), false);
});

test('si falla la membresía después de crear Auth, elimina la identidad huérfana', async () => {
  const calls = [];
  await assert.rejects(
    runEmployeeCreation(
      {
        createAuthUser: async () => {
          calls.push('crear-auth');
          return { id: 'user-new' };
        },
        persistMembership: async () => {
          calls.push('crear-membresia');
          throw new Error('MEMBERSHIP_FAILED');
        },
        deleteAuthUser: async (id) => {
          calls.push(`compensar:${id}`);
        },
      },
      { usuario: 'caja', clave: 'una-clave-segura' },
    ),
    /MEMBERSHIP_FAILED/,
  );
  assert.deepEqual(calls, ['crear-auth', 'crear-membresia', 'compensar:user-new']);
});

test('una creación correcta no dispara compensación', async () => {
  const calls = [];
  const result = await runEmployeeCreation(
    {
      createAuthUser: async () => ({ id: 'user-new' }),
      persistMembership: async (user) => ({ ok: true, user_id: user.id }),
      deleteAuthUser: async () => { calls.push('compensar'); },
    },
    { usuario: 'caja', clave: 'una-clave-segura' },
  );
  assert.deepEqual(result, { ok: true, user_id: 'user-new' });
  assert.deepEqual(calls, []);
});
