import { createClient } from "npm:@supabase/supabase-js@2.111.0";

import {
  clientIp,
  jsonResponse,
} from "../_shared/f5-auth-core.mjs";
import {
  authorizeInvitationAction,
  hashInvitationDimensions,
  invitationPreviewResponse,
  limitedResponse,
  validateInvitationRequest,
} from "../_shared/f6-contracts.mjs";

const BODY_LIMIT_BYTES = 16 * 1024;
const SUPPORT_ACTIONS = new Set(["issue", "regenerate", "revoke"]);

function envFirst(...names: string[]): string {
  for (const name of names) {
    const value = Deno.env.get(name)?.trim();
    if (value) return value;
  }
  return "";
}

function configuredKeys() {
  const secretKey = envFirst("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY");
  return {
    url: envFirst("SUPABASE_URL"),
    publishableKey: envFirst("SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY"),
    secretKey,
    pepper: envFirst("F6_INVITATION_PEPPER") || secretKey,
  };
}

function allowedOrigins(): Set<string> {
  return new Set(
    envFirst("F6_ALLOWED_ORIGINS")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function corsHeaders(origin: string): Record<string, string> {
  const headers: Record<string, string> = {
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "POST, OPTIONS",
    vary: "Origin",
  };
  if (origin) headers["access-control-allow-origin"] = origin;
  return headers;
}

function withCors(response: Response, origin: string): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders(origin))) headers.set(name, value);
  return new Response(response.body, { status: response.status, headers });
}

function respond(origin: string, body: unknown, status = 200): Response {
  return jsonResponse(body, status, corsHeaders(origin));
}

