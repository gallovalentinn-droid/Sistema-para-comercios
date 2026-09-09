import { createClient } from "npm:@supabase/supabase-js@2.111.0";

import { jsonResponse } from "../_shared/f5-auth-core.mjs";
import {
  F6_INVOICE_MODEL,
  buildGeminiInvoiceRequest,
  extractGeminiInvoice,
  extractGeminiUsage,
  validateInvoiceImageRequest,
} from "../_shared/f6-invoice-reader.mjs";

const BODY_LIMIT_BYTES = 12 * 1024 * 1024;
const GEMINI_TIMEOUT_MS = 25_000;

function envFirst(...names: string[]): string {
  for (const name of names) {
    const value = Deno.env.get(name)?.trim();
    if (value) return value;
  }
  return "";
}

function configuredKeys() {
  return {
    url: envFirst("SUPABASE_URL"),
    publishableKey: envFirst("SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY"),
    secretKey: envFirst("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
    geminiApiKey: Deno.env.get("GEMINI_API_KEY")?.trim() ?? "",
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

function geminiFailureStatus(status: number): { status: number; code: string } {
  if (status === 429) return { status: 429, code: "IA_AGOTADA_TEMPORALMENTE" };
  if (status === 400 || status === 422) return { status: 422, code: "FACTURA_NO_RECONOCIDA" };
  return { status: 503, code: "IA_NO_DISPONIBLE" };
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
    return respond(origin, { code: tooLarge ? "IMAGEN_DEMASIADO_GRANDE" : "DATOS_INVALIDOS" }, tooLarge ? 413 : 400);
  }

  const input = validateInvoiceImageRequest(rawInput);
  if (!input.ok) {
    return respond(origin, { code: input.code }, input.code === "IMAGEN_DEMASIADO_GRANDE" ? 413 : 400);
  }

  const { url, publishableKey, secretKey, geminiApiKey } = configuredKeys();
  if (!url || !publishableKey || !secretKey || !geminiApiKey) {
    return respond(origin, { code: "IA_NO_CONFIGURADA" }, 503);
  }

  const token = bearerToken(request);
  if (!token) return respond(origin, { code: "SESION_REQUERIDA" }, 401);
  const userClient = createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
  const actorUserId = claimsData?.claims?.sub ?? null;
  if (claimsError || !isUuid(actorUserId)) return respond(origin, { code: "SESION_INVALIDA" }, 401);

  const serviceClient = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: reservation, error: reservationError } = await serviceClient.rpc(
    "f6_service_reservar_lectura_factura",
    {
      p_actor_user_id: actorUserId,
      p_comercio_id: input.comercioId,
      p_request_id: input.requestId,
    },
  );
  if (reservationError) {
    const detail = String(reservationError.message ?? "");
    if (detail.includes("F6_IA_FORBIDDEN")) return respond(origin, { code: "SIN_PERMISO" }, 403);
    if (detail.includes("F6_IA_LICENSE_INACTIVE")) return respond(origin, { code: "LICENCIA_NO_OPERABLE" }, 403);
    return respond(origin, { code: "IA_NO_DISPONIBLE" }, 503);
  }
  if (reservation?.ok !== true) {
    const limited = reservation?.code === "LIMITE_IA_MENSUAL";
    return respond(origin, {
      code: limited ? "LIMITE_IA_MENSUAL" : "IA_NO_DISPONIBLE",
      limite: Number(reservation?.limite ?? 0),
      usados: Number(reservation?.usados ?? 0),
    }, limited ? 429 : 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const providerResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": geminiApiKey,
      },
      body: JSON.stringify(buildGeminiInvoiceRequest({
        imageBase64: input.imageBase64,
        mediaType: input.mediaType,
        model: F6_INVOICE_MODEL,
      })),
      signal: controller.signal,
    });
    if (!providerResponse.ok) {
      const failure = geminiFailureStatus(providerResponse.status);
      return respond(origin, { code: failure.code }, failure.status);
    }
    const providerBody = await providerResponse.json();
    const invoice = extractGeminiInvoice(providerBody);
    const iaUsage = extractGeminiUsage(providerBody);
    return respond(origin, { ...invoice, iaUsage });
  } catch (error) {
    const code = error instanceof Error && error.name === "AbortError"
      ? "IA_TIEMPO_AGOTADO"
      : "FACTURA_NO_RECONOCIDA";
    return respond(origin, { code }, code === "IA_TIEMPO_AGOTADO" ? 504 : 422);
  } finally {
    clearTimeout(timeout);
  }
});
