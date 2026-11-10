// Sonda de navegador: la salida REAL del extractor del servidor (modo revisión) entra a la revisión de la app.
// Sin backend ni IA: la red externa queda bloqueada por el arnés de tests.
process.env.PW||='C:/Users/valen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
process.env.CHROME||='C:/Program Files/Google/Chrome/Application/chrome.exe';
const path=require('node:path'),{pathToFileURL}=require('node:url');
const {openShadow}=require('../tests/browser-fixture/shadow.cjs');
const fila=(producto,cantidad,precioUnit,extra={})=>({producto,codigo:'',descripcion:producto,cantidad,unidadesPorBulto:1,precioUnit,descuento:0,subtotal:Math.round(cantidad*precioUnit*100)/100,impuestoFila:0,...extra});
const respuesta=d=>({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(d)}]}]});

(async()=>{
  const {extractOpenAIInvoice}=await import(pathToFileURL(path.resolve(__dirname,'../supabase/functions/_shared/f6-openai-invoice-reader.mjs')).href);
  const leer=f=>JSON.parse(JSON.stringify(extractOpenAIInvoice(respuesta(f),{reviewMode:true}))); // como viaja por HTTP
  const h=await openShadow({width:1366});const p=h.page;const out={};
  try{
    await p.evaluate(()=>{db.productos=[{id:'gas',nombre:'Gaseosa Cola 500 ml',unidad:'unidad',costo:780,stock:0},{id:'alf',nombre:'Alfajor Triple',unidad:'unidad',costo:500,stock:0}];});

    // A · La IA lee mal el subtotal impreso (96000 en vez de 9600); cantidad y precio están bien.
    const a=leer({proveedor:'Distribuidora ficticia',nroComprobante:'1',total:9600,descuentoGlobal:0,saldoAnterior:0,pagosACuenta:0,items:[fila('GASEOSA COLA 500 ML',12,800,{subtotal:96000})]});
    await p.evaluate(d=>{remito=[];abrirRevisionFactura(d);},a);
    await p.selectOption('[data-rev-prod="0"]','gas');
    const celda=await p.locator('#revTabla tbody tr').first().innerText();
    out.A={
      estado:await p.locator('#revTabla .pill').first().innerText(),
      cargarHabilitado:await p.locator('#okRev').isEnabled(),
      muestraSubtotalImpreso:/96[.\s]?000/.test(celda),
      hayCampoSubtotal:await p.locator('#revTabla input[data-rev-subtotal], #revTabla input[data-rev-sub]').count()>0,
    };
    // Lo único que destraba la fila sin excluirla: falsear el precio para que cuadre con el subtotal mal leído.
    await p.fill('[data-rev-costo="0"]','8000');await p.dispatchEvent('[data-rev-costo="0"]','change');
    out.A.destrabaConPrecioFalso=await p.locator('#okRev').isEnabled();
    await p.click('#okRev');
    out.A.costoCargadoPorUnidad=await p.evaluate(()=>remito.map(l=>Number(l.costoU)));
    out.A.costoReal=800;

    // B · Descuento general con dos renglones finales en cantidad 0 (el servidor manda descuento null).
    const b=leer({proveedor:'Distribuidora ficticia',nroComprobante:'2',total:180,descuentoGlobal:20,saldoAnterior:0,pagosACuenta:0,
      items:[fila('GASEOSA COLA 500 ML',2,100),fila('VASOS REGALO',0,50),fila('SORBETES REGALO',0,30)]});
    out.B={servidor:b.items.map(i=>({descuento:i.descuento,descuentoGlobalAsignado:i.descuentoGlobalAsignado}))};
    await p.evaluate(d=>{remito=[];abrirRevisionFactura(d);},b);
    await p.selectOption('[data-rev-prod="0"]','gas');
    out.B.cargarHabilitado=await p.locator('#okRev').isEnabled();
    await p.click('#okRev');
    out.B.totalCargado=await p.evaluate(()=>remito.reduce((s,l)=>s+Number(l.totalL),0));
    out.B.esperado=180;
    out.errores=h.errors.filter(e=>e.startsWith('pageerror'));
    out.externas=h.external||[];
  }finally{await h.close();}
  console.log(JSON.stringify(out,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
