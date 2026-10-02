process.env.PW||='C:/Users/valen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
process.env.CHROME||='C:/Program Files/Google/Chrome/Application/chrome.exe';
const {openShadow}=require('./browser-fixture/shadow.cjs');const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{for(const width of [1366,390]){
 const h=await openShadow({width});try{const p=h.page;
 await p.evaluate(()=>{window.__readerCalls=0;sb.functions.invoke=async()=>{window.__readerCalls++;return {error:{message:'PRIVATE',context:new Response(JSON.stringify({code:'IA_AGOTADA_TEMPORALMENTE',diagnostic:{stage:'provider',providerCategory:'RATE_LIMIT',providerStatus:429,requestId:'00000000-0000-4000-8000-000000000001'}}),{status:429})}};};panelIngreso(true,'ia');});
 await p.setInputFiles('#facFoto',{name:'factura.png',mimeType:'image/png',buffer:Buffer.from('synthetic image')});
 await p.locator('#facError').waitFor({state:'visible'});assert.match(await p.locator('#facError').innerText(),/Google.*demasiadas solicitudes/);
 assert.equal(await p.evaluate(()=>window.__readerCalls),1);assert.equal(await p.locator('#facManualContent').isVisible(),true);
 await p.locator('#facError summary').click();assert.match(await p.locator('#facError').innerText(),/429/);assert.doesNotMatch(await p.locator('#facError').innerText(),/PRIVATE/);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 const out=path.join(__dirname,'../entregables/lector-diagnostico-REV82');fs.mkdirSync(out,{recursive:true});await p.screenshot({path:path.join(out,`limite-${width}.png`)});
 await p.evaluate(()=>{sb.functions.invoke=async()=>{window.__readerCalls++;return {data:{items:[]},error:null};};});
 await p.setInputFiles('#facFoto',{name:'otra.png',mimeType:'image/png',buffer:Buffer.from('synthetic image')});
 await p.waitForFunction(()=>document.querySelector('#facError').innerText.includes('no encontró productos'));
 assert.doesNotMatch(await p.locator('#facError').innerText(),/RATE_LIMIT|429|00000000-0000/);
 assert.equal(await p.evaluate(()=>window.__readerCalls),2);
 assert.equal(h.errors.filter(e=>e.startsWith('pageerror:')).length,0);
 console.log(`REV82 diagnóstico ${width}: OK`);
 }finally{await h.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
