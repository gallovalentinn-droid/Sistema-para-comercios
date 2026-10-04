import {F6_INVOICE_MODEL, F6_INVOICE_PROVIDER_TIMEOUT_MS, buildGeminiInvoiceRequest,
  extractGeminiInvoice, extractGeminiUsage, geminiProviderDiagnostic, safeGeminiErrorMessage} from './f6-invoice-reader.mjs';
import {F6_OPENAI_INVOICE_MODEL, buildOpenAIInvoiceRequest, extractOpenAIInvoice, extractOpenAIUsage} from './f6-openai-invoice-reader.mjs';

function failure(code, status, diagnostic, transient = false) {
  return Object.assign(new Error(code), {code, status, diagnostic, transient});
}

function openaiDiagnostic(body, status, retryAfter) {
  let error;
  try { error = JSON.parse(body).error; } catch (_) {}
  const code = String(error?.code ?? ''), type = String(error?.type ?? '');
  const categories = {insufficient_quota:'BILLING_REQUIRED',credit_balance_exhausted:'BILLING_REQUIRED',
    invalid_api_key:'API_KEY_INVALID',permission_denied:'PERMISSION_DENIED',rate_limit_exceeded:'RATE_LIMIT'};
  const billing = [code,type].some(value => categories[value] === 'BILLING_REQUIRED');
  const known = [categories[code],categories[type]].filter(Boolean);
  const category = (billing ? 'BILLING_REQUIRED' : known.find(value => value !== 'RATE_LIMIT') ?? known[0]) ?? (status === 401 ? 'API_KEY_INVALID' : status === 403 ? 'PERMISSION_DENIED'
    : status >= 500 ? 'UNAVAILABLE' : status === 400 || status === 422 ? 'INVALID_ARGUMENT' : 'UNKNOWN');
  const diagnostic = {providerCategory:category,providerStatus:status};
  if (typeof retryAfter === 'string' && /^\d{1,6}$/.test(retryAfter)) {
    const seconds = Number(retryAfter);
    if (seconds > 0 && seconds <= 86400) diagnostic.retryAfterSeconds = seconds;
  }
  return diagnostic;
}

// Covers both headers and response body; abort alone cannot bound a stalled body.
export async function invoiceStep(promise, timeoutMs) {
  let timer;
  try { return await Promise.race([promise,new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(Object.assign(new Error('F6_STEP_TIMEOUT'),{name:'AbortError'})),Math.max(1,timeoutMs));
  })]); } finally { clearTimeout(timer); }
}

