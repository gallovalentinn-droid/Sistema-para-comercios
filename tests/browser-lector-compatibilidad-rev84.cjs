// Cliente REV83 real congelado desde eb468b0. Solo archivos locales y RPC simuladas.
process.env.PW||='C:/Users/valen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
process.env.CHROME||='C:/Program Files/Google/Chrome/Application/chrome.exe';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),temp=path.join(root,'.superpowers/sdd/2026-10-03-lector-facturas-rev84/compatibility');
fs.mkdirSync(path.join(temp,'beta/vendor'),{recursive:true});process.env.REV=temp;
const {openShadow}=require('./browser-fixture/shadow.cjs');
(async()=>{for(const width of [1366,390]){
 fs.copyFileSync(path.join(__dirname,'browser-fixture/legacy-rev83.html'),path.join(temp,'beta/index.html'));fs.copyFileSync(path.join(root,'beta/sw.js'),path.join(temp,'beta/sw.js'));
 fs.copyFileSync(path.join(root,'beta/vendor/xlsx-0.18.5.full.min.js'),path.join(temp,'beta/vendor/xlsx-0.18.5.full.min.js'));
 const h=await openShadow({width});try{const p=h.page;assert.equal(await p.evaluate(()=>MICOMERCIO_BUILD.packageRevision),83);
 await p.evaluate(()=>{window.__calls=0;sb.functions.invoke=async()=>{__calls++;return {error:{context:new Response(JSON.stringify({code:'CLIENTE_REQUIERE_ACTUALIZACION',diagnostic:{stage:'client',requestId:'00000000-0000-4000-8000-000000000001'}}),{status:426})}}};panelIngreso(true,'ia')});
 await p.setInputFiles('#facFoto',{name:'foto.png',mimeType:'image/png',buffer:Buffer.from('fixture')});await p.locator('#facError').waitFor({state:'visible'});
 assert.match(await p.locator('#facError').innerText(),/El servicio de lectura no está disponible/);assert.equal(await p.locator('#facManualContent').isVisible(),true);
 await p.click('#facError summary');assert.match(await p.locator('#facError').innerText(),/426/);assert.match(await p.locator('#facError').innerText(),/00000000-0000-4000-8000-000000000001/);assert.equal(await p.locator('#facCopiarError').isVisible(),true);
 await p.evaluate(()=>f62ComprobarVersion());await p.locator('#f62VersionBanner').waitFor();assert.equal(await p.locator('#f62VersionBanner button').isDisabled(),true);
 await p.evaluate(()=>cerrarModal());assert.equal(await p.locator('#f62VersionBanner button').isEnabled(),true);
 fs.copyFileSync(path.join(root,'beta/index.html'),path.join(temp,'beta/index.html'));
 await Promise.all([p.waitForNavigation(),p.click('#f62VersionBanner button')]);await p.waitForFunction(()=>window.MiComercioBuild?.packageRevision===87);
 assert.equal(await p.evaluate(()=>MICOMERCIO_BUILD.packageRevision),87);assert.equal(h.errors.filter(e=>e.startsWith('pageerror:')).length,0);
 console.log(JSON.stringify({width,legacy426:'generic',manualAccessible:true,updateBlockedDuringModal:true,updatedRevision:await p.evaluate(()=>MICOMERCIO_BUILD.packageRevision),externalAI:0}));
 }finally{await h.close()}
}})().catch(e=>{console.error(e);process.exitCode=1});
