const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'beta/index.html'), 'utf8').replace(/\r\n/g, '\n');

function section(start, end) {
  const from = html.indexOf(start), to = html.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `falta la sección ${start}`);
  return html.slice(from, to);
}

test('ninguna salida de la beta revoca las sesiones de otros dispositivos', () => {
  const calls = [...html.matchAll(/\bsb\.auth\.signOut\s*\(([^)]*)\)/g)].map(match => match[1]);
  assert.equal(calls.length, 1, 'todas las salidas deben usar la misma función local');
  assert.ok(calls.every(args => /scope\s*:\s*['"]local['"]/.test(args)), 'hay un signOut global');
  assert.ok((html.match(/f61CerrarAuthLocal\(/g) || []).length >= 10, 'faltan salidas de sesión migradas');
});

test('una sesión caducada se detecta por refresh o 401 de negocio, no por clave incorrecta', () => {
  const context = vm.createContext({});
  vm.runInContext(`${section('/* F61_SESSION_CORE_START */', '/* F61_SESSION_CORE_END */')}\nthis.esRechazo=f61EsRechazoSesion;`, context);
  assert.equal(context.esRechazo(400, 'https://ejemplo.supabase.co/auth/v1/token?grant_type=refresh_token', 'refresh_token_not_found'), true);
  assert.equal(context.esRechazo(401, 'https://ejemplo.supabase.co/rest/v1/rpc/f5_obtener_proyeccion', ''), true);
  assert.equal(context.esRechazo(401, 'https://ejemplo.supabase.co/auth/v1/token?grant_type=password', 'invalid_grant'), false);
  assert.equal(context.esRechazo(401, 'https://ejemplo.supabase.co/functions/v1/f5-login', 'bad credentials'), false);
  assert.equal(context.esRechazo(403, 'https://ejemplo.supabase.co/rest/v1/rpc/f5_obtener_proyeccion', 'permission denied'), false);
});

test('cerrar sesión localmente no dispara alarma; un SIGNED_OUT externo sí pausa la sincronización', async () => {
  let listener, scope;
  const context = vm.createContext({
    sb:{auth:{onAuthStateChange(cb){listener=cb;}, async signOut(options){scope=options.scope;listener('SIGNED_OUT',null);return {error:null};}}},
    queueMicrotask,
  });
  vm.runInContext(`${section('let sesion=null;', 'let revisionNube=0;')}\nthis.api={setSession(s){sesion=s;},closed(){return f61SesionCerrada;},logout:f61CerrarAuthLocal,watch:f61MarcarSesionCerrada};`, context);
  context.api.setSession({user:{id:'usuario'}});
  await context.api.logout();
  await Promise.resolve();
  assert.equal(scope, 'local');
  assert.equal(context.api.closed(), false);
  listener('SIGNED_OUT', null);
  await Promise.resolve();
  assert.equal(context.api.closed(), true);
  listener('TOKEN_REFRESHED', {user:{id:'usuario'},access_token:'renovado'});
  assert.equal(context.api.closed(), false);
});

test('al perder la sesión aparece una acción persistente y se conserva el almacén local', () => {
  const sesion = section('/* F61_SESSION_CORE_START */', 'let revisionNube=0;');
  assert.match(section('<div class="session-alert"', '<script>'), /id="sesionAviso"[^>]*role="alert"/);
  assert.match(sesion, /onAuthStateChange\(/);
  assert.match(sesion, /event===['"]SIGNED_OUT['"]/);
  assert.match(sesion, /if\(!sesion\|\|f61CierreIntencional\|\|f61SesionCerrada\)return false/);
  assert.match(html, /if\(f61SesionCerrada\|\|!f3Activo\(\)/);
  assert.match(html, /if\(f61SesionCerrada\)return false/);
});

test('con la sesión cerrada no se envían ni operaciones V4 ni la copia anterior', async () => {
  const context = vm.createContext({f61SesionCerrada:true});
  vm.runInContext(`${section('async function f3ProcesarOutbox(', 'async function f3PrepararMaestrosShadow(')}\n${section('async function subirALaNube(){', 'async function cargar(){')}\nthis.drenar=f3ProcesarOutbox;this.subir=subirALaNube;`,context);
  assert.equal(await context.drenar(), false);
  assert.equal(await context.subir(), false);
});

test('el efectivo esperado y la ganancia solo se muestran al dueño desbloqueado', () => {
  const caja = section('function vCaja(m){', '\n/* ═══════════════════════════════════════════════════════\n   MOVIMIENTOS EN CUENTAS');
  assert.match(caja, /\$\{esDuenio\(\)\?`<div class="cash-boxes/);
  assert.match(caja, /<div><span>Ganancia estimada/);
  assert.match(caja, /<\/div><\/details>`:''\}/);
});

test('el permiso reparado de configuración queda versionado para instalaciones nuevas', () => {
  const sql = fs.readFileSync(path.join(root, 'REV61-PERMISO-CONFIG.sql'), 'utf8');
  assert.match(sql, /grant execute on function private\._f5_actualizar_config_privilegiada\(uuid,jsonb\) to authenticated;/i);
  assert.doesNotMatch(sql, /grant[^;]*\bto\s+(?:anon|public)\b/i);
});