async function attempt({provider, apiKey, input, fetchImpl, timeoutMs, reviewMode}) {
  const openai = provider === 'openai', controller = new AbortController();
  let rejectTimeout;
  const expired = new Promise((_,reject)=>{rejectTimeout=reject});
  const timeout = setTimeout(() => {controller.abort();rejectTimeout(Object.assign(new Error('F6_PROVIDER_TIMEOUT'),{name:'AbortError'}));}, timeoutMs);
  let stage = 'provider';
  try {
    const response = await Promise.race([expired,fetchImpl(openai ? 'https://api.openai.com/v1/responses' : 'https://generativelanguage.googleapis.com/v1beta/interactions', {
      method:'POST', headers:openai ? {'content-type':'application/json',authorization:`Bearer ${apiKey}`} : {'content-type':'application/json','x-goog-api-key':apiKey},
      body:JSON.stringify(openai ? buildOpenAIInvoiceRequest(input) : buildGeminiInvoiceRequest({...input,reviewMode})), signal:controller.signal,
    })]);
    if (!response.ok) {
      const body = await Promise.race([expired,response.text()]);
      const diagnostic = openai ? openaiDiagnostic(body,response.status,response.headers.get('retry-after'))
        : geminiProviderDiagnostic(body,response.status,response.headers.get('retry-after'));
      const billing = diagnostic.providerCategory === 'BILLING_REQUIRED';
      const rate = response.status === 429;
      const rejected = [400,401,403,404,422].includes(response.status);
      throw failure(billing ? 'IA_SALDO_AGOTADO' : rate ? 'IA_AGOTADA_TEMPORALMENTE' : rejected ? 'IA_SOLICITUD_RECHAZADA' : 'IA_NO_DISPONIBLE',
        billing ? 503 : rate ? 429 : rejected ? 502 : 503, {stage,provider,...diagnostic},
        (reviewMode && openai && (billing || [401,403,404,429].includes(response.status))) ||
        (['UNAVAILABLE','INTERNAL','PROVIDER_TIMEOUT','RATE_LIMIT'].includes(diagnostic.providerCategory)
          && (response.status >= 500 || (rate && diagnostic.providerCategory === 'RATE_LIMIT'))));
    }
    stage = 'response';
    const body = await Promise.race([expired,response.json()]);
    stage = 'validation';
    const invoice = openai ? extractOpenAIInvoice(body,{reviewMode}) : extractGeminiInvoice(body,{reviewMode});
    const iaUsage = openai ? extractOpenAIUsage(body) : extractGeminiUsage(body);
    return {invoice,iaUsage,provider,model:openai ? F6_OPENAI_INVOICE_MODEL : F6_INVOICE_MODEL};
  } catch (error) {
    if (error?.code && error?.diagnostic) throw error;
    const timed = controller.signal.aborted || error?.name === 'AbortError';
    const code = timed ? 'IA_TIEMPO_AGOTADO' : stage === 'provider' ? 'IA_CONEXION_PROVEEDOR'
      : stage === 'response' ? 'IA_RESPUESTA_INVALIDA' : 'FACTURA_NO_RECONOCIDA';
    const reason = openai && /^F6_OPENAI_(OUTPUT_INVALID|INCOMPLETE|OUTPUT_MISSING|REFUSAL)$/.test(error?.message ?? '')
      ? error.message : safeGeminiErrorMessage(error);
    // Whitelist only validation metadata. Never propagate an arbitrary error or provider body.
    const d = error?.diagnostic ?? {};
    const safe = stage === 'validation' ? Object.fromEntries(['field','reason','row'].filter(k => d[k] !== undefined).map(k => [k,d[k]])) : {};
    throw failure(code,timed ? 504 : stage === 'validation' ? 422 : 503,{stage,provider,reason,...safe},timed || stage === 'provider' || (reviewMode && openai && reason === 'F6_OPENAI_INCOMPLETE'));
  } finally { clearTimeout(timeout); }
}

export async function readInvoiceWithProviders({input,openaiApiKey,geminiApiKey,fetchImpl = fetch,now = Date.now,
  totalTimeoutMs = F6_INVOICE_PROVIDER_TIMEOUT_MS,primaryTimeoutMs = 60_000,beforeAttempt}) {
  // HEIC/HEIF remain supported through Gemini; OpenAI accepts JPEG, PNG and WebP.
  const providers = [];
  if (openaiApiKey && ['image/jpeg','image/png','image/webp'].includes(input.mediaType)) providers.push({provider:'openai',apiKey:openaiApiKey});
  if (geminiApiKey) providers.push({provider:'gemini',apiKey:geminiApiKey});
  if (!providers.length) throw failure('IA_NO_CONFIGURADA',503,{stage:'configuration'});
  const started = now(), reviewMode=input.readerContract==='f6-invoice-review-v1';
  let fallbackDiagnostic;
  for (let index = 0; index < providers.length; index++) {
    if (beforeAttempt) await beforeAttempt({provider:providers[index].provider,attempt:index+1});
    const remaining = totalTimeoutMs - (now()-started);
    if (remaining <= 0) throw failure('IA_TIEMPO_AGOTADO',504,{stage:'provider',provider:providers[index].provider,fallbackUsed:index>0});
    try {
      const result = await attempt({...providers[index],input,fetchImpl,reviewMode,timeoutMs:index === 0 && providers.length>1 ? Math.min(primaryTimeoutMs,remaining) : remaining});
      return {...result,fallbackUsed:index>0,...(fallbackDiagnostic?{fallbackDiagnostic}:{})};
    } catch (error) {
      error.diagnostic.fallbackUsed = index>0;
      if (fallbackDiagnostic) error.diagnostic.fallbackDiagnostic=fallbackDiagnostic;
      if (!error.transient || index+1 === providers.length || now()-started >= totalTimeoutMs) throw error;
      fallbackDiagnostic={...error.diagnostic,code:error.code};
    }
  }
}
