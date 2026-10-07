// REV54 · Lector de facturas: volver un paso (revisión → foto, carga → revisión) sin perder ni duplicar datos.
const {openShadow}=require('./shadow.cjs');const log=(...a)=>console.log(...a);
const toast=p=>p.evaluate(()=>[...document.querySelectorAll('#toasts .toast')].map(t=>t.innerText).at(-1)||'');
const estado=p=>p.evaluate(()=>({titulo:document.querySelector('.mod-h h3')?.innerText,pasos:[...document.querySelectorAll('.invoice-steps span')].map(s=>s.innerText+(s.classList.contains('active')?'*':'')).join(' | '),
  remito:remito.map(l=>{const q=productoEnFactura(l.prodId);return `${q.nombre}:${l.cant}`;}),pend:productosFacturaPendientes.length,foto:!!document.querySelector('#facFotoLabel'),
  botones:[...document.querySelectorAll('.mod-f button')].map(b=>b.innerText)}));
const leer={proveedor:'Dist SA',nroComprobante:'A-77',total:0,descuentoGlobal:0,items:[{producto:'Coca-Cola 500 ml',cantidad:2,unidadesPorBulto:6,precioUnit:3000,descuento:0},{producto:'SPEEDXLUNLIMITEDX473CCX6U-SP',cantidad:24,unidadesPorBulto:1,precioUnit:1958.33,descuento:0}]};
(async()=>{const h=await openShadow();const p=h.page;
await p.evaluate(()=>{cargarDemo('kiosco');guardar();comprasTab='factura';vista='compras';render();});await p.waitForTimeout(200);
await p.click('#comprasIA');await p.waitForTimeout(200);
// carga manual previa de un producto
await p.click('#facManualToggle');await p.evaluate(()=>{addRemito(db.productos.find(x=>/Alfajor/i.test(x.nombre)).id);});await p.waitForTimeout(150);
log('0 antes de leer',JSON.stringify(await estado(p)));
const stockCoca0=await p.evaluate(()=>db.productos.find(x=>x.nombre==='Coca-Cola 500 ml').stock);
// simula la respuesta de la IA (lo mismo que hace leerFacturaFoto)
await p.evaluate(l=>abrirRevisionFactura(l),leer);await p.waitForTimeout(200);
log('1 revisión',JSON.stringify(await estado(p)));
// edita la revisión: cantidad 5 en Coca y "crear nuevo" en la segunda fila
await p.fill('[data-rev-cant="0"]','5');await p.dispatchEvent('[data-rev-cant="0"]','change');
await p.selectOption('[data-rev-prod="1"]','__nuevo__');await p.waitForTimeout(100);
await p.click('#okRev');await p.waitForTimeout(250);
log('2 carga',JSON.stringify(await estado(p)));
// volver sin cambios
await p.click('#volverRevFac');await p.waitForTimeout(250);
log('3 volvió a revisión',JSON.stringify(await estado(p)),'| edición conservada:',JSON.stringify(await p.evaluate(()=>({cant:document.querySelector('[data-rev-cant="0"]').value,sel1:document.querySelector('[data-rev-prod="1"]').value}))));
await p.click('#okRev');await p.waitForTimeout(250);
log('4 carga otra vez (sin duplicar)',JSON.stringify(await estado(p)));
// cambio en la carga → pide confirmar
await p.click('[data-ra="0"]');await p.waitForTimeout(100);
await p.click('#volverRevFac');await p.waitForTimeout(150);
log('5 primer toque con cambios ->',await toast(p),'| sigue en carga:',await p.evaluate(()=>document.querySelector('.mod-h h3').innerText),'| botón:',await p.evaluate(()=>document.querySelector('#volverRevFac').innerText));
await p.click('#volverRevFac');await p.waitForTimeout(250);
log('6 segundo toque',JSON.stringify(await estado(p)));
// volver a la foto
await p.click('#volverFotoFac');await p.waitForTimeout(250);
log('7 volvió a la foto',JSON.stringify(await estado(p)),'| memoria IA:',await p.evaluate(()=>facturaIA));
// nueva lectura y confirmación completa
await p.evaluate(l=>abrirRevisionFactura(l),leer);await p.waitForTimeout(150);
await p.selectOption('[data-rev-prod="1"]','__nuevo__');await p.click('#okRev');await p.waitForTimeout(250);
log('8 carga final',JSON.stringify(await estado(p)));
const ix=await p.evaluate(()=>remito.findIndex(l=>productosFacturaPendientes.some(x=>x.id===l.prodId)));
await p.fill(`[data-rprecio="${ix}"]`,'2900');await p.dispatchEvent(`[data-rprecio="${ix}"]`,'change');
await p.click('#okIng');await p.waitForTimeout(400);
log('9 confirmada',await toast(p),JSON.stringify(await p.evaluate(s0=>({coca:db.productos.find(x=>x.nombre==='Coca-Cola 500 ml').stock-s0,nuevo:db.productos.filter(x=>x.nombre.startsWith('SPEEDX')).map(x=>[x.stock,x.precio,Math.round(x.costo*100)/100]),memoria:facturaIA}),stockCoca0)));
log('errors',h.errors.filter(e=>!/ERR_FAILED|Failed to fetch|OFFLINE/.test(e)));await h.close();})();
