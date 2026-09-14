export const GENERIC_LOGIN_FAILURE = Object.freeze({
  status: 401,
  body: Object.freeze({
    code: 'CREDENCIALES_INVALIDAS',
    message: 'No pudimos iniciar sesión con esos datos.',
  }),
});

export const LOGIN_RATE_LIMIT = Object.freeze({ attempts: 5, windowSeconds: 900 });

export function normalizeLoginText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function validateLoginBody(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false };
  const allowed = new Set(['comercio', 'usuario', 'clave']);
  if (Object.keys(value).some((key) => !allowed.has(key))) return { ok: false };

  const comercio = normalizeLoginText(value.comercio).replace(/[^a-z0-9]/g, '');
  const usuario = normalizeLoginText(value.usuario);
  const clave = typeof value.clave === 'string' ? value.clave : '';
  if (!/^[a-z0-9]{10}$/.test(comercio)) return { ok: false };
  if (!usuario || usuario.length > 80 || !/^[a-z0-9._-]+$/.test(usuario)) return { ok: false };
  if (clave.length < 8 || clave.length > 128) return { ok: false };
  return { ok: true, comercio, usuario, clave };
}

export function rateLimitDecision(failedAttempts) {
  const limited = Number(failedAttempts) >= LOGIN_RATE_LIMIT.attempts;
  return {
    limited,
    status: limited ? 429 : 200,
    retryAfter: limited ? LOGIN_RATE_LIMIT.windowSeconds : 0,
  };
}

export function publicSessionPayload(session, membership) {
  const permisos = Array.isArray(membership?.permisos_efectivos)
    ? membership.permisos_efectivos.map(String)
    : [];
  return {
    access_token: String(session?.access_token ?? ''),
    refresh_token: String(session?.refresh_token ?? ''),
    expires_in: Number(session?.expires_in ?? 0),
    token_type: String(session?.token_type ?? 'bearer'),
    membresia: {
      comercio_id: String(membership?.comercio_id ?? ''),
      user_id: String(membership?.user_id ?? ''),
      rol: String(membership?.rol ?? ''),
      nombre_mostrado: String(membership?.nombre_mostrado ?? ''),
      permission_version: Number(membership?.permission_version ?? 0),
      permisos_efectivos: permisos,
    },
  };
}

export async function runEmployeeCreation(deps, input) {
  let authUser = null;
  try {
    authUser = await deps.createAuthUser(input);
    if (!authUser?.id) throw new Error('F5_AUTH_USER_INVALIDO');
    return await deps.persistMembership(authUser, input);
  } catch (error) {
    if (authUser?.id) {
      try {
        await deps.deleteAuthUser(authUser.id);
      } catch (compensationError) {
        throw new AggregateError(
          [error, compensationError],
          'F5_COMPENSACION_AUTH_FALLO',
        );
      }
    }
    throw error;
  }
}

export async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

// El extremo IZQUIERDO de x-forwarded-for lo pone quien llama: rotarlo reseteaba
// gratis los limites por IP y por par. Se usa el header que agrega la plataforma
// (cf-connecting-ip) y, si no esta, el extremo DERECHO de XFF, que es el unico
// que un cliente no puede fabricar porque lo anexa el proxy mas cercano.
export function clientIp(request) {
  const directo = request.headers.get('cf-connecting-ip')?.trim();
  if (directo) return directo;
  const cadena = request.headers.get('x-forwarded-for');
  if (!cadena) return 'unknown';
  const partes = cadena.split(',').map((x) => x.trim()).filter(Boolean);
  return partes.length ? partes[partes.length - 1] : 'unknown';
}

export function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  });
}

export function internalEmail() {
  return `${crypto.randomUUID()}@auth.micomercio.invalid`;
}
