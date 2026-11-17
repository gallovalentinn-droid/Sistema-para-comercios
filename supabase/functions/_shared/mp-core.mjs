// Shared by Deno Edge and Node tests. No Node dependencies or local storage.
const encoder = new TextEncoder();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(['accounts','oauth-start','primary','disconnect','positions','set-position','transfer-coverage','income-history','sale-receipts','receipts','claim','manual','qr-create','qr-status','qr-cancel']);
const OWNER = new Set(['oauth-start','primary','disconnect','positions','set-position','transfer-coverage']);
const ORIGINS = new Set(['https://micomercio.ar','https://www.micomercio.ar']);
export function fail(code, status = 409) { const e = new Error(code); e.status = status; throw e; }
function b64(bytes) { return btoa(String.fromCharCode(...bytes)); }
function unb64(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
export function random() { return b64(crypto.getRandomValues(new Uint8Array(32))).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''); }
export async function hash(s) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(s)))].map(n=>n.toString(16).padStart(2,'0')).join(''); }
export async function challenge(s) { return b64(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(s)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''); }
export async function encrypt(value, key, context) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await crypto.subtle.importKey('raw',key,'AES-GCM',false,['encrypt']);
  const data = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(context)},k,encoder.encode(JSON.stringify(value)));
  return 'v1.'+b64(iv)+'.'+b64(new Uint8Array(data));
}
export async function decrypt(value, key, context) {
  const [version,iv,data,...rest] = String(value).split('.');
  if(version!=='v1'||rest.length) fail('CONEXION_NO_DISPONIBLE');
  const k = await crypto.subtle.importKey('raw',key,'AES-GCM',false,['decrypt']);
  const bytes = await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv),additionalData:encoder.encode(context)},k,unb64(data));
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function configuration(env) {
  let key = null;
  try { const raw=env.MP_TOKEN_ENCRYPTION_KEY||''; if(/^[A-Za-z0-9+/]{43}=$/.test(raw)) {const k=unb64(raw);if(k.length===32)key=k;} } catch { /* configured:false */ }
  const url = env.SUPABASE_URL || '';
  const c = {url,anonKey:env.SUPABASE_ANON_KEY||'',serviceKey:env.SUPABASE_SERVICE_ROLE_KEY||'',clientId:env.MP_CLIENT_ID||'',clientSecret:env.MP_CLIENT_SECRET||'',key,transferVerification:env.MP_TRANSFER_VERIFICATION_ENABLED==='true',newPayments:env.MP_NEW_PAYMENTS_ENABLED!=='false',redirectUri:url+'/functions/v1/mercadopago-callback'};
  c.configured = !!(url.startsWith('https://')&&c.anonKey&&c.serviceKey&&/^[0-9]{1,30}$/.test(c.clientId)&&c.clientSecret&&key);
  return c;
}
export function cents(value) {
  const s=String(value??''); if(!/^\d{1,12}(\.\d{1,2})?$/.test(s)) fail('MONTO_INVALIDO');
  const [whole,frac='']=s.split('.'),n=Number(whole)*100+Number(frac.padEnd(2,'0'));
  if(!Number.isSafeInteger(n)||n<=0) fail('MONTO_INVALIDO'); return n;
}
const decimal = n => (n/100).toFixed(2);
export function authorize(ctx, owner=false) {
  if(!ctx?.commerceId||!ctx?.userId||!['duenio','admin','empleado'].includes(ctx.role)) fail('PERMISO_DENEGADO',403);
  if(owner&&ctx.role!=='duenio') fail('PERMISO_DUENIO_REQUERIDO',403);
  const p=ctx.permissions||[];
  if(ctx.role==='empleado'&&!(Array.isArray(p)?p.includes('ventas_registrar'):p.ventas_registrar===true)) fail('PERMISO_VENDER_REQUERIDO',403);
}
export async function authenticate(config,token,body,fetcher=fetch) {
  if(!token||token.length>8192||!UUID.test(body?.commerceId||'')||!UUID.test(body?.deviceId||'')) fail('SESION_INVALIDA',401);
  const headers={apikey:config.anonKey,authorization:'Bearer '+token,'content-type':'application/json'};
  const get=async(path,options={})=>{let r;try {r=await fetcher(config.url+path,{...options,headers,signal:AbortSignal.timeout(10000)});}catch {fail('CONEXION_NO_DISPONIBLE',503);}if(!r.ok)fail('SESION_INVALIDA',401);return r.json();};
  // Auth getUser endpoint validates the supplied JWT on the server, not decode-only.
  const user=await get('/auth/v1/user');if(!UUID.test(user.id||''))fail('SESION_INVALIDA',401);
  const query=new URLSearchParams({select:'comercio_id,user_id,rol,permisos,activo',comercio_id:'eq.'+body.commerceId,user_id:'eq.'+user.id,activo:'eq.true'});
  const rows=await get('/rest/v1/comercio_miembros?'+query),member=rows?.[0];
  if(!member||member.comercio_id!==body.commerceId||member.user_id!==user.id||member.activo!==true)fail('PERMISO_DENEGADO',403);
  const authority=await get('/rest/v1/rpc/f5_chequear_autoridad',{method:'POST',body:JSON.stringify({p_comercio_id:body.commerceId,p_device_id:body.deviceId})});
  if(authority.writable!==true||!authority.membership||authority.membership.rol!==member.rol)fail('AUTORIDAD_NO_VIGENTE',403);
  const ctx={commerceId:member.comercio_id,userId:user.id,deviceId:body.deviceId,role:authority.membership.rol,permissions:authority.membership.permisos_efectivos||[]};
  authorize(ctx);return ctx;
}
export function validatePayment(p,account,amount) {
  const transfer=p?.operation_type==='money_transfer'||(p?.operation_type==='account_fund'&&p.payment_type_id==='bank_transfer'&&p.payment_method_id==='cvu');
  if(!/^\d{1,30}$/.test(String(p?.id||''))||p.status!=='approved'||p.status_detail!=='accredited'||String(p.collector_id)!==account.providerId||p.currency_id!=='ARS'||!transfer)fail('INGRESO_NO_VALIDO');
  if(p.transaction_amount_refunded!=null&&(!/^0(?:\.0{1,2})?$/.test(String(p.transaction_amount_refunded))))fail('INGRESO_NO_VALIDO');
  const n=cents(p.transaction_amount);if(amount!==undefined&&n!==amount)fail('INGRESO_MONTO_DISTINTO');
}
// Diagnóstico de cobertura de transferencias: solo conteos por categorías del proveedor.
// Nunca incluye importes, fechas, nombres ni identificadores. Cada campo se clasifica contra
// un catálogo cerrado de categorías conocidas del proveedor: cualquier otro texto, aunque
// tenga forma de categoría, se informa como "otro" y nunca se copia a la salida ni al registro.
const COVERAGE_CATALOG = {
  operation:new Set(['regular_payment','money_transfer','recurring_payment','account_fund','payment_addition','cellphone_recharge','pos_payment','money_exchange','investment']),
  type:new Set(['account_money','bank_transfer','ticket','atm','credit_card','debit_card','prepaid_card','digital_currency','digital_wallet','voucher_card','crypto_transfer']),
  method:new Set(['account_money','cvu','debin_transfer','bank_transfer','interop_transfer','consumer_credits','visa','master','amex','naranja','cabal','maestro','debvisa','debmaster','debcabal','pagofacil','rapipago']),
  status:new Set(['pending','approved','authorized','in_process','in_mediation','rejected','cancelled','refunded','charged_back']),
  detail:new Set(['accredited','pending_contingency','pending_review_manual','pending_waiting_payment','pending_waiting_transfer','partially_refunded','refunded','by_collector','by_payer','expired']),
  currency:new Set(['ARS','USD']),
};
const coverageLabel = (field,v) => v==null?'sin_dato':typeof v==='string'&&COVERAGE_CATALOG[field].has(v)?v:'otro';
export const COVERAGE_MAX_MINUTES = 4320;
// available: total informado por el proveedor para la ventana. Si supera lo analizado, el
// resultado está recortado y una ausencia no permite concluir nada.
export function transferCoverage(rows,account,{minutes=COVERAGE_MAX_MINUTES,available}={}) {
  const groups=new Map();let total=0;
  for(const p of Array.isArray(rows)?rows.slice(0,500):[]){
    total++;let accepted=true;try{validatePayment(p,account);}catch{accepted=false;}
    const key=JSON.stringify({operation:coverageLabel('operation',p?.operation_type),type:coverageLabel('type',p?.payment_type_id),method:coverageLabel('method',p?.payment_method_id),status:coverageLabel('status',p?.status),detail:coverageLabel('detail',p?.status_detail),currency:coverageLabel('currency',p?.currency_id),received:String(p?.collector_id??'')===account.providerId,accepted});
    groups.set(key,(groups.get(key)||0)+1);
  }
  const list=[...groups].map(([key,count])=>({...JSON.parse(key),count})).sort((a,b)=>b.count-a.count);
  const reported=Number.isSafeInteger(available)&&available>=0?available:total;
  return {minutes,total,truncated:reported>total||(Array.isArray(rows)&&rows.length>500),groups:list.slice(0,40),otherGroups:Math.max(0,list.length-40)};
}
export function validateOrder(o,account,a) {
  if(!/^ORD[A-Za-z0-9]{26}$/.test(String(o?.id||''))||o.type!=='qr'||String(o.user_id)!==account.providerId||(o.currency||o.currency_id)!=='ARS'||o.external_reference!==a.reference)fail('ORDEN_INVALIDA');
  if(cents(o.total_amount)!==a.amountCents)fail('ORDEN_MONTO_DISTINTO');
  if(!['created','processed','canceled','expired','action_required','failed'].includes(o.status))fail('ORDEN_INVALIDA');
}
// Diagnóstico seguro: solo el nombre de la condición que falló, nunca valores de la respuesta.
const UNACCREDITED_REASONS = new Set(['estado_orden','detalle_orden','cantidad_pagos','id_pago','estado_pago','detalle_pago','importe_pago']);
function unaccredited(reason) { const e=new Error('ORDEN_SIN_ACREDITAR'); e.status=409; e.reason=reason; throw e; }
// Mercado Pago documenta la orden pagada como processed/processed en su tabla de estados
// y como processed/accredited en el ejemplo de la notificación order.processed. Se aceptan
// ambas; partially_refunded y refunded siguen rechazadas. La acreditación se decide en la
// transacción: única, processed/accredited y por el importe congelado del intento.
const ORDER_PAID_DETAILS = new Set(['processed','accredited']);
export function accreditedOrderPayment(o,account,a) {
  validateOrder(o,account,a);const payments=o.transactions?.payments;
  if(o.status!=='processed')unaccredited('estado_orden');
  if(!ORDER_PAID_DETAILS.has(o.status_detail))unaccredited('detalle_orden');
  if(!Array.isArray(payments)||payments.length!==1)unaccredited('cantidad_pagos');
  const p=payments[0];
  if(!p?.id)unaccredited('id_pago');
  if(p.status!=='processed')unaccredited('estado_pago');
  if(p.status_detail!=='accredited')unaccredited('detalle_pago');
  let amount=null;try{amount=cents(p.amount);}catch{}
  if(amount!==a.amountCents)unaccredited('importe_pago');
  return String(p.id);
}
export class Provider {
  constructor(config,fetcher=fetch){this.config=config;this.fetcher=fetcher;}
  async request(path,c,options={}) {
    const {definitiveCreation,...fetchOptions}=options;
    let r;try {r=await this.fetcher('https://api.mercadopago.com'+path,{...fetchOptions,headers:{'content-type':'application/json',...(c?{authorization:'Bearer '+c.access_token}:{}),...options.headers},signal:AbortSignal.timeout(15000)});}catch {fail('MERCADO_PAGO_NO_DISPONIBLE',503);}
    if(!r.ok){
      const error=new Error(r.status===401?'RECONECTAR_CUENTA':r.status===429?'MERCADO_PAGO_OCUPADO':'MERCADO_PAGO_NO_DISPONIBLE');error.status=r.status===401?409:503;
      if(definitiveCreation&&[400,404].includes(r.status)){
        // Only documented, unambiguous validation failures of POST Orders.
        const allowed=new Set(['pos_not_found','unsupported_site','unsupported_properties','bad_request','property_value','property_type','required_properties','minimum_properties','empty_required_header']);
        let body;try{body=await r.json();}catch{/* unknown -> ambiguous */}
        const codes=Array.isArray(body?.errors)?body.errors.map(e=>e?.code):[body?.code||body?.error];
        if(codes.length>0&&codes.length<=10&&codes.every(code=>allowed.has(code))&&(r.status===400||codes.every(code=>code==='pos_not_found')))error.definitiveNoOrder=true;
      }
      throw error;
    }
    try{return r.status===204?{}:await r.json();}catch {fail('MERCADO_PAGO_NO_DISPONIBLE',503);}
  }
  token(body){return this.request('/oauth/token',null,{method:'POST',body:JSON.stringify({client_id:this.config.clientId,client_secret:this.config.clientSecret,...body})});}
  exchange(code,verifier){return this.token({grant_type:'authorization_code',code,code_verifier:verifier,redirect_uri:this.config.redirectUri});}
  refresh(c){return this.token({grant_type:'refresh_token',refresh_token:c.refresh_token});}
  identity(c){return this.request('/users/me',c);}
  async positions(c){const rows=[];for(let offset=0;offset<1020;offset+=30){const r=await this.request('/v2/pos?limit=30&offset='+offset,c);if(!Array.isArray(r.data))fail('MERCADO_PAGO_NO_DISPONIBLE',503);rows.push(...r.data);if(offset+30>=(r.paging?.total||0))return rows;}fail('MERCADO_PAGO_NO_DISPONIBLE',503);}
  preparePosition(c,id,externalId,key){if(!/^\d{1,30}$/.test(String(id)))fail('CAJA_NO_DISPONIBLE');return this.request('/v2/pos/'+id,c,{method:'PATCH',headers:{'X-Idempotency-Key':key},body:JSON.stringify({external_id:externalId})});}
  // Sin filtros (searchAll) solo se usa para el diagnóstico de cobertura, que nunca muestra ni reclama ingresos.
  // Es estricta: una respuesta sin arreglo de resultados o sin total válido es un error, nunca
  // "cero movimientos". Devuelve también el total informado para detectar recortes.
  async searchAll(c,minutes=4320){let available=0;const rows=await this.search(c,{},{windowMs:minutes*60000,onPage:r=>{if(!Array.isArray(r?.results)||!Number.isSafeInteger(r.paging?.total)||r.paging.total<0)fail('MERCADO_PAGO_NO_DISPONIBLE',503);available=r.paging.total;}});return {rows,available};}
  async searchTransfers(c){let available=0;const rows=await this.search(c,{status:'approved'},{onPage:r=>{if(!Array.isArray(r?.results)||!Number.isSafeInteger(r.paging?.total)||r.paging.total<0)fail('MERCADO_PAGO_NO_DISPONIBLE',503);available=r.paging.total;}});return {rows,available};}
  async search(c,filters={operation_type:'money_transfer',status:'approved'},{windowMs=3*86400000,onPage}={}){const end=new Date(),begin=new Date(end-windowMs),rows=[];for(let offset=0;offset<500;offset+=50){const q=new URLSearchParams({sort:'date_created',criteria:'desc',range:'date_created',begin_date:begin.toISOString(),end_date:end.toISOString(),...filters,limit:'50',offset:String(offset)});const r=await this.request('/v1/payments/search?'+q,c);onPage?.(r);rows.push(...(r.results||[]));if(offset+50>=(r.paging?.total||0))break;}return rows;}
  payment(c,id){if(!/^\d{1,30}$/.test(id))fail('INGRESO_NO_VALIDO');return this.request('/v1/payments/'+id,c);}
  create(c,body,key){return this.request('/v1/orders',c,{method:'POST',headers:{'X-Idempotency-Key':key},body:JSON.stringify(body),definitiveCreation:true});}
  order(c,id){return this.request('/v1/orders/'+encodeURIComponent(id),c);}
  cancel(c,id,key){return this.request('/v1/orders/'+encodeURIComponent(id)+'/cancel',c,{method:'POST',headers:{'X-Idempotency-Key':key},body:'{}'});}
}
const publicAccount = a => ({id:a.id,alias:a.alias,primary:!!a.primary,posId:a.posId||'',active:!!a.active});
function saleInput(input) {
  if(!/^[A-Za-z0-9_-]{1,60}$/.test(input.saleId||'')||typeof input.fingerprint!=='string'||input.fingerprint.length<1||input.fingerprint.length>128)fail('VENTA_INVALIDA',400);
  if(!UUID.test(input.accountId||''))fail('CUENTA_NO_DISPONIBLE',400);
  return {saleId:input.saleId,fingerprint:input.fingerprint,accountId:input.accountId,amountCents:cents(input.amount)};
}
function credentialsPayload(c,providerId) {
  if(typeof c?.access_token!=='string'||!c.access_token||typeof c.refresh_token!=='string'||!c.refresh_token||String(c.user_id)!==providerId||!Number.isFinite(c.expires_in)||c.expires_in<1)fail('AUTORIZACION_RECHAZADA');
  return {access_token:c.access_token,refresh_token:c.refresh_token,user_id:providerId,expiresAt:Date.now()+c.expires_in*1000};
}
export class Service {
  constructor({store,provider,config}){this.store=store;this.provider=provider;this.config=config;}
  call(ctx,op,args={}){return this.store.call(op,{commerceId:ctx.commerceId,actor:ctx.userId,...args});}
  async account(ctx,id){if(!UUID.test(id||''))fail('CUENTA_NO_DISPONIBLE');const a=await this.call(ctx,'account',{accountId:id});if(!a?.active)fail('CUENTA_NO_DISPONIBLE');return a;}
  async credentials(ctx,account) {
    // Every worker must acquire a durable account refresh CAS before using a refresh token.
    let c;try {c=await decrypt(account.credentials,this.config.key,'account:'+account.id);}catch {fail('RECONECTAR_CUENTA');}
    if(account.refreshState!=='idle')fail('RECONECTAR_CUENTA');
    if(c.expiresAt>Date.now()+60000)return c;
    const owner=crypto.randomUUID();const acquired=await this.call(ctx,'refresh-begin',{accountId:account.id,version:account.version,owner});
    if(!acquired)fail('CUENTA_OCUPADA');
    try {
      const next=credentialsPayload(await this.provider.refresh(c),account.providerId);
      const encrypted=await encrypt(next,this.config.key,'account:'+account.id);
      if(!await this.call(ctx,'refresh-finish',{accountId:account.id,owner,credentials:encrypted}))fail('RECONECTAR_CUENTA');
      return next;
    } catch {
      // A lost response may have consumed a rotating refresh token. Never retry it.
      await this.call(ctx,'refresh-fail',{accountId:account.id,owner}).catch(()=>{});fail('RECONECTAR_CUENTA');
    }
  }
  async handle(ctx,input,token) {
    authorize(ctx,OWNER.has(input.action));const action=input.action;
    if(!ACTIONS.has(action))fail('ACCION_INVALIDA',400);
    if(action==='accounts')return {configured:this.config.configured,capabilities:{transferVerification:!!(this.config.configured&&this.config.transferVerification),newPayments:!!(this.config.configured&&this.config.newPayments!==false)},accounts:(await this.call(ctx,'accounts')).map(publicAccount)};
    if(action==='oauth-start'){
      if(!this.config.configured)fail('APLICACION_NO_CONFIGURADA');
      const alias=String(input.alias||'').trim();if(!alias||alias.length>80)fail('NOMBRE_CUENTA_INVALIDO');
      const state=random(),verifier=random(),stateHash=await hash(state);
      const encrypted=await encrypt({token,body:{commerceId:ctx.commerceId,deviceId:ctx.deviceId},userId:ctx.userId,alias,verifier},this.config.key,'oauth:'+stateHash);
      await this.call(ctx,'state-save',{stateHash,encrypted});
      const q=new URLSearchParams({client_id:this.config.clientId,response_type:'code',platform_id:'mp',state,redirect_uri:this.config.redirectUri,code_challenge:await challenge(verifier),code_challenge_method:'S256'});
      return {url:'https://auth.mercadopago.com/authorization?'+q};
    }
    if(action==='sale-receipts'){
      if(!Array.isArray(input.saleIds)||input.saleIds.length>100||input.saleIds.some(s=>typeof s!=='string'||!/^[A-Za-z0-9_-]{1,60}$/.test(s)))fail('VENTA_INVALIDA');
      return {receipts:await this.call(ctx,'receipts',{saleIds:input.saleIds})};
    }
    if(!this.config.configured)fail('APLICACION_NO_CONFIGURADA');
    // Auth/membership/F5 were checked above. Recover only an exact durable
    // terminal snapshot atomically, before requiring a live provider account.
    // This path neither reads credentials nor creates a new attempt/payment.
    if(['manual','qr-status','qr-cancel'].includes(action)){
      const recovered=await this.call(ctx,'sale-recover',{...saleInput(input),action});
      if(recovered)return recovered;
    }
    const account=await this.account(ctx,input.accountId);
    if(action==='primary'||action==='disconnect'){await this.call(ctx,action,{accountId:account.id});return {ok:true};}
    if(action==='positions'||action==='set-position'){
      const c=await this.credentials(ctx,account),rows=await this.provider.positions(c);
      const eligible=rows.filter(p=>p.status!=='inactive'&&(p.user_id==null||String(p.user_id)===account.providerId));
      const selection=p=>p.external_id?(typeof p.external_id==='string'&&p.external_id.length<=100?p.external_id:null):/^\d{1,30}$/.test(String(p.id))?'@pos:'+p.id:null;
      const positions=eligible.map(p=>({id:selection(p),name:String(p.name||p.external_id||'Caja '+p.id).slice(0,100)})).filter(p=>p.id);
      if(action==='positions')return {positions};
      // A lost PATCH response may have prepared this same POS already. Accept
      // its original numeric selection without replacing the now-existing ID.
      const numericSelection=typeof input.posId==='string'&&/^@pos:\d{1,30}$/.test(input.posId)?input.posId.slice(5):null;
      const selected=eligible.find(p=>selection(p)&&(selection(p)===input.posId||(numericSelection&&String(p.id)===numericSelection)));if(!selected)fail('CAJA_NO_DISPONIBLE');
      let posId=selected.external_id;
      if(!posId){
        // Only after owner selection. Stable per provider POS, safe to retry;
        // PATCH leaves its name, store and QR configuration untouched.
        const digest=await hash('micomercio-pos:'+account.providerId+':'+selected.id),externalId='MC'+digest.slice(0,32);
        await this.provider.preparePosition(c,selected.id,externalId,digest);
        const confirmed=(await this.provider.positions(c)).find(p=>String(p.id)===String(selected.id)&&p.status!=='inactive'&&(p.user_id==null||String(p.user_id)===account.providerId));
        if(confirmed?.external_id!==externalId)fail('CAJA_NO_DISPONIBLE');
        posId=externalId;
      }
      await this.call(ctx,'position',{accountId:account.id,posId});return {ok:true};
    }
    if(action==='transfer-coverage'){
      // Solo dueño. Consulta movimientos sin escrituras de negocio (ni ventas, ni recibos, ni
      // reclamos); si las credenciales vencieron, puede renovarlas como cualquier otra acción.
      // No depende de transferVerification: sirve para decidir si habilitarla.
      // minutes acota la ventana para poder atribuir una transferencia recién hecha.
      const minutes=input.minutes===undefined?COVERAGE_MAX_MINUTES:input.minutes;
      if(!Number.isSafeInteger(minutes)||minutes<1||minutes>COVERAGE_MAX_MINUTES)fail('DATOS_INVALIDOS',400);
      const {rows,available}=await this.provider.searchAll(await this.credentials(ctx,account),minutes);
      const coverage=transferCoverage(rows,account,{minutes,available});
      console.info(JSON.stringify({event:'MP_PUBLIC_COVERAGE',...coverage}));
      return {coverage};
    }
    if(action==='receipts'||action==='income-history'){
      if(action==='receipts'&&!this.config.transferVerification)fail('TRANSFERENCIAS_NO_HABILITADAS');
      const amount=action==='receipts'?cents(input.amount):undefined;
      const {rows,available}=await this.provider.searchTransfers(await this.credentials(ctx,account)),receipts=[];
      const valid=rows.filter(p=>{try{validatePayment(p,account);return true;}catch{return false;}}),visible=valid.slice(0,100);
      // Bounded parallel reads avoid a serial RPC for every row. Fail the whole list if
      // any use lookup fails; never guess that a transfer is available.
      for(let offset=0;offset<visible.length;offset+=10)receipts.push(...await Promise.all(visible.slice(offset,offset+10).map(async p=>{
        const used=await this.call(ctx,'used',{accountId:account.id,paymentId:String(p.id)});
        return {id:String(p.id),amountCents:cents(p.transaction_amount),matches:amount!==undefined&&cents(p.transaction_amount)===amount,date:p.date_approved||p.date_created,payer:[p.payer?.first_name,p.payer?.last_name].filter(Boolean).join(' ').slice(0,100),used:!!used};
      })));
      return {receipts,truncated:available>rows.length||valid.length>visible.length,days:3};
    }
    const sale=saleInput(input),owner=crypto.randomUUID();
    const existing=await this.call(ctx,'attempt',{saleId:sale.saleId});
    if(action==='qr-status'&&!existing)fail('COBRO_NO_EXISTE');
    if(action==='qr-create'&&this.config.newPayments===false&&(!existing||existing.status==='prepared'))fail('COBROS_NO_HABILITADOS');
    if(action==='qr-create'&&(!existing||existing.status==='prepared')&&!existing?.posId&&!account.posId)fail('CONFIGURAR_CAJA_QR');
    if(action==='claim'&&(!this.config.transferVerification||this.config.newPayments===false)){
      if(existing){
        if(existing.accountId!==sale.accountId||existing.amountCents!==sale.amountCents||existing.fingerprint!==sale.fingerprint)fail('TICKET_CAMBIO');
        const rows=await this.call(ctx,'receipts',{saleIds:[sale.saleId]});if(rows.length)return {receipt:rows[0]};
      }
      fail(this.config.newPayments===false?'COBROS_NO_HABILITADOS':'TRANSFERENCIAS_NO_HABILITADAS');
    }
    let a=await this.call(ctx,'sale-begin',{...sale,owner,posId:account.posId||'',cancelIfMissing:action==='qr-cancel'});
    if(!a)fail('COBRO_OCUPADO');
    try {
      const previous=await this.call(ctx,'receipts',{saleIds:[sale.saleId]});
      if(previous.length)return {attempt:a,receipt:previous[0]};
      if(action==='manual'){
        if(a.orderId&&!['canceled','expired'].includes(a.status)||!['prepared','canceled','expired','manual'].includes(a.status))fail('QR_PENDIENTE');
        await this.call(ctx,'sale-update',{saleId:a.saleId,owner,patch:{status:'manual'}});return {ok:true};
      }
      if(action==='claim'){
        if(a.status==='manual')fail('COBRO_FINALIZADO_MANUAL');
        if(a.orderId||a.status==='creating')fail('QR_PENDIENTE');
        const p=await this.provider.payment(await this.credentials(ctx,account),String(input.paymentId||''));
        validatePayment(p,account,a.amountCents);if(String(p.id)!==String(input.paymentId))fail('INGRESO_NO_VALIDO');
        return {receipt:await this.call(ctx,'claim',{saleId:a.saleId,owner,paymentId:String(p.id),kind:'transfer'})};
      }
      if(['canceled','expired','manual'].includes(a.status))return {attempt:a,receipt:null};
      if(!a.orderId&&['prepared','rejected'].includes(a.status)&&action==='qr-cancel'){
        a=await this.call(ctx,'sale-update',{saleId:a.saleId,owner,patch:{status:'canceled'}});return {attempt:a,receipt:null};
      }
      if(!a.orderId&&(['prepared','rejected'].includes(a.status)&&action==='qr-status'||a.status==='rejected'))return {attempt:a,receipt:null};
      const c=await this.credentials(ctx,account);
      if(!a.orderId){
        if(!a.posId)fail('CONFIGURAR_CAJA_QR');
        // Provider idempotency retention is 24h. An unknown older creation needs reconciliation.
        if(Date.now()-Date.parse(a.createdAt)>23*3600000)fail('QR_REQUIERE_CONCILIACION');
        const firstCreation=a.status==='prepared';
        a=await this.call(ctx,'sale-update',{saleId:a.saleId,owner,patch:{status:'creating'}});
        const body={type:'qr',total_amount:decimal(a.amountCents),description:'Venta MiComercio',external_reference:a.reference,expiration_time:'PT15M',config:{qr:{external_pos_id:a.posId,mode:'dynamic'}},transactions:{payments:[{amount:decimal(a.amountCents)}]}};
        let order;
        try{order=await this.provider.create(c,body,a.id);}catch(error){
          if(firstCreation&&error.definitiveNoOrder)await this.call(ctx,'sale-update',{saleId:a.saleId,owner,patch:{status:'rejected'}});
          throw error;
        }
        validateOrder(order,account,a);
        a=await this.call(ctx,'sale-update',{saleId:a.saleId,owner,patch:{orderId:String(order.id),qrData:typeof order.type_response?.qr_data==='string'?order.type_response.qr_data.slice(0,16384):null,status:order.status}});
      }
      if(action==='qr-create')return {attempt:a,receipt:null};
      let order=await this.provider.order(c,a.orderId);validateOrder(order,account,a);if(order.id!==a.orderId)fail('ORDEN_INVALIDA');
      if(action==='qr-cancel'&&order.status==='created'){
        await this.provider.cancel(c,a.orderId,a.id+'-cancel');order=await this.provider.order(c,a.orderId);validateOrder(order,account,a);if(order.id!==a.orderId)fail('ORDEN_INVALIDA');
      }
      if(order.status==='processed'){
        const paymentId=accreditedOrderPayment(order,account,a);
        const receipt=await this.call(ctx,'claim',{saleId:a.saleId,owner,paymentId,kind:'qr'});return {attempt:{...a,status:'verified'},receipt};
      }
      a=await this.call(ctx,'sale-update',{saleId:a.saleId,owner,patch:{status:order.status}});
      return {attempt:a,receipt:null};
    } finally {await this.call(ctx,'sale-release',{saleId:sale.saleId,owner}).catch(()=>{});}
  }
}
const ERROR_CODES = new Set(['SESION_INVALIDA','PERMISO_DENEGADO','PERMISO_DUENIO_REQUERIDO','PERMISO_VENDER_REQUERIDO','AUTORIDAD_NO_VIGENTE','APLICACION_NO_CONFIGURADA','ACCION_INVALIDA','DATOS_INVALIDOS','ORIGEN_NO_PERMITIDO','METODO_NO_PERMITIDO','NOMBRE_CUENTA_INVALIDO','CUENTA_NO_DISPONIBLE','CUENTA_OTRO_COMERCIO','CUENTA_OCUPADA','COBRO_OCUPADO','COBRO_NO_EXISTE','COBROS_NO_HABILITADOS','COBRO_PENDIENTE','QR_PENDIENTE','QR_REQUIERE_CONCILIACION','TICKET_CAMBIO','VENTA_INVALIDA','MONTO_INVALIDO','CAJA_NO_DISPONIBLE','CONFIGURAR_CAJA_QR','TRANSFERENCIAS_NO_HABILITADAS','TRANSFERENCIA_UTILIZADA','VENTA_YA_VERIFICADA','COBRO_FINALIZADO_MANUAL','INGRESO_NO_VALIDO','INGRESO_MONTO_DISTINTO','ORDEN_INVALIDA','ORDEN_MONTO_DISTINTO','ORDEN_SIN_ACREDITAR','RECONECTAR_CUENTA','MERCADO_PAGO_OCUPADO','MERCADO_PAGO_NO_DISPONIBLE','CONEXION_NO_DISPONIBLE','AUTORIZACION_RECHAZADA','AUTORIZACION_VENCIDA']);
function response(body,status=200,origin='') {
  const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','vary':'Origin'};
  if(ORIGINS.has(origin))Object.assign(headers,{'access-control-allow-origin':origin,'access-control-allow-headers':'authorization, apikey, content-type, x-client-info','access-control-allow-methods':'POST, OPTIONS'});
  return new Response(status===204?null:JSON.stringify(body),{status,headers});
}
async function readBody(request) {
  if(!request.headers.get('content-type')?.startsWith('application/json'))fail('DATOS_INVALIDOS',400);
  const reader=request.body?.getReader();if(!reader)fail('DATOS_INVALIDOS',400);let size=0;const chunks=[];
  const timer=setTimeout(()=>reader.cancel().catch(()=>{}),10000);
  try {for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();fail('DATOS_INVALIDOS',413);}chunks.push(value);}const all=new Uint8Array(size);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length;}const body=JSON.parse(new TextDecoder().decode(all));if(!body||Array.isArray(body)||typeof body!=='object')fail('DATOS_INVALIDOS',400);return body;}catch(e){if(e.status)throw e;fail('DATOS_INVALIDOS',400);}finally{clearTimeout(timer);}
}
export function createApiHandler({config,store,provider=new Provider(config),fetcher=fetch}) {
  const service=new Service({config,store,provider});
  return async request=>{const origin=request.headers.get('origin')||'';let action='invalid';try {
    if(origin&&!ORIGINS.has(origin))fail('ORIGEN_NO_PERMITIDO',403);
    if(request.method==='OPTIONS')return response(null,204,origin);
    if(request.method!=='POST')fail('METODO_NO_PERMITIDO',405);
    const body=await readBody(request);if(!ACTIONS.has(body.action))fail('ACCION_INVALIDA',400);action=body.action;
    const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
    const ctx=await authenticate(config,token,body,fetcher);authorize(ctx,OWNER.has(body.action));
    return response(await service.handle(ctx,body,token),200,origin);
  }catch(e){const code=ERROR_CODES.has(e.message)?e.message:'CONEXION_NO_DISPONIBLE';const reason=code==='ORDEN_SIN_ACREDITAR'&&UNACCREDITED_REASONS.has(e.reason)?e.reason:undefined;console.warn(JSON.stringify({event:'MP_PUBLIC_ERROR',action,code,...(reason?{reason}:{})}));return response({code},e.status||409,origin);}};
}
export function createCallbackHandler({config,store,provider=new Provider(config),fetcher=fetch}) {
  return async request=>{let status='error';try {
    if(request.method!=='GET'||!config.configured)fail('AUTORIZACION_RECHAZADA');
    const url=new URL(request.url),state=url.searchParams.get('state')||'';
    if(!/^[A-Za-z0-9_-]{43}$/.test(state))fail('AUTORIZACION_RECHAZADA');
    const stateHash=await hash(state);
    // The sole pre-auth privileged operation is atomic consumption of an opaque, hashed challenge.
    const saved=await store.call('state-consume',{stateHash});if(!saved)fail('AUTORIZACION_VENCIDA');
    const data=await decrypt(saved.encrypted,config.key,'oauth:'+stateHash);
    if(url.searchParams.has('error')||!url.searchParams.get('code')||url.searchParams.get('code').length>4096)fail('AUTORIZACION_RECHAZADA');
    const ctx=await authenticate(config,data.token,data.body,fetcher);authorize(ctx,true);
    if(ctx.userId!==data.userId)fail('AUTORIZACION_RECHAZADA');
    const raw=await provider.exchange(url.searchParams.get('code'),data.verifier),identity=await provider.identity(raw),providerId=String(identity?.id||'');
    if(!/^\d{1,30}$/.test(providerId))fail('AUTORIZACION_RECHAZADA');
    const credentials=credentialsPayload(raw,providerId);
    // Recheck after provider I/O as well: revocation during authorization must not connect an account.
    const fresh=await authenticate(config,data.token,data.body,fetcher);authorize(fresh,true);if(fresh.userId!==ctx.userId)fail('AUTORIZACION_RECHAZADA');
    const id=crypto.randomUUID(),encrypted=await encrypt(credentials,config.key,'account:'+id);
    // RPC returns existing id before encryption on reconnect; bind ciphertext to canonical id.
    const existing=await store.call('provider-account',{commerceId:ctx.commerceId,actor:ctx.userId,providerId});
    const accountId=existing?.id||id;
    await store.call('account-save',{commerceId:ctx.commerceId,actor:ctx.userId,providerId,id:accountId,alias:data.alias,credentials:accountId===id?encrypted:await encrypt(credentials,config.key,'account:'+accountId)});
    status='conectado';
  }catch { /* Only non-sensitive fixed result goes to the browser. */ }
  return new Response(null,{status:303,headers:{location:'https://micomercio.ar/beta/?mercadopago='+status,'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});};
}
