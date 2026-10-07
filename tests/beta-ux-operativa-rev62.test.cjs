const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=()=>fs.readFileSync(path.join(__dirname,'../beta/index.html'),'utf8');
function fn(source,name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,`falta ${name}`);
  const end=source.indexOf('\n}',start);
  assert.ok(end>start,`no termina ${name}`);
  return source.slice(start,end+2);
}
function run(names){
  const source=html(),context=vm.createContext({num:v=>Number(String(v).replace(',','.'))||0});
  vm.runInContext(names.map(name=>fn(source,name)).join('\n'),context);
  return context;
}

test('el estado de nube no es verde cuando la cola V4 o la copia local tienen pendientes',()=>{
  const {f62ResumenSync}=run(['f62ResumenSync']);
  const base={sesionActiva:true,enLinea:true,counts:{pendientes:0,problemas:0,licencia:0}};
  assert.equal(f62ResumenSync(base).tono,'ok');
  assert.equal(f62ResumenSync({...base,counts:{pendientes:3,problemas:0,licencia:0}}).texto,'3 operaciones sin subir · Reintentar');
  assert.equal(f62ResumenSync({...base,pendienteLegacy:true}).tono,'warn');
  assert.equal(f62ResumenSync({...base,counts:{pendientes:0,problemas:1,licencia:0}}).tono,'bad');
  assert.equal(f62ResumenSync({...base,lecturaFallida:true}).tono,'warn');
  assert.equal(f62ResumenSync({...base,sesionCerrada:true}).accion,'login');
  assert.equal(f62ResumenSync({...base,enLinea:false}).texto,'Sin conexión · datos en este dispositivo');
});

test('un aviso de actualización exige revisión superior y una venta terminada',()=>{
  const {f62RevisionNueva,f62PuedeActualizar}=run(['f62RevisionNueva','f62PuedeActualizar']);
  assert.equal(f62RevisionNueva("const CACHE='micomercio-beta-6.0.0-f6-rc2-rev62';",61),62);
  assert.equal(f62RevisionNueva("const CACHE='micomercio-beta-6.0.0-f6-rc2-rev61';",61),null);
  assert.equal(f62RevisionNueva('<html>offline fallback</html>',61),null);
  assert.equal(f62PuedeActualizar({ticketEnCurso:false,ventaEnProceso:false,modalAbierto:false,falloGuardadoLocal:false}),true);
  assert.equal(f62PuedeActualizar({ticketEnCurso:true}),false);
  assert.equal(f62PuedeActualizar({ventaEnProceso:true}),false);
  assert.equal(f62PuedeActualizar({modalAbierto:true}),false);
  assert.equal(f62PuedeActualizar({falloGuardadoLocal:true}),false);
});

test('efectivo vacío equivale al importe exacto sin alterar el vuelto de un importe ingresado',()=>{
  const {f62ImporteEfectivo}=run(['f62ImporteEfectivo']);
  assert.deepEqual(JSON.parse(JSON.stringify(f62ImporteEfectivo('',9500))),{valido:true,recibido:9500,vuelto:0});
  assert.deepEqual(JSON.parse(JSON.stringify(f62ImporteEfectivo('10000',9500))),{valido:true,recibido:10000,vuelto:500});
  assert.equal(f62ImporteEfectivo('9000',9500).valido,false);
});
