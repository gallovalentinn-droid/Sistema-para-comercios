'use strict';
process.env.PW ||= 'C:/Users/valen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
process.env.CHROME ||= 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=require('node:assert/strict');
const {openShadow,abrirTurno}=require('./browser-fixture/shadow.cjs');

async function main(){
  const width=Number(process.env.WIDTH)||1366;
  const h=await openShadow({width,height:1000}),p=h.page,abrirPago=width<=820?'#posMobilePay':'#abrirPago';
  try{
    assert.equal(await abrirTurno(p,'0','0','Valen'),true);
    await p.evaluate(async()=>{
      db.productos=[{id:'producto-saldo',nombre:'Alfajor de prueba',precio:800,costo:300,stock:10,stockBase:10,rubro:'Almacén',unidad:'u',ean:'7790000000800'}];
      db.clientes=[{id:'otro-cliente',nombre:'Otro cliente',saldo:0,saldoBase:0,alta:new Date().toISOString()}];db.ventas=[];db.pagos=[];db.ajustesFiado=[];db.movs=[];
      await guardar();vista='fiado';render();
    });
    await p.click('#nuevoFiado');await p.click('#fiadoCrearCliente');
    await p.fill('#c_nom','Cliente saldo de prueba');await p.click('#okC');
    await p.waitForFunction(()=>vista==='vender'&&!!clienteFiado);
    const clienteId=await p.evaluate(()=>clienteFiado);
    await p.fill('#scan','7790000000800');await p.press('#scan','Enter');
    await p.waitForSelector(abrirPago);await p.click(abrirPago);
    assert.equal(await p.inputValue('#cliF'),clienteId);
    await p.click('#anotar');
    await p.waitForFunction(()=>db.ventas.length===1&&ticket.length===0);
    const estado=await p.evaluate(async id=>{
      await esperarPersistenciaLocal();const local=await leerLocalIdb();
      return {venta:db.ventas[0],cliente:cli(id),guardado:local.db.clientes.find(c=>c.id===id),ventasGuardadas:local.db.ventas.length};
    },clienteId);
    assert.equal(estado.venta.forma,'fiado');assert.equal(estado.venta.clienteId,clienteId);
    assert.equal(estado.venta.total,800);
    assert.equal(estado.cliente.saldo,800,'el saldo en memoria suma la venta fiada');
    assert.equal(estado.guardado.saldo,800,'el saldo guardado suma la venta fiada');
    assert.equal(estado.ventasGuardadas,1);
    await p.evaluate(()=>{document.querySelectorAll('.ov').forEach(e=>e.remove());vista='fiado';fiadoFiltro='saldo';render();});
    await p.waitForSelector(`[data-fiado-cliente="${clienteId}"]`);
    assert.match(await p.locator(`[data-fiado-cliente="${clienteId}"]`).innerText(),/800,00/);
    await p.locator(`[data-fiado-cliente="${clienteId}"] .fiado-more > summary`).click();
    await p.locator(`[data-fiado-cliente="${clienteId}"] [data-fiar]`).click();
    await p.fill('#scan','7790000000800');await p.press('#scan','Enter');
    await p.waitForSelector(abrirPago);await p.press('#scan','F2');
    assert.equal(await p.locator('#cliF').count(),1,'F2 conserva la venta fiada ya elegida y no la cambia a efectivo');
    assert.equal(await p.inputValue('#cliF'),clienteId);
    await p.click('#anotar');await p.waitForFunction(()=>db.ventas.length===2&&ticket.length===0);
    const segunda=await p.evaluate(async id=>{await esperarPersistenciaLocal();const local=await leerLocalIdb();return {saldo:cli(id).saldo,guardado:local.db.clientes.find(c=>c.id===id).saldo,formas:local.db.ventas.map(v=>v.forma)};},clienteId);
    assert.equal(segunda.saldo,1600);assert.equal(segunda.guardado,1600);
    assert.deepEqual(segunda.formas,['fiado','fiado']);
    await p.evaluate(()=>{document.querySelectorAll('.ov').forEach(e=>e.remove());clienteFiado='';pago='transferencia';});
    await p.fill('#scan','7790000000800');await p.press('#scan','Enter');
    await p.waitForSelector(abrirPago);await p.press('#scan','F2');
    assert.equal(await p.locator('#rec').count(),1,'F2 mantiene efectivo como opción habitual sin venta fiada elegida');
    assert.equal(await p.locator('#cliF').count(),0);
    await p.click('[data-p="fiado"]');await p.click('#nuevoCliRapido');
    await p.fill('#c_nom','Cliente desde cobro');await p.click('#okC');
    assert.equal(await p.locator('#anotar').count(),1,'crear el cliente dentro del cobro devuelve a la confirmación fiada');
    const clienteDesdeCobro=await p.evaluate(()=>clienteFiado);
    assert.equal(await p.inputValue('#cliF'),clienteDesdeCobro);
    assert.equal(await p.evaluate(()=>ticket.length),1,'el alta conserva el ticket');
    await p.click('#anotar');await p.waitForFunction(()=>db.ventas.length===3&&ticket.length===0);
    assert.equal(await p.evaluate(async id=>{await esperarPersistenciaLocal();return (await leerLocalIdb()).db.clientes.find(c=>c.id===id).saldo;},clienteDesdeCobro),800);
    assert.deepEqual(h.errors.filter(e=>e.startsWith('pageerror:')),[]);
    console.log(JSON.stringify({ok:true,saldo:segunda.saldo,saldoGuardado:segunda.guardado,ventaFiada:true,boton:true,atajoF2:true,altaDentroDelCobro:true,saldoClienteNuevo:800}));
  }finally{await h.close();}
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
