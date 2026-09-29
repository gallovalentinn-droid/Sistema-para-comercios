const assert=require('node:assert/strict');
const path=require('node:path');
const {open}=require('../pruebas-navegador-REV58/harness.cjs');

async function check(width){
  const env=await open({width,height:850});
  try{
    const {page}=env;
    await page.evaluate(()=>{
      db.productos=[{id:'qa62',nombre:'Cigarrillos de prueba',ean:'7790000000001',rubro:'Cigarrillos',proveedor:'QA',costo:100,precio:150,stock:2,stockMin:5,stockDeseado:10,unidad:'unidad',origenId:'',porAtado:0,vence:''}];
      vista='productos';render();
    });
    assert.match(await page.locator('#tabProd').innerText(),/Bajo · 2/);
    await page.locator('#productosFiltrosToggle').click();
    assert.equal(await page.locator('#productosFiltrosExtra').isVisible(),true);
    await page.locator('#seleccionarFiltrados').click();
    assert.equal(await page.locator('[data-seleccionar-producto]').count(),1);
    if(width<760){
      const row=page.locator('#tabProd tbody tr');
      assert.equal(await row.locator('.product-extra').first().isVisible(),false);
      await row.locator('[data-expand-producto]').click();
      assert.equal(await row.locator('.product-extra').first().isVisible(),true);
    }
    if(process.env.SCREENSHOTS)await page.screenshot({path:path.join(__dirname,`productos-${width}.png`),fullPage:true});
    await page.evaluate(()=>{vista='vender';render();agregarAlTicket(db.productos[0]);});
    if(width<820)assert.equal(await page.locator('#posMobileCheckout').isVisible(),true);
    if(process.env.SCREENSHOTS)await page.screenshot({path:path.join(__dirname,`venta-${width}.png`),fullPage:true});
    await page.locator(width<820?'#posMobilePay':'#abrirPago').click();
    assert.equal(await page.locator('#cobrar').isEnabled(),true);
    assert.match(await page.locator('.vuelto').innerText(),/\$\s*0/);
    await page.evaluate(()=>{f62VersionNueva=66;f62PintarActualizacion();});
    assert.equal(await page.locator('#f62VersionBanner button').isEnabled(),false);
    await page.evaluate(()=>{cerrarModal();ticket=[];pintarPOS();});
    assert.equal(await page.locator('#f62VersionBanner button').isEnabled(),true);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.ok(overflow<=2,`desborde horizontal ${overflow}px a ${width}px`);
    assert.deepEqual(env.errors.filter(e=>!e.includes('Failed to load resource: net::ERR_FAILED')),[]);
    console.log(`OK ${width}px: productos, filtros, selección, cobro exacto y sin desborde`);
  }finally{await env.close();}
}
(async()=>{await check(1366);await check(390);})().catch(e=>{console.error(e);process.exitCode=1;});
