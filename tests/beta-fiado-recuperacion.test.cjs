const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../beta/index.html'),'utf8');
function fuente(nombre){const m=new RegExp('^(?:async )?function '+nombre+'\\(','m').exec(html);assert.ok(m,nombre);const fin=html.indexOf('\n}',m.index);return html.slice(m.index,fin+2);}
test('una respuesta de corrección perdida bloquea nuevos cobros y escrituras aunque ya no haya RPC activa',async()=>{
  const mensajes=[],c={sesion:{user:{id:'u'}},f3Estado:{comercioId:'c'},fiadoCorreccionActiva:false,sessionStorage:{getItem:()=>JSON.stringify({pagoLocalId:'p',operationId:'una-sola-operacion'})},aviso:m=>mensajes.push(m)};
  vm.createContext(c);
  // fiadoClaveCorreccion es una función de una línea; se declara el mismo alcance de almacenamiento.
  c.fiadoClaveCorreccion=()=> 'fiado:correccion:u:c';
  for(const n of ['fiadoHayCorreccionPendiente','guardar','formPago','f5ExigirEscritura','subirALaNube','f3ProcesarOutbox'])vm.runInContext(fuente(n),c);
  assert.equal(c.fiadoHayCorreccionPendiente(),true);assert.throws(()=>c.guardar(),/pendiente/);assert.throws(()=>c.f5ExigirEscritura(),/pendiente/);
  c.formPago('otro');assert.match(mensajes[0],/corrección pendiente/);assert.equal(await c.subirALaNube(),false);assert.equal(await c.f3ProcesarOutbox(),false);
});
test('recuperar una corrección incorpora la configuración y los metadatos de la revisión actual',async()=>{
  const remoto={clientes:[],pagos:[],ajustesFiado:[],egresos:[],cierres:[],config:{diasPlazoFiado:60},_tombstones:{pagos:{borrado:'fecha'}},_configSyncAt:'2026-11-02',_configSync:{diasPlazoFiado:'2026-11-02'},claveAjena:{conservar:true}};
  let persistido;
  const c={cambioLocalSeq:5,pendienteSubir:false,revisionNube:10,db:{...remoto,config:{diasPlazoFiado:30}},snapshotLocal:{},ultimaNubeDb:{},SYNC_COLECCIONES:['clientes','pagos','ajustesFiado','egresos','cierres'],
    clonarLocal:x=>structuredClone(x),deepCopy:x=>structuredClone(x),migrarFormaDb:x=>structuredClone(x),obtenerNube:async()=>({db:remoto,revision:12}),f32PersistirDatoEntrante:async()=>{},f32AplicarVisible:()=>{},f32PersistirFinalizacion:async()=>{persistido=structuredClone(c.db);}};
  vm.createContext(c);vm.runInContext(fuente('fiadoAplicarCorreccionServidor'),c);
  await c.fiadoAplicarCorreccionServidor({legacy:{revision:11,puts:[]},legacy_current_revision:12},{payload:{}},5);
  assert.equal(c.revisionNube,12);assert.equal(c.db.config.diasPlazoFiado,60);assert.equal(persistido.config.diasPlazoFiado,60);assert.deepEqual(c.db.claveAjena,{conservar:true});assert.deepEqual(c.db._tombstones,remoto._tombstones);assert.equal(c.pendienteSubir,false);
});
