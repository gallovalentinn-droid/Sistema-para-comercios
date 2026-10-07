const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'beta/index.html'), 'utf8').replace(/\r\n/g, '\n');
function section(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `Falta ${start} / ${end}`);
  return html.slice(a, b);
}

test('la migración acepta promociones NxM válidas y conserva rechazo de porcentajes inválidos', () => {
  const sql = fs.readFileSync(path.join(root, 'REV53-PROMOCIONES-CANTIDAD.sql'), 'utf8');
  assert.match(sql, /drop constraint if exists promociones_porcentaje_check/i);
  assert.match(sql, /tipo = 'producto'/i);
  assert.match(sql, /porcentaje = 0/i);
  assert.match(sql, /objetivo_texto ~/i);
  assert.match(sql, /split_part\(objetivo_texto, 'x', 1\)::integer\s*>\s*split_part\(objetivo_texto, 'x', 2\)::integer/i);
  assert.match(sql, /porcentaje > 0 and porcentaje <= 100/i);
});

test('una referencia de cierre desactualizada no revierte la apertura ni las ventas', () => {
  const sql = fs.readFileSync(path.join(root, 'REV52-CAJA-TRASPASO.sql'), 'utf8');
  assert.doesNotMatch(sql, /raise exception 'REV52_ULTIMO_CIERRE_CAMBIO_REVISAR_CAJA'/i);
  assert.match(sql, /apertura_requiere_revision/i);
  assert.match(sql, /apertura_cierre_servidor_id/i);
  assert.match(sql, /exception when others then[\s\S]*rev52_meta_alerta/i);
});

test('consulta de traspaso agotada permite contar la caja con contexto de conexión', async () => {
  const context = vm.createContext({
    db:{cierres:[]}, f3Estado:{cajaId:'caja',comercioId:'comercio'},
    sesion:{user:{id:'u'}}, enLinea:true,
    sb:{rpc:()=>new Promise(()=>{})},
    f3MensajeError:error=>String(error&&error.message||error),
    f3CodigoError:error=>String(error&&error.code||''),
    setTimeout:(fn)=>setTimeout(fn,0), clearTimeout,
  });
  vm.runInContext(`${section('function f52UltimoCierreLocal(', '\nfunction htmlCierresAnteriores(')}\nthis.consultar=f52ConsultarTraspasoCaja;`, context);
  const result = await context.consultar();
  assert.equal(result.tipo, 'sin_cierre');
  assert.equal(result.sinConexion, true);
  assert.equal(result.consultaError, 'conexion');
});

test('un cierre local pendiente no se ofrece como saldo remoto confirmado', async () => {
  const context=vm.createContext({
    db:{cierres:[{id:'local',_v4id:'pendiente',_v4cajaId:'caja',hasta:'2026-09-26T12:00:00Z',traspasoConfirmado:true,quedaGeneral:500,quedaCigarros:0}]},
    f3Estado:{cajaId:'caja',comercioId:'comercio'},sesion:{user:{id:'u'}},enLinea:true,
    sb:{rpc:async()=>({data:{id:'otro',queda_general:1000,queda_cigarros:0,retiro_general:0},error:null})},
    setTimeout,clearTimeout,f3MensajeError:error=>String(error&&error.message||error),f3CodigoError:error=>String(error&&error.code||''),
  });
  vm.runInContext(`${section('function f52UltimoCierreLocal(', '\nfunction htmlCierresAnteriores(')}\nthis.consultar=f52ConsultarTraspasoCaja;`,context);
  assert.equal((await context.consultar()).tipo,'en_revision');
});

test('un rechazo de restricción queda para revisión sin agotar reintentos', () => {
  const context=vm.createContext({navigator:{onLine:true}});
  vm.runInContext(`${section('function f3CodigoError(', '\nfunction f3AgotarReintentos(')}\nthis.manual=f3EsExcepcionManual;`, context);
  assert.equal(context.manual({code:'23514',message:'promociones_porcentaje_check'}),true);
  assert.equal(context.manual({code:'P0001',message:'REV52_TRASPASO_INVALIDO'}),true);
});

test('un cierre con alerta de metadatos no sugiere automáticamente plata para abrir', () => {
  const context=vm.createContext({});
  vm.runInContext(`${section('function f52ResumenTraspaso(', '\nfunction f52ImportesApertura(')}\nthis.resumen=f52ResumenTraspaso;`,context);
  const result=context.resumen({id:'c1',queda_general:500,queda_cigarros:0,retiro_general:0,rev52_meta_alerta:'23514:CONTEO'});
  assert.equal(result.tipo,'en_revision');
});

test('la persona que cerró viaja con el cierre y se lee desde la nube', () => {
  assert.match(section('function f3OperacionCierre(', '\nfunction f3MarcarSesionLocalCierrePendiente('),/responsable_nombre:String\(cierre\.responsableNombre/);
  assert.match(section('function f32bMapCierre(', '\nfunction f32bAjusteCierreView('),/traspaso\.responsable_nombre/);
  assert.match(section('async function f32bFetchCierreExtras(', '\nasync function f32bFetchExtras('),/rev52_meta_alerta/);
});

test('la caja presenta acciones y cifras con términos precisos', () => {
  const caja=section('function vCaja(m){', '\n/* ═══════════════════════════════════════════════════════\n   MOVIMIENTOS EN CUENTAS');
  assert.ok(caja.indexOf('data-destino-caja="dejar"')<caja.indexOf('data-destino-caja="retirar_todo"'));
  assert.match(caja,/id="responsableCierreCaja"/);
  assert.match(section('function htmlCierresAnteriores(', '\nfunction enlazarCierresAnteriores('),/c\.cantVentas===1\?'venta':'ventas'/);
  assert.match(section('function estadoDiferenciaCaja(', '\nfunction f52CalcularDestinoCierre('),/minimumFractionDigits:2/);
  assert.match(section('function pintarPreviewPrecios(', '\nfunction '),/Recargo sobre costo/);
});
