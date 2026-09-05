import { jsonResponse, sha256Hex } from './f5-auth-core.mjs';

export const F6_GENERIC_INVITATION = Object.freeze({
  ok: false,
  code: 'INVITATION_NOT_AVAILABLE',
});

export const F6_INVITE_ACTIONS = Object.freeze([
  'preview',
  'consume',
  'issue',
  'regenerate',
  'revoke',
]);

export const F6_SUPPORT_ACTIONS = Object.freeze([
  'panel',
  'license',
  'invite',
  'device_revoke',
  'sync_retry',
  'diagnostic_export',
  'reconciliation_note',
]);

const ACTION_FIELDS = Object.freeze({
  preview: Object.freeze(['action', 'token']),
  consume: Object.freeze(['action', 'token', 'idempotencyKey']),
  issue: Object.freeze([
    'action',
    'contacto',
    'comercioNombre',
    'timezone',
    'businessDayCutoff',
    'motivo',
    'idempotencyKey',
  ]),
  regenerate: Object.freeze(['action', 'invitationId', 'motivo', 'idempotencyKey']),
  revoke: Object.freeze(['action', 'invitationId', 'motivo']),
});

const ACTION_SET = new Set(F6_INVITE_ACTIONS);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[A-Za-z0-9_-]{43,256}$/;
const BUILD_RE = /^[A-Za-z0-9._-]{1,80}$/;
const HASH_RE = /^[0-9a-f]{64}$/;

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function exactFields(value, action) {
  const expected = ACTION_FIELDS[action];
  const keys = Object.keys(value).sort();
  return keys.length === expected.length
    && keys.every((key, index) => key === [...expected].sort()[index]);
}

function requiredText(value, maximum) {
  return typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= maximum;
}

function validUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function validateInvitationRequest(value) {
  if (!isRecord(value) || !ACTION_SET.has(value.action) || !exactFields(value, value.action)) {
    return { ok: false, code: 'DATOS_INVALIDOS' };
  }

  if (value.action === 'preview' || value.action === 'consume') {
    if (typeof value.token !== 'string' || !TOKEN_RE.test(value.token)) {
      return { ok: false, code: 'DATOS_INVALIDOS' };
    }
  }

  if (value.action === 'consume' && !validUuid(value.idempotencyKey)) {
    return { ok: false, code: 'DATOS_INVALIDOS' };
  }

  if (value.action === 'issue') {
    if (!requiredText(value.contacto, 320)
      || !requiredText(value.comercioNombre, 160)
      || !requiredText(value.timezone, 100)
      || typeof value.businessDayCutoff !== 'string'
      || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value.businessDayCutoff)
      || !requiredText(value.motivo, 500)
      || !validUuid(value.idempotencyKey)) {
      return { ok: false, code: 'DATOS_INVALIDOS' };
    }
  }

  if (value.action === 'regenerate' || value.action === 'revoke') {
    if (!validUuid(value.invitationId) || !requiredText(value.motivo, 500)) {
      return { ok: false, code: 'DATOS_INVALIDOS' };
    }
    if (value.action === 'regenerate' && !validUuid(value.idempotencyKey)) {
      return { ok: false, code: 'DATOS_INVALIDOS' };
    }
  }

  return { ok: true, ...value };
}

export function authorizeInvitationAction(action, context = {}) {
  if (action === 'preview') return { ok: true };
  if (!validUuid(context.userId)) {
    return { ok: false, status: 401, code: 'SESION_REQUERIDA' };
  }
  if (['issue', 'regenerate', 'revoke'].includes(action)) {
    if (context.isSupport === false) {
      return { ok: false, status: 403, code: 'SIN_PERMISO' };
    }
    if (context.isSupport !== true) return { ok: true, requiresSupport: true };
  }
  return { ok: true };
}

function hasExactKeys(value, expected) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function validSupportPayload(action, command, payload) {
  if (!isRecord(payload)) return false;
  if (action === 'license') {
    if (!['pause', 'reactivate', 'extend', 'cancel'].includes(command)) return false;
    if (command === 'pause' || command === 'cancel') return hasExactKeys(payload, []);
    if (command === 'reactivate') {
      return hasExactKeys(payload, ['compensar']) && typeof payload.compensar === 'boolean';
    }
    return hasExactKeys(payload, ['dias'])
      && Number.isInteger(payload.dias) && payload.dias >= 1 && payload.dias <= 7;
  }
  if (action === 'invite') {
    return ['resend', 'regenerate', 'revoke'].includes(command)
      && hasExactKeys(payload, ['invitationId']) && validUuid(payload.invitationId);
  }
  if (action === 'device_revoke') {
    return hasExactKeys(payload, ['deviceId', 'ackPerdida'])
      && validUuid(payload.deviceId)
      && payload.ackPerdida === 'ACEPTO_PERDER_OPERACIONES_OFFLINE';
  }
  if (action === 'sync_retry') return hasExactKeys(payload, ['deviceId']) && validUuid(payload.deviceId);
  if (action === 'diagnostic_export') return hasExactKeys(payload, []);
  if (action === 'reconciliation_note') {
    return hasExactKeys(payload, ['entidad', 'entidadId', 'nota'])
      && ['operacion', 'sesion', 'cierre'].includes(payload.entidad)
      && validUuid(payload.entidadId) && requiredText(payload.nota, 500);
  }
  return false;
}

