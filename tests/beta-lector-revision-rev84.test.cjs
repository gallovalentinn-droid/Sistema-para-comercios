const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function context(){const html=fs.readFileSync('beta/index.html','utf8'),c={};const block=html.match(/\/\/ REV84_REVISION_INICIO([\s\S]*?)\/\/ REV84_REVISION_FIN/);if(block)vm.runInNewContext(block[1],c);return c;}
const row=(extra={})=>({_rev84:true,cantidad:2,costoU:5000,descuento:0,impuestoFila:0,subtotal:10000,descuentoGlobalAsignado:0,packDetectado:8,prodId:'p',porBulto:1,...extra});
test('REV84 pack pendiente bloquea; elecciones dan stock y costo correctos',()=>{
 const c=context();assert.equal(typeof c.rev84PuedeCargar,'function');const r=row();assert.equal(c.rev84PuedeCargar([r]).ok,false);
 c.rev84ElegirStock(r,1);assert.equal(c.rev84CostoFila(r).unidades,2);assert.equal(c.rev84CostoFila(r).costoUnitario,5000);
 c.rev84ElegirStock(r,8);assert.equal(c.rev84CostoFila(r).unidades,16);assert.equal(c.rev84CostoFila(r).costoUnitario,625);assert.equal(c.rev84PuedeCargar([r]).ok,true);
 const s=row({cantidad:5,costoU:3000,subtotal:15000,packDetectado:12});c.rev84ElegirStock(s,12);assert.equal(c.rev84CostoFila(s).unidades,60);assert.equal(c.rev84CostoFila(s).costoUnitario,250);
});
test('REV84 costo incluye impuesto y conserva centavos sin deriva por costo unitario',()=>{
 const c=context();assert.equal(typeof c.rev84CostoFila,'function');const r=row({costoU:100,impuestoFila:42,subtotal:242});c.rev84ElegirStock(r,8);
 assert.equal(c.rev84CostoFila(r).costoUnitario,15.125);assert.equal(c.rev84CostoFila(r).importeCentavos,24200);
 const n=row({cantidad:3,costoU:1,subtotal:3,packDetectado:7});c.rev84ElegirStock(n,7);assert.equal(c.rev84CostoFila(n).costoUnitario,.1429);assert.equal(c.rev84CostoFila(n).importeCentavos,300);
});
test('REV84 recalcula discordancia y confirmación ausente, excluir resuelve y producto nuevo vuelve a preguntar',()=>{
 const c=context();assert.equal(typeof c.rev84EstadoRevision,'function');const r=row({subtotal:9999});c.rev84ElegirStock(r,8);assert.equal(c.rev84PuedeCargar([r]).ok,false);
 r.subtotal=10000;assert.equal(c.rev84PuedeCargar([r]).ok,true);r.costoU=1;assert.equal(c.rev84PuedeCargar([r]).ok,false);r.excluida=true;assert.equal(c.rev84PuedeCargar([r]).ok,true);
 const missing=row({subtotal:null});c.rev84ElegirStock(missing,8);assert.equal(c.rev84PuedeCargar([missing]).ok,false);missing.importeConfirmado=true;assert.equal(c.rev84PuedeCargar([missing]).ok,true);
 missing.prodId='otro';assert.equal(c.rev84PuedeCargar([missing]).ok,false);
});
test('REV84 otra cantidad queda explícita y los límites manuales no se aceptan a ciegas',()=>{
 const c=context();assert.equal(typeof c.rev84ElegirStock,'function');const r=row();c.rev84ElegirStock(r,2);assert.equal(r.modoStock,'manual');assert.equal(c.rev84CostoFila(r).unidades,4);
 for(const n of [0,-1,1.5,1001,NaN])assert.equal(c.rev84ElegirStock(r,n),false);
});
test('REV84 corrección recalcula descuento general en centavos y bloquea reparto imposible',()=>{
 const c=context(),rows=[row({cantidad:1,costoU:10,subtotal:10,packDetectado:null,descuentoGlobalAsignado:50,descuentoGlobalTotal:100}),row({cantidad:1,costoU:100,subtotal:100,packDetectado:null,descuentoGlobalAsignado:50,descuentoGlobalTotal:100})];
 assert.equal(c.rev84PuedeCargar(rows).ok,true);assert.equal(rows.reduce((s,r)=>s+c.rev84CostoFila(r).importeCentavos,0),1000);
 rows[0].descuentoGlobalTotal=120;rows[1].descuentoGlobalTotal=120;assert.equal(c.rev84PuedeCargar(rows).ok,false);
});
test('REV84 presentación ambigua requiere decisión',()=>{
 const c=context();assert.equal(c.rev84PuedeCargar([row({packDetectado:null,packAmbiguo:true})]).ok,false);
});
test('H-06 pack de una unidad no bloquea por una elección equivalente',()=>{
 const c=context(),r=row({packDetectado:1});assert.equal(c.rev84PuedeCargar([r]).ok,true);assert.equal(c.rev84CostoFila(r).unidades,2);
});
test('H-05 administración ve respaldo/registro pendiente; empleados y diagnósticos crudos no',()=>{
 const c=context(),data={iaFallbackUsed:true,iaFallbackDiagnostic:{provider:'openai',providerCategory:'BILLING_REQUIRED',providerStatus:429,message:'PRIVATE SECRET',requestId:'00000000-0000-4000-8000-000000000001'}};
 assert.equal(typeof c.rev84AvisoAdmin,'function');
 const html=c.rev84AvisoAdmin(data,'duenio');assert.match(html,/Gemini/);assert.match(html,/saldo/i);assert.match(html,/00000000-0000-4000-8000-000000000001/);assert.doesNotMatch(html,/PRIVATE SECRET/);
 assert.equal(c.rev84AvisoAdmin(data,'empleado'),'');assert.match(c.rev84AvisoAdmin({iaAccountingStatus:'pending'},'admin'),/registro/i);
 assert.doesNotMatch(c.rev84AvisoAdmin({iaFallbackUsed:true,iaFallbackDiagnostic:{providerCategory:'<script>PRIVATE SECRET</script>',requestId:'<img>'}},'admin'),/PRIVATE|<script>|<img>/);
});
test('REV84 avisos explican memoria no disponible o solo local',()=>{
 const c=context();
 assert.equal(typeof c.rev84AvisoMemoria,'function');assert.match(c.rev84AvisoMemoria({decisionAvailable:false}),/no.*record|volver.*eleg/i);
 assert.match(c.rev84AvisoMemoria({syncStatus:'local'}),/dispositivo|local/i);
});
test('REV84 reintento explica consumo mensual del modo anterior aun si falla',()=>{
 const c=context();assert.equal(typeof c.rev84AvisoReintento,'function');assert.match(c.rev84AvisoReintento({_rev84QuotaMode:'legacy-rev83'}),/lectura mensual.*falla|falla.*lectura mensual/i);
});
test('REV84 memoria sin columnas conserva producto pero pregunta otra vez y no reaplica la elección de caché',async()=>{
 const html=fs.readFileSync('beta/index.html','utf8'),store=new Map(),sent=[];
 const missing={code:'PGRST204',message:'modo_stock column missing'};
 const table={upsert:async payload=>{sent.push(payload);return payload[0].modo_stock!==undefined?{error:missing}:{error:null}},select:fields=>({eq:()=>({limit:async()=>fields.includes('modo_stock')?{error:missing}:{data:[{proveedor_clave:'proveedor',texto_clave:'x8u',producto_ref:'p',unidades_por_bulto:8,usos:1}],error:null}})})};
 const c={console:{warn(){}},setTimeout,clearTimeout,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},numFactura:Number,detectarBulto:()=>1,sb:{from:()=>table},sesion:{},navigator:{onLine:true}};
 vm.createContext(c);vm.runInContext(html.slice(html.indexOf('/* REV70_EMPAREJADOR_START */'),html.indexOf('/* REV70_MEMORIA_END */')),c);
 const mem=c.rev70MemoriaVacia();c.rev70Recordar(mem,{proveedor:'Proveedor',texto:'X8U',ref:'p',upb:8,modoStock:'unidad',packDetectado:8});c.rev70GuardarMemoria('c',mem);
 const synced=await c.rev70SincronizarMemoria('c');assert.equal(synced.decisionAvailable,false);assert.equal(synced.filas['proveedor|x8u'].modoStock,undefined);
 const r=c.rev70PrepararFilas({proveedor:'Proveedor',items:[{producto:'X8U',cantidad:2,precioUnit:100,unidadesPorBulto:8,subtotal:200,impuestoFila:0,revisionImporte:{status:'ok'},packDetectado:8}]},[{id:'p',nombre:'Producto'}],synced)[0];
 assert.equal(r.prodId,'p');assert.equal(r.modoStock,undefined);assert.equal(c.rev84PuedeCargar([r]).ok,false);
 assert.equal(sent.length,2);assert.equal(sent[1][0].modo_stock,undefined);
});
test('REV84 reutiliza decisión propia, permite corregirla y pregunta ante otro proveedor/producto/pack o memoria vieja',()=>{
 const html=fs.readFileSync('beta/index.html','utf8'),c={numFactura:Number,detectarBulto:()=>1,localStorage:{getItem:()=>null,setItem(){}},navigator:{onLine:false}};
 vm.createContext(c);vm.runInContext(html.slice(html.indexOf('/* REV70_EMPAREJADOR_START */'),html.indexOf('/* REV70_MEMORIA_END */')),c);
 const mem=c.rev70MemoriaVacia(),products=[{id:'p',nombre:'Pañales X8U'},{id:'q',nombre:'Otro producto'}];
 const prepare=(proveedor='Proveedor',packDetectado=8)=>c.rev70PrepararFilas({proveedor,items:[{producto:'Pañales X8U',codigo:'001',cantidad:2,precioUnit:100,unidadesPorBulto:8,subtotal:200,impuestoFila:0,revisionImporte:{status:'ok'},packDetectado}]},products,mem)[0];
 c.rev70Recordar(mem,{proveedor:'Proveedor',texto:'Pañales X8U',codigo:'001',ref:'p',upb:8,modoStock:'unidad',packDetectado:8});
 let r=prepare();assert.equal(r.modoStock,'unidad');assert.equal(c.rev84PuedeCargar([r]).ok,true);
 c.rev70Recordar(mem,{proveedor:'Proveedor',texto:'Pañales X8U',codigo:'001',ref:'p',upb:2,modoStock:'manual',packDetectado:8});
 r=prepare();assert.equal(r.modoStock,'manual');assert.equal(r.porBulto,2);assert.equal(c.rev84CostoFila(r).unidades,4);
 for(const r of [prepare('Otro proveedor'),prepare('Proveedor',12)])assert.equal(c.rev84PuedeCargar([r]).ok,false);
 r=prepare();r.prodId='q';assert.equal(c.rev84PuedeCargar([r]).ok,false);
 c.rev70Recordar(mem,{proveedor:'Proveedor',texto:'Pañales X8U',codigo:'001',ref:'p',upb:8});r=prepare();assert.equal(c.rev84PuedeCargar([r]).ok,false);
});
