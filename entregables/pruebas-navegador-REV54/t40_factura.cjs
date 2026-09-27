// Lector de facturas: revisión de la IA y tabla de carga con nombres largos (antes/después).
const {openShadow}=require('./shadow.cjs');const log=(...a)=>console.log(...a);
const W=Number(process.env.W||1366),H=Number(process.env.H||800),TAG=process.env.TAG||'x';
(async()=>{const h=await openShadow({width:W,height:H});const p=h.page;
await p.evaluate(()=>{cargarDemo('kiosco');guardar();comprasTab='factura';vista='compras';render();});await p.waitForTimeout(200);
await p.click('#comprasIA');await p.waitForTimeout(200);
const items=[['SPEEDXLUNLIMITEDX473CCX6U-SP',24,1,1958.33],['Coca-Cola 500 ml',2,6,3000],['GALLETITAS OREO X 118 GR RELLENAS SABOR ORIGINAL PACK X 3',3,12,850.5],['Alfajor Nuevo Test XL',1,12,4000]];
for(let i=0;i<14;i++)items.push([`PRODUCTO LEIDO NUMERO ${i+1} CON NOMBRE LARGO DE FACTURA`,1+i,6,1000+i*37]);
await p.evaluate(items=>{cerrarModal();abrirRevisionFactura({proveedor:'Dist SA',nroComprobante:'A-1',total:698096.38,descuentoGlobal:0,items:items.map(([n,c,b,pu])=>({producto:n,cantidad:c,unidadesPorBulto:b,precioUnit:pu,descuento:0}))});
 revisionFactura.forEach((r,i)=>{if(i!==1)r.prodId='__nuevo__';});pintarRevision(document.querySelector('#ov'));},items);
await p.waitForTimeout(250);
const medir=async(sel)=>p.evaluate(sel=>{const m=document.querySelector('.mod');const t=document.querySelector(sel+' table');const td=t&&t.querySelector('tbody td');
 return {modal:Math.round(m.getBoundingClientRect().width),tabla:t&&Math.round(t.getBoundingClientRect().width),primeraCol:td&&Math.round(td.getBoundingClientRect().width),
  scrollH:(()=>{const b=document.querySelector('.mod-b');return b?b.scrollWidth>b.clientWidth+1:false;})(),vista:t?getComputedStyle(t.querySelector('thead')).display:'-'};},sel);
log(TAG,W,'revisión',JSON.stringify(await medir('#revTabla')),'| botones pie:',await p.evaluate(()=>[...document.querySelectorAll('.mod-f button')].map(b=>b.innerText)));
await p.screenshot({path:`fac_${TAG}_${W}_rev.png`});
await p.click('#okRev');await p.waitForTimeout(300);
log(TAG,W,'carga',JSON.stringify(await medir('#iTabla')),'| botones pie:',await p.evaluate(()=>[...document.querySelectorAll('.mod-f button')].map(b=>b.innerText)));
await p.evaluate(()=>{const t=document.querySelector('#iTabla');t&&t.scrollIntoView();});await p.waitForTimeout(100);
await p.screenshot({path:`fac_${TAG}_${W}_carga.png`});
log('errors',h.errors.filter(e=>!/ERR_FAILED|Failed to fetch|OFFLINE/.test(e)));await h.close();})();
