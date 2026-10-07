// Modo "turnos": simula sesión autenticada de dueño en modo shadow, sin backend (rpc falla, outbox queda pendiente).
const {open}=require('./harness.cjs');
async function openShadow(opts={}){
 const h=await open({...opts,boot:false});const p=h.page;
 await p.evaluate(async(o)=>{
  window.__f43ok=1;
  sesion={access_token:'x',refresh_token:'y',user:{id:'00000000-0000-4000-8000-0000000000aa',email:'duenio@test.ar'},expires_at:9999999999};
  localStorage.setItem(F3_SHADOW_KEY,'1');
  f3Estado.comercioId='00000000-0000-4000-8000-00000000c0de';f3Estado.deviceUuid='00000000-0000-4000-8000-00000000d0de';
  f3Estado.cajaId='00000000-0000-4000-8000-00000000ca1a';f3Estado.cajaCodigo='CAJA-1';f3Estado.modo='shadow';
  const ops=[...new Set((document.documentElement.innerHTML.match(/'[a-z0-9_]+_v4'/g)||[]).map(x=>x.slice(1,-1)))];
  const now=Date.now();
  const lease={lease_id:'l1',lease_family_id:'lf1',comercio_id:f3Estado.comercioId,user_id:sesion.user.id,device_id:f3Estado.deviceUuid,rol:o.rol||'duenio',permisos:o.permisos||[],permission_version:1,contract_version:1,
    issued_at:new Date(now-1000).toISOString(),valid_until:new Date(now+6*24*3600e3).toISOString(),aceptacion_hasta:new Date(now+7*24*3600e3).toISOString(),operation_types:ops};
  const st=f5InstalarLease(f5Estado(),{lease,server_now:new Date(now).toISOString()});
  st.membership={...st.membership,nombre_mostrado:o.nombre||'Valen'};
  f5ReemplazarEstado(st);window.__ops=ops;
  assertWritable=()=>({ok:true,causas:[]});
  enLinea=false;
  if(!o.conPin) f6AsegurarProteccionDispositivo=async()=>{interfazProtegida=false;};
  await mostrarApp();
 },opts);
 await p.waitForTimeout(400);
 return h;
}
module.exports={openShadow};
// REV52: la apertura es explícita también sin «Caja por turnos».
async function abrirTurno(p,g='0',c='0',quien='Valen'){
 await p.evaluate(()=>{document.querySelectorAll('.ov').forEach(o=>o.remove());vista='vender';render();});
 await p.waitForSelector('#rev31Abrir',{timeout:3000});await p.waitForTimeout(250);
 if(await p.$('#rev31NoCoincide:visible'))await p.click('#rev31NoCoincide');
 await p.fill('#rev31Fondo',g);if(await p.$('#rev31FondoCig'))await p.fill('#rev31FondoCig',c);
 await p.fill('#rev31Responsable',quien);await p.click('#rev31Abrir');await p.waitForTimeout(300);
 return p.evaluate(()=>!!(f3Estado.session&&f3Estado.session.estado==='abierta'));}
module.exports.abrirTurno=abrirTurno;
