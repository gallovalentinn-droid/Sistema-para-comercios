import { createClient } from "npm:@supabase/supabase-js@2.111.0";

import { clientIp, jsonResponse, sha256Hex } from "../_shared/f5-auth-core.mjs";
import {
  authorizeSupportRequest,
  hashSupportDimensions,
  isRedactedSupportPanel,
  limitedResponse,
  validateSupportRequest,
} from "../_shared/f6-contracts.mjs";

const BODY_LIMIT_BYTES = 16 * 1024;

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
    pepper: envFirst("F6_SUPPORT_PEPPER") || secretKey,
  };
}

function allowedOrigins(): Set<string> {
  return new Set(envFirst("F6_ALLOWED_ORIGINS").split(",").map((value) => value.trim()).filter(Boolean));
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

function respond(origin: string, body: unknown, status = 200): Response {
  return jsonResponse(body, status, corsHeaders(origin));
}

function withCors(response: Response, origin: string): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders(origin))) headers.set(name, value);
  return new Response(response.body, { status: response.status, headers });
}

function bearerToken(request: Request): string {
  return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
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

function rpcErrorCode(error: { message?: string } | null): string {
  return String(error?.message ?? "");
}

function newInvitationToken(): string {
  return `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin")?.trim() ?? "";
  if (origin && !allowedOrigins().has(origin)) return jsonResponse({ code: "ORIGEN_NO_PERMITIDO" }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== "POST") return respond(origin, { code: "METODO_NO_PERMITIDO" }, 405);

  let rawInput: unknown;
  try {
    rawInput = await readJsonBody(request);
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "F6_BODY_TOO_LARGE";
    return respond(origin, { code: tooLarge ? "CUERPO_DEMASIADO_GRANDE" : "DATOS_INVALIDOS" }, tooLarge ? 413 : 400);
  }
  const input = validateSupportRequest(rawInput);
  if (!input.ok) return respond(origin, { code: "DATOS_INVALIDOS" }, 400);

  const { url, publishableKey, secretKey, pepper } = configuredKeys();
  if (!url || !publishableKey || !secretKey || !pepper) return respond(origin, { code: "SERVICIO_NO_CONFIGURADO" }, 503);

  const token = bearerToken(request);
  if (!token) return respond(origin, { code: "SESION_REQUERIDA" }, 401);
  const userClient = createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
  const actorUserId = claimsData?.claims?.sub ?? null;
  if (claimsError || !isUuid(actorUserId)) return respond(origin, { code: "SESION_INVALIDA" }, 401);
  const identity = authorizeSupportRequest({ userId: actorUserId, isSupport: undefined });
  if (!identity.ok) return respond(origin, { code: identity.code }, identity.status);

  const serviceClient = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  try {
    const hashes = await hashSupportDimensions({
      commerceId: input.comercioId,
      ip: clientIp(request),
      pepper,
    });
    let surface = "support_panel";
    let dimensions: Record<string, string> = { ip_hash: hashes.ipHash };
    if (input.action === "license") {
      surface = "license_mutation";
      dimensions = { comercio_hash: hashes.comercioHash };
    } else if (input.action === "invite") {
      surface = "invite_regenerate";
      dimensions = { invitation_id: input.payload.invitationId };
    }
    const requestId = input.action === "panel" ? crypto.randomUUID() : input.correlationId;
    const { data: preflight, error: preflightError } = await serviceClient.rpc(
      "f6_service_rate_limit_preflight",
      {
        p_superficie: surface,
        p_dimensions: dimensions,
        p_operador_user_id: actorUserId,
        p_request_id: requestId,
      },
    );
    if (preflightError || !preflight || typeof preflight !== "object") throw preflightError ?? new Error("F6_RATE_PREFLIGHT_FAILED");
    if (preflight.limited === true) return withCors(limitedResponse(preflight), origin);

    if (input.action === "panel") {
      const { data, error } = await serviceClient.rpc("f6_service_panel", {
        p_actor_user_id: actorUserId,
        p_comercio_id: input.comercioId,
        p_build_observado: input.build,
        p_ip_hash: hashes.ipHash,
      });
      if (error) throw error;
      if (!isRedactedSupportPanel(data)) throw new Error("F6_SUPPORT_PANEL_REDACTION_FAILED");
      return respond(origin, data);
    }

    let sqlPayload = input.sqlPayload;
    let generatedToken = "";
    if (input.action === "invite" && input.command === "regenerate") {
      generatedToken = newInvitationToken();
      const tokenHash = await sha256Hex(`${pepper}|f6-invitation-token|${generatedToken}`);
      sqlPayload = { ...sqlPayload, new_token_hash: tokenHash, ip_hash: hashes.ipHash };
    }
    const { data, error } = await serviceClient.rpc("f6_service_comando", {
      p_actor_user_id: actorUserId,
      p_comercio_id: input.comercioId,
      p_action: input.sqlAction,
      p_payload: sqlPayload,
      p_correlation_id: input.correlationId,
      p_motivo: input.reason.trim(),
      p_build_observado: input.build,
    });
    if (error) throw error;
    if (data?.ok !== true) return respond(origin, { code: data?.code ?? "COMANDO_RECHAZADO" }, 409);
    return respond(origin, generatedToken ? { ...data, token: generatedToken } : data);
  } catch (error) {
    const code = rpcErrorCode(error);
    if (code.includes("F6_SUPPORT_FORBIDDEN")) return respond(origin, { code: "SIN_PERMISO" }, 403);
    if (code.includes("INPUT_INVALID") || code.includes("PAYLOAD_INVALID") || code.includes("ACTION_UNKNOWN")) {
      return respond(origin, { code: "DATOS_INVALIDOS" }, 400);
    }
    return respond(origin, { code: "SERVICIO_NO_DISPONIBLE" }, 503);
  }
});
