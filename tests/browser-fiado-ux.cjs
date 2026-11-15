'use strict';
// App real, clientes sintéticos y servicios externos bloqueados por el arnés.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {openShadow,abrirTurno}=require('./browser-fixture/shadow.cjs');
async function main(){
 const width=Number(process.env.WIDTH)||1366,out=process.env.UX_OUTPUT_DIR;
 const h=await openShadow({width,height:width<600?1000:1050}),p=h.page;
 const captura=async nombre=>{if(out){fs.mkdirSync(out,{recursive:true});await p.screenshot({path:path.join(out,`${width}-${nombre}.png`),fullPage:true});}};
 try{
  assert.equal(await abrirTurno(p,'0','0','Valen'),true);
  await p.evaluate(()=>{
   const actual=new Date(),anterior=new Date();anterior.setDate(anterior.getDate()-35);
   db.config.diasPlazoFiado=30;db.config.recargoFiadoPct=10;
   db.clientes=[{id:'ju',nombre:'Juan',tel:'1122589426',saldoBase:1200,alta:anterior.toISOString()},
    {id:'an',nombre:'Ana',tel:'5491122334455',saldoBase:2500,alta:actual.toISOString()},
    {id:'br',nombre:'Bruno',tel:'',saldoBase:0,alta:actual.toISOString()},
    {id:'la',nombre:'Laura',tel:'',saldoBase:0,alta:actual.toISOString()}];
   db.ventas=[];db.ajustesFiado=[];db.pagos=[{id:'credito-la',clienteId:'la',monto:100,fecha:actual.toISOString(),forma:'efectivo'}];
   recalcularDerivados(db);fiadoFiltro='saldo';vista='fiado';render();
  });
  await p.waitForFunction(()=>!document.querySelector('.toast'));
  assert.equal(await p.locator('.fiado-table tbody tr').count(),2);
  assert.match(await p.locator('[data-fiado-filtro="saldo"]').innerText(),/Con saldo \(2\)/);
  assert.match(await p.locator('[data-fiado-filtro="todos"]').innerText(),/Todos los clientes \(4\)/);
  assert.match(await p.locator('#fiadoTotalAdeudado').innerText(),/3\.700,00/);
  assert.match(await p.locator('#fiadoMontoVencido').innerText(),/1\.200,00/);
  const ju=p.locator('[data-fiado-cliente="ju"]'),ana=p.locator('[data-fiado-cliente="an"]');
  assert.equal(await ju.locator('[data-pago]').isVisible(),true);
  assert.equal(await ju.locator('[data-cta]').isVisible(),true);
  assert.equal(await ju.locator('[data-fiar]').isVisible(),false);
  assert.equal(await ju.locator('[data-rec]').isVisible(),false);
  assert.match(await ju.locator('.fiado-phone-number').innerText(),/11 2258-9426/);
  assert.equal(await ju.locator('a[href^="https://wa.me/"]').getAttribute('href'),'https://wa.me/1122589426');
  assert.equal(await ju.locator('.fiado-days.is-overdue').count(),1);
  assert.equal(await ju.locator('.fiado-mora-status.bad').count(),1);
  assert.equal(await ana.locator('.fiado-days.is-overdue').count(),0);
  assert.equal(await ju.locator('td[data-label="Saldo"]').evaluate(e=>getComputedStyle(e).textAlign),'right');
  assert.equal(await p.locator('.fiado-search svg').count(),1);
  await captura('fiado');
  await ju.locator('.fiado-more summary').click();assert.equal(await ju.locator('[data-rec]').isVisible(),true);await captura('acciones');
  await ju.locator('.fiado-more summary').press('Escape');assert.equal(await ju.locator('[data-rec]').isVisible(),false);
  await ju.locator('.fiado-more summary').click();await ju.locator('[data-rec]').click();assert.equal(await p.locator('#rc_monto').isVisible(),true);await p.locator('#ov [data-cerrar]').first().click();
  await ju.locator('[data-cta]').click();assert.match(await p.locator('#ov').innerText(),/Cuenta de Juan/);await p.locator('#ov [data-cerrar]').first().click();
  await p.locator('[data-fiado-filtro="todos"]').click();assert.equal(await p.locator('.fiado-table tbody tr').count(),4);
  assert.match(await p.locator('[data-fiado-cliente="la"]').innerText(),/Crédito/);
  assert.equal(await p.locator('[data-fiado-cliente="br"] [data-pago]').count(),0);
  await p.fill('#qc','11 2258-9426');assert.equal(await p.locator('.fiado-table tbody tr').count(),1);assert.match(await p.locator('#tabCli').innerText(),/Juan/);
  await p.fill('#qc','no existe');assert.match(await p.locator('#tabCli').innerText(),/Sin resultados/);await p.fill('#qc','');
  await p.click('#nc');assert.equal(await p.inputValue('#c_nom'),'');assert.equal(await p.evaluate(()=>db.clientes.length),4);await p.locator('#ov [data-cerrar]').first().click();
  await p.click('#nuevoFiado');assert.match(await p.locator('#ov').innerText(),/Nueva venta fiada/);await p.locator('#ov [data-cerrar]').first().click();
  await ju.locator('.fiado-more summary').click();await ju.locator('[data-fiar]').click();assert.equal(await p.evaluate(()=>vista),'vender');assert.equal(await p.evaluate(()=>clienteFiado),'ju');
  await p.evaluate(()=>{vista='fiado';fiadoFiltro='saldo';render();});
  await ju.locator('[data-pago]').click();assert.equal(await p.inputValue('#p_monto'),'1.200,00');await p.fill('#p_monto','200');await p.click('#okP');
  await p.waitForFunction(()=>db.pagos.some(x=>x.clienteId==='ju'&&x.monto===200)&&!document.querySelector('#okP'));
  assert.equal(await p.evaluate(()=>cli('ju').saldo),1000);assert.match(await p.locator('#fiadoTotalAdeudado').innerText(),/3\.500,00/);assert.match(await p.locator('#fiadoMontoVencido').innerText(),/1\.000,00/);
  const dimensiones=await p.evaluate(()=>({ancho:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(dimensiones.scroll<=dimensiones.ancho+1,JSON.stringify(dimensiones));
  assert.deepEqual(h.errors.filter(e=>e.startsWith('pageerror:')),[]);
  console.log(JSON.stringify({ok:true,width,clientes:4,conSaldo:2,cobro:200,saldoJuan:1000,menu:true,telefono:true,filtros:true}));
 }finally{await h.close();}
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
