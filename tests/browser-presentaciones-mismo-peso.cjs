'use strict';
process.env.PW||='C:/Users/valen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
process.env.CHROME||='C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {openShadow,abrirTurno}=require('./browser-fixture/shadow.cjs');

(async()=>{
  const width=Number(process.env.WIDTH)||1366,h=await openShadow({width,height:950}),p=h.page;
  try{
    await abrirTurno(p);
    await p.evaluate(()=>{
      guardar=async()=>{};
      db.productos=[{id:'helado',nombre:'Helado',unidad:'kg',ean:'1234',rubro:'Helados',precio:22000,costo:10000,stock:3,stockMin:1,stockDeseado:5,
        preciosPorPeso:[{nombre:'Cuarto',gramos:250,precio:8000,costoEnvase:300}]}];
      vista='productos';render();formProducto('helado');
    });
    if(await p.locator('#editarTamanos').isVisible())await p.click('#editarTamanos');
    await p.click('[data-tamano-gramos="250"]');
    assert.equal(await p.locator('.peso-presentacion').count(),2,'El atajo de 250 g permite otra presentación con ese peso');
    const segunda=p.locator('.peso-presentacion').nth(1);
    await segunda.locator('[data-peso-nombre]').fill('Milkshake');
    await segunda.locator('[data-peso-precio]').fill('6000');
    await segunda.locator('[data-peso-envase]').fill('500');
    await p.click('#guardarP');
    await p.waitForFunction(()=>!document.querySelector('#guardarP'));
    assert.deepEqual(await p.evaluate(()=>db.productos[0].preciosPorPeso.map(x=>[x.nombre,x.gramos,x.precio,x.costoEnvase])),
      [['Cuarto',250,8000,300],['Milkshake',250,6000,500]]);
    await p.evaluate(()=>{db.productos[0].preciosPorPeso.reverse();vista='vender';ticket=[];render();});
    await p.fill('#scan','helado');
    const resultados=p.locator('#res li[data-gramos="250"]');
    assert.equal(await resultados.count(),2);
    await resultados.filter({hasText:'Milkshake'}).click();
    await p.fill('#scan','cuarto');await p.press('#scan','Enter');
    assert.equal(await p.locator('#pesoG').count(),0,'Las dos presentaciones entran directamente');
    const estado=await p.evaluate(()=>({stock:db.productos[0].stock,lineas:ticket.map(buildVentaItem)}));
    assert.equal(estado.stock,3,'Preparar el ticket todavía no modifica stock');
    assert.deepEqual(estado.lineas.map(i=>[i.nombre,i.cant,i.precio*i.cant,i.costo*i.cant]),
      [['Milkshake',.25,6000,3000],['Cuarto',.25,8000,2800]]);
    assert.ok(estado.lineas.every(i=>i.prodId==='helado'));
    assert.equal(estado.lineas.reduce((n,i)=>n+i.cant,0),.5,'Ambas líneas consumen el mismo stock base');
    await p.evaluate(()=>{ticket=[];pintarPOS();});
    await p.fill('#scan','milkshake');await p.press('#scan','Enter');
    assert.equal(await p.evaluate(()=>ticket[0].nombre),'Milkshake','Enter con un nombre único conserva la presentación');
    await p.evaluate(()=>{ticket=[];pintarPOS();});
    await p.fill('#scan','1234');await p.press('#scan','Enter');
    await p.locator('[data-vender-presentacion="250"]').filter({hasText:'Milkshake'}).click();
    assert.equal(await p.evaluate(()=>ticket[0].nombre),'Milkshake','El código genérico conserva el nombre del tamaño elegido');
    await p.evaluate(()=>{ticket=[];pintarPOS();});
    await p.fill('#scan','helado');
    await p.evaluate(()=>{db.productos[0].preciosPorPeso.reverse();});
    await p.locator('#res li').filter({hasText:'Milkshake'}).click();
    assert.equal(await p.evaluate(()=>ticket[0].nombre),'Milkshake','Reordenar el catálogo no cambia la selección');
    await p.evaluate(()=>{ticket=[];pintarPOS();});
    await p.fill('#scan','helado');
    await p.evaluate(()=>{db.productos[0].preciosPorPeso=db.productos[0].preciosPorPeso.filter(x=>x.nombre!=='Milkshake');});
    await p.locator('#res li').filter({hasText:'Milkshake'}).click();
    assert.equal(await p.evaluate(()=>ticket.length),0,'Quitar una presentación no vende otra del mismo peso');
    if(process.env.UX_OUTPUT_DIR){fs.mkdirSync(process.env.UX_OUTPUT_DIR,{recursive:true});await p.screenshot({path:path.join(process.env.UX_OUTPUT_DIR,`mismo-peso-${width}.png`)});}
    assert.equal(h.errors.filter(x=>x.startsWith('pageerror')).length,0,JSON.stringify(h.errors));
    console.log(JSON.stringify({width,pass:true,cuartoYMilkshake250g:true,ventasReales:0}));
  }finally{await h.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
