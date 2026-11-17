'use strict';
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {validateTransferWindow}=require('../../supabase/functions/_shared/mp-core.mjs');
function fail(code){throw new Error(code);}
function cents(value){const s=String(value??'');if(!/^\d{1,12}(\.\d{1,2})?$/.test(s))fail('MONTO_INVALIDO');const [a,b='']=s.split('.'),n=Number(a)*100+Number(b.padEnd(2,'0'));if(!Number.isSafeInteger(n)||n<=0)fail('MONTO_INVALIDO');return n;}
const decimal=n=>(n/100).toFixed(2);
function encrypt(value,key){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([c.update(JSON.stringify(value)),c.final()]);return Buffer.concat([iv,c.getAuthTag(),data]).toString('base64');}
function decrypt(value,key){const b=Buffer.from(value,'base64'),d=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString());}
const parse=row=>row?JSON.parse(row.data):null;
class PaymentStore{
 constructor(file){this.db=new DatabaseSync(file);this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,commerce TEXT NOT NULL,provider TEXT NOT NULL UNIQUE,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY,commerce TEXT NOT NULL,sale TEXT NOT NULL,data TEXT NOT NULL,UNIQUE(commerce,sale));
 CREATE TABLE IF NOT EXISTS receipts(account TEXT NOT NULL,payment TEXT NOT NULL,commerce TEXT NOT NULL,sale TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(account,payment),UNIQUE(commerce,sale));
 CREATE TABLE IF NOT EXISTS oauth(state TEXT PRIMARY KEY,data TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,at TEXT NOT NULL,commerce TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,reference TEXT NOT NULL);`);}
 transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 accounts(commerce){return this.db.prepare('SELECT data FROM accounts WHERE commerce=? ORDER BY rowid').all(commerce).map(parse);}
 account(commerce,id){return parse(this.db.prepare('SELECT data FROM accounts WHERE commerce=? AND id=?').get(commerce,id));}
 saveAccount(data){return this.transaction(()=>{const previous=parse(this.db.prepare('SELECT data FROM accounts WHERE provider=?').get(data.providerId));if(previous&&previous.commerceId!==data.commerceId)fail('CUENTA_OTRO_COMERCIO');const list=this.accounts(data.commerceId),a={...previous,...data,id:previous?.id||crypto.randomUUID(),primary:previous?.active?previous.primary:!list.some(a=>a.active),active:true};this.db.prepare('INSERT INTO accounts VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(a.id,a.commerceId,a.providerId,JSON.stringify(a));return a;});}
 updateAccount(a){this.db.prepare('UPDATE accounts SET data=? WHERE commerce=? AND id=?').run(JSON.stringify(a),a.commerceId,a.id);return a;}
 primary(commerce,id){return this.transaction(()=>{const list=this.accounts(commerce);if(!list.some(a=>a.id===id&&a.active))fail('CUENTA_NO_DISPONIBLE');for(const a of list)this.updateAccount({...a,primary:a.id===id});});}
 disconnect(commerce,id){return this.transaction(()=>{const a=this.account(commerce,id);if(!a)fail('CUENTA_NO_DISPONIBLE');this.updateAccount({...a,active:false,primary:false,credentials:''});const list=this.accounts(commerce).filter(x=>x.active);if(list.length&&!list.some(x=>x.primary))this.updateAccount({...list[0],primary:true});});}
 attempt(commerce,sale){return parse(this.db.prepare('SELECT data FROM attempts WHERE commerce=? AND sale=?').get(commerce,sale));}
 prepare(ctx,input){return this.transaction(()=>{const previous=this.attempt(ctx.commerceId,input.saleId),amountCents=cents(input.amount);if(previous){if(previous.amountCents!==amountCents||previous.fingerprint!==input.fingerprint||previous.accountId!==input.accountId)fail('TICKET_CAMBIO');return previous;}if(!/^[a-zA-Z0-9_-]{1,60}$/.test(input.saleId||'')||typeof input.fingerprint!=='string'||input.fingerprint.length<1||input.fingerprint.length>128)fail('VENTA_INVALIDA');const a={id:crypto.randomUUID(),commerceId:ctx.commerceId,saleId:input.saleId,accountId:input.accountId,amountCents,fingerprint:input.fingerprint,actor:ctx.userId,status:'prepared',orderId:null,qrData:null,createdAt:new Date().toISOString()};this.db.prepare('INSERT INTO attempts VALUES(?,?,?,?)').run(a.id,a.commerceId,a.saleId,JSON.stringify(a));return a;});}
 updateAttempt(a){this.db.prepare('UPDATE attempts SET data=? WHERE id=? AND commerce=?').run(JSON.stringify(a),a.id,a.commerceId);return a;}
 receipt(commerce,sale){return parse(this.db.prepare('SELECT data FROM receipts WHERE commerce=? AND sale=?').get(commerce,sale));}
 receipts(commerce,sales){return sales.map(s=>this.receipt(commerce,s)).filter(Boolean);}
 used(account,payment){return parse(this.db.prepare('SELECT data FROM receipts WHERE account=? AND payment=?').get(account,String(payment)));}
 claim(ctx,a,paymentId,kind){return this.transaction(()=>{const used=this.used(a.accountId,paymentId),existing=this.receipt(ctx.commerceId,a.saleId);if(used){if(used.saleId!==a.saleId||used.commerceId!==ctx.commerceId)fail('TRANSFERENCIA_UTILIZADA');return used;}if(existing)fail('VENTA_YA_VERIFICADA');const r={commerceId:ctx.commerceId,saleId:a.saleId,accountId:a.accountId,paymentId:String(paymentId),amountCents:a.amountCents,kind,verifiedAt:new Date().toISOString(),actor:ctx.userId};this.db.prepare('INSERT INTO receipts VALUES(?,?,?,?,?)').run(a.accountId,String(paymentId),ctx.commerceId,a.saleId,JSON.stringify(r));this.audit(ctx,'verified',a.saleId);return r;});}
 audit(ctx,action,reference){this.db.prepare('INSERT INTO audit(at,commerce,actor,action,reference) VALUES(?,?,?,?,?)').run(new Date().toISOString(),ctx.commerceId,ctx.userId,action,reference);}
 saveState(state,data,expires){this.db.prepare('DELETE FROM oauth WHERE expires<?').run(Date.now());this.db.prepare('INSERT INTO oauth VALUES(?,?,?)').run(crypto.createHash('sha256').update(state).digest('hex'),JSON.stringify(data),expires);}
 consumeState(state){return this.transaction(()=>{const hash=crypto.createHash('sha256').update(state).digest('hex'),r=this.db.prepare('SELECT data,expires FROM oauth WHERE state=?').get(hash);this.db.prepare('DELETE FROM oauth WHERE state=?').run(hash);return r&&r.expires>Date.now()?parse(r):null;});}
 close(){this.db.close();}
}
function authorize(ctx,owner=false){if(!ctx?.commerceId||!ctx?.userId||!['duenio','admin','empleado'].includes(ctx.role))fail('PERMISO_DENEGADO');if(owner&&ctx.role!=='duenio')fail('PERMISO_DUENIO_REQUERIDO');const p=ctx.permissions||{};if(ctx.role==='empleado'&&!(Array.isArray(p)?p.includes('ventas_registrar'):p.ventas_registrar===true))fail('PERMISO_VENDER_REQUERIDO');}
function publicAccount(a){return {id:a.id,alias:a.alias,primary:!!a.primary,posId:a.posId||'',active:!!a.active};}
class PaymentService{
 constructor({store,provider,key}){this.store=store;this.provider=provider;this.key=key;this.locks=new Map();}
 async locked(id,fn){const previous=this.locks.get(id)||Promise.resolve();let release;const current=new Promise(r=>release=r);this.locks.set(id,current);await previous.catch(()=>{});try{return await fn();}finally{release();if(this.locks.get(id)===current)this.locks.delete(id);}}
 account(ctx,id){const a=this.store.account(ctx.commerceId,id);if(!a?.active)fail('CUENTA_NO_DISPONIBLE');return a;}
 credentials(a){try{return decrypt(a.credentials,this.key);}catch{fail('CONEXION_NO_DISPONIBLE');}}
 async handle(ctx,input){
  authorize(ctx);const s=this.store,action=input.action;
  if(action==='accounts')return {configured:this.provider.configured,accounts:s.accounts(ctx.commerceId).filter(a=>a.active).map(publicAccount)};
  if(action==='sale-receipts'){if(!Array.isArray(input.saleIds)||input.saleIds.length>100)fail('VENTA_INVALIDA');return {receipts:s.receipts(ctx.commerceId,input.saleIds.map(String))};}
  if(['primary','disconnect','positions','set-position'].includes(action)){
   authorize(ctx,true);const a=this.account(ctx,input.accountId);
   if(action==='primary'){s.primary(ctx.commerceId,a.id);s.audit(ctx,action,a.id);return {ok:true};}
   if(action==='disconnect'){const active=s.db.prepare('SELECT data FROM attempts WHERE commerce=?').all(ctx.commerceId).map(parse).some(x=>x.accountId===a.id&&!['canceled','expired','verified','manual'].includes(x.status));if(active)fail('COBRO_PENDIENTE');s.disconnect(ctx.commerceId,a.id);s.audit(ctx,action,a.id);return {ok:true};}
   const positions=await this.provider.positions(this.credentials(a));if(action==='positions')return {positions:positions.filter(p=>p.external_id).map(p=>({id:p.external_id,name:p.name||p.external_id}))};if(!positions.some(p=>p.external_id===input.posId))fail('CAJA_NO_DISPONIBLE');s.updateAccount({...a,posId:input.posId});return {ok:true};
  }
  const account=this.account(ctx,input.accountId),credentials=this.credentials(account);
  if(action==='transfer-start')return this.locked('sale:'+ctx.commerceId+input.saleId,async()=>{const a=s.prepare(ctx,input);if(a.orderId||a.status==='creating')fail('QR_PENDIENTE');return {attempt:a,receipt:s.receipt(ctx.commerceId,a.saleId)};});
  if(action==='manual')return this.locked('sale:'+ctx.commerceId+input.saleId,async()=>{const a=s.prepare(ctx,input),receipt=s.receipt(ctx.commerceId,a.saleId);if(receipt)return {receipt};if(a.orderId&&!['canceled','expired'].includes(a.status)||a.status==='creating')fail('QR_PENDIENTE');s.updateAttempt({...a,status:'manual'});s.audit(ctx,'manual',a.saleId);return {ok:true};});
  if(action==='receipts'||action==='income-history'){const amount=action==='receipts'?cents(input.amount):undefined;let attempt=null;if(action==='receipts'){if(!s.attempt(ctx.commerceId,input.saleId))fail('COBRO_NO_INICIADO');attempt=s.prepare(ctx,input);if(attempt.orderId||attempt.status==='creating')fail('QR_PENDIENTE');}const {rows,available}=await this.provider.searchTransfers(credentials),receipts=[];for(const p of rows){try{this.validatePayment(p,account);}catch{continue;}const used=!!s.used(account.id,p.id);let eligible=false;if(attempt)try{validateTransferWindow(p,attempt);eligible=true;}catch{}receipts.push({id:String(p.id),amountCents:cents(p.transaction_amount),matches:amount!==undefined&&cents(p.transaction_amount)===amount,eligible,date:p.date_approved||p.date_created,payer:[p.payer?.first_name,p.payer?.last_name].filter(Boolean).join(' ').slice(0,100),used});}return {receipts,truncated:available>rows.length,days:3,...(attempt?{ambiguous:receipts.filter(p=>p.matches&&p.eligible&&!p.used).length>1,window:{startedAt:attempt.createdAt,endsAt:new Date(Date.parse(attempt.createdAt)+1800000).toISOString()}}:{})};}
  if(action==='claim')return this.locked('sale:'+ctx.commerceId+input.saleId,async()=>{if(!s.attempt(ctx.commerceId,input.saleId))fail('COBRO_NO_INICIADO');const a=s.prepare(ctx,input),existing=s.receipt(ctx.commerceId,a.saleId);if(existing)return {receipt:existing};if(a.status==='manual')fail('COBRO_FINALIZADO_MANUAL');if(a.orderId||a.status==='creating')fail('QR_PENDIENTE');const p=await this.provider.payment(credentials,String(input.paymentId||''));this.validatePayment(p,account,a.amountCents);if(String(p.id)!==String(input.paymentId))fail('INGRESO_NO_VALIDO');validateTransferWindow(p,a);const receipt=s.claim(ctx,a,p.id,'transfer');s.updateAttempt({...a,status:'verified'});return {receipt};});
  if(['qr-create','qr-status','qr-cancel'].includes(action))return this.locked('sale:'+ctx.commerceId+input.saleId,async()=>{
   let a=s.prepare(ctx,input);const receipt=s.receipt(ctx.commerceId,a.saleId);if(receipt)return {attempt:a,receipt};if(['canceled','expired','manual'].includes(a.status))return {attempt:a,receipt:null};
   if(!a.orderId&&a.status==='prepared'&&action==='qr-cancel'){a=s.updateAttempt({...a,status:'canceled'});return {attempt:a,receipt:null};}
   if(!a.orderId){if(!account.posId)fail('CONFIGURAR_CAJA_QR');a=s.updateAttempt({...a,status:'creating'});const body={type:'qr',total_amount:decimal(a.amountCents),description:'Venta MiComercio',external_reference:'MC_'+a.saleId,expiration_time:'PT15M',config:{qr:{external_pos_id:account.posId,mode:'dynamic'}},transactions:{payments:[{amount:decimal(a.amountCents)}]}};const o=await this.provider.create(credentials,body,a.id);this.validateOrder(o,account,a);if(!o.id)fail('ORDEN_INVALIDA');a=s.updateAttempt({...a,orderId:String(o.id),qrData:o.type_response?.qr_data||null,status:String(o.status)});if(o.status==='created'&&!a.qrData)fail('ORDEN_SIN_QR');}
   if(action==='qr-create')return {attempt:a,receipt:null};
   let order=await this.provider.order(credentials,a.orderId);this.validateOrder(order,account,a);if(String(order.id)!==a.orderId)fail('ORDEN_INVALIDA');
   if(action==='qr-cancel'&&!['processed','canceled','expired'].includes(order.status)){await this.provider.cancel(credentials,a.orderId,a.id+'-cancel');order=await this.provider.order(credentials,a.orderId);this.validateOrder(order,account,a);}
   a=s.updateAttempt({...a,status:String(order.status)});
   if(order.status==='processed'){const p=order.transactions?.payments?.[0];if(order.status_detail!=='accredited'||!p?.id||p.status!=='processed'||p.status_detail!=='accredited'||cents(p.amount)!==a.amountCents)fail('ORDEN_SIN_ACREDITAR');const receipt=s.claim(ctx,a,p.id,'qr');a=s.updateAttempt({...a,status:'verified'});return {attempt:a,receipt};}
   return {attempt:a,receipt:null};
  });
  fail('ACCION_INVALIDA');
 }
 validatePayment(p,account,amount){if(p?.order?.id||p?.metadata?.order_id||p?.point_of_interaction?.transaction_data?.order_id||typeof p?.external_reference==='string'&&p.external_reference.startsWith('MC_'))fail('INGRESO_VINCULADO_ORDEN');const transfer=p?.operation_type==='money_transfer'||p?.operation_type==='account_fund'&&p.payment_type_id==='bank_transfer'&&p.payment_method_id==='cvu';if(!p?.id||p.status!=='approved'||p.status_detail!=='accredited'||String(p.collector_id)!==account.providerId||p.currency_id!=='ARS'||!transfer||p.transaction_amount_refunded!=null&&!/^0(?:\.0{1,2})?$/.test(String(p.transaction_amount_refunded)))fail('INGRESO_NO_VALIDO');let n;try{n=cents(p.transaction_amount);}catch{fail('INGRESO_NO_VALIDO');}if(amount&&n!==amount)fail('INGRESO_MONTO_DISTINTO');}
 validateOrder(o,account,a){if(String(o.user_id)!==account.providerId||(o.currency||o.currency_id)!=='ARS'||o.external_reference!=='MC_'+a.saleId)fail('ORDEN_INVALIDA');try{if(cents(o.total_amount)!==a.amountCents)fail('ORDEN_MONTO_DISTINTO');}catch{fail('ORDEN_MONTO_DISTINTO');}}
}
class MercadoPagoProvider{
 constructor(config={},fetcher=fetch){this.config=config;this.fetcher=fetcher;this.configured=!!(config.clientId&&config.clientSecret&&config.redirectUri);}
 async request(path,c,options={}){const r=await this.fetcher('https://api.mercadopago.com'+path,{...options,headers:{'content-type':'application/json',...(c?{authorization:'Bearer '+c.access_token}:{}),...options.headers},signal:AbortSignal.timeout(15000)});if(!r.ok)fail(r.status===401?'RECONECTAR_CUENTA':r.status===429?'MERCADO_PAGO_OCUPADO':'MERCADO_PAGO_NO_DISPONIBLE');return r.status===204?{}:r.json();}
 async search(c){const end=new Date(),begin=new Date(end-3*86400000);let rows=[];for(let offset=0;offset<500;offset+=50){const query=new URLSearchParams({sort:'date_created',criteria:'desc',range:'date_created',begin_date:begin.toISOString(),end_date:end.toISOString(),operation_type:'money_transfer',status:'approved',limit:'50',offset:String(offset)});const r=await this.request('/v1/payments/search?'+query,c);rows.push(...(r.results||[]));if(offset+50>=(r.paging?.total||0))break;}return rows;}
 async searchTransfers(c){const end=new Date(),begin=new Date(end-3*86400000),rows=[];let available=0;for(let offset=0;offset<500;offset+=50){const query=new URLSearchParams({sort:'date_created',criteria:'desc',range:'date_created',begin_date:begin.toISOString(),end_date:end.toISOString(),status:'approved',limit:'50',offset:String(offset)});const r=await this.request('/v1/payments/search?'+query,c);if(!Array.isArray(r?.results)||!Number.isSafeInteger(r.paging?.total)||r.paging.total<0)fail('MERCADO_PAGO_NO_DISPONIBLE');available=r.paging.total;rows.push(...r.results);if(offset+50>=available)break;}return {rows,available};}
 payment(c,id){if(!/^\d{1,30}$/.test(id))fail('INGRESO_NO_VALIDO');return this.request('/v1/payments/'+id,c);}
 create(c,body,key){return this.request('/v1/orders',c,{method:'POST',headers:{'X-Idempotency-Key':key},body:JSON.stringify(body)});}
 order(c,id){return this.request('/v1/orders/'+encodeURIComponent(id),c);}
 cancel(c,id,key){return this.request('/v1/orders/'+encodeURIComponent(id)+'/cancel',c,{method:'POST',headers:{'X-Idempotency-Key':key},body:'{}'});}
 async positions(c){const r=await this.request('/pos?limit=100',c);return r.results||[];}
 exchange(code,verifier){if(!this.configured)fail('APLICACION_NO_CONFIGURADA');return this.request('/oauth/token',null,{method:'POST',body:JSON.stringify({client_id:this.config.clientId,client_secret:this.config.clientSecret,grant_type:'authorization_code',code,redirect_uri:this.config.redirectUri,code_verifier:verifier})});}
 identity(c){return this.request('/users/me',c);}
}
module.exports={PaymentStore,PaymentService,MercadoPagoProvider,encrypt,decrypt,cents,decimal,authorize,publicAccount};
