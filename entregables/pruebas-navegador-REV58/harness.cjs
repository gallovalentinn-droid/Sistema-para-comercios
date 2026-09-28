// Arnés: sirve una COPIA del paquete, bloquea toda red externa, reemplaza Supabase por un stub sin sesión.
const {chromium}=require(process.env.PW||'playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,process.env.REV||'../..');
const STUB=`window.supabase={createClient(){
 const err={message:'OFFLINE_STUB',code:'OFFLINE'};
 const chain=()=>{const p=new Proxy(function(){},{get(t,k){if(k==='then')return (res)=>res({data:null,error:err});return ()=>p;},apply(){return p;}});return p;};
 return {auth:{getSession:async()=>({data:{session:(localStorage.getItem('__stubSession')?JSON.parse(localStorage.getItem('__stubSession')):null)}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({}),signInWithPassword:async()=>({data:null,error:err}),getUser:async()=>({data:{user:null}})},
  rpc:async(n,a)=>{(window.__rpcs=window.__rpcs||[]).push(n);(window.__rpcArgs=window.__rpcArgs||[]).push([n,a]);if(window.__rpcStub&&window.__rpcStub[n])return window.__rpcStub[n](a);if(n==='estado_f43'&&window.__f43ok)return {data:{estado:'normal'},error:null};return {data:null,error:{message:'TypeError: Failed to fetch',details:'',hint:'',code:''}};},from:()=>chain(),channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){},
  storage:{from:()=>({upload:async()=>({error:err}),getPublicUrl:()=>({data:{publicUrl:''}}),createSignedUrl:async()=>({error:err}),remove:async()=>({error:err})})},functions:{invoke:async()=>({data:null,error:err})}};
}};`;
function serve(){return new Promise(r=>{const s=http.createServer((q,res)=>{let u=decodeURIComponent(q.url.split('?')[0]);if(u.endsWith('/'))u+='index.html';
 if(u.includes('supabase-js')&&!process.env.REAL_SB){res.writeHead(200,{'content-type':'application/javascript'});return res.end(STUB);}
 const f=path.join(ROOT,u);if(!f.startsWith(ROOT)||!fs.existsSync(f)){res.writeHead(404);return res.end();}
 const ext=path.extname(f);res.writeHead(200,{'content-type':{'.html':'text/html; charset=utf-8','.js':'application/javascript'}[ext]||'application/octet-stream'});fs.createReadStream(f).pipe(res);}).listen(0,()=>r(s));});}
async function open({width=1366,height=800,boot=true}={}){
 const server=await serve();const port=server.address().port;
 const browser=await chromium.launch({...(process.env.CHROME?{executablePath:process.env.CHROME}:{})});
 const ctx=await browser.newContext({viewport:{width,height},locale:'es-AR',timezoneId:'America/Buenos_Aires',acceptDownloads:true});
 const errors=[],external=[];
 await ctx.route('**/*',route=>{const u=route.request().url();if(u.startsWith(`http://127.0.0.1:${port}`))return route.continue();external.push(u);return route.abort();});
 const page=await ctx.newPage();
 page.on('pageerror',e=>errors.push('pageerror: '+e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
 page.on('dialog',d=>{errors.push('DIALOG '+d.type()+': '+d.message());if(d.type()==='beforeunload')d.accept();else d.dismiss();});
 await page.goto(`http://127.0.0.1:${port}/beta/`);
 await page.waitForTimeout(600);
 if(boot){await page.evaluate(async()=>{window.__f43ok=1;f3Estado.comercioId='00000000-0000-4000-8000-00000000c0de';f3Estado.deviceUuid='00000000-0000-4000-8000-00000000d0de';await mostrarApp();});await page.waitForTimeout(300);}
 return {page,ctx,browser,server,errors,external,close:async()=>{await browser.close();server.close();}};
}
module.exports={open,serve};
