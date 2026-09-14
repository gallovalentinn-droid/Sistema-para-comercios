import { createClient } from "npm:@supabase/supabase-js@2.111.0";

import {
  GENERIC_LOGIN_FAILURE,
  clientIp,
  jsonResponse,
  publicSessionPayload,
  sha256Hex,
  validateLoginBody,
} from "../_shared/f5-auth-core.mjs";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};

function envFirst(...names: string[]): string {
  for (const name of names) {
    const value = Deno.env.get(name)?.trim();
    if (value) return value;
  }
  return "";
}

function configuredKeys(): { url: string; publishableKey: string; secretKey: string; pepper: string } {
  const secretKey = envFirst("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY");
  return {
    url: envFirst("SUPABASE_URL"),
    publishableKey: envFirst("SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY"),
    secretKey,
    pepper: envFirst("F5_LOGIN_PEPPER") || secretKey,
  };
}

function respond(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return jsonResponse(body, status, { ...corsHeaders, ...extraHeaders });
}

async function safeMarkAttempt(serviceClient: ReturnType<typeof createClient>, attemptId: number, success: boolean) {
  const { data, error } = await serviceClient.rpc("f5_service_login_result", {
    p_attempt_id: attemptId,
    p_exitoso: success,
  });
  if (error || data !== true) throw new Error("F5_LOGIN_AUDIT_FAILED");
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return respond({ code: "METODO_NO_PERMITIDO" }, 405);

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return respond(GENERIC_LOGIN_FAILURE.body, GENERIC_LOGIN_FAILURE.status);
  }

  const input = validateLoginBody(parsed);
  if (!input.ok) return respond(GENERIC_LOGIN_FAILURE.body, GENERIC_LOGIN_FAILURE.status);

  const { url, publishableKey, secretKey, pepper } = configuredKeys();
  if (!url || !publishableKey || !secretKey || !pepper) {
    return respond({ code: "SERVICIO_NO_CONFIGURADO", message: "El acceso no está disponible temporalmente." }, 503);
  }

  const serviceClient = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const authClient = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  try {
    const ipHash = await sha256Hex(`${pepper}|ip|${clientIp(request)}`);
    const userHash = await sha256Hex(`${pepper}|user|${input.comercio}|${input.usuario}`);
    const { data: preflight, error: preflightError } = await serviceClient.rpc(
      "f5_service_login_preflight",
      {
        p_comercio: input.comercio,
        p_usuario_normalizado: input.usuario,
        p_ip_hash: ipHash,
        p_usuario_hash: userHash,
      },
    );
    if (preflightError || !preflight || typeof preflight !== "object") {
      throw new Error("F5_LOGIN_PREFLIGHT_FAILED");
    }
    if (preflight.limited === true) {
      return respond(
        { code: "DEMASIADOS_INTENTOS", message: "Esperá 15 minutos antes de volver a intentar." },
        429,
        { "retry-after": String(preflight.retry_after ?? 900) },
      );
    }

    const attemptId = Number(preflight.attempt_id);
    if (!Number.isSafeInteger(attemptId) || attemptId < 1) throw new Error("F5_LOGIN_ATTEMPT_INVALID");
    if (preflight.found !== true || typeof preflight.internal_email !== "string") {
      await safeMarkAttempt(serviceClient, attemptId, false);
      return respond(GENERIC_LOGIN_FAILURE.body, GENERIC_LOGIN_FAILURE.status);
    }

    const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
      email: preflight.internal_email,
      password: input.clave,
    });
    const authenticated = !authError && !!authData.user && !!authData.session
      && authData.user.id === preflight.user_id;
    await safeMarkAttempt(serviceClient, attemptId, authenticated);
    if (!authenticated) return respond(GENERIC_LOGIN_FAILURE.body, GENERIC_LOGIN_FAILURE.status);

    const { data: membership, error: membershipError } = await serviceClient.rpc(
      "f5_service_login_membresia",
      { p_comercio_id: preflight.comercio_id, p_user_id: authData.user.id },
    );
    if (membershipError || !membership) throw new Error("F5_LOGIN_MEMBERSHIP_FAILED");

    return respond(publicSessionPayload(authData.session, membership));
  } catch {
    return respond({ code: "SERVICIO_NO_DISPONIBLE", message: "No pudimos completar el acceso. Intentá nuevamente." }, 503);
  }
});
