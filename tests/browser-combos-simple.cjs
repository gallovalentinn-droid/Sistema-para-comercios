'use strict';
process.env.PW||='C:/Users/valen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
process.env.CHROME||='C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {openShadow}=require('./browser-fixture/shadow.cjs');
async function main(){
 const width=Number(process.env.WIDTH)||1366,h=await openShadow({width,height:950}),p=h.page;
 const foto=async n=>{if(process.env.UX_OUTPUT_DIR){fs.mkdirSync(process.env.UX_OUTPUT_DIR,{recursive:true});await p.screenshot({path:path.join(process.env.UX_OUTPUT_DIR,width+'-'+n+'.png'),fullPage:true});}};
 try{
  await p.evaluate(async()=>{db.productos=[{id:'alf',nombre:'Alfajor de prueba',precio:800,costo:400,stock:40,stockBase:40,unidad:'unidad',ean:'779100',rubro:'Almacén'},{id:'gas',nombre:'Gaseosa cola 500 ml',precio:1500,costo:900,stock:24,stockBase:24,unidad:'unidad',ean:'779200',rubro:'Bebidas'}];db.movs=[];db.ventas=[];db.combos=[];await guardar();vista='combos';render();});
  await p.click('#bNuevoCombo');await p.fill('#cb_buscar','Alfajor');
  const buscador=await p.locator('#cb_buscar').boundingBox(),resultados=await p.locator('#cb_res').boundingBox();
  assert.ok(resultados.y>=buscador.y+buscador.height+4,'los resultados quedan debajo del buscador, sin tapar el texto');
  assert.equal(await p.locator('#cb_buscar').evaluate(e=>{const r=e.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e;}),true,'el campo sigue visible y accesible');
  await p.locator('#cb_buscar').pressSequentially(' de');assert.equal(await p.inputValue('#cb_buscar'),'Alfajor de');assert.equal(await p.locator('#cb_buscar').evaluate(e=>document.activeElement===e),true);await foto('buscador-visible');
  await p.click('#cb_res li');await p.fill('#cb_buscar','779200');await p.click('#cb_res li');
  assert.equal(await p.inputValue('#cb_nom'),'','no se impone un nombre largo');
  await p.fill('#cb_nom','Combo merienda');await p.fill('#cb_precio','2000');await p.locator('#cb_nom').focus();
  assert.equal(await p.inputValue('#cb_precio'),'2.000,00');
  assert.match(await p.locator('#cb_gananciaVal').innerText(),/700,00/);assert.match(await p.locator('#cb_margenVal').innerText(),/35.*sobre.*venta/);
  assert.match(await p.locator('#cb_disponible').innerText(),/24.*Gaseosa/s);
  const menos=await p.locator('[data-ci-menos="0"]').boundingBox();assert.ok(menos.width>=44&&menos.height>=44);
  await p.click('[data-ci-mas="1"]');assert.match(await p.locator('#cb_disponible').innerText(),/12/);await p.click('[data-ci-menos="1"]');
  await p.fill('#cb_precio','2500');assert.equal(await p.locator('#guardarCombo').isDisabled(),true);assert.equal(await p.locator('#cb_confirmar_caro').isVisible(),true);await p.check('#confirmarPrecioCombo');assert.equal(await p.locator('#guardarCombo').isDisabled(),false);
  await p.fill('#cb_precio','2000');await p.locator('#cb_nom').focus();await foto('nuevo-combo');
  assert.equal(await p.locator('#ov .mod').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,'sin desbordamiento horizontal');
  await p.evaluate(()=>{window.__guardarComboReal=guardar;window.__persistirComboReal=persistirCambiosIdb;window.__comboCalls=0;window.__comboWrites=0;window.__comboRetries=0;guardar=(...args)=>{window.__comboCalls++;return window.__guardarComboReal(...args);};persistirCambiosIdb=(...args)=>{if(!args[0]?.puts?.some(p=>p.coleccion==='combos'))return window.__persistirComboReal(...args);window.__comboWrites++;if(window.__comboWrites===1)return new Promise((resolve,reject)=>{window.__comboResolve=async()=>{await window.__persistirComboReal(...args);resolve(true);};window.__comboReject=reject;});window.__comboRetries++;return window.__persistirComboReal(...args);};});
  await p.click('#guardarCombo');assert.equal(await p.locator('#guardarCombo').innerText(),'Guardando…');assert.equal(await p.locator('#guardarCombo').isDisabled(),true);
  await p.evaluate(()=>document.querySelector('#guardarCombo').onclick());assert.equal(await p.evaluate(()=>window.__comboCalls),1);
  await p.keyboard.press('Escape');assert.equal(await p.locator('#ov').count(),1,'no se cierra mientras guarda');
  await p.evaluate(()=>window.__comboReject(new Error('IDB_FALLO_PRUEBA')));await p.waitForFunction(()=>document.querySelector('#guardarCombo')?.textContent==='Reintentar guardado');
  assert.equal(await p.locator('#cb_error').isVisible(),true);assert.equal(await p.evaluate(()=>db.combos.length),1);
  await p.click('#guardarCombo');await p.waitForSelector('#ov',{state:'detached'});assert.equal(await p.evaluate(()=>window.__comboRetries),1);assert.equal(await p.evaluate(()=>db.combos.length),1,'un solo combo tras el reintento');
  assert.equal(await p.evaluate(async()=>{const d=await abrirIdb(),tx=d.transaction('combos','readonly'),done=idbTx(tx),rows=await idbReq(tx.objectStore('combos').getAll());await done;return rows.filter(c=>c.nombre==='Combo merienda'&&c.precio===2000).length;}),1,'el combo quedó guardado en IndexedDB');
  assert.match(await p.locator('#listaCombos').innerText(),/Ganancia bruta.*700,00/s);assert.match(await p.locator('#listaCombos').innerText(),/35.*sobre.*venta/);
  await p.evaluate(()=>{guardar=window.__guardarComboReal;persistirCambiosIdb=window.__persistirComboReal;});
  await p.click('[data-ed-combo]');assert.equal(await p.inputValue('#cb_precio'),'2.000,00');await p.fill('#cb_nom','Merienda actualizada');await p.click('#guardarCombo');await p.waitForSelector('#ov',{state:'detached'});assert.equal(await p.evaluate(()=>db.combos.length),1);
  await p.evaluate(()=>{prod('gas').stock=0;prod('gas').stockBase=0;prod('gas').costo=0;});await p.click('[data-ed-combo]');assert.match(await p.locator('#cb_disponible').innerText(),/0/);assert.match(await p.locator('#cb_costos').innerText(),/Faltan costos/);assert.equal(await p.locator('#guardarCombo').isDisabled(),false,'sin stock o costo se puede guardar');await foto('combo-sin-stock');
  assert.deepEqual(h.errors.filter(x=>x.startsWith('pageerror:')),[]);console.log(JSON.stringify({ok:true,width,precio:true,margenSobreVenta:35,stock:true,guardadoConReintento:true,edicion:true}));
 }finally{await h.close();}
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