function bearerToken(request: Request): string {
  const value = request.headers.get("authorization") ?? "";
  return value.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function readJsonBody(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > BODY_LIMIT_BYTES) throw new Error("F6_BODY_TOO_LARGE");
  if (!request.body) throw new Error("F6_BODY_REQUIRED");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > BODY_LIMIT_BYTES) {
      await reader.cancel();
      throw new Error("F6_BODY_TOO_LARGE");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function newInvitationToken(): string {
  return `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
}

function rpcErrorCode(error: { message?: string } | null): string {
  return String(error?.message ?? "");
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin")?.trim() ?? "";
  if (origin && !allowedOrigins().has(origin)) {
    return jsonResponse({ code: "ORIGEN_NO_PERMITIDO" }, 403);
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") return respond(origin, { code: "METODO_NO_PERMITIDO" }, 405);

  let rawInput: unknown;
  try {
    rawInput = await readJsonBody(request);
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "F6_BODY_TOO_LARGE";
    return respond(origin, { code: tooLarge ? "CUERPO_DEMASIADO_GRANDE" : "DATOS_INVALIDOS" }, tooLarge ? 413 : 400);
  }

  const input = validateInvitationRequest(rawInput);
  if (!input.ok) return respond(origin, { code: "DATOS_INVALIDOS" }, 400);

  const { url, publishableKey, secretKey, pepper } = configuredKeys();
  if (!url || !publishableKey || !secretKey || !pepper) {
    return respond(origin, { code: "SERVICIO_NO_CONFIGURADO" }, 503);
  }

  const serviceClient = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let actorUserId: string | null = null;
  if (input.action !== "preview") {
    const token = bearerToken(request);
    if (!token) return respond(origin, { code: "SESION_REQUERIDA" }, 401);
    const userClient = createClient(url, publishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    actorUserId = claimsData?.claims?.sub ?? null;
    if (claimsError || !isUuid(actorUserId)) {
      return respond(origin, { code: "SESION_INVALIDA" }, 401);
    }
  }

  // Para acciones internas, el núcleo SQL vuelve a comprobar que el actor sea
  // soporte. La Edge sólo anticipa el requisito de identidad y traduce el veto.
  const authorization = authorizeInvitationAction(input.action, {
    userId: actorUserId,
    isSupport: SUPPORT_ACTIONS.has(input.action) ? undefined : false,
  });
  if (!authorization.ok) return respond(origin, { code: authorization.code }, authorization.status);

  try {
    const generatedToken = input.action === "issue" || input.action === "regenerate"
      ? newInvitationToken()
      : (input.token ?? "");
    const hashes = await hashInvitationDimensions({
      token: generatedToken,
      contact: input.contacto ?? "",
      ip: clientIp(request),
      pepper,
    });
    const surface = input.action === "preview" ? "invite_validate"
      : input.action === "consume" ? "invite_consume"
      : input.action === "issue" ? "invite_issue" : "invite_regenerate";
    const dimensions = input.action === "preview" || input.action === "consume"
      ? { token_hash: hashes.tokenHash, ip_hash: hashes.ipHash }
      : input.action === "issue"
      ? { contacto_hash: hashes.contactoHash }
      : { invitation_id: input.invitationId };
    const { data: preflight, error: preflightError } = await serviceClient.rpc(
      "f6_service_rate_limit_preflight",
      {
        p_superficie: surface,
        p_dimensions: dimensions,
        p_operador_user_id: actorUserId,
        p_request_id: input.idempotencyKey ?? crypto.randomUUID(),
      },
    );
    if (preflightError || !preflight || typeof preflight !== "object") {
      throw new Error("F6_RATE_PREFLIGHT_FAILED");
    }
    if (preflight.limited === true) return withCors(limitedResponse(preflight), origin);

    if (input.action === "preview") {
      const { data, error } = await serviceClient.rpc("f6_service_validar_invitacion", {
        p_token_hash: hashes.tokenHash,
      });
      if (error) throw error;
      return withCors(invitationPreviewResponse(data), origin);
    }

    if (input.action === "consume") {
      const { data, error } = await serviceClient.rpc("f6_service_consumir_invitacion", {
        p_token_hash: hashes.tokenHash,
        p_owner_user_id: actorUserId,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw error;
      if (data?.ok !== true) return withCors(invitationPreviewResponse(data), origin);
      return respond(origin, data);
    }

    if (input.action === "issue") {
      const { data, error } = await serviceClient.rpc("f6_service_emitir_invitacion", {
        p_actor_user_id: actorUserId,
        p_token_hash: hashes.tokenHash,
        p_contacto_hash: hashes.contactoHash,
        p_ip_hash: hashes.ipHash,
        p_comercio_nombre: input.comercioNombre.trim(),
        p_timezone: input.timezone.trim(),
        p_business_day_cutoff: input.businessDayCutoff,
        p_motivo: input.motivo.trim(),
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw error;
      return respond(origin, { ...data, token: generatedToken });
    }

    if (input.action === "regenerate") {
      const { data, error } = await serviceClient.rpc("f6_service_regenerar_invitacion", {
        p_actor_user_id: actorUserId,
        p_invitation_id: input.invitationId,
        p_new_token_hash: hashes.tokenHash,
        p_ip_hash: hashes.ipHash,
        p_motivo: input.motivo.trim(),
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw error;
      return respond(origin, { ...data, token: generatedToken });
    }

    const { data, error } = await serviceClient.rpc("f6_service_revocar_invitacion", {
      p_actor_user_id: actorUserId,
      p_invitation_id: input.invitationId,
      p_motivo: input.motivo.trim(),
    });
    if (error) throw error;
    return respond(origin, data);
  } catch (error) {
    const code = rpcErrorCode(error);
    if (code.includes("F6_SUPPORT_FORBIDDEN")) return respond(origin, { code: "SIN_PERMISO" }, 403);
    if (code.includes("F6_INVITATION_NOT_AVAILABLE") || code.includes("F6_INVITATION_ACTIVE_EXISTS")) {
      return withCors(invitationPreviewResponse(null), origin);
    }
    return respond(origin, { code: "SERVICIO_NO_DISPONIBLE" }, 503);
  }
});
