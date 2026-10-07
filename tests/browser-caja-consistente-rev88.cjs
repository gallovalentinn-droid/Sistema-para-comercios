const assert=require('node:assert/strict');
const {openShadow,abrirTurno}=require('./browser-fixture/shadow.cjs');
async function main(){
 const h=await openShadow({width:Number(process.env.WIDTH)||1366,publicUrl:process.env.PUBLIC_URL||null});const p=h.page;
 try{
  await p.evaluate(()=>{db.config.moduloCigarros=false;db.config.separaCigarrillosAlCierre=false;db.config.manejaTurnos=true;db.cierres=[];db.ventas=[];f3Estado.session=null;});
  const venta=async(monto)=>p.evaluate(monto=>{
   const v={id:uid(),_v4id:f3Uuid(),fecha:new Date().toISOString(),total:monto,subtotal:monto,forma:'efectivo',items:[],pagos:[{forma:'efectivo',monto}]};
   f5EstamparSesionLocal(v,f3Estado.session);db.ventas.push(v);guardar(f3OperacionVenta(v));return v.id;
  },monto);
  const arqueo=async()=>{
   const esperado=await p.evaluate(()=>{vista='caja';globalThis.__miCajaVista='cierre';render();const t=turnoActual(f5SesionIds(f3Estado.session).effectiveId);return Number(f3Estado.session.fondoGeneral)+t.porForma.efectivo+t.cobEfectivo-t.egrGeneral;});
   await p.fill('#contadoG',String(esperado));await p.click('#pasoCajaSiguiente');await p.click('#pasoCajaFinalizar');
   await p.click('[data-destino-caja="retirar_todo"]');await p.fill('#responsableCierreCaja','Persona de prueba');await p.click('#cerrarCaja');
  };
  assert.equal(await abrirTurno(p,'100','0','Primera'),true);const va=await venta(1000);
  await arqueo();await p.click('#okC');await p.waitForFunction(()=>db.cierres.length===1&&f3Estado.session===null&&document.querySelector('#ov textarea'));
  const a=await p.evaluate(async()=>{await esperarPersistenciaLocal();return {...db.cierres[0]};});
  assert.deepEqual(a.ventaIds,[va]);assert.equal(a.contadoGeneral,1100);
  assert.equal(await abrirTurno(p,'200','0','Segunda'),true);const vb=await venta(500);
  await arqueo();await p.click('#okC');await p.waitForFunction(()=>db.cierres.length===2&&f3Estado.session===null&&document.querySelector('#ov textarea'));
  const b=await p.evaluate(()=>({...db.cierres[1]}));assert.deepEqual(b.ventaIds,[vb]);assert.equal(b.contadoGeneral,700);assert.notEqual(a._v4sessionSegmentId,b._v4sessionSegmentId);
  assert.equal(await abrirTurno(p,'300','0','Tercera'),true);await venta(600);
  await arqueo();await p.evaluate(()=>{window.__prepararCierre=f3OperacionCierre;f3OperacionCierre=()=>{throw new Error('F5_LEASE_EXPIRED_OR_REVOKED');};});
  await p.click('#okC');assert.equal(await p.evaluate(()=>db.cierres.length),2);assert.equal(await p.evaluate(()=>f3Estado.session.estado),'abierta');
  await p.evaluate(()=>{f3OperacionCierre=window.__prepararCierre;});
  await arqueo();await venta(100);await p.click('#okC');assert.equal(await p.evaluate(()=>db.cierres.length),2);assert.equal(await p.evaluate(()=>f3Estado.session.estado),'abierta');
  await arqueo();await p.evaluate(()=>{window.__turnoViejo=f3Estado.session;const s={...f3Estado.session,id:f3Uuid()};s.sessionSegmentId=s.id;f3Estado.session=s;});
  await p.click('#okC');assert.equal(await p.evaluate(()=>db.cierres.length),2);assert.notEqual(await p.evaluate(()=>f3Estado.session.id),await p.evaluate(()=>window.__turnoViejo.id));
  await p.evaluate(()=>{f3Estado.session=window.__turnoViejo;});
  // Una pantalla de apertura preparada antes de recuperar el turno no lo reutiliza.
  await p.evaluate(()=>{const s=f3Estado.session;f3Estado.session=null;vista='vender';render();window.__turnoAbrir=s;});
  await p.waitForFunction(()=>!document.querySelector('#rev31Abrir').disabled);
  await p.fill('#rev31Fondo','999');await p.fill('#rev31Responsable','Otra persona');
  await p.evaluate(()=>{f3Estado.session=window.__turnoAbrir;});await p.click('#rev31Abrir');
  assert.equal(await p.evaluate(()=>f3Estado.session.fondoGeneral),300);assert.equal(await p.evaluate(()=>f3Estado.session.abiertoPor),'Tercera');
  await arqueo();await p.click('#okC');await p.waitForFunction(()=>db.cierres.length===3&&f3Estado.session===null&&document.querySelector('#ov textarea'));
  const durable=await p.evaluate(async()=>{await esperarPersistenciaLocal();const out=await f3LeerOutbox();return out.filter(o=>o.operationType==='cerrar_sesion_caja_v4').map(o=>({segment:o.payload.session_segment_id,ventas:o.payload.venta_ids.length}));});
  assert.equal(durable.length,3);assert.equal(new Set(durable.map(o=>o.segment)).size,3);
  const cantidades=new Map(durable.map(o=>[o.segment,o.ventas]));
  assert.equal(cantidades.get(a._v4sessionSegmentId),1);assert.equal(cantidades.get(b._v4sessionSegmentId),1);
  const tercero=await p.evaluate(()=>db.cierres[2]._v4sessionSegmentId);assert.equal(cantidades.get(tercero),2);
  assert.deepEqual(h.errors.filter(e=>!e.includes('net::ERR_FAILED')),[]);console.log(JSON.stringify({ok:true,width:Number(process.env.WIDTH)||1366,publica:!!process.env.PUBLIC_URL,cierres:3,escenarios:6,redExternaBloqueada:h.external.length}));
 }finally{await h.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
