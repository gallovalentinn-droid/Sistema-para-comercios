'use strict';
process.env.PW||='C:/Users/valen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';process.env.CHROME||='C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=require('node:assert/strict'),{openShadow}=require('./browser-fixture/shadow.cjs');
(async()=>{const width=Number(process.env.WIDTH)||1366,h=await openShadow({width,height:950}),p=h.page;try{
 await p.evaluate(()=>{const dia=(n)=>{const d=new Date();d.setDate(d.getDate()-n);d.setHours(12,0,0,0);return d.toISOString();};db.productos=[{id:'p',nombre:'Producto de período',stockBase:0,stock:6,rubro:'Bebidas',unidad:'unidad'}];db.movs=[1,10,20].map((n,i)=>({id:'m'+i,prodId:'p',tipo:'ingreso',cant:i+1,fecha:dia(n)}));db.ventas=[];db.cierres=[];vista='movimientos';render();window.__fechaPruebaStock=n=>{const d=new Date();d.setDate(d.getDate()-n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};});
 assert.equal(await p.locator('#movDesdeStockUX,#movHastaStockUX').count(),2);assert.equal(await p.locator('.mov-ux-totales-wrap,.mov-ux-totales').count(),0);
 const fechas=await p.evaluate(()=>({desde:window.__fechaPruebaStock(21),hasta:window.__fechaPruebaStock(9)}));
 await p.fill('#movDesdeStockUX',fechas.desde);await p.fill('#movHastaStockUX',fechas.hasta);await p.locator('#movHastaStockUX').dispatchEvent('change');
 assert.equal((await p.locator('[data-mov-fila="p"] [data-label="Ingresos"]').textContent()).trim(),'+5');
 await p.evaluate(()=>{db.movs.forEach(m=>m._v4receivedAt=new Date().toISOString());pintarMovimientosDia();});
 assert.doesNotMatch(await p.locator('#tablaMovimientos').innerText(),/Sincronizado tarde|Sincronizado después|post-cierre/);
 await p.click('[data-mov-vista="turnos"]');await p.click('[data-mov-vista="periodo"]');assert.equal(await p.inputValue('#movDesdeStockUX'),fechas.desde);assert.equal(await p.inputValue('#movHastaStockUX'),fechas.hasta);
 await p.fill('#movDesdeStockUX',await p.evaluate(()=>window.__fechaPruebaStock(0)));await p.locator('#movDesdeStockUX').dispatchEvent('change');assert.equal(await p.locator('[data-mov-fila]').count(),0);assert.match(await p.locator('#tablaMovimientos [role="alert"]').innerText(),/Desde.*Hasta/i);assert.equal(await p.locator('#movExportar').count(),0);
 await p.fill('#movDesdeStockUX',fechas.desde);await p.locator('#movDesdeStockUX').dispatchEvent('change');assert.equal(await p.locator('[data-mov-fila]').count(),1);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.deepEqual(h.errors.filter(x=>x.startsWith('pageerror:')),[]);console.log(JSON.stringify({ok:true,width,periodoPersonalizado:true,validacion:true,conservaPeriodo:true,sinTotales:true}));
}finally{await h.close();}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
