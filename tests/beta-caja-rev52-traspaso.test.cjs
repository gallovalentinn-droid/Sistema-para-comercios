const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../beta/index.html'), 'utf8').replace(/\r\n/g, '\n');
function between(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `faltan ${start} / ${end}`);
  return source.slice(from, to);
}
function loadDomain() {
  const context = vm.createContext({
    setTimeout, clearTimeout, f3MensajeError:error=>String(error&&error.message||error),
    numImportacion: (value) => {
      const raw = String(value ?? '').trim();
      if (!raw) return {ok:true,blank:true,value:0};
      const number = Number(raw.replace(',', '.'));
      return {ok:Number.isFinite(number),blank:false,value:number};
    },
  });
  const code = between('function f52CalcularDestinoCierre(', '\nfunction htmlCierresAnteriores(');
  vm.runInContext(`${code}\nthis.calcular=f52CalcularDestinoCierre;this.ultimo=f52UltimoCierreLocal;this.resumen=f52ResumenTraspaso;this.importes=f52ImportesApertura;this.consultar=f52ConsultarTraspasoCaja;`, context);
  return context;
}

test('el cierre obliga a elegir y calcula el retiro desde lo que se deja', () => {
  const {calcular} = loadDomain();
  assert.equal(calcular(10000,3000,'','','',true).ok, false);
  assert.deepEqual(JSON.parse(JSON.stringify(calcular(10000,3000,'retirar_todo','','',true))), {
    ok:true,quedaGeneral:0,quedaCigarros:0,retiroGeneral:10000,retiroCigarros:3000,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(calcular(10000,3000,'dejar','4000','3000',true))), {
    ok:true,quedaGeneral:4000,quedaCigarros:3000,retiroGeneral:6000,retiroCigarros:0,
  });
});

test('no permite dejar más de lo contado ni omitir una caja activa', () => {
  const {calcular} = loadDomain();
  assert.equal(calcular(10000,3000,'dejar','10001','0',true).ok, false);
  assert.equal(calcular(10000,3000,'dejar','10000','',true).ok, false);
  assert.equal(calcular(10000,3000,'dejar','-1','0',true).ok, false);
  assert.equal(calcular(10000,3000,'dejar','10000','0',false).quedaCigarros, 0);
});

test('la caja toma su cierre más reciente y no recicla saldos de otra caja ni de un cierre viejo', () => {
  const {ultimo} = loadDomain();
  const cierres = [
    {id:'a',_v4cajaId:'caja-1',hasta:'2026-09-24T10:00:00Z',traspasoConfirmado:true,quedaGeneral:3000},
    {id:'b',_v4cajaId:'caja-2',hasta:'2026-09-24T12:00:00Z',traspasoConfirmado:true,quedaGeneral:9000},
    {id:'c',_v4cajaId:'caja-1',hasta:'2026-09-24T11:00:00Z'},
  ];
  assert.equal(ultimo(cierres,'caja-1').id, 'c');
  assert.equal(ultimo(cierres,'caja-2').id, 'b');
  assert.equal(ultimo(cierres,'caja-3'), null);
});

test('un cierre viejo no infiere saldo y una caja unificada suma el dinero que quedó en cigarrillos', () => {
  const {resumen,importes}=loadDomain();
  assert.equal(resumen({id:'viejo',contadoGeneral:10000}).tipo,'anterior');
  const nuevo=resumen({id:'nuevo',traspasoConfirmado:true,quedaGeneral:4000,quedaCigarros:1500});
  assert.deepEqual(JSON.parse(JSON.stringify(importes(nuevo,false))),{general:5500,cigarros:0});
  assert.deepEqual(JSON.parse(JSON.stringify(importes(nuevo,true))),{general:4000,cigarros:1500});
  assert.equal(resumen({id:'disputado',estado:'requiere_conciliacion',queda_general:4000,retiro_general:0}).tipo,'en_revision');
});

test('la apertura consulta el cierre de su caja en el servidor y usa un cierre local pendiente', async () => {
  const env=loadDomain();
  let llamadas=0;
  env.db={cierres:[]};env.f3Estado={comercioId:'comercio',cajaId:'caja'};
  env.sesion={user:{id:'u'}};env.enLinea=true;
  env.sb={rpc:async (name,args)=>{llamadas++;assert.equal(name,'ultimo_traspaso_caja_v1');assert.equal(args.p_caja_id,'caja');return {data:{id:'remoto',queda_general:2800,queda_cigarros:0,retiro_general:200,closed_at_server:'2026-09-26T10:00:00Z'},error:null};}};
  assert.equal((await env.consultar()).quedaGeneral,2800);
  assert.equal(llamadas,1);
  env.db.cierres=[{id:'local',_v4id:'pendiente',_v4cajaId:'caja',hasta:'2026-09-26T11:00:00Z',traspasoConfirmado:true,quedaGeneral:0,quedaCigarros:0}];
  assert.equal((await env.consultar()).cierreId,'pendiente');
  env.enLinea=false;
  assert.equal((await env.consultar()).sinConexion,true);
});

test('la migración conserva cierres anteriores y valida el traspaso en la misma operación', () => {
  const sql=fs.readFileSync(path.resolve(__dirname,'../REV52-CAJA-TRASPASO.sql'),'utf8');
  assert.match(sql,/add column if not exists queda_general numeric/i);
  assert.match(sql,/v_retiro_g\+v_queda_g/);
  assert.match(sql,/perform private\._rev52_guardar_traspaso\(p_comercio_id,p_payload,v_result\)/);
  assert.match(sql,/ultimo_traspaso_caja_v1/);
  assert.doesNotMatch(sql,/update public\.cierres_caja set[^;]*where[^;]*closed_at_server/i);
});
