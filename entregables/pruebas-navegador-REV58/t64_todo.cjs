// REV58 · «Reintentar todo»: ventas trabadas por sesión revocada se recuperan con un toque.
const {openShadow,abrirTurno}=require('./shadow.cjs');const log=(...a)=>console.log(...a);
const assert=require('node:assert/strict');
(async()=>{const h=await openShadow({width:Number(process.env.W||1366),height:800});const p=h.page;await abrirTurno(p);
const estados=()=>p.evaluate(async()=>(await f3LeerOutbox()).filter(o=>String(o.estado).includes('v4')).map(o=>o.operationType.replace(/_v4$/,'')+':'+o.estado).join(', '));
await p.evaluate(async()=>{db.productos.push({id:'coca',nombre:'Coca',rubro:'Bebidas',precio:1500,costo:900,stock:50,unidad:'unidad'});guardar();
 window.__modo401=true;
 window.__rpcStub=new Proxy({},{get:(_,n)=>a=>window.__modo401?{data:null,error:{code:'PGRST303',message:'JWT expired',status:401}}:{data:{ok:true,sesion_id:a&&a.p_payload&&a.p_payload.caja_sesion_id,session_segment_id:a&&a.p_payload&&a.p_payload.session_segment_id,estado:'registrado'},error:null}});
 enLinea=true;
 for(let i=0;i<3;i++){ticket=[];agregarAlTicket(prod('coca'),1);cerrarVenta('efectivo');cerrarModal();}
 await new Promise(r=>setTimeout(r,300));
 // llevar todo a dead-letter como pasó en el mostrador
 for(let k=0;k<8;k++){for(const o of await f3LeerOutbox()){if(!String(o.estado).includes('v4')||['confirmado_v4','dead_letter_v4'].includes(o.estado))continue;o.nextAttemptAt=null;await f3ActualizarOutbox(o);await f3ProcesarUna(o);}}});
const antes=await estados();log('1 con sesión revocada:',antes);
assert.equal((antes.match(/dead_letter_v4/g)||[]).length,4);
// vuelve la sesión y se abre el panel
await p.evaluate(async()=>{window.__modo401=false;document.querySelectorAll('#toasts .toast').forEach(t=>t.remove());vista='soporte';render();});
await p.click('#abrirEstadoSistema');await p.waitForTimeout(400);
log('2 panel antes:',(await p.evaluate(()=>document.querySelector('#f33-content .f33-summary').innerText.replace(/\n+/g,' '))),'| botones:',await p.evaluate(()=>[...document.querySelectorAll('#f33-content .f33-actions button')].map(b=>b.innerText).slice(0,4)));
await p.screenshot({path:'todo_1_antes.png'});
await p.click('#f33-process');await p.waitForTimeout(1500);
const despues=await estados();log('3 después de «Reintentar todo»:',despues);
assert.equal((despues.match(/pendiente_v4/g)||[]).length,4);
const mensaje=await p.evaluate(()=>[...document.querySelectorAll('#toasts .toast')].map(t=>t.innerText).at(-1));
log('   aviso:',mensaje);assert.match(mensaje,/4 pendientes de envío/);
log('   panel:',(await p.evaluate(()=>document.querySelector('#f33-content').innerText.replace(/\n+/g,' | '))).slice(0,300));
await p.screenshot({path:'todo_2_despues.png'});
log('4 envío de la cola (mismo proceso que corre solo):',await p.evaluate(async()=>{window.__f3dbg={procesando:typeof f3Procesando!=='undefined'?f3Procesando:'?'};
 for(let k=0;k<3;k++){for(const o of (await f3LeerOutbox()).sort((a,b)=>a.localSeq-b.localSeq)){if(o.estado!=='pendiente_v4')continue;await f3ProcesarUna(o);}}
 return (await f3LeerOutbox()).filter(o=>String(o.estado).includes('v4')).map(o=>o.operationType.replace(/_v4$/,'')+':'+o.estado+(o.ultimoError?'('+String(o.ultimoError).slice(0,40)+')':'')).join(', ')+' | procesando='+window.__f3dbg.procesando;}));
const inesperados=h.errors.filter(e=>!/ERR_FAILED|Failed to fetch|OFFLINE/.test(e));log('errors',inesperados);assert.deepEqual(inesperados,[]);await h.close();})();
