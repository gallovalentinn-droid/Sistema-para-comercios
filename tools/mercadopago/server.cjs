'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PaymentStore,PaymentService,MercadoPagoProvider,encrypt,decrypt,authorize}=require('./core.cjs');
function codeError(code,status=409){const e=new Error(code);e.status=status;return e;}
async function authenticateSupabase(local,token,body){
 if(!token||!body.commerceId||!body.deviceId)throw codeError('SESION_INVALIDA',401);
 const headers={apikey:local.publishableKey,authorization:'Bearer '+token},get=async(url,options={})=>{
  const r=await fetch(local.apiUrl+url,{...options,headers:{...headers,'content-type':'application/json'},signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw codeError('SESION_INVALIDA',401);return r.json();
 };
 const user=await get('/auth/v1/user');if(!user.id)throw codeError('SESION_INVALIDA',401);
 const query=new URLSearchParams({select:'comercio_id,user_id,rol,permisos,activo',comercio_id:'eq.'+body.commerceId,user_id:'eq.'+user.id,activo:'eq.true'});
 const members=await get('/rest/v1/comercio_miembros?'+query),m=members[0];if(!m)throw codeError('PERMISO_DENEGADO',403);
 const authority=await get('/rest/v1/rpc/f5_chequear_autoridad',{method:'POST',body:JSON.stringify({p_comercio_id:body.commerceId,p_device_id:body.deviceId})});
 if(authority.writable!==true)throw codeError('AUTORIDAD_NO_VIGENTE',403);
 const ctx={commerceId:m.comercio_id,userId:user.id,role:authority.membership?.rol||m.rol,permissions:authority.membership?.permisos_efectivos||[]};authorize(ctx);return ctx;
}
function createPaymentServer(options){
 const {appDir,local,store,key,provider,service}=options,root=path.resolve(appDir);
 if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(local.apiUrl))throw codeError('BACKEND_LOCAL_REQUERIDO');
 const authenticate=options.authenticate||((token,body)=>authenticateSupabase(local,token,body));
 const ws=local.apiUrl.replace(/^http/,'ws'),csp=`default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${local.apiUrl}; font-src 'self' data:; connect-src 'self' ${local.apiUrl} ${ws}; frame-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`;
 const send=(res,status,body,type='application/json; charset=utf-8')=>{res.writeHead(status,{'content-type':type,'cache-control':'no-store','content-security-policy':csp,'referrer-policy':'no-referrer','x-content-type-options':'nosniff','x-entorno':'prueba-local'});res.end(type.startsWith('application/json')?JSON.stringify(body):body);};
 return http.createServer(async(req,res)=>{
  try{
   const host=String(req.headers.host||''),localHost=/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host);
   const publicOrigin=provider.config?.redirectUri?new URL(provider.config.redirectUri).origin:null;
   if(!localHost&&(!publicOrigin||new URL(publicOrigin).host!==host))throw codeError('ORIGEN_NO_PERMITIDO',403);
   const expectedOrigin=localHost?'http://'+host:publicOrigin;
   const url=new URL(req.url,'http://localhost');
   if(url.pathname==='/api/mercadopago/callback'&&req.method==='GET'){
    const state=url.searchParams.get('state')||'',saved=store.consumeState(state);if(!saved)throw codeError('AUTORIZACION_VENCIDA');
    const auth=decrypt(saved.encrypted,key),ctx=await authenticate(auth.token,auth.body);authorize(ctx,true);
    if(ctx.userId!==auth.ctx.userId||ctx.commerceId!==auth.ctx.commerceId||url.searchParams.has('error'))throw codeError('AUTORIZACION_RECHAZADA');
    const credentials=await provider.exchange(url.searchParams.get('code')||'',auth.verifier),identity=await provider.identity(credentials);
    if(!credentials.access_token||String(identity.id)!==String(credentials.user_id))throw codeError('AUTORIZACION_RECHAZADA');
    const a=store.saveAccount({commerceId:ctx.commerceId,providerId:String(identity.id),alias:auth.alias,credentials:encrypt(credentials,key)});store.audit(ctx,'connected',a.id);
    res.writeHead(303,{location:'/beta/?mercadopago=conectado','cache-control':'no-store','referrer-policy':'no-referrer'});return res.end();
   }
   if(url.pathname==='/api/mercadopago'){
    if(req.method!=='POST')return send(res,405,{code:'METODO_NO_PERMITIDO'});
    if(req.headers.origin&&req.headers.origin!==expectedOrigin)throw codeError('ORIGEN_NO_PERMITIDO',403);
    if(!String(req.headers['content-type']).startsWith('application/json'))throw codeError('DATOS_INVALIDOS',400);
    const token=String(req.headers.authorization||'').match(/^Bearer (.+)$/)?.[1];if(!token)throw codeError('SESION_INVALIDA',401);
    let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>16384)throw codeError('DATOS_INVALIDOS',413);chunks.push(chunk);}
    let body;try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{throw codeError('DATOS_INVALIDOS',400);}
    const ctx=await authenticate(token,body);
    if(body.action==='oauth-start'){
     authorize(ctx,true);if(!provider.configured)throw codeError('APLICACION_NO_CONFIGURADA');
     const alias=String(body.alias||'').trim();if(!alias||alias.length>80)throw codeError('NOMBRE_CUENTA_INVALIDO');
     const state=crypto.randomBytes(32).toString('base64url'),verifier=crypto.randomBytes(48).toString('base64url');
     store.saveState(state,{encrypted:encrypt({token,body:{commerceId:body.commerceId,deviceId:body.deviceId},ctx,alias,verifier},key)},Date.now()+600000);
     const q=new URLSearchParams({client_id:provider.config.clientId,response_type:'code',platform_id:'mp',state,redirect_uri:provider.config.redirectUri,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
     return send(res,200,{url:'https://auth.mercadopago.com/authorization?'+q});
    }
    return send(res,200,await service.handle(ctx,body));
   }
   if(!['GET','HEAD'].includes(req.method))return send(res,405,{code:'METODO_NO_PERMITIDO'});
   let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{return send(res,404,{code:'NO_ENCONTRADO'});}
   if(pathname==='/'){res.writeHead(302,{location:'/beta/'});return res.end();}
   if(pathname==='/beta/')pathname+="index.html";
   // Lista cerrada: nunca sirve tools, credenciales, SQLite, informes ni archivos ocultos.
   if(!/^\/beta\/(index\.html|mercadopago\.js|sw\.js|vendor\/[a-zA-Z0-9._-]+\.(js|txt))$/.test(pathname))return send(res,404,{code:'NO_ENCONTRADO'});
   const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return send(res,404,{code:'NO_ENCONTRADO'});
   if(pathname==='/beta/sw.js')return send(res,200,"self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.registration.unregister()));",'application/javascript');
   let body=fs.readFileSync(file,'utf8');
   if(pathname.endsWith('.html')){
    body=body.replaceAll('https://qrvdfqpxutymmlcplsal.supabase.co',local.apiUrl).replace(/(const SUPABASE_ANON_KEY\s*=\s*)'[^']*'/,(_,a)=>a+JSON.stringify(local.publishableKey));
    if(body.includes('qrvdfqpxutymmlcplsal'))throw codeError('AISLAMIENTO_LOCAL_FALLO');
    body=body.replace('<title>','<title>[PRUEBA LOCAL] ').replace('</body>','<div style="position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:2147483647;background:#b00020;color:white;padding:2px 12px;font:700 12px system-ui;pointer-events:none">PRUEBA LOCAL · datos ficticios</div></body>');
   }
   return send(res,200,body,pathname.endsWith('.html')?'text/html; charset=utf-8':pathname.endsWith('.js')?'application/javascript; charset=utf-8':'text/plain; charset=utf-8');
  }catch(e){const known=/^[A-Z][A-Z0-9_]{2,80}$/.test(e.message||'');return send(res,e.status||409,{code:known?e.message:'CONEXION_NO_DISPONIBLE'});}
 });
}
function start(){
 const appDir=path.resolve(__dirname,'../..'),privateDir=path.join(appDir,'.mercadopago-local');fs.mkdirSync(privateDir,{recursive:true,mode:0o700});
 const keyFile=path.join(privateDir,'key');if(!fs.existsSync(keyFile))fs.writeFileSync(keyFile,crypto.randomBytes(32),{mode:0o600,flag:'wx'});const key=fs.readFileSync(keyFile);if(key.length!==32)throw codeError('CLAVE_LOCAL_INVALIDA');
 const localFile=process.env.MC_LOCAL_CONFIG;if(!localFile)throw codeError('FALTA_CONFIG_LOCAL');const local=JSON.parse(fs.readFileSync(localFile));
 const configFile=path.join(privateDir,'config.json'),config=fs.existsSync(configFile)?JSON.parse(fs.readFileSync(configFile)):{};
 if(config.redirectUri&&(!config.redirectUri.startsWith('https://')||new URL(config.redirectUri).pathname!=='/api/mercadopago/callback'))throw codeError('REDIRECCION_HTTPS_REQUERIDA');
 const store=new PaymentStore(path.join(privateDir,'payments.sqlite')),provider=new MercadoPagoProvider(config),service=new PaymentService({store,provider,key});
 const server=createPaymentServer({appDir,local,store,key,provider,service}),port=Number(process.env.MC_WEB_PORT)||55382;
 server.listen(port,'127.0.0.1',()=>console.log('PRUEBA LOCAL Mercado Pago: http://127.0.0.1:'+port+'/beta/ · '+(provider.configured?'aplicación configurada':'pendiente de aplicación')));
}
if(require.main===module){try{start();}catch{console.error('No se pudo iniciar el conector local. Revisá su configuración privada.');process.exitCode=1;}}
module.exports={createPaymentServer,authenticateSupabase};
