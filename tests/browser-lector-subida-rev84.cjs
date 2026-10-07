// User-visible upload timeout. Local shadow only, no provider/session/stock writes.
process.env.PW||='C:/Users/valen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
process.env.CHROME||='C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=require('node:assert/strict');
const {openShadow}=require('./browser-fixture/shadow.cjs');
(async()=>{for(const width of [1366,390]){
 const h=await openShadow({width});try{
  const p=h.page;
  await p.evaluate(()=>{panelIngreso(true,'ia');f82MostrarFalloFactura(document.querySelector('#ov'),{code:'IA_TIEMPO_AGOTADO',status:408,diagnostic:{stage:'upload'}})});
  const error=p.locator('#facError');assert.match(await error.innerText(),/foto.*terminó.*llegar/);assert.doesNotMatch(await error.innerText(),/datos inválidos|Google|OpenAI/i);
  await p.click('#facError summary');assert.match(await error.innerText(),/Paso: Subida de la foto/);assert.match(await error.innerText(),/408/);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.equal(h.errors.filter(x=>x.startsWith('pageerror:')).length,0);
  console.log(JSON.stringify({width,uploadTimeoutVisible:true,invalidJSONBlame:false,externalAI:0}));
 }finally{await h.close()}
}})().catch(e=>{console.error(e);process.exitCode=1});
