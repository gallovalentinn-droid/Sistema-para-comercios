const assert = require('node:assert/strict');
const path = require('node:path');
process.env.REV = path.resolve(__dirname,'..');
process.env.PW ||= 'C:/Users/valen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
process.env.CHROME ||= 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const {openShadow}=require('./browser-fixture/shadow.cjs');
(async()=>{
 const h=await openShadow({height:900,publicUrl:process.env.PUBLIC_BETA||null});
 try{
  const p=h.page;
  await p.evaluate(()=>{
   cargarDemo('kiosco');f3Estado.session=null;
   db.productos=[{id:'p',nombre:'Alfajor Milka Mousse Simple 42gr',stockBase:8,unidad:'unidad',rubro:'Almacén'},
    {id:'q',nombre:'Cigarrillo Red Point Nix Box',stockBase:-2,unidad:'unidad',rubro:'Cigarrillos'},
    {id:'z',nombre:'Lata Speed 473ml',stockBase:6,unidad:'unidad',rubro:'Bebidas'}];
   const c=(id,desde,hasta,responsableNombre)=>({id,_v4sessionSegmentId:id,desde,hasta,responsableNombre});
   db.cierres=[c('a','2026-10-01T08:00:00Z','2026-10-01T12:00:00Z','Ana'),c('b','2026-10-01T13:00:00Z','2026-10-01T16:00:00Z','Juan')];
   const m=(prodId,id,cant,fecha,tipo='venta')=>({prodId,_v4sessionSegmentId:id,cant,fecha,tipo});
   db.movs=[m('p','b',-1,'2026-10-01T14:00:00Z'),m('q','b',-2,'2026-10-01T14:00:00Z'),
    m('z','a',-2,'2026-10-01T10:00:00Z'),{...m('z','',24,'2026-10-01T12:15:00Z','ingreso'),_v4remote:true,_v4deviceId:'otro-dispositivo'},
    m('z','b',-4,'2026-10-01T14:00:00Z'),m('z','b',1,'2026-10-01T15:00:00Z','anulacion')];
   db.ventas=[];filtrosMovimientos={q:'',rubro:''};movVista='turnos';movTurnoA='b';movTurnoB='a';
   vista='movimientos';render();
   window.__stockBefore=JSON.stringify({productos:db.productos,movs:db.movs,cierres:db.cierres});
  });
  assert.equal(await p.locator('#movTurnoA').inputValue(),'a','la selección se ordena por fecha');
  assert.equal(await p.locator('[data-mov-producto]').count(),3);
  assert.equal(await p.locator('.mov81-detalle:visible').count(),0,'la cuenta empieza contraída');
  assert.equal(await p.locator('.mov81-sin-turno .mov81-mov').count(),0,'el listado sin turno se prepara al abrirlo');
  await p.locator('.mov81-sin-turno summary').click();
  await p.locator('.mov81-sin-turno .mov81-mov').waitFor();
  assert.equal(await p.locator('.mov81-sin-turno .mov81-mov').count(),1);
  await p.locator('.mov81-sin-turno summary').click();
  assert.doesNotMatch(await p.locator('#tablaMovimientos').innerText(),/Vendidas|Al abrir/,'la cuenta no ocupa el resumen');
  const btn=p.locator('[data-mov-producto="z"] [data-mov-expandir]');
  await btn.focus();await p.keyboard.press('Enter');
  assert.equal(await btn.getAttribute('aria-expanded'),'true');
  assert.match(await p.locator('.mov81-detalle:visible').innerText(),/Vendidas/);
  assert.match(await p.locator('.mov81-detalle:visible').innerText(),/24/);
  assert.match(await p.locator('.mov81-gap').innerText(),/Responsable no disponible/);
  assert.doesNotMatch(await p.locator('.mov81-gap').innerText(),/Este dispositivo/);
  await p.keyboard.press('Space');assert.equal(await btn.getAttribute('aria-expanded'),'false');
  await p.locator('[data-mov-producto="p"]').click();
  assert.equal(await p.locator('[data-mov-producto="p"] [data-mov-expandir]').getAttribute('aria-expanded'),'true');
  await p.locator('#movSoloAvisos').check();
  assert.equal(await p.locator('[data-mov-producto]').count(),1);
  assert.match(await p.locator('#tablaMovimientos').innerText(),/Stock en negativo/);
  await p.locator('#movSoloAvisos').uncheck();
  await p.fill('#qMovimientos','speed');await p.waitForFunction(()=>document.querySelectorAll('[data-mov-producto]').length===1);
  assert.equal(await p.locator('[data-mov-producto]').getAttribute('data-mov-producto'),'z');
  await p.fill('#qMovimientos','');await p.waitForFunction(()=>document.querySelectorAll('[data-mov-producto]').length===3);
  for(const width of [1366,390]){
   await p.setViewportSize({width,height:900});
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await p.locator('[data-mov-producto="z"] [data-mov-expandir]').click();
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'el detalle tampoco desborda');
   await p.screenshot({path:path.resolve(__dirname,`../entregables/comparar-turnos-REV81/${process.env.PUBLIC_BETA?'publico-':''}detalle-${width}.png`),fullPage:true});
   await p.locator('[data-mov-producto="z"] [data-mov-expandir]').click();
   await p.screenshot({path:path.resolve(__dirname,`../entregables/comparar-turnos-REV81/${process.env.PUBLIC_BETA?'publico-':''}resumen-${width}.png`),fullPage:true});
  }
  assert.equal(await p.evaluate(()=>JSON.stringify({productos:db.productos,movs:db.movs,cierres:db.cierres})===window.__stockBefore),true);
  await p.selectOption('#movTurnoB','a');assert.match(await p.locator('#tablaMovimientos').innerText(),/dos turnos/);
  await p.click('[data-mov-vista="periodo"]');assert.equal(await p.locator('#fechaMovimientos').count(),1);
  await p.evaluate(()=>{f5Estado().membership.rol='empleado';movVista='turnos';vMovimientos(document.querySelector('#main'));});
  assert.equal(await p.locator('[data-mov-vista="turnos"]').count(),0);
  assert.deepEqual(h.errors.filter(e=>e.startsWith('pageerror:')),[]);
  console.log('REV81: resumen contraído, detalle accesible, orden, avisos, búsqueda, móvil, datos intactos y empleado verificados');
 }finally{await h.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
