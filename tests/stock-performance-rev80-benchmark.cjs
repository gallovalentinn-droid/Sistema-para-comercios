const assert = require('node:assert/strict');
const {performance} = require('node:perf_hooks');
const {fs, path, fixture, load, plain, baselineHtml, candidatePath, vm} = require('./stock-perf-rev80-fixture.cjs');
const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/valen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const after = fs.readFileSync(candidatePath, 'utf8');
const before = baselineHtml(after, {includeUI: true});
const input = fixture();
const samples = Number(process.env.BENCH_SAMPLES || 3);
const report = {fixture: {products: 850, shiftsAvailable: 120, shiftsCompared: 2, movements: 100000}, samples, node: process.version, platform: process.platform, resultEquivalence: false, results: {}};
function block(html, name) {
  return html.slice(html.indexOf(`/* ${name}_START */`), html.indexOf(`/* ${name}_END */`));
}
function browserSource(html) {
  const uiStart = html.indexOf('function f79PuedeCompararTurnos(){'), uiEnd = html.indexOf('function rangoDiaMovimientos(', uiStart);
  const viewStart = html.indexOf('function vMovimientos(m){'), viewEnd = html.indexOf('\n/* ═', viewStart);
  return ['UX_BUSQUEDAS_PAGOS_HELPERS', 'F5_SESSION_CORE', 'F6_TURNOS_CORE', 'REV79_MOVIMIENTOS'].map(name => block(html, name)).join('\n') + '\n' + html.slice(uiStart, uiEnd) + '\n' + html.slice(viewStart, viewEnd);
}
async function browserBench(browser, html) {
  const page = await browser.newPage({viewport: {width: 1366, height: 768}});
  await page.setContent('<main id="main"></main>');
  await page.addScriptTag({content: `
    let movVista='turnos',movTurnoA='s0',movTurnoB='s119',fechaMovimientos='2026-01-01',movRango='dia';
    let filtrosMovimientos={q:'',rubro:''},db={},opciones=[];
    const $=(s,c=document)=>c.querySelector(s),$$=(s,c=document)=>[...c.querySelectorAll(s)];
    const esDuenio=()=>true,esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const fFH=x=>x,fmtCant=(p,n)=>String(n),rubros=()=>['Almacén'],hoy=()=>fechaMovimientos;
    ${browserSource(html)}
    f79OpcionesTurnos=()=>opciones;
    const paintOriginal=pintarMovimientosActual;
    globalThis.paintCalls=0;
    pintarMovimientosActual=()=>{globalThis.paintCalls++;return paintOriginal();};
  `});
  await page.evaluate(data => {db={productos:data.productos,movs:data.movimientos,ventas:data.ventas};opciones=data.allTurnos;}, input);
  const initial = [];
  for (let i = 0; i < samples; i++) {
    initial.push(await page.evaluate(async () => {
      filtrosMovimientos.q='';
      const start=performance.now();vMovimientos($('#main'));
      const synchronous=performance.now()-start;
      await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
      return {synchronousMs:synchronous,withLayoutMs:performance.now()-start,rows:document.querySelectorAll('[data-mov-producto]').length||$('#tablaMovimientos tbody').rows.length};
    }));
  }
  // Each key dispatches the actual production oninput handler. The optimized
  // version batches the burst; the old version performs a full repaint per key.
  const search = await page.evaluate(async () => {
    const input=$('#qMovimientos'),start=performance.now(),firstPaint=paintCalls;
    for(const q of ['P','Pr','Pro','Prod','Produ','Produc','Product','Producto','Producto ','Producto 0','Producto 00']){
      input.value=q;input.dispatchEvent(new Event('input',{bubbles:true}));
    }
    const handlers=performance.now()-start,callsBeforeDelay=paintCalls-firstPaint;
    await new Promise(r=>setTimeout(r,250));
    await new Promise(requestAnimationFrame);
    return {keys:11,handlersMs:handlers,paintCallsSynchronous:callsBeforeDelay,paintCallsTotal:paintCalls-firstPaint,totalWithDebounceMs:performance.now()-start,query:input.value,rows:document.querySelectorAll('[data-mov-producto]').length||$('#tablaMovimientos tbody').rows.length};
  });
  await page.close();
  return {initial,search};
}
(async () => {
  const oldCtx=load(before),newCtx=load(after);
  if(process.argv.includes('--verify-sources')){
    const small=fixture({products:40,shifts:12,movements:1200});
    assert.deepEqual(plain(newCtx.f79CompararStockTurnos(small)),plain(oldCtx.f79CompararStockTurnos(small)));
    new vm.Script(browserSource(before));new vm.Script(browserSource(after));
    console.log('Bundled before/after sources reconstruct, compile and return equivalent results. No external baseline needed.');
    return;
  }
  const nodeResults={};
  for(const [name,ctx] of [['before',oldCtx],['after',newCtx]]){
    const start=performance.now(),result=plain(ctx.f79CompararStockTurnos(input));
    nodeResults[name]={ms:performance.now()-start,rows:result.filas.length,result};
    console.log(`${name}: comparator ${nodeResults[name].ms.toFixed(1)} ms, ${result.filas.length} rows`);
  }
  assert.deepEqual(nodeResults.after.result,nodeResults.before.result);
  report.resultEquivalence=true;
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  report.browserVersion=browser.version();
  try {
    for(const [name,html] of [['before',before],['after',after]]) {
      const timings=await browserBench(browser,html);
      report.results[name]={nodeComparatorMs:nodeResults[name].ms,...timings};
      console.log(`${name}: Chrome initial ${timings.initial.map(r=>r.synchronousMs.toFixed(1)).join(', ')} ms; 11 keys ${timings.search.handlersMs.toFixed(1)} ms; ${timings.search.paintCallsTotal} repaints`);
    }
  }finally{await browser.close();}
  const med = xs => [...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
  report.improvement={nodeComparator:report.results.before.nodeComparatorMs/report.results.after.nodeComparatorMs,chromeInitialMedian:med(report.results.before.initial.map(r=>r.synchronousMs))/med(report.results.after.initial.map(r=>r.synchronousMs)),searchHandlers:report.results.before.search.handlersMs/report.results.after.search.handlersMs};
  const output=process.env.BENCH_OUTPUT||path.resolve(__dirname,'../entregables/respuesta-revision-REV79/stock-performance-rev80-benchmark.json');
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(`Full results: ${output}`);
})().catch(error=>{console.error(error);process.exitCode=1;});
