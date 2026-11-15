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
  assert.equal(await p.locator('.cash-movements-card').count(),0);
  assert.equal(await p.locator('#operacionesCaja > summary').innerText(),'Movimientos del turno');
  await p.click('#cancelarCierreCaja');await p.click('#operacionesCaja > summary');
  assert.doesNotMatch(await p.locator('[data-caja-panel="turno"]').innerText(),/Todo el efectivo se cuenta junto\. El monto de cigarrillos se aparta al cerrar\.|Consultá los totales extra/);
  assert.equal(await p.locator('.cash-sales-head small').count(),0);
  const ventasVisibles=p.locator('#ventasCajaTurno [data-anular-venta]');assert.equal(await ventasVisibles.count(),4);
  assert.equal(await p.locator('.cash-sales-card,.cash-payment-list').count(),0);
  const totalVendido=await p.evaluate(()=>db.ventas.reduce((s,v)=>s+v.total,0));
  const selectorRubros=p.locator('#rubrosCajaTurno');
  const elegirRubros=async rubros=>{await selectorRubros.locator('.rubro-multi-trigger').click();await selectorRubros.locator('[data-rubro-clear]').click();for(const rubro of rubros)await selectorRubros.getByRole('checkbox',{name:new RegExp(rubro)}).check();await selectorRubros.locator('[data-rubro-apply]').click();};
  await elegirRubros(['Cigarrillos']);assert.equal(await ventasVisibles.count(),3);
  await selectorRubros.locator('.rubro-multi-trigger').click();await selectorRubros.locator('input[value="Almacén"]').check();assert.equal(await ventasVisibles.count(),3,'la selección se confirma con Aplicar');await selectorRubros.locator('[data-rubro-apply]').click();assert.equal(await ventasVisibles.count(),4);assert.match(await selectorRubros.locator('.rubro-multi-trigger').innerText(),/2 rubros/);
  await p.evaluate(()=>render());await p.click('#operacionesCaja > summary');assert.match(await selectorRubros.locator('.rubro-multi-trigger').innerText(),/2 rubros/);assert.equal(await ventasVisibles.count(),4,'la selección múltiple se conserva al redibujar Caja');
  await selectorRubros.locator('.rubro-multi-trigger').click();await selectorRubros.locator('input[value="Almacén"]').uncheck();await selectorRubros.press('Escape');assert.equal(await ventasVisibles.count(),4,'Escape descarta cambios sin aplicar');
  await elegirRubros(['Cigarrillos']);
  await p.fill('#qCajaTurno','Almacén');assert.equal(await ventasVisibles.count(),0);assert.match(await p.locator('#ventasCajaTurno').innerText(),/esos filtros/);
  await elegirRubros([]);assert.equal(await ventasVisibles.count(),1);
  await p.fill('#qCajaTurno','');await elegirRubros(['Almacén']);assert.equal(await ventasVisibles.count(),1);
  assert.equal(await p.evaluate(()=>db.ventas.reduce((s,v)=>s+v.total,0)),totalVendido,'filtrar la lista no modifica las ventas registradas');
  if(out){await p.locator('[data-caja-panel="turno"]').screenshot({path:path.join(out,`${width}-filtro-rubro.png`)});}
  await elegirRubros([]);assert.equal(await ventasVisibles.count(),4);await p.click('#irCierreCaja');
  assert.equal(await p.locator('button[data-caja-indicador]').count(),3);
  assert.equal(await p.locator('#pasoCajaAnterior').count(),0);
  await p.click('[data-caja-indicador="finalizar"]');assert.equal(await p.locator('[data-caja-paso="contar"]').isVisible(),true,'no se saltea un conteo vacío');
  await p.fill('#contadoG','10000');await p.click('[data-caja-indicador="finalizar"]');assert.equal(await p.locator('[data-caja-paso="revisar"]').isVisible(),true,'una diferencia grande requiere explicación');
  await p.click('[data-caja-indicador="contar"]');await p.fill('#contadoG','87500');await capture('contar');await p.click('[data-caja-indicador="revisar"]');await capture('revisar');await p.click('[data-caja-indicador="finalizar"]');
  assert.equal(await p.inputValue('#apartadoCigarrillos'),'15.000,00','se precarga y formatea el total de todos los medios');
  assert.equal(await p.locator('#apartadoCigarrillos').evaluate(e=>e.readOnly),true);
  assert.equal(await p.locator('#apartadoCigarrillos').evaluate(e=>getComputedStyle(e).textAlign),'left');
  assert.equal(await p.locator('.cash-money-prefix').innerText(),'$');
  const panel=p.locator('[data-caja-paso="finalizar"]');
  assert.ok(await p.locator('#cerrarCaja').evaluate(e=>Math.abs(e.getBoundingClientRect().width-e.parentElement.getBoundingClientRect().width)<2),'el botón ocupa todo el ancho disponible');
  assert.doesNotMatch(await panel.innerText(),/Sugerencia por ventas|Usar sugerencia|copia de seguridad|Efectivo contado:/i);
  assert.match(await panel.innerText(),/Monto a separar para cigarrillos/);
  assert.equal(await p.locator('#totalEfectivoCaja').count(),0);
  assert.doesNotMatch(await panel.innerText(),/Finalizá el cierre|Total efectivo en caja|Cómo se calcula/);
  assert.equal(await panel.locator('label').first().innerText(),'Monto a separar para cigarrillos');
  assert.equal(await panel.locator('[data-destino-caja="dejar"]').innerText(),'Dejo plata');
  assert.equal(await panel.locator('[data-destino-caja="retirar_todo"]').innerText(),'Retiro todo');
  assert.equal(await p.locator('.cash-cigarette-amount-row #editarApartadoCigarrillos svg').count(),1);
  assert.equal(await p.locator('#preguntaDestinoCaja').innerText(),'¿Qué hacés con la plata?');
  assert.ok(await p.evaluate(()=>document.querySelector('#preguntaDestinoCaja').getBoundingClientRect().top-document.querySelector('.cash-cigarette-separation').getBoundingClientRect().bottom>=28),'hay espacio entre las dos decisiones');
  assert.equal(await p.locator('#cobrosCigarrillosCompactos').isVisible(),true);
  assert.equal(await p.locator('#cerrarCaja').isDisabled(),true);
  await capture('finalizar-pendiente');await p.click('[data-destino-caja="retirar_todo"]');
  const detalle=p.locator('#detalleDestinoCaja');assert.equal(await detalle.count(),1,'el reparto completo sigue bajo Ver detalle');assert.equal(await detalle.evaluate(e=>e.open),false);assert.equal(await p.locator('#resumenCompactoCaja').count(),0);assert.equal(await p.locator('#resumenDestinoCaja').isVisible(),false);assert.doesNotMatch(await panel.innerText(),/Otros retiros|Próximo turno/);await capture('finalizar');
  await detalle.locator('summary').click();assert.equal(await p.locator('#resumenDestinoCaja').isVisible(),true);await detalle.locator('summary').click();
  await p.click('[data-destino-caja="dejar"]');assert.equal(await p.inputValue('#quedaCajaGeneral'),'72500');
  await p.click('#editarApartadoCigarrillos');assert.equal(await p.locator('#apartadoCigarrillos').evaluate(e=>e.readOnly),false);assert.equal(await p.locator('#cerrarCaja').isDisabled(),true);await capture('editando');
  await p.fill('#apartadoCigarrillos','100000');assert.equal(await p.locator('#cerrarCaja').isDisabled(),true);
  for(const importe of ['', '-1']){await p.fill('#apartadoCigarrillos',importe);assert.equal(await p.locator('#cerrarCaja').isDisabled(),true);}
  await p.fill('#apartadoCigarrillos','12000');await p.locator('#apartadoCigarrillos').blur();assert.equal(await p.inputValue('#apartadoCigarrillos'),'12.000,00');assert.equal(await p.locator('#cerrarCaja').isDisabled(),true,'el importe distinto requiere Guardar');await p.click('#guardarApartadoCigarrillos');assert.equal(await p.locator('#apartadoCigarrillos').evaluate(e=>e.readOnly),true);assert.equal(await p.locator('#cerrarCaja').isDisabled(),false);assert.equal(await p.inputValue('#quedaCajaGeneral'),'75500');
  await p.click('#editarApartadoCigarrillos');await p.fill('#apartadoCigarrillos','0');await p.click('#cancelarApartadoCigarrillos');assert.equal(await p.inputValue('#apartadoCigarrillos'),'12.000,00');assert.equal(await p.inputValue('#quedaCajaGeneral'),'75500');
  await p.fill('#quedaCajaGeneral','20000');await p.click('[data-caja-indicador="revisar"]');await p.click('[data-caja-indicador="finalizar"]');assert.equal(await p.inputValue('#apartadoCigarrillos'),'12.000,00');assert.equal(await p.inputValue('#quedaCajaGeneral'),'20000');
  await detalle.locator('summary').click();assert.match(await panel.innerText(),/55[.,]500|55\.500/);await capture('finalizar-editado');await detalle.locator('summary').click();
  await p.fill('#responsableCierreCaja',' ');assert.equal(await p.locator('#cerrarCaja').isDisabled(),true);
  await p.fill('#responsableCierreCaja','Valen');
  await p.evaluate(()=>{const original=backupAuto;backupAuto=async()=>{backupAuto=original;await new Promise(resolve=>globalThis.__liberarBackupUX=resolve);return original();};});
  await p.click('#cerrarCaja');await p.click('#okC');await p.waitForFunction(()=>document.querySelector('#cerrarCaja')?.getAttribute('aria-busy')==='true');assert.match(await p.locator('#cerrarCaja').innerText(),/Guardando/);assert.equal(await p.locator('#cerrarCaja').isDisabled(),true);
  await p.evaluate(()=>document.querySelector('#cerrarCaja').onclick());assert.equal(await p.locator('#okC').count(),0,'no se abre otro cierre durante el guardado');assert.equal(await p.evaluate(()=>db.cierres.length),1);await p.waitForFunction(()=>typeof globalThis.__liberarBackupUX==='function');await p.evaluate(()=>globalThis.__liberarBackupUX());await p.waitForFunction(()=>document.querySelector('#ov textarea'));
  const cierre=await p.evaluate(async()=>{await esperarPersistenciaLocal();const d=await abrirIdb(),tx=d.transaction('cierres','readonly'),rows=await idbReq(tx.objectStore('cierres').getAll());return rows[0];});
  assert.equal(cierre.contadoGeneral,87500);assert.equal(cierre.apartadoCigarrillos,12000);assert.equal(cierre.quedaGeneral,20000);assert.equal(cierre.retiroGeneral,67500);assert.equal(cierre.ventaIds.length,4);
  // Cero es una elección válida. No se amplía ni modifica el cálculo financiero.
  await p.evaluate(()=>{document.querySelectorAll('.ov').forEach(e=>e.remove());db.ventas=[];db.pagos=[];db.egresos=[];});
  assert.equal(await abrirTurno(p,'0','0','Valen'),true);
  await p.evaluate(()=>{vista='caja';globalThis.__miCajaVista='cierre';render();});await p.fill('#contadoG','0');await p.click('#pasoCajaSiguiente');await p.click('#pasoCajaFinalizar');assert.equal(await p.inputValue('#apartadoCigarrillos'),'0,00');await p.click('[data-destino-caja="retirar_todo"]');assert.equal(await p.locator('#cerrarCaja').isDisabled(),false);
  await p.click('#cerrarCaja');await p.click('#okC');await p.waitForFunction(()=>db.cierres.length===2&&f3Estado.session===null&&document.querySelector('#ov textarea'));await p.evaluate(()=>document.querySelectorAll('.ov').forEach(e=>e.remove()));
  assert.equal(await abrirTurno(p,'10000','0','Valen'),true);
  await p.evaluate(()=>{const v={id:'ux-transferencia',_v4id:f3Uuid(),nro:5,fecha:new Date().toISOString(),total:30000,subtotal:30000,forma:'transferencia',pagos:[{forma:'transferencia',monto:30000}],items:[{tipo:'producto',rubro:'Cigarrillos',nombre:'Cigarrillos',cant:1,neto:30000,precio:30000,costo:0}]};f5EstamparSesionLocal(v,f3Estado.session);db.ventas=[v];vista='caja';globalThis.__miCajaVista='cierre';render();});
  await p.fill('#contadoG','10000');await p.click('#pasoCajaSiguiente');await p.click('#pasoCajaFinalizar');assert.equal(await p.inputValue('#apartadoCigarrillos'),'30.000,00','no se recorta la precarga al efectivo disponible');assert.equal(await p.locator('#apartadoCigarrillos').getAttribute('aria-invalid'),'true');await p.click('[data-destino-caja="dejar"]');assert.equal(await p.locator('#cerrarCaja').isDisabled(),true);
  await p.click('#editarApartadoCigarrillos');await p.fill('#apartadoCigarrillos','1000,25');await p.click('#guardarApartadoCigarrillos');assert.equal(await p.inputValue('#apartadoCigarrillos'),'1.000,25');assert.equal(await p.inputValue('#quedaCajaGeneral'),'8999.75');
  await p.click('[data-caja-indicador="contar"]');await p.fill('#contadoG','9999,50');await p.click('[data-caja-indicador="finalizar"]');assert.equal(await p.inputValue('#apartadoCigarrillos'),'1.000,25');assert.equal(await p.locator('#cerrarCaja').isDisabled(),true,'cambiar el conteo invalida el destino anterior');await p.click('[data-destino-caja="dejar"]');assert.equal(await p.inputValue('#quedaCajaGeneral'),'8999.25');
  const box=await p.locator('.cash-close-dialog').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth}));assert.ok(box.scroll<=box.client+1,JSON.stringify(box));
  assert.deepEqual(h.errors.filter(e=>e.startsWith('pageerror:')),[]);
  console.log(JSON.stringify({ok:true,width,publica:!!process.env.PUBLIC_URL,apartado:12000,retiro:67500,queda:20000,ventas:4,cierreDurable:true,ceroValido:true,precargaSinRecorte:true,centavos:true,cambioConteo:true}));
 }finally{await h.close();}
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
