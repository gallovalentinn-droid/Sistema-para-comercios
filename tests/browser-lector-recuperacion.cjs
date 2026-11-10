// H2/H3 y aviso de cuenta: la salida REAL del extractor del servidor (modo revisión) entra a la revisión de la app.
// Sin backend ni IA: el arnés bloquea toda red externa.
process.env.PW||='C:/Users/valen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
process.env.CHROME||='C:/Program Files/Google/Chrome/Application/chrome.exe';
const path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {openShadow}=require('./browser-fixture/shadow.cjs');
const fila=(producto,cantidad,precioUnit,extra={})=>({producto,codigo:'',descripcion:producto,cantidad,unidadesPorBulto:1,precioUnit,descuento:0,subtotal:Math.round(cantidad*precioUnit*100)/100,impuestoFila:0,...extra});
const doc=(items,total,extra={})=>({proveedor:'Distribuidora ficticia',nroComprobante:'1',total,descuentoGlobal:0,saldoAnterior:0,pagosACuenta:0,items,...extra});
const gpt=d=>({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(d)}]}]});
const gem=d=>({status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(d)}]}]});

(async()=>{
  const shared=f=>import(pathToFileURL(path.resolve(__dirname,'../supabase/functions/_shared',f)).href);
  const {extractOpenAIInvoice}=await shared('f6-openai-invoice-reader.mjs'),{extractGeminiInvoice}=await shared('f6-invoice-reader.mjs');
  for(const [proveedor,leerCrudo] of [['openai',d=>extractOpenAIInvoice(gpt(d),{reviewMode:true})],['gemini',d=>extractGeminiInvoice(gem(d),{reviewMode:true})]])for(const width of [1366,390]){
    const leer=d=>JSON.parse(JSON.stringify(leerCrudo(d))); // como viaja por HTTP
    const h=await openShadow({width});const p=h.page;
    const abrir=async d=>{await p.evaluate(d=>{document.querySelectorAll('.ov').forEach(o=>o.remove());remito=[];productosFacturaPendientes=[];abrirRevisionFactura(d);},d);};
    const cambiar=async(sel,valor)=>{await p.fill(sel,valor);await p.dispatchEvent(sel,'change');};
    const cargar=()=>p.locator('#okRev');
    try{
      await p.evaluate(()=>{db.productos=[{id:'gas',nombre:'Gaseosa Cola 500 ml',unidad:'unidad',costo:780,stock:0},{id:'car',nombre:'Caramelos Surtidos',unidad:'unidad',costo:0,stock:0},{id:'sn',nombre:'Sin nombre',unidad:'unidad',costo:0,stock:0}];});

      // H2a · subtotal mal leído (96.000 en vez de 9.600): se descarta el dato leído y se confirma el importe.
      await abrir(leer(doc([fila('GASEOSA COLA 500 ML',12,800,{subtotal:96000})],9600)));
      await p.selectOption('[data-rev-prod="0"]','gas');
      assert.equal(await cargar().isEnabled(),false);
      assert.match(await p.locator('[data-rev-evidencia="0"]').innerText(),/96\.000,00.*9\.600,00.*86\.400,00/s);
      assert.equal(await p.locator('[data-rev-subtotal="0"]').isVisible(),true);
      await p.click('[data-rev-sin-subtotal="0"]');
      assert.equal(await cargar().isEnabled(),false,'descartar el subtotal exige confirmar el importe');
      assert.match(await p.locator('[data-rev-importe="0"]').innerText(),/9\.600,00/);
      await p.check('[data-rev-confirmar="0"]');
      assert.equal(await cargar().isEnabled(),true);
      assert.deepEqual(await p.evaluate(()=>({leido:revisionFactura[0].subtotalIa,usado:revisionFactura[0].subtotal})),{leido:96000,usado:null},'lo leído se conserva aparte');
      await p.click('#okRev');
      assert.deepEqual(await p.evaluate(()=>remito.map(l=>[l.cant,Number(l.costoU),l.totalL])),[[12,800,'9600.00']]);

      // H2b · el mismo caso corrigiendo el subtotal a mano.
      await abrir(leer(doc([fila('GASEOSA COLA 500 ML',12,800,{subtotal:96000})],9600)));
      await p.selectOption('[data-rev-prod="0"]','gas');
      await cambiar('[data-rev-subtotal="0"]','9.600');
      assert.equal(await cargar().isEnabled(),true);
      assert.match(await p.locator('[data-rev-leido="0"]').innerText(),/96\.000,00/);

      // H2c · impuesto mal leído (la IA sumó $21 que la factura no cobra aparte).
      await abrir(leer(doc([fila('GASEOSA COLA 500 ML',2,100,{impuestoFila:21,subtotal:200})],200)));
      await p.selectOption('[data-rev-prod="0"]','gas');
      assert.equal(await cargar().isEnabled(),false);
      await cambiar('[data-rev-impuesto="0"]','0');
      assert.equal(await cargar().isEnabled(),true);
      await p.click('#okRev');
      assert.deepEqual(await p.evaluate(()=>remito.map(l=>[l.cant,Number(l.costoU),l.totalL])),[[2,100,'200.00']]);

      // H3a · devolución y nota de crédito con signo: no se cargan, no son deuda y explican el total impreso.
      const conAjustes=leer(doc([fila('GASEOSA COLA 500 ML',12,800),fila('DEVOLUCION ENVASES',-6,150),fila('NOTA DE CREDITO ROTURA',1,-500)],8200,{descuentoGlobal:0}));
      assert.deepEqual(conAjustes.items.map(i=>!!i.ajuste),[false,true,true]);
      await abrir(conAjustes);
      await p.selectOption('[data-rev-prod="0"]','gas');
      assert.equal(await cargar().isEnabled(),true,'los ajustes no traban la carga');
      assert.equal(await p.locator('[data-rev-ajuste]').count(),2);
      assert.match(await p.locator('[data-rev-ajuste="1"]').innerText(),/Ajuste: no se carga.*−\$\s?900,00/s);
      assert.equal(await p.locator('[data-rev-ajuste] input:not([type=checkbox])').count(),0,'una fila con signo no se edita con campos que lo borran');
      assert.match(await p.locator('#revTabla .notice').first().innerText(),/9\.600,00.*−\$\s?1\.400,00.*8\.200,00.*diferencia: \$\s?0,00/s);
      assert.doesNotMatch(await p.locator('#rev78TicketResumen').innerText(),/deuda|Revisá el total/i);
      await p.check('[data-rev-ajuste="2"] [data-rev-excluir]');
      assert.match(await p.locator('#revTabla .notice').first().innerText(),/−\$\s?900,00.*diferencia: \$\s?500,00/s);
      await p.click('#okRev');
      assert.deepEqual(await p.evaluate(()=>({lineas:remito.map(l=>[l.prodId,l.cant,l.totalL]),deuda:remitoHeader.deudaTicket,pagos:remitoHeader.pagosTicket,revisar:remitoHeader.revisarTicket})),
        {lineas:[['gas',12,'9600.00']],deuda:0,pagos:0,revisar:false});

      // H3b · un descuento general no se reparte sobre los ajustes.
      const conDescuento=leer(doc([fila('GASEOSA COLA 500 ML',12,800),fila('DEVOLUCION ENVASES',-6,150)],8600,{descuentoGlobal:100}));
      await abrir(conDescuento);await p.selectOption('[data-rev-prod="0"]','gas');await p.click('#okRev');
      assert.deepEqual(await p.evaluate(()=>remito.map(l=>l.totalL)),['9500.00']);

      // H3c · si la IA marcó como ajuste un producto, la persona lo convierte y lo revisa como cualquier fila.
      await abrir(leer(doc([fila('GASEOSA COLA 500 ML',-12,800)],9600)));
      assert.equal(await cargar().isEnabled(),true);
      await p.click('[data-rev-ajuste-producto="0"]');
      assert.equal(await cargar().isEnabled(),false);
      await p.selectOption('[data-rev-prod="0"]','gas');
      assert.equal(await cargar().isEnabled(),true);
      await p.click('#okRev');
      assert.deepEqual(await p.evaluate(()=>remito.map(l=>[l.cant,l.totalL])),[[12,'9600.00']]);

      // H3d · bulto ilegible (0): no se asume unidad; hay que elegir cómo se carga.
      const bulto=leer(doc([fila('CARAMELOS SURTIDOS',1,900,{unidadesPorBulto:0})],900));
      assert.equal(bulto.items[0].bultoDesconocido,true);
      await abrir(bulto);await p.selectOption('[data-rev-prod="0"]','car');
      assert.equal(await cargar().isEnabled(),false);
      assert.match(await p.locator('[data-label="Unid. x bulto"]').innerText(),/Presentación a revisar/);
      assert.match(await p.locator('[data-label="Se carga"]').innerText(),/^Por confirmar/);
      await p.click('[data-rev-stock="0:1"]');
      assert.equal(await cargar().isEnabled(),true);

      // H3e · producto sin nombre: ni el emparejador ni la memoria lo eligen; tampoco se recuerda.
      const vacio=leer(doc([fila('',1,700,{codigo:'A-77',descripcion:''})],700));
      assert.equal(vacio.items[0].productoVacio,true);
      const memoria=await p.evaluate(d=>{const mem=rev70LeerMemoria(f3Estado.comercioId);rev70Recordar(mem,{proveedor:d.proveedor,texto:'(sin nombre)',codigo:'A-77',ref:'sn',upb:1});
        document.querySelectorAll('.ov').forEach(o=>o.remove());remito=[];abrirRevisionFactura(d,{memoria:mem});return rev70BuscarEnMemoria(mem,{proveedor:d.proveedor,texto:'(sin nombre)',codigo:'A-77'},db.productos)?.producto?.id||null;},vacio);
      assert.equal(memoria,'sn','la memoria de prueba sí conoce ese código');
      assert.deepEqual(await p.evaluate(()=>({prodId:revisionFactura[0].prodId,candidatos:revisionFactura[0].candidatos.length})),{prodId:'',candidatos:0});
      assert.match(await p.locator('#revTabla .pill').first().innerText(),/Sin nombre: elegí el producto/);
      assert.equal(await cargar().isEnabled(),false);
      await p.selectOption('[data-rev-prod="0"]','sn');
      assert.equal(await cargar().isEnabled(),true);
      assert.equal(await p.evaluate(()=>{const mem={v:1,proveedores:{},items:{}};const antes=JSON.stringify(mem);try{rev70RecordarRevision(mem,revisionFactura,'Distribuidora ficticia',r=>r.prodId);}catch(_){return 'error';}return JSON.stringify(mem)===antes;}),true,'una fila sin nombre no se recuerda');

      assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'sin desborde horizontal');

      // Aviso de cuenta: OpenAI rechazó la clave y el respaldo también falló.
      const fallo={code:'IA_NO_DISPONIBLE',status:503,diagnostic:{stage:'provider',provider:'gemini',providerCategory:'UNAVAILABLE',providerStatus:503,fallbackUsed:true,retryAfterSeconds:30,
        fallbackDiagnostic:{stage:'provider',provider:'openai',providerCategory:'API_KEY_INVALID',providerStatus:401,code:'IA_SOLICITUD_RECHAZADA',detalle:'PRIVATE sk-secreto'}}};
      const verFallo=async rol=>{
        await p.evaluate(({fallo,rol})=>{document.querySelectorAll('.ov').forEach(o=>o.remove());f5RolActual=()=>rol;
          sb.functions.invoke=async()=>({data:null,error:{message:'PRIVATE',context:new Response(JSON.stringify(fallo),{status:503})}});panelIngreso(true,'ia');},{fallo,rol});
        await p.setInputFiles('#facFoto',{name:'factura.png',mimeType:'image/png',buffer:Buffer.from('synthetic image')});
        await p.locator('#facError').waitFor({state:'visible'});return p.locator('#facError').innerText();
      };
      const duenio=await verFallo('duenio');
      assert.match(duenio,/Aviso para administración.*OpenAI rechazó la clave del lector/s);assert.match(duenio,/Google no pudo atender/);
      assert.doesNotMatch(duenio,/PRIVATE|sk-secreto/);
      const empleado=await verFallo('empleado');
      assert.doesNotMatch(empleado,/Aviso para administración|rechazó la clave/);
      assert.equal(await p.evaluate(()=>f82DescribirFalloFactura({code:'IA_NO_DISPONIBLE',diagnostic:{stage:'provider',provider:'gemini',providerCategory:'UNAVAILABLE'}}).admin),'');

      assert.deepEqual(h.errors.filter(e=>e.startsWith('pageerror:')),[]);
      console.log(JSON.stringify({proveedor,width,subtotalCorregible:true,impuestoCorregible:true,ajustesConSigno:true,bultoPendiente:true,sinNombrePendiente:true,avisoCuenta:true}));
    }finally{await h.close();}
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
