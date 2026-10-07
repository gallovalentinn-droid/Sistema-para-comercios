const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(process.env.MICOMERCIO_TEST_HTML||path.join(__dirname,'../beta/index.html'),'utf8').replace(/\r\n/g,'\n');
function source(name){
  const match=new RegExp(`^(?:async )?function ${name}\\(`,'m').exec(html);
  if(!match)return '';
  const end=html.indexOf('\n}',match.index);
  return html.slice(match.index,end+2);
}
function load(){
  const nodes=new Map(),opened=[],modals=[];
  const c={id:'own',responsableId:'employee',hasta:'2026-10-01T18:00:00Z',desde:'2026-10-01T10:00:00Z',cantVentas:0,total:0,porForma:{},cigTotal:0,cajaUnica:true,esperadoGeneral:0,contadoGeneral:0,diferenciaGeneral:0,ventaIds:[]};
  const context={
    owner:false,member:{rol:'empleado',user_id:'employee',comercio_id:'shop',permisos:{caja_operar:true}},
    cierreRecienteParaCompartir:c,db:{config:{nombre:'QA',whatsappDueno:'5491100000000'},cierres:[c],ventas:[]},
    f3Estado:{comercioId:'shop'},f69Estado:{comercioId:'shop',items:[],error:''},cierreResponsableFiltro:'todos',
    esDuenio:()=>context.owner,f5MembresiaActual:()=>context.member,
    f5PermissionsObject:value=>value||{},esc:value=>String(value),$m:value=>'$'+Number(value||0).toFixed(2),fFH:value=>value,
    responsableCierre:()=> 'QA',f69ResumenCierre:()=>({}),estadoDiferenciaCaja:()=>({}),
    formaKey:forma=>({qr:'transferencia',debito:'tarjeta',credito:'tarjeta'})[forma]||forma,
    FORMAS:{efectivo:'Efectivo',transferencia:'Transferencia / QR',tarjeta:'Tarjeta',fiado:'Fiado'},
    aviso:()=>{},guardar:()=>{},cerrarModal:()=>{},
    modal:options=>{modals.push(options);if(options.alAbrir)options.alAbrir({});},
    $:selector=>{if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',value:''});return nodes.get(selector);},
    window:{open:url=>opened.push(url)},netoItemVenta:i=>i.neto,esCigarrillo:r=>r==='Cigarrillos',
  };
  vm.createContext(context);
  const names=['efectivoCigarrillosVenta','f63CigarrillosCobradosVenta','calcularTotalesTurno','ventasDeCierre','verVentasTurno','verVentasTurnoInterrumpido','htmlCierresAnteriores','enlazarCierresAnteriores','textoResumenCierre','modalEnviarResumen','f79PuedeVerHistorialCaja','f79PuedeCompartirCierre','f79CigarrillosPorFormaTurno','f79CigarrillosPorFormaCierre'];
  vm.runInContext(names.map(source).join('\n')+`\nconst numeroWa=n=>String(n||'').replace(/[^\\d]/g,'');const linkWhatsapp=(n,t)=>'https://wa.me/'+numeroWa(n)+'?text='+encodeURIComponent(t);`,context);
  return {context,c,nodes,opened,modals};
}
test('empleado no obtiene historial ni detalles con llamadas indirectas',()=>{
  const {context,modals}=load();
  assert.equal(context.htmlCierresAnteriores(),'');
  context.verVentasTurno('own');context.verVentasTurnoInterrumpido('missing');
  assert.equal(modals.length,0);
});
test('interfaz protegida del dueño tampoco obtiene historial',()=>{
  const {context}=load();context.member.rol='duenio';
  assert.equal(context.htmlCierresAnteriores(),'');
});
test('empleado comparte sólo el objeto propio que acaba de cerrar',()=>{
  const {context,c,modals}=load();
  context.modalEnviarResumen({...c,id:'other',responsableId:'another'});
  assert.equal(modals.length,0);
  context.modalEnviarResumen(c);assert.equal(modals.length,1);
});
test('un botón de WhatsApp abierto por dueño deja de funcionar al cambiar de identidad',()=>{
  const {context,c,nodes,opened}=load();context.owner=true;context.cierreRecienteParaCompartir=null;
  context.modalEnviarResumen(c);context.owner=false;
  nodes.get('#okWa').onclick();assert.equal(opened.length,0);
});
test('resumen conserva los cuatro importes netos de cigarrillos de pagos combinados',()=>{
  const {context,c}=load();
  const sales=[{id:'v1',total:2000,forma:'mixto',pagos:[{forma:'efectivo',monto:500},{forma:'qr',monto:500},{forma:'debito',monto:500},{forma:'fiado',monto:500}],items:[{neto:1000,cant:1,costo:1,rubro:'Cigarrillos'},{neto:1000,cant:1,costo:1,rubro:'Almacén'}]}];
  const t=context.calcularTotalesTurno({ventasTodas:sales,pagos:[],egresos:[],moduloCigarros:false});
  c.cigTotal=t.cigTotal;c.cigPorForma=context.f79CigarrillosPorFormaTurno?context.f79CigarrillosPorFormaTurno(t):undefined;
  const message=context.textoResumenCierre(c);
  assert.match(message,/\*Cigarrillos por forma de pago\*\nEfectivo: \$250\.00\nTransferencia \/ QR: \$250\.00\nTarjeta: \$250\.00\nFiado: \$250\.00/);
});
test('el fiado puro y ventas anuladas no inflan los importes cobrados',()=>{
  const {context,c}=load();
  const sales=[{total:900,forma:'fiado',items:[{neto:900,cant:1,costo:1,rubro:'Cigarrillos'}]},{total:700,forma:'efectivo',anulada:true,items:[{neto:700,cant:1,costo:1,rubro:'Cigarrillos'}]}];
  const t=context.calcularTotalesTurno({ventasTodas:sales,pagos:[],egresos:[],moduloCigarros:false});
  c.cigTotal=t.cigTotal;c.cigPorForma=context.f79CigarrillosPorFormaTurno?context.f79CigarrillosPorFormaTurno(t):undefined;
  assert.match(context.textoResumenCierre(c),/Efectivo: \$0\.00\nTransferencia \/ QR: \$0\.00\nTarjeta: \$0\.00\nFiado: \$900\.00/);
});
test('snapshot del cierre conserva importes aunque luego anulen una venta',()=>{
  const {context,c}=load();c.cigTotal=800;c.cigPorForma={efectivo:200,transferencia:300,tarjeta:100,fiado:200};c.ventaIds=['v1'];c.cantVentas=1;
  context.db.ventas=[{id:'v1',anulada:true,anuladaFecha:'2026-10-02T12:00:00Z'}];
  assert.match(context.textoResumenCierre(c),/Efectivo: \$200\.00\nTransferencia \/ QR: \$300\.00\nTarjeta: \$100\.00\nFiado: \$200\.00/);
});
test('histórico con detalle incompleto no inventa cuatro ceros',()=>{
  const {context,c}=load();c.cigTotal=800;c.cantVentas=1;c.ventaIds=['missing'];
  assert.match(context.textoResumenCierre(c),/Desglose de cigarrillos no disponible/);
  assert.doesNotMatch(context.textoResumenCierre(c),/Efectivo: \$0\.00\nTransferencia/);
});
test('histórico completo reconstruye el desglose sin mezclar cobros de fiado posteriores',()=>{
  const {context,c}=load();c.cigTotal=600;c.cantVentas=1;c.ventaIds=['v1'];
  context.db.ventas=[{id:'v1',total:1000,forma:'mixto',pagos:[{forma:'credito',monto:500},{forma:'fiado',monto:500}],items:[{neto:600,cant:1,costo:1,rubro:'Cigarrillos'},{neto:400,cant:1,costo:1,rubro:'Almacén'}]}];
  assert.match(context.textoResumenCierre(c),/Efectivo: \$0\.00\nTransferencia \/ QR: \$0\.00\nTarjeta: \$300\.00\nFiado: \$300\.00/);
});
test('histórico sin snapshot con anulación posterior indica falta de desglose original',()=>{
  const {context,c}=load();c.cigTotal=800;c.cantVentas=1;c.ventaIds=['v1'];context.db.ventas=[{id:'v1',anulada:true,anuladaFecha:'2026-10-02T12:00:00Z'}];
  assert.match(context.textoResumenCierre(c),/Desglose de cigarrillos no disponible/);
});
test('el cero conocido de cigarrillos muestra las cuatro formas aunque falte detalle histórico',()=>{
  const {context,c}=load();c.cantVentas=2;c.ventaIds=['missing1','missing2'];
  assert.match(context.textoResumenCierre(c),/Efectivo: \$0\.00\nTransferencia \/ QR: \$0\.00\nTarjeta: \$0\.00\nFiado: \$0\.00/);
});
test('empleado sin teléfono configurado usa un destino temporal sin modificar configuración',()=>{
  const {context,c,nodes,opened}=load();context.db.config.whatsappDueno='';let saves=0;context.guardar=()=>{saves++;};
  context.modalEnviarResumen(c);context.$('#waNum').value='5491199999999';nodes.get('#okWa').onclick();
  assert.equal(opened.length,1);assert.equal(saves,0);assert.equal(context.db.config.whatsappDueno,'');
});
test('centavos prorrateados suman el neto total de cigarrillos',()=>{
  const {context,c}=load();c.cigTotal=.02;
  const t=context.calcularTotalesTurno({ventasTodas:[{total:.03,forma:'mixto',pagos:[{forma:'efectivo',monto:.01},{forma:'qr',monto:.01},{forma:'credito',monto:.01}],items:[{neto:.02,rubro:'Cigarrillos',cant:1,costo:1},{neto:.01,rubro:'Almacén',cant:1,costo:1}]}],pagos:[],egresos:[],moduloCigarros:false});
  c.cigPorForma=context.f79CigarrillosPorFormaTurno(t);
  assert.deepEqual(JSON.parse(JSON.stringify(c.cigPorForma)),{efectivo:.01,transferencia:.01,tarjeta:0,fiado:0});
});
test('redondeo de componentes entre ventas no genera fiado negativo ni pierde desglose',()=>{
  const {context}=load();
  const result=context.f79CigarrillosPorFormaTurno({cigTotal:.03,cigCobradoPorForma:{efectivo:.02,transferencia:.02,tarjeta:0,otros:0}});
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{efectivo:.02,transferencia:.01,tarjeta:0,fiado:0});
});
test('cierre remoto con sólo una parte del pago combinado no inventa deuda fiada',()=>{
  const {context,c}=load();c.cigTotal=600;c.cantVentas=1;c.ventaIds=['v1'];
  context.db.ventas=[{id:'v1',total:1000,forma:'mixto',pagos:[{forma:'efectivo',monto:250}],items:[{neto:600,cant:1,costo:1,rubro:'Cigarrillos'},{neto:400,cant:1,costo:1,rubro:'Almacén'}]}];
  assert.match(context.textoResumenCierre(c),/Desglose de cigarrillos no disponible/);
});
test('cierre remoto con pagos combinados completos reconstruye efectivo y transferencia',()=>{
  const {context,c}=load();c.cigTotal=600;c.cantVentas=1;c.ventaIds=['v1'];
  context.db.ventas=[{id:'v1',total:1000,forma:'mixto',pagos:[{forma:'efectivo',monto:250},{forma:'transferencia',monto:750}],items:[{neto:600,cant:1,costo:1,rubro:'Cigarrillos'},{neto:400,cant:1,costo:1,rubro:'Almacén'}]}];
  assert.match(context.textoResumenCierre(c),/Efectivo: \$150\.00\nTransferencia \/ QR: \$450\.00\nTarjeta: \$0\.00\nFiado: \$0\.00/);
});
test('pago reconstruido como efectivo no sustituye la forma original de una venta mixta',()=>{
  const {context,c}=load();c.cigTotal=600;c.cantVentas=1;c.ventaIds=['v1'];
  context.db.ventas=[{id:'v1',total:1000,forma:'transferencia',pagos:[{forma:'efectivo',monto:1000}],items:[{neto:600,cant:1,costo:1,rubro:'Cigarrillos'},{neto:400,cant:1,costo:1,rubro:'Almacén'}]}];
  assert.match(context.textoResumenCierre(c),/Desglose de cigarrillos no disponible/);
});
test('ventas o componentes de combo aproximados no se usan como detalle original',()=>{
  for(const approximate of ['sale','combo']){
    const {context,c}=load();c.cigTotal=600;c.cantVentas=1;c.ventaIds=['v1'];
    context.db.ventas=[{id:'v1',total:1000,forma:'efectivo',_v4reconstruccionAprox:approximate==='sale',items:approximate==='combo'?[{tipo:'combo',neto:1000,cant:1,costo:1,_v4reconstruccionAprox:true,componentes:[{rubro:'Cigarrillos',precio:600,cant:1,costo:1},{rubro:'Almacén',precio:400,cant:1,costo:1}]}]:[{neto:600,cant:1,costo:1,rubro:'Cigarrillos'},{neto:400,cant:1,costo:1,rubro:'Almacén'}]}];
    assert.match(context.textoResumenCierre(c),/Desglose de cigarrillos no disponible/);
  }
});
