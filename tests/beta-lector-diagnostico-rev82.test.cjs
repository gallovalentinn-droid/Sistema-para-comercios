const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../beta/index.html'),'utf8');
function describe(error){const match=html.match(/\/\/ REV82_DIAGNOSTICO_INICIO([\s\S]*?)\/\/ REV82_DIAGNOSTICO_FIN/);assert.ok(match,'existe diagnóstico de interfaz');const c={};vm.runInNewContext(match[1],c);return c.f82DescribirFalloFactura(error);}
test('REV82 aviso distingue límite de Google y cupo mensual propio',()=>{
 assert.match(describe({code:'IA_AGOTADA_TEMPORALMENTE',diagnostic:{providerCategory:'RATE_LIMIT'}}).message,/Google.*demasiadas solicitudes/);
 assert.match(describe({code:'IA_AGOTADA_TEMPORALMENTE',diagnostic:{providerCategory:'DAILY_QUOTA'}}).message,/Google.*cupo diario/);
 assert.match(describe({code:'IA_AGOTADA_TEMPORALMENTE',diagnostic:{providerCategory:'UNKNOWN'}}).message,/no informó qué límite/);
 assert.match(describe({code:'LIMITE_IA_MENSUAL',limite:100}).message,/100 lecturas.*comercio/);
});
test('REV82 validación informa fila y campo y las respuestas incompletas no culpan a la foto',()=>{
 const row=describe({code:'FACTURA_NO_RECONOCIDA',diagnostic:{stage:'validation',field:'cantidad',reason:'BELOW_MINIMUM',row:2}});
 assert.match(row.message,/fila 2.*cantidad.*menor/);
 assert.match(describe({code:'FACTURA_NO_RECONOCIDA',diagnostic:{reason:'F6_GEMINI_INCOMPLETE'}}).message,/Google.*incompleta/);
 assert.match(describe({code:'IA_SOLICITUD_RECHAZADA'}).message,/Google rechazó la solicitud/);
});
test('REV82 soporte contiene sólo metadatos conocidos, sin texto arbitrario ni credenciales',()=>{
 const r=describe({code:'SECRET',message:'PRIVATE',diagnostic:{stage:'PRIVATE',providerCategory:'SECRET',requestId:'SECRET',field:'PRIVATE',reason:'SECRET',row:-1,providerStatus:503}});
 assert.doesNotMatch(JSON.stringify(r),/SECRET|PRIVATE/);
 const valid=describe({code:'IA_NO_DISPONIBLE',diagnostic:{stage:'provider',providerCategory:'UNAVAILABLE',providerStatus:503,requestId:'00000000-0000-4000-8000-000000000001'}});
 assert.match(valid.detail,/503/);assert.match(valid.detail,/00000000-0000-4000-8000-000000000001/);
});
test('REV82 proveedor distingue autorización, su propio tiempo límite y recurso ausente',()=>{
 const msg=category=>describe({code:'IA_NO_DISPONIBLE',diagnostic:{stage:'provider',providerCategory:category}}).message;
 assert.match(msg('AUTHENTICATION'),/Google rechazó la autorización/);
 assert.match(msg('PROVIDER_TIMEOUT'),/Google agotó su propio tiempo/);assert.doesNotMatch(msg('PROVIDER_TIMEOUT'),/90 segundos/);
 assert.match(msg('RESOURCE_NOT_FOUND'),/Google no encontró el recurso/);assert.doesNotMatch(msg('RESOURCE_NOT_FOUND'),/modelo/);
});
test('REV84 subida vencida explica el envío de la foto sin culpar al JSON ni al proveedor',()=>{
 const r=describe({code:'IA_TIEMPO_AGOTADO',status:408,diagnostic:{stage:'upload'}});
 assert.match(r.message,/foto/);assert.match(r.detail,/Paso:.*foto/);assert.doesNotMatch(r.message,/Google|OpenAI|inválidos/);
});
