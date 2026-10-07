const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../beta/index.html'),'utf8');
function fuente(nombre){
  const inicio=html.indexOf(`function ${nombre}(`);
  if(inicio<0)return '';
  return html.slice(inicio,html.indexOf('\n}',inicio)+2);
}
function caja(){
  const ses={id:'turno-a',sessionSegmentId:'turno-a',rootSessionId:'raiz',estado:'abierta',fondoGeneral:100};
  const turno={desde:'2026-10-06T10:00:00Z',ventas:[{id:'venta-a'}],pagos:[],egresos:[],total:1000,
    porForma:{efectivo:1000},cigTotal:0,costo:500,egrGeneral:0,egrCigarros:0};
  const callbacks=[],avisos=[];
  const nodes={'#responsableCierreCaja':{value:'Ana'},'#cerrarCaja':{}};
  const c={f3Estado:{session:ses,cajaId:'caja'},db:{cierres:[],config:{}},activeSession:ses,t:turno,
    inpG:{value:'1100'},inpC:null,moduloCigarros:false,separaCigarrillosAlCierre:false,
    espGeneral:1100,espCigarros:0,decisionDestino:'retirar_todo',quedaG:null,quedaC:null,
    explicacionCaja:{value:''},apartadoInput:null,rev31ReabrirTrasCierre:false,
    conteosCajaCompletos:()=>true,f3Activo:()=>true,num:Number,
    f5EstadoBloqueo:()=>({authority:{writable:true}}),f5Estado:()=>({membership:{user_id:'persona'}}),
    f5ExigirEscritura:()=>{},motivoDiferenciaCaja:()=>'',f52CalcularDestinoCierre:()=>({ok:true,retiroGeneral:1100,retiroCigarros:0,quedaGeneral:0,quedaCigarros:0}),
    f79CigarrillosPorFormaTurno:()=>({}),f3OperacionCierre:()=>({operationId:'op'}),
    f3MarcarSesionLocalCierrePendiente:()=>{},guardar:()=>{},f3GuardarEstadoLocal:async()=>true,
    backupAuto:async()=>{},render:()=>{},modalEnviarResumen:()=>{},uid:()=>`cierre-${callbacks.length}`,
    turnoActual:()=>c.t,$:s=>nodes[s],$m:String,esc:String,aviso:m=>avisos.push(m),
    confirmar:(_titulo,_texto,fn)=>callbacks.push(fn),sesion:{user:{id:'persona'}}};
  vm.createContext(c);
  vm.runInContext(['f5SesionIds','f5CamposSesionLocal','f5EstamparSesionLocal','f6ClaveTurno','f6EvaluarCierreTurno','f56CajaSeparadaEnSesion','f57ModoCaja','f88HuellaArqueo','f88ValidarArqueoActual'].map(fuente).join('\n'),c);
  c.huellaArqueo=c.f88HuellaArqueo?c.f88HuellaArqueo(ses,turno):'';
  const inicio=html.indexOf("  $('#cerrarCaja').onclick=()=>{");
  const fin=html.indexOf('\n  };\n}',inicio)+6;
  vm.runInContext(html.slice(inicio,fin),c);
  return {c,callbacks,avisos,nodes,abrir:()=>nodes['#cerrarCaja'].onclick()};
}
test('si falla preparar el cierre no queda un cierre fantasma que bloquee el turno',async()=>{
  const h=caja();h.c.f3OperacionCierre=()=>{throw new Error('F5_LEASE_EXPIRED_OR_REVOKED');};h.abrir();
  await h.callbacks[0]().catch(()=>{});
  assert.equal(h.c.db.cierres.length,0);
  assert.equal(h.c.f3Estado.session.estado,'abierta');
  assert.ok(h.avisos.length>0);
});
test('una operación de cierre ausente no libera el turno autenticado',async()=>{
  const h=caja();h.c.f3OperacionCierre=()=>null;h.abrir();await h.callbacks[0]();
  assert.equal(h.c.db.cierres.length,0);assert.equal(h.c.f3Estado.session.id,'turno-a');
});
test('confirmar una pantalla vieja no cierra ni mezcla el turno siguiente',async()=>{
  const h=caja();h.abrir();h.c.f3Estado.session={...h.c.activeSession,id:'turno-b',sessionSegmentId:'turno-b'};
  await h.callbacks[0]();assert.equal(h.c.db.cierres.length,0);assert.equal(h.c.f3Estado.session.id,'turno-b');
});
test('un movimiento recibido durante la confirmación obliga a revisar el arqueo',async()=>{
  const h=caja();h.abrir();h.c.t={...h.c.t,ventas:[...h.c.t.ventas,{id:'venta-tardia'}],total:1500};
  await h.callbacks[0]();assert.equal(h.c.db.cierres.length,0);assert.equal(h.c.f3Estado.session.id,'turno-a');
});
test('cambiar el modelo de caja durante la confirmación obliga a revisar el arqueo',async()=>{
  const h=caja();h.abrir();h.c.db.config.moduloCigarros=false;
  await h.callbacks[0]();assert.equal(h.c.db.cierres.length,0);assert.equal(h.c.f3Estado.session.id,'turno-a');
});
test('un mismo cierre confirmado dos veces conserva un solo cierre',async()=>{
  const h=caja();h.abrir();await h.callbacks[0]();await h.callbacks[0]();assert.equal(h.c.db.cierres.length,1);
});
test('el cierre estable mantiene el arqueo y sus referencias al segmento correcto',async()=>{
  const h=caja();h.abrir();await h.callbacks[0]();assert.equal(h.c.db.cierres.length,1);
  const cierre=h.c.db.cierres[0];assert.equal(cierre._v4sessionSegmentId,'turno-a');
  assert.equal(cierre.contadoGeneral,1100);assert.equal(cierre.total,1000);
  assert.deepEqual(Array.from(cierre.ventaIds),['venta-a']);assert.equal(h.c.f3Estado.session,null);
});
test('una apertura que esperaba no reutiliza un turno recuperado antes de confirmar',async()=>{
  const nodes=new Map();const node=s=>{if(!nodes.has(s))nodes.set(s,{value:'',hidden:false,classList:{add(){},remove(){}},focus(){}});return nodes.get(s);};
  const c={f3Estado:{session:null},db:{config:{moduloCigarros:false}},f61SesionCerrada:false,enLinea:false,
    f5MembresiaActual:()=>null,esc:String,$:node,numImportacion:t=>({ok:true,blank:false,value:Number(t)}),
    f52ConsultarTraspasoCaja:async()=>({tipo:'sin_cierre',cierreId:null}),f52ImportesApertura:()=>({general:null,cigarros:null}),
    f5ExigirEscritura(){},f3GuardarEstadoLocal:async()=>{},render(){},aviso(){},ir(){},
    f3AsegurarSesionLocal:()=>c.f3Estado.session};
  vm.createContext(c);vm.runInContext(fuente('vAbrirTurnoRev31'),c);c.vAbrirTurnoRev31({});await new Promise(r=>setImmediate(r));
  assert.equal(node('#rev31Abrir').disabled,false,'la consulta terminó y habilitó abrir');
  node('#rev31Fondo').value='200';node('#rev31Responsable').value='Nueva persona';
  c.f3Estado.session={id:'recuperado',estado:'abierta',rev31AperturaExplicita:true,fondoGeneral:100,abiertoPor:'Persona anterior'};
  await node('#rev31Abrir').onclick();assert.equal(c.f3Estado.session.fondoGeneral,100);
  assert.equal(c.f3Estado.session.abiertoPor,'Persona anterior');
});