export function validateSupportRequest(value) {
  if (!isRecord(value) || !F6_SUPPORT_ACTIONS.includes(value.action)) {
    return { ok: false, code: 'DATOS_INVALIDOS' };
  }
  if (value.action === 'panel') {
    if (!hasExactKeys(value, ['action', 'comercioId', 'build'])
      || !validUuid(value.comercioId) || typeof value.build !== 'string' || !BUILD_RE.test(value.build)) {
      return { ok: false, code: 'DATOS_INVALIDOS' };
    }
    return { ok: true, ...value };
  }

  const expected = ['action', 'comercioId', 'payload', 'reason', 'correlationId', 'build'];
  if (value.action === 'license' || value.action === 'invite') expected.push('command');
  if (!hasExactKeys(value, expected)
    || !validUuid(value.comercioId) || !validUuid(value.correlationId)
    || !requiredText(value.reason, 500) || typeof value.build !== 'string' || !BUILD_RE.test(value.build)
    || !validSupportPayload(value.action, value.command, value.payload)) {
    return { ok: false, code: 'DATOS_INVALIDOS' };
  }

  const sqlAction = value.action === 'license' || value.action === 'invite'
    ? `${value.action}_${value.command}` : value.action;
  const payload = value.action === 'device_revoke'
    ? { device_id: value.payload.deviceId, ack_perdida: value.payload.ackPerdida }
    : value.action === 'sync_retry'
    ? { device_id: value.payload.deviceId }
    : value.action === 'invite'
    ? { invitation_id: value.payload.invitationId }
    : value.action === 'reconciliation_note'
    ? { entidad: value.payload.entidad, entidad_id: value.payload.entidadId, nota: value.payload.nota.trim() }
    : { ...value.payload };
  return { ok: true, ...value, sqlAction, sqlPayload: payload };
}

export function authorizeSupportRequest(context = {}) {
  if (!validUuid(context.userId)) return { ok: false, status: 401, code: 'SESION_REQUERIDA' };
  if (context.isSupport === false) return { ok: false, status: 403, code: 'SIN_PERMISO' };
  if (context.isSupport !== true) return { ok: true, requiresSupport: true };
  return { ok: true };
}

const FORBIDDEN_PANEL_KEYS = new Set([
  'token', 'token_hash', 'contacto', 'contacto_hash', 'ip_hash', 'pin', 'pin_hash',
  'password', 'encrypted_password', 'credential', 'credentials', 'secret', 'secrets',
  'email', 'db', 'ventas', 'productos', 'clientes', 'stock', 'fiado', 'saldos', 'permisos',
]);

export function isRedactedSupportPanel(value) {
  const visit = (item) => {
    if (Array.isArray(item)) return item.every(visit);
    if (!isRecord(item)) return true;
    return Object.entries(item).every(([key, child]) => (
      !FORBIDDEN_PANEL_KEYS.has(key.toLowerCase()) && visit(child)
    ));
  };
  return isRecord(value) && visit(value);
}

export function invitationPreviewResponse(result) {
  if (result?.ok === true && result?.code === 'INVITATION_AVAILABLE') {
    return jsonResponse({ ok: true, code: 'INVITATION_AVAILABLE' });
  }
  return jsonResponse(F6_GENERIC_INVITATION);
}

export function limitedResponse(preflight) {
  const parsed = Number(preflight?.retry_after);
  const retryAfter = Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : 900;
  return jsonResponse(
    { code: 'RATE_LIMITED', retry_after: retryAfter },
    429,
    { 'Retry-After': String(retryAfter) },
  );
}

export async function hashInvitationDimensions({ token = '', contact = '', ip = '', pepper }) {
  if (typeof pepper !== 'string' || pepper.length < 1) throw new Error('F6_PEPPER_REQUIRED');
  const normalizedContact = String(contact).normalize('NFKC').trim().toLowerCase();
  return {
    tokenHash: await sha256Hex(`${pepper}|f6-invitation-token|${String(token)}`),
    contactoHash: await sha256Hex(`${pepper}|f6-invitation-contact|${normalizedContact}`),
    ipHash: await sha256Hex(`${pepper}|f6-invitation-ip|${String(ip).trim()}`),
  };
}

export async function hashSupportDimensions({ commerceId = '', ip = '', pepper }) {
  if (typeof pepper !== 'string' || pepper.length < 1) throw new Error('F6_PEPPER_REQUIRED');
  const comercioHash = await sha256Hex(`${pepper}|f6-support-commerce|${String(commerceId)}`);
  const ipHash = await sha256Hex(`${pepper}|f6-support-ip|${String(ip).trim()}`);
  if (!HASH_RE.test(comercioHash) || !HASH_RE.test(ipHash)) throw new Error('F6_HASH_FAILED');
  return { comercioHash, ipHash };
}
