import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import { jsonResponse } from "../_shared/f5-auth-core.mjs";
import { buildInvoiceTelemetry, validateInvoiceImageRequest } from "../_shared/f6-invoice-reader.mjs";
import { readInvoiceWithProviders, invoiceStep } from "../_shared/f6-invoice-providers.mjs";

const BODY_LIMIT_BYTES = 24 * 1024 * 1024;

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
    openaiApiKey: Deno.env.get("OPENAI_API_KEY")?.trim() ?? "",
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


Deno.serve(async (request: Request) => {
  const arrived = Date.now(), deadline = arrived + 145_000;
  const admissionTime = () => Math.max(1,Math.min(10_000-(Date.now()-arrived),deadline-Date.now()));
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
    rawInput = await invoiceStep(readJsonBody(request),admissionTime());
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "F6_BODY_TOO_LARGE";
    return respond(origin, { code: tooLarge ? "IMAGEN_DEMASIADO_GRANDE" : "DATOS_INVALIDOS" }, tooLarge ? 413 : 400);
  }

  const input = validateInvoiceImageRequest(rawInput);
  if (!input.ok) {
    return respond(origin, { code: input.code }, input.code === "IMAGEN_DEMASIADO_GRANDE" ? 413 : 400);
  }

  const diagnosticAt = (stage: string) => ({ requestId: input.requestId, stage });
  const fail = (code: string, status: number, stage: string) => {
    const diagnostic = diagnosticAt(stage);
    console.error("F6_IA_DIAGNOSTIC", JSON.stringify({code, ...diagnostic}));
    return respond(origin, {code, diagnostic}, status);
  };

  const { url, publishableKey, secretKey, geminiApiKey, openaiApiKey } = configuredKeys();
  if (!url || !publishableKey || !secretKey || (!geminiApiKey && !openaiApiKey)) {
    return fail("IA_NO_CONFIGURADA", 503, "configuration");
  }

  const token = bearerToken(request);
  if (!token) return fail("SESION_REQUERIDA", 401, "authentication");
  const userClient = createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  let claims;
  try { claims = await invoiceStep(userClient.auth.getClaims(token),admissionTime()); }
  catch (_) { return fail("IA_AUTENTICACION_NO_DISPONIBLE", 503, "authentication"); }
  const { data: claimsData, error: claimsError } = claims;
  const actorUserId = claimsData?.claims?.sub ?? null;
  if (claimsError && (claimsError.name === "AuthRetryableFetchError" || ![400, 401, 403].includes(Number(claimsError.status)))) {
    return fail("IA_AUTENTICACION_NO_DISPONIBLE", 503, "authentication");
  }
  if (claimsError || !isUuid(actorUserId)) return fail("SESION_INVALIDA", 401, "authentication");
  if (input.readerContract !== "f6-invoice-review-v1") return fail("CLIENTE_REQUIERE_ACTUALIZACION",426,"client");

  const serviceClient = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const identity={p_actor_user_id:actorUserId,p_comercio_id:input.comercioId,p_request_id:input.requestId};
  const reservationFailure=(error: {message?:string})=>{
    const detail=String(error?.message??"");
    if(detail.includes("F6_IA_FORBIDDEN"))return fail("SIN_PERMISO",403,"reservation");
    if(detail.includes("F6_IA_LICENSE_INACTIVE"))return fail("LICENCIA_NO_OPERABLE",403,"reservation");
    return fail("IA_RESERVA_NO_DISPONIBLE",503,"reservation");
  };
  const capabilityName="f6_service_capacidades_lector_factura_rev84";
  let quotaMode="rev84";
  try {
    const probe=await invoiceStep(serviceClient.rpc(capabilityName,{p_actor_user_id:actorUserId,p_comercio_id:input.comercioId}),admissionTime());
    if(probe.error){
      const missing=["PGRST202","42883"].includes(probe.error.code)&&String(probe.error.message??"").includes(capabilityName);
      if(!missing)return reservationFailure(probe.error);
      quotaMode="legacy-rev83";
      console.error("F6_IA_LEGACY_QUOTA",JSON.stringify(diagnosticAt("reservation")));
    }else if(probe.data?.contract!=="f6-reader-quota-rev84")return fail("IA_RESERVA_NO_DISPONIBLE",503,"reservation");
  }catch(_){return fail("IA_RESERVA_NO_DISPONIBLE",503,"reservation");}
  const modern=quotaMode==="rev84";
  const maxAttempts=openaiApiKey&&geminiApiKey&&["image/jpeg","image/png","image/webp"].includes(input.mediaType)?2:1;
  let reserved;
  try { reserved = await invoiceStep(serviceClient.rpc(
    modern?"f6_service_reservar_lectura_factura_rev84":"f6_service_reservar_lectura_factura",
    {...identity,...(modern?{p_max_attempts:maxAttempts}:{})},
  ),admissionTime()); } catch (_) { return fail("IA_RESERVA_NO_DISPONIBLE", 503, "reservation"); }
  const { data: reservation, error: reservationError } = reserved;
  if (reservationError) return reservationFailure(reservationError);
  if(reservation?.replayed===true){
    const running=modern&&reservation.code==="LECTURA_EN_CURSO";
    return respond(origin,{code:running?"LECTURA_EN_CURSO":"LECTURA_NO_RECUPERABLE",diagnostic:{...diagnosticAt("reservation"),...(running?{retryAfterSeconds:5}:{})},iaQuotaMode:quotaMode},running?202:409);
  }
  if (reservation?.ok !== true) {
    const limited = reservation?.code === "LIMITE_IA_MENSUAL";
    const capacity=["IA_LIMITE_FRECUENCIA","IA_LECTURAS_EN_CURSO"].includes(reservation?.code);
    return respond(origin, {
      code: limited||capacity ? reservation.code : "IA_RESERVA_NO_DISPONIBLE",
      diagnostic: {...diagnosticAt("reservation"),...(capacity?{retryAfterSeconds:Number(reservation.retryAfterSeconds??1)}:{})},
      limite: Number(reservation?.limite ?? 0),
      usados: Number(reservation?.usados ?? 0),
      iaQuotaMode:quotaMode,
    }, limited||capacity ? 429 : 503);
  }
  if(reservation.monthlyCallsWarning)console.error("F6_IA_MONTHLY_CALL_WARNING",JSON.stringify(diagnosticAt("reservation")));
  const finalize=async()=>{
    if(!modern)return true;
    try{
      const closed=await invoiceStep(serviceClient.rpc("f6_service_finalizar_lectura_factura_rev84",identity),Math.max(1,Math.min(2_000,deadline-Date.now())));
      if(closed.error||closed.data?.ok!==true)throw new Error("F6_CLOSE_FAILED");
      return true;
    }catch(_){console.error("F6_IA_CLOSE_PENDING",JSON.stringify(diagnosticAt("telemetry")));return false;}
  };

  let stage = "provider";
  try {
    if(deadline-Date.now()<=5_000)throw Object.assign(new Error("IA_TIEMPO_AGOTADO"),{code:"IA_TIEMPO_AGOTADO",status:504});
    const result = await readInvoiceWithProviders({input,openaiApiKey,geminiApiKey,fetchImpl:fetch,totalTimeoutMs:Math.min(135_000,deadline-Date.now()-5_000),
      ...(modern?{beforeAttempt:async({provider,attempt}: {provider:string;attempt:number})=>{
        let admitted;
        try{admitted=await invoiceStep(serviceClient.rpc("f6_service_iniciar_intento_lectura_factura_rev84",{...identity,p_provider:provider,p_attempt:attempt}),Math.max(1,Math.min(2_000,deadline-Date.now()-5_000)));}
        catch(_){throw Object.assign(new Error("IA_RESERVA_NO_DISPONIBLE"),{code:"IA_RESERVA_NO_DISPONIBLE",status:503,diagnostic:diagnosticAt("reservation")});}
        if(admitted.error||admitted.data?.ok!==true)throw Object.assign(new Error("IA_RESERVA_NO_DISPONIBLE"),{code:"IA_RESERVA_NO_DISPONIBLE",status:503,diagnostic:diagnosticAt("reservation")});
      }}:{}),
    });
    const {invoice,iaUsage} = result;
    if(!invoice.items.length)throw Object.assign(new Error("FACTURA_SIN_PRODUCTOS"),{code:"FACTURA_SIN_PRODUCTOS",status:422,diagnostic:{stage:"validation",provider:result.provider}});
    stage = "telemetry";
    let accountingStatus="confirmed";
    try{
      const telemetry = buildInvoiceTelemetry({invoice,usage:iaUsage,model:result.model});
      const { data: telemetryResult, error: telemetryError } = await invoiceStep(serviceClient.rpc(
      modern?"f6_service_registrar_resultado_lectura_factura_rev84":"f6_service_registrar_resultado_lectura_factura",
      {
        p_actor_user_id: actorUserId,
        p_comercio_id: input.comercioId,
        p_request_id: input.requestId,
        p_model: telemetry.model,
        p_usage: telemetry.usage,
        p_recognized_fields: telemetry.recognizedFields,
        p_recognized_items: telemetry.recognizedItems,
      },
    ),Math.max(1,Math.min(2_000,deadline-Date.now())));
    if (telemetryError || telemetryResult?.ok !== true) {
      throw new Error("F6_TELEMETRY_PENDING");
    }
    }catch(_){accountingStatus="pending";console.error("F6_IA_TELEMETRY_PENDING",JSON.stringify(diagnosticAt(stage)));}
    const closed=await finalize();
    return respond(origin, { ...invoice, iaUsage, iaProvider:result.provider, iaFallbackUsed:result.fallbackUsed,
      ...(result.fallbackDiagnostic?{iaFallbackDiagnostic:result.fallbackDiagnostic}:{}),
      iaQuotaMode:quotaMode,iaAccountingStatus:accountingStatus,...(accountingStatus==="pending"?{iaAccountingDiagnostic:diagnosticAt("telemetry")}:{ }),
      ...(closed?{}:{iaClosureStatus:"pending"}),
    });
  } catch (error) {
    await finalize();
    const failure = error as {code?:string; status?:number; diagnostic?:object};
    const code = failure.code ?? (stage === "telemetry" ? "IA_TELEMETRIA_NO_REGISTRADA" : "IA_NO_DISPONIBLE");
    const diagnostic = {...diagnosticAt(stage),...(failure.diagnostic ?? {})};
    console.error("F6_IA_PROCESSING_ERROR", JSON.stringify({code,...diagnostic}));
    return respond(origin,{code,diagnostic},failure.status ?? 503);
  }
});
