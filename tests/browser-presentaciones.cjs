'use strict';
process.env.PW||='C:/Users/valen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
process.env.CHROME||='C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=require('node:assert/strict');
const {openShadow,abrirTurno}=require('./browser-fixture/shadow.cjs');
(async()=>{for(const width of [1366,390]){
 const h=await openShadow({width,publicUrl:process.env.PUBLIC_BETA||null});try{const p=h.page;
 await p.evaluate(()=>{db.productos=[{id:'helado',nombre:'Helado a granel',unidad:'kg',precio:16000,costo:8000,stock:10,stockBase:10,stockMin:1,stockDeseado:20,rubro:'Helados',origenId:''}];db.combos=[];db.ventas=[];db.movs=[];db.config.manejaTurnos=true;enLinea=true;vista='productos';render();});
 for(const [nombre,gramos,precio] of [['Cuarto',250,5500],['Medio',500,10000],['Kilo',1000,18000]]){
  await p.click('#bTamanos');await p.click('#nuevoTamano');await p.fill('#tamNombre',nombre);await p.fill('#tamGramos',String(gramos));await p.fill('#tamPrecio',String(precio));await p.click('#guardarTamano');await p.waitForSelector('#bTamanos');
 }
 const config=await p.evaluate(()=>db.combos.map(c=>({nombre:c.nombre,precio:c.precio,cant:c.items[0].cant})));assert.deepEqual(config,[{nombre:'Cuarto',precio:5500,cant:0.25},{nombre:'Medio',precio:10000,cant:0.5},{nombre:'Kilo',precio:18000,cant:1}]);
 await p.evaluate(()=>{enLinea=false});assert.equal(await abrirTurno(p,'0','0','Prueba'),true);
 for(const name of ['Cuarto','Cuarto','Medio','Kilo'])await p.getByRole('button',{name:new RegExp('^'+name+' ')}).click();
 const ticketData=await p.evaluate(()=>({lines:ticket.map(i=>({nombre:i.nombre,cant:i.cant,total:i.precio*i.cant})),total:totalTicket()}));assert.equal(ticketData.total,39000);assert.equal(ticketData.lines[0].cant,2);
 if(process.env.SHOT_DIR)await p.screenshot({path:process.env.SHOT_DIR+'/tamanos-'+width+'.png',fullPage:true});
 assert.equal(await p.evaluate(()=>{recibido='39000';return cerrarVenta('efectivo')}),true);await p.waitForTimeout(400);
 const sold=await p.evaluate(async()=>{await esperarPersistenciaLocal();return{stock:db.productos[0].stock,venta:db.ventas[0],stored:await leerLocalIdb()}});
 assert.equal(sold.stock,8);assert.equal(sold.venta.total,39000);assert.equal(sold.venta.items.reduce((s,i)=>s+i.costo*i.cant,0),16000);assert.equal(sold.stored.db.ventas.length,1);assert.equal(sold.stored.db.ventas[0].items[0].componentes[0].cant,0.25);assert.equal(sold.stored.db.combos.length,3);
 const payload=await p.evaluate(()=>f3OperacionVenta(db.ventas[0]).payload);assert.equal(payload.venta.total,39000);assert.deepEqual(payload.items.map(i=>[i.cantidad,i.precio_unitario,i.componentes[0].cantidad_por_combo]),[[2,5500,0.25],[1,10000,0.5],[1,18000,1]]);
 // La configuración nueva no reescribe el consumo histórico de la venta.
 await p.evaluate(()=>{db.combos[0].items[0].cant=0.4;db.combos[0].precio=9000;enLinea=true;});
 assert.equal(await p.evaluate(()=>anularVenta(db.ventas[0].id,'Prueba de devolución de kilos')),true);
 assert.equal(await p.evaluate(()=>db.productos[0].stock),10);assert.equal(await p.evaluate(()=>anularVenta(db.ventas[0].id,'Segundo intento')),false);assert.equal(await p.evaluate(()=>db.productos[0].stock),10);
 // Desactivar o archivar la base retira los accesos de venta.
 await p.evaluate(()=>{db.combos[0].activo=false;vista='vender';render()});assert.equal(await p.locator('[data-vender-tamano]').count(),2);
 await p.evaluate(()=>{db.productos[0].archivadoAt=new Date().toISOString();db.productos.push({id:'queso',nombre:'Queso',unidad:'kg',stock:3,costo:100,precio:200});render();formPresentacion(db.combos[1].id)});assert.equal(await p.locator('[data-vender-tamano]').count(),0);assert.equal(await p.locator('#tamBase').count(),0,'una base archivada no debe sustituirse por otra al editar');
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await p.evaluate(()=>esperarPersistenciaLocal());await p.reload();await p.waitForTimeout(400);
 const recovered=await p.evaluate(async()=>{sesion={user:{id:'00000000-0000-4000-8000-0000000000aa'}};const local=await leerLocalIdb();return{ventas:local.db.ventas.length,anulada:local.db.ventas[0].anulada,consumo:local.db.ventas[0].items[0].componentes[0].cant,tamanos:local.db.combos.length}});assert.deepEqual(recovered,{ventas:1,anulada:true,consumo:0.25,tamanos:3});
 assert.equal(h.errors.filter(e=>e.startsWith('pageerror:')).length,0,JSON.stringify(h.errors));
 console.log(JSON.stringify({width,configuracion:true,venta_offline_total:39000,stock_inicial:10,stock_venta:8,stock_anulada:10,sin_escrituras_externas:true}));
 }finally{await h.close();}
}})().catch(e=>{console.error(e);process.exitCode=1});
