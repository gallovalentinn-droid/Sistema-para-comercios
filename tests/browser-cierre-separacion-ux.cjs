'use strict';
// UI real, datos sintéticos; el arnés bloquea toda escritura a servicios externos.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {openShadow,abrirTurno}=require('./browser-fixture/shadow.cjs');
async function main(){
 const width=Number(process.env.WIDTH)||1366,out=process.env.UX_OUTPUT_DIR;
 const h=await openShadow({width,height:width<600?1000:1100,publicUrl:process.env.PUBLIC_URL||null}),p=h.page;
 const capture=async name=>{if(out){fs.mkdirSync(out,{recursive:true});await p.locator('.cash-close-dialog').screenshot({path:path.join(out,`${width}-${name}.png`)});}};
 try{
  await p.evaluate(()=>{db.config.moduloCigarros=false;db.config.separaCigarrillosAlCierre=true;db.config.manejaTurnos=true;db.cierres=[];db.ventas=[];db.egresos=[];db.pagos=[];f3Estado.session=null;});
  assert.equal(await abrirTurno(p,'5000','0','Valen'),true);
  await p.evaluate(()=>{
   db.ventas=[[10000,'efectivo','Cigarrillos'],[3000,'transferencia','Cigarrillos'],[2000,'tarjeta','Cigarrillos'],[72500,'efectivo','Almacén']].map(([monto,forma,rubro],i)=>{
    const v={id:'ux-venta-'+i,_v4id:f3Uuid(),nro:i+1,fecha:new Date().toISOString(),total:monto,subtotal:monto,forma,pagos:[{forma,monto}],items:[{lineId:'l'+i,tipo:'producto',prodId:'ux-p'+i,nombre:rubro,rubro,cant:1,precio:monto,costo:0,bruto:monto,neto:monto}]};f5EstamparSesionLocal(v,f3Estado.session);return v;
   });vista='caja';globalThis.__miCajaVista='cierre';render();
  });
  await p.waitForFunction(()=>!document.querySelector('.toast'));
  await p.fill('#contadoG','87500');await capture('contar');await p.click('#pasoCajaSiguiente');await capture('revisar');await p.click('#pasoCajaFinalizar');
  assert.equal(await p.inputValue('#apartadoCigarrillos'),'15000','se precarga el total de todos los medios, sin pulsar Usar sugerencia');
  assert.equal(await p.locator('#apartadoCigarrillos').evaluate(e=>e.readOnly),true);
  const panel=p.locator('[data-caja-paso="finalizar"]');
  assert.doesNotMatch(await panel.innerText(),/Sugerencia por ventas|Usar sugerencia|copia de seguridad|Efectivo contado:/i);
  assert.match(await panel.innerText(),/Tenés que separar/);
  assert.equal(await p.locator('#editarApartadoCigarrillos svg').count(),1);
  assert.equal(await p.locator('#cerrarCaja').isDisabled(),true);
  await capture('finalizar-pendiente');await p.click('[data-destino-caja="retirar_todo"]');await capture('finalizar');
  await p.click('[data-destino-caja="dejar"]');assert.equal(await p.inputValue('#quedaCajaGeneral'),'72500');
  await p.click('#editarApartadoCigarrillos');await p.fill('#apartadoCigarrillos','100000');assert.equal(await p.locator('#cerrarCaja').isDisabled(),true);assert.equal(await p.locator('#guardarApartadoCigarrillos').isDisabled(),true);
  await p.fill('#apartadoCigarrillos','12000');assert.equal(await p.locator('#cerrarCaja').isDisabled(),true,'el borrador no permite cerrar antes de guardar');await p.click('#guardarApartadoCigarrillos');assert.equal(await p.inputValue('#quedaCajaGeneral'),'75500');
  await p.click('#editarApartadoCigarrillos');await p.fill('#apartadoCigarrillos','0');await p.click('#cancelarApartadoCigarrillos');assert.equal(await p.inputValue('#apartadoCigarrillos'),'12000');assert.equal(await p.inputValue('#quedaCajaGeneral'),'75500');
  await p.fill('#quedaCajaGeneral','20000');await p.click('#pasoCajaAnterior');await p.click('#pasoCajaFinalizar');assert.equal(await p.inputValue('#apartadoCigarrillos'),'12000');assert.equal(await p.inputValue('#quedaCajaGeneral'),'20000');
  assert.match(await panel.innerText(),/55[.,]500|55\.500/);await capture('finalizar-editado');
  await p.fill('#responsableCierreCaja','Valen');await p.click('#cerrarCaja');await p.click('#okC');await p.waitForFunction(()=>db.cierres.length===1);
  const cierre=await p.evaluate(async()=>{await esperarPersistenciaLocal();const d=await abrirIdb(),tx=d.transaction('cierres','readonly'),rows=await idbReq(tx.objectStore('cierres').getAll());return rows[0];});
  assert.equal(cierre.contadoGeneral,87500);assert.equal(cierre.apartadoCigarrillos,12000);assert.equal(cierre.quedaGeneral,20000);assert.equal(cierre.retiroGeneral,67500);assert.equal(cierre.ventaIds.length,4);
  // Cero es una elección válida. No se amplía ni modifica el cálculo financiero.
  await p.evaluate(()=>{document.querySelectorAll('.ov').forEach(e=>e.remove());db.ventas=[];db.pagos=[];db.egresos=[];});
  assert.equal(await abrirTurno(p,'0','0','Valen'),true);
  await p.evaluate(()=>{vista='caja';globalThis.__miCajaVista='cierre';render();});await p.fill('#contadoG','0');await p.click('#pasoCajaSiguiente');await p.click('#pasoCajaFinalizar');assert.equal(await p.inputValue('#apartadoCigarrillos'),'0');await p.click('[data-destino-caja="retirar_todo"]');assert.equal(await p.locator('#cerrarCaja').isDisabled(),false);
  await p.click('#cerrarCaja');await p.click('#okC');await p.waitForFunction(()=>db.cierres.length===2&&f3Estado.session===null&&document.querySelector('#ov textarea'));await p.evaluate(()=>document.querySelectorAll('.ov').forEach(e=>e.remove()));
  assert.equal(await abrirTurno(p,'10000','0','Valen'),true);
  await p.evaluate(()=>{const v={id:'ux-transferencia',_v4id:f3Uuid(),nro:5,fecha:new Date().toISOString(),total:30000,subtotal:30000,forma:'transferencia',pagos:[{forma:'transferencia',monto:30000}],items:[{tipo:'producto',rubro:'Cigarrillos',nombre:'Cigarrillos',cant:1,neto:30000,precio:30000,costo:0}]};f5EstamparSesionLocal(v,f3Estado.session);db.ventas=[v];vista='caja';globalThis.__miCajaVista='cierre';render();});
  await p.fill('#contadoG','10000');await p.click('#pasoCajaSiguiente');await p.click('#pasoCajaFinalizar');assert.equal(await p.inputValue('#apartadoCigarrillos'),'30000','no se recorta la precarga al efectivo disponible');assert.equal(await p.locator('#apartadoCigarrillos').getAttribute('aria-invalid'),'true');await p.click('[data-destino-caja="dejar"]');assert.equal(await p.locator('#cerrarCaja').isDisabled(),true);
  await p.click('#editarApartadoCigarrillos');await p.fill('#apartadoCigarrillos','1000,25');await p.click('#guardarApartadoCigarrillos');assert.equal(await p.inputValue('#quedaCajaGeneral'),'8999.75');
  await p.click('#pasoCajaAnterior');await p.click('[data-caja-volver="contar"]');await p.fill('#contadoG','9999,50');await p.click('#pasoCajaSiguiente');await p.click('#pasoCajaFinalizar');assert.equal(await p.inputValue('#apartadoCigarrillos'),'1000,25');assert.equal(await p.locator('#cerrarCaja').isDisabled(),true,'cambiar el conteo invalida el destino anterior');await p.click('[data-destino-caja="dejar"]');assert.equal(await p.inputValue('#quedaCajaGeneral'),'8999.25');
  const box=await p.locator('.cash-close-dialog').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth}));assert.ok(box.scroll<=box.client+1,JSON.stringify(box));
  assert.deepEqual(h.errors.filter(e=>e.startsWith('pageerror:')),[]);
  console.log(JSON.stringify({ok:true,width,publica:!!process.env.PUBLIC_URL,apartado:12000,retiro:67500,queda:20000,ventas:4,cierreDurable:true,ceroValido:true,precargaSinRecorte:true,centavos:true,cambioConteo:true}));
 }finally{await h.close();}
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
