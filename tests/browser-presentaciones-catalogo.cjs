'use strict';
process.env.PW||='C:/Users/valen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
process.env.CHROME||='C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {openShadow,abrirTurno}=require('./browser-fixture/shadow.cjs');

async function main(){
  const width=Number(process.env.WIDTH)||1366,theme=process.env.THEME||'oscuro',h=await openShadow({width,height:900}),p=h.page;
  let releaseAccounts,accountCalls=0,creates=0,accountMode='enabled';
  const gate=new Promise(r=>releaseAccounts=r);
  await p.route(/\/(?:api|functions\/v1)\/mercadopago$/,async route=>{
    const body=route.request().postDataJSON();
    if(body.action==='accounts'){
      accountCalls++;await gate;
      if(accountMode==='error')return route.fulfill({status:503,json:{code:'MERCADO_PAGO_NO_DISPONIBLE'}});
      return route.fulfill({json:{configured:true,capabilities:{newPayments:accountMode==='enabled',transferVerification:true},accounts:[{id:'a',alias:'Principal',primary:true,posId:'POS'}]}});
    }
    if(body.action==='qr-create'){creates++;return route.fulfill({json:{attempt:{status:'created',qrData:'000201-synthetic'}}});}
    if(body.action==='qr-cancel')return route.fulfill({json:{attempt:{status:'canceled'}}});
    if(body.action==='qr-status')return route.fulfill({json:{attempt:{status:'created',qrData:'000201-synthetic'}}});
    if(body.action==='sale-receipts')return route.fulfill({json:{receipts:[]}});
    throw Error('Acción inesperada: '+body.action);
  });
  try{
    await abrirTurno(p);
    await p.evaluate(()=>{
      db.config.manejaTurnos=false;
      db.productos=[{id:'helado',nombre:'Helado',unidad:'kg',ean:'1234',rubro:'Helados',precio:22000,costo:11000,stock:3,stockMin:1,stockDeseado:5,
        preciosPorPeso:[{nombre:'Helado de cuarto',gramos:250,precio:8000,costoEnvase:700},{gramos:1000,precio:22000,costoEnvase:1150}]},
        {id:'normal',nombre:'Alfajor',unidad:'unidad',precio:1500,costo:500,stock:10,stockMin:2,stockDeseado:15}];
      vista='vender';ticket=[];render();
    });
    await p.evaluate(tema=>{
      localStorage.setItem('micomercio:tema',tema);
      window.dispatchEvent(new StorageEvent('storage',{key:'micomercio:tema',newValue:tema}));
    },theme);
    assert.equal(await p.locator('html').getAttribute('data-tema'),theme);
    await p.evaluate(()=>{
      db.productos.push({id:'jamon',nombre:'Jamón',unidad:'kg',precio:3000,costo:1000,stock:10,
        preciosPorPeso:[{nombre:'Jamón de cuarto',gramos:250,precio:2000,costoEnvase:50}]});
    });
    await p.fill('#scan','jamon');
    assert.equal(await p.locator('#res li').count(),1,'Un producto con una presentación aparece una sola vez, sin otra opción de peso libre');
    assert.equal(await p.locator('#res li .nm').innerText(),'Jamón','Con un solo tamaño se conserva el nombre del producto central');
    assert.doesNotMatch(await p.locator('#res').innerText(),/Peso libre|\/kg/);
    if(process.env.UX_OUTPUT_DIR){fs.mkdirSync(process.env.UX_OUTPUT_DIR,{recursive:true});await p.screenshot({path:path.join(process.env.UX_OUTPUT_DIR,`jamon-directo-${width}-${theme}.png`)});}
    await p.locator('#res li').click();
    assert.equal(await p.locator('#pesoG').count(),0,'Jamón entra directo sin preguntar gramos');
    assert.deepEqual(await p.evaluate(()=>({kg:ticket[0].cant,total:ticket[0].precio*ticket[0].cant})),{kg:.25,total:2000});
    await p.evaluate(()=>{ticket=[];pintarPOS();});
    await p.evaluate(()=>{
      db.productos.push({id:'nuevo',nombre:'Helado nuevo',ean:'987654',unidad:'kg',precio:9000,costo:3000,stock:5,
        preciosPorPeso:[{nombre:'Helado nuevo medio',gramos:500,precio:7000,costoEnvase:100}]});
      seleccionarProducto(prod('nuevo'));
    });
    assert.equal(await p.locator('#pesoG').count(),0,'Seleccionar la ficha con un solo tamaño no pide gramos');
    assert.equal(await p.evaluate(()=>ticket[0].cant),0.5);
    await p.fill('#scan','987654');await p.press('#scan','Enter');
    assert.equal(await p.locator('#pesoG').count(),0,'El código también agrega la presentación directamente');
    assert.equal(await p.evaluate(()=>ticket[0].cant),1);
    await p.evaluate(()=>{ticket=[];pintarPOS();});
    await p.fill('#scan','1234');await p.press('#scan','Enter');
    assert.equal(await p.locator('#pesoG').count(),0,'Con varios tamaños no pregunta gramos');
    assert.equal(await p.getByRole('button',{name:'Peso libre',exact:true}).count(),0,'Con presentaciones tampoco se ofrece peso libre desde la selección por código');
    assert.equal(await p.locator('#scan').evaluate(e=>e===document.activeElement),false,'El lector no sigue activo detrás del selector');
    await p.keyboard.type('987654');await p.keyboard.press('Enter');
    assert.equal(await p.evaluate(()=>ticket.length),0,'Un segundo código no agrega productos detrás del selector');
    await p.locator('[data-vender-presentacion="1000"]').click();
    assert.equal(await p.evaluate(()=>ticket[0].cant),1);
    assert.equal(await p.locator('#scan').evaluate(e=>e===document.activeElement),true,'Al elegir tamaño vuelve el foco al lector');
    await p.keyboard.type('987654');await p.keyboard.press('Enter');
    assert.equal(await p.evaluate(()=>ticket.length),2,'El siguiente código entra sin volver a enfocar el lector');
    await p.keyboard.type('1234');await p.keyboard.press('Enter');await p.keyboard.press('Escape');
    assert.equal(await p.locator('#scan').evaluate(e=>e===document.activeElement),true,'Cancelar también devuelve el foco al lector');
    await p.evaluate(()=>{ticket=[];pintarPOS();});
    await p.evaluate(()=>{db.productos.push({id:'libre',nombre:'Pan sin tamaños',unidad:'kg',precio:3000,costo:1000,stock:5});});
    await p.fill('#scan','pan sin tamaños');
    await p.locator('#res li[data-id="libre"]').click();
    assert.equal(await p.locator('#pesoG').count(),1,'Solo el producto sin presentaciones pregunta el peso');
    assert.equal(await p.locator('#pesoG').evaluate(e=>e===document.activeElement),true);
    await p.locator('.ov [aria-label="Cerrar"]').click();
    await p.fill('#scan','helado');
    const matches=await p.locator('#res li').allTextContents();
    assert.match(matches[0],/Helado de cuarto/);
    assert.equal(await p.locator('#res li[data-id="helado"]:not([data-gramos])').count(),0,'Con tamaños no aparece una entrada que pregunte gramos');
    await p.locator('#res li[data-gramos="250"]').click();
    assert.equal(await p.locator('#pesoG').count(),0);
    await p.fill('#scan','1 kg helado');await p.locator('#res li[data-gramos="1000"]').click();
    const ticket=await p.evaluate(()=>({stock:db.productos[0].stock,items:ticket.map(buildVentaItem)}));
    assert.equal(ticket.stock,3);
    assert.deepEqual(ticket.items.map(i=>[i.nombre,i.cant,i.precio*i.cant,i.costo*i.cant]),[['Helado de cuarto',0.25,8000,3450],['Helado 1 kg',1,22000,12150]]);
    await p.evaluate(()=>{vista='productos';fProd.vista='detallada';render();});
    const headers=await p.locator('#tabProd th').allTextContents();
    assert.deepEqual(headers.map(x=>x.trim()),['Producto','Rubro','Código','Stock','Costo','Venta','Margen','Acciones']);
    const row=p.locator('[data-producto-fila="helado"]');
    assert.equal(await p.locator('.product-detail-row:visible').count(),0,'El detalle cerrado no aparece tampoco en celular');
    const closedHeight=(await row.boundingBox()).height;
    await row.locator('[data-expand-producto]').click();
    assert.ok((await row.boundingBox()).height<=closedHeight+1,'Expandir el detalle no desplaza los valores y acciones de la fila');
    const detailId=await row.locator('[data-expand-producto]').getAttribute('aria-controls');
    const detail=await p.locator('#'+detailId).innerText();
    assert.match(detail,/Helado de cuarto/);assert.match(detail,/¼ kg/);assert.match(detail,/8\.000/);
    assert.match(detail,/Helado 1 kg/);assert.match(detail,/22\.000/);
    const porcion=p.locator('#'+detailId+' [data-presentacion-gramos="250"]');
    assert.deepEqual((await porcion.locator('[role="cell"]').allTextContents()).map(x=>x.trim()),
      ['Helado de cuarto','¼ kg','$8.000,00','$700,00','56,9%']);
    await row.locator('[data-expand-producto]').click();
    assert.equal(await p.locator('#'+detailId).isVisible(),false);
    await row.locator('[data-expand-producto]').click();
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    if(process.env.UX_OUTPUT_DIR){fs.mkdirSync(process.env.UX_OUTPUT_DIR,{recursive:true});await p.screenshot({path:path.join(process.env.UX_OUTPUT_DIR,`presentaciones-${width}-${theme}.png`),fullPage:true});}
    await p.evaluate(()=>{vista='caja';render();});
    await p.locator('#operacionesCaja > summary').click();
    assert.doesNotMatch(await p.locator('#main').innerText(),/Ganancia estimada/);
    await p.evaluate(()=>{mpPublico=()=>true;vista='vender';render();pago='transferencia';abrirModalPago();});
    await p.waitForFunction(()=>document.querySelector('#mpPanel'));
    await p.waitForFunction(()=>!!document.querySelector('#mpCuenta option[value=""]'));
    assert.equal(await p.locator('#mpGenerarQR').isVisible(),true,'QR debe verse antes de que respondan las cuentas');
    await p.click('#mpGenerarQR');
    assert.equal(await p.locator('#mpContinuarCobro').innerText(),'Mostrar QR');
    assert.equal(await p.locator('#mpContinuarCobro').isDisabled(),true);
    assert.equal(creates,0);
    if(process.env.UX_OUTPUT_DIR)await p.screenshot({path:path.join(process.env.UX_OUTPUT_DIR,`qr-cargando-${width}-${theme}.png`),fullPage:true});
    releaseAccounts();await p.waitForSelector('#mpCuenta option[value="a"]',{state:'attached'});
    await p.waitForFunction(()=>!document.querySelector('#mpContinuarCobro').disabled);
    await p.locator('#mpContinuarCobro').dblclick().catch(()=>{});await p.waitForSelector('#mpQR svg');
    assert.equal(creates,1);assert.equal(await p.evaluate(()=>db.ventas.length),0);
    await p.locator('.ov [aria-label="Cerrar"]').click();
    await p.waitForFunction(()=>!mpLeerPendiente());
    accountMode='paused';await p.evaluate(()=>abrirModalPago());
    await p.waitForSelector('#mpCuenta option[value="a"]',{state:'attached'});
    assert.equal(await p.locator('#mpGenerarQR').isVisible(),false,'La capacidad explícitamente pausada conserva el bloqueo');
    await p.locator('.ov [aria-label="Cerrar"]').click();
    accountMode='error';await p.evaluate(()=>abrirModalPago());
    await p.waitForSelector('#mpEstado:has-text("No pudimos consultar")');
    assert.equal(await p.locator('#mpGenerarQR').isDisabled(),true,'QR indica que no está disponible si falla la consulta de cuentas');
    assert.equal(await p.locator('#mpContinuarCobro').isDisabled(),true);
    assert.equal(creates,1,'El error de cuentas no habilita nuevas creaciones');
    assert.equal(h.errors.filter(x=>x.startsWith('pageerror')).length,0,JSON.stringify(h.errors));
    console.log(JSON.stringify({width,theme,pass:true,accountCalls,creates,ventasReales:0}));
  }finally{releaseAccounts();await h.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
