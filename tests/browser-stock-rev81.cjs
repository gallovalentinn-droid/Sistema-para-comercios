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
   db.productos=[{id:'p',nombre:'Alfajor Milka Mousse Simple 42gr',stockBase:8,stock:7,unidad:'unidad',rubro:'Almacén'},
    {id:'q',nombre:'Cigarrillo Red Point Nix Box',stockBase:-2,stock:13,unidad:'unidad',rubro:'Cigarrillos'},
    {id:'z',nombre:'Lata Speed 473ml',stockBase:6,stock:25,unidad:'unidad',rubro:'Bebidas'}];
   const c=(id,desde,hasta,responsableNombre)=>({id,_v4sessionSegmentId:id,desde,hasta,responsableNombre});
   db.cierres=[c('a','2026-10-01T08:00:00Z','2026-10-01T12:00:00Z','Ana'),c('b','2026-10-01T13:00:00Z','2026-10-01T16:00:00Z','Juan')];
   const m=(prodId,id,cant,fecha,tipo='venta')=>({prodId,_v4sessionSegmentId:id,cant,fecha,tipo});
   db.movs=[m('p','b',-1,'2026-10-01T14:00:00Z'),m('q','b',-2,'2026-10-01T14:00:00Z'),
    m('z','a',-2,'2026-10-01T10:00:00Z'),{...m('z','',24,'2026-10-01T12:15:00Z','ingreso'),_v4remote:true,_v4deviceId:'otro-dispositivo'},
    m('z','b',-4,'2026-10-01T14:00:00Z'),m('z','b',1,'2026-10-01T15:00:00Z','anulacion')];
   db.ventas=[];filtrosMovimientos={q:'',rubro:''};movVista='turnos';movTurnoA='b';movTurnoB='a';
   db.movs.forEach(m=>m._v4receivedAt='2026-10-02T18:00:00Z');
   vista='movimientos';render();
   window.__stockBefore=JSON.stringify({productos:db.productos,movs:db.movs,cierres:db.cierres});
  });
  assert.equal(await p.locator('#movTurnoA').inputValue(),'a','la selección se ordena por fecha');
  assert.equal(await p.locator('[data-mov-producto]').count(),3);
  assert.match(await p.locator('[data-mov-producto="p"]').innerText(),/Bajó 1/);
  assert.equal(await p.locator('[data-mov-producto="q"].mov81-critico').count(),0,'un negativo histórico no pinta la fila como problema actual');
  assert.match(await p.locator('[data-mov-producto="q"] .pill.warn').innerText(),/Tuvo stock negativo/);
  assert.equal(await p.locator('#movExportarComparacion').count(),1);
  assert.match(await p.locator('#movResumenComparacion').innerText(),/3 productos comparados.*3 con variaciones.*0 con stock actual negativo.*1 tuvo stock negativo/);
  const colores=await p.locator('.mov81-delta').evaluateAll(es=>es.map(e=>({color:getComputedStyle(e).color,fondo:getComputedStyle(e).backgroundColor})));
  assert.equal(new Set(colores.map(c=>JSON.stringify(c))).size,1,'subidas, bajadas y sin cambios tienen el mismo color neutro');
  assert.doesNotMatch(await p.locator('[data-mov-producto]').allTextContents().then(x=>x.join('\n')),/Sincronizado después|post-cierre/);
  const descarga=p.waitForEvent('download');await p.click('#movExportarComparacion');
  const archivo=await descarga;assert.equal(archivo.suggestedFilename(),'comparacion-turnos-stock.csv');
  const csv=require('node:fs').readFileSync(await archivo.path(),'utf8');assert.match(csv,/Alfajor Milka/);assert.match(csv,/Juan/);assert.match(csv,/Ana/);
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
  assert.doesNotMatch(await p.locator('.mov81-detalle:visible').innerText(),/Sincronizado tarde|Sincronizado después|post-cierre/);
  assert.match(await p.locator('.mov81-detalle:visible').innerText(),/24/);
  assert.equal(await p.locator('.mov81-detalle .mov81-mov,.mov81-detalle .mov81-lista').count(),0,'el detalle conserva solo la cuenta, sin listas de registros');
  assert.doesNotMatch(await p.locator('.mov81-detalle:visible').innerText(),/Movimientos registrados/);
  await p.keyboard.press('Space');assert.equal(await btn.getAttribute('aria-expanded'),'false');
  await p.locator('[data-mov-producto="p"]').click();
  assert.equal(await p.locator('[data-mov-producto="p"] [data-mov-expandir]').getAttribute('aria-expanded'),'true');
  const elegir=async rubros=>{await p.click('#rubrosMovimientosUX .rubro-multi-trigger');await p.click('#rubrosMovimientosUX [data-rubro-clear]');for(const r of rubros)await p.locator('#rubrosMovimientosUX input[value="'+r+'"]').check();await p.click('#rubrosMovimientosUX [data-rubro-apply]');};
  await elegir(['Cigarrillos']);assert.equal(await p.locator('[data-mov-producto]').count(),1);assert.match(await p.locator('#tablaMovimientos').innerText(),/Tuvo stock negativo/);
  assert.equal(await p.locator('[data-mov-entre]').count(),0,'sin movimientos entre turnos se elimina toda la columna');
  assert.equal(await p.locator('.mov81-detalle td').getAttribute('colspan'),'4');
  await elegir(['Bebidas']);assert.equal(await p.locator('[data-mov-producto]').getAttribute('data-mov-producto'),'z');
  assert.equal(await p.locator('[data-mov-entre]').count(),2,'la columna vuelve con movimientos reales');
  await elegir([]);assert.equal(await p.locator('[data-mov-producto]').count(),3);
  for(const width of [1366,390]){
   await p.setViewportSize({width,height:900});
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await p.locator('[data-mov-producto="z"] [data-mov-expandir]').click();
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'el detalle tampoco desborda');
   await p.screenshot({path:path.join(process.env.UX_OUTPUT_DIR||require('os').tmpdir(),`stock-turnos-detalle-${width}.png`),fullPage:true});
   await p.locator('[data-mov-producto="z"] [data-mov-expandir]').click();
   await p.screenshot({path:path.join(process.env.UX_OUTPUT_DIR||require('os').tmpdir(),`stock-turnos-resumen-${width}.png`),fullPage:true});
  }
  assert.equal(await p.evaluate(()=>JSON.stringify({productos:db.productos,movs:db.movs,cierres:db.cierres})===window.__stockBefore),true);
  await p.evaluate(()=>{db.productos.find(p=>p.id==='q').stock=-4;pintarMovimientosTurnos();});
  assert.equal(await p.locator('[data-mov-producto="q"].mov81-critico').count(),1);
  assert.match(await p.locator('[data-mov-producto="q"] .pill.bad').innerText(),/Stock actual negativo/);
  assert.match(await p.locator('#movResumenComparacion').innerText(),/1 con stock actual negativo/);
  for(const stock of [0,null]){await p.evaluate(stock=>{db.productos.find(p=>p.id==='q').stock=stock;pintarMovimientosTurnos();},stock);assert.equal(await p.locator('[data-mov-producto="q"].mov81-critico').count(),0);assert.match(await p.locator('[data-mov-producto="q"] .pill.warn').innerText(),/Tuvo stock negativo/);}
  await p.evaluate(()=>{db.productos.find(p=>p.id==='q').stock=13;pintarMovimientosTurnos();});
  await p.evaluate(()=>{db.movs.push({id:'entre-reversa',prodId:'z',cant:-24,fecha:'2026-10-01T12:30:00Z',tipo:'ajuste'});pintarMovimientosTurnos();});
  assert.equal(await p.locator('th[data-mov-entre]').count(),1,'un neto cero también conserva los movimientos intermedios');
  assert.match(await p.locator('[data-mov-producto="z"] [data-mov-entre]').innerText(),/2 movimientos/);
  await p.selectOption('#movTurnoB','a');assert.match(await p.locator('#tablaMovimientos').innerText(),/dos turnos/);
  assert.equal(await p.locator('#movTurnoBContexto').innerText(),await p.locator('#movTurnoAContexto').innerText(),'el horario corresponde al turno seleccionado incluso con selección inválida');
  await p.evaluate(()=>{db.movs=[{prodId:'z',cant:5,fecha:'2026-10-01T12:30:00Z',tipo:'ingreso'}];movTurnoA='a';movTurnoB='b';pintarMovimientosTurnos();});
  assert.match(await p.locator('#movResumenComparacion').innerText(),/1 producto comparado.*1 con variaciones/,'la variación entre turnos también cuenta');
  await p.click('[data-mov-vista="periodo"]');assert.equal(await p.locator('#rubrosMovimientosUX').count(),1);
  assert.equal(await p.locator('#movTamano').count(),0,'sin selector de tamaño de página');
  await p.evaluate(()=>{f5Estado().membership.rol='empleado';movVista='turnos';vMovimientos(document.querySelector('#main'));});
  assert.equal(await p.locator('[data-mov-vista="turnos"]').count(),0);
  assert.deepEqual(h.errors.filter(e=>e.startsWith('pageerror:')),[]);
  console.log('REV81: resumen contraído, detalle accesible, orden, avisos, búsqueda, móvil, datos intactos y empleado verificados');
 }finally{await h.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
