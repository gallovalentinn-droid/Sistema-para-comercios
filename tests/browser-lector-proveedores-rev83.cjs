// Pruebas de interfaz aisladas: nunca llaman IA, reservan cupo ni escriben stock.
process.env.PW||='C:/Users/valen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
process.env.CHROME||='C:/Program Files/Google/Chrome/Application/chrome.exe';
const {openShadow}=require('./browser-fixture/shadow.cjs'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{for(const width of [1366,390]){
 const h=await openShadow({width,publicUrl:process.env.PUBLIC_BETA||null});try{const p=h.page;
 assert.ok(await p.evaluate(()=>MICOMERCIO_BUILD.packageRevision>=83));
 const image=process.env.INVOICE_IMAGE?{name:'factura.jpeg',mimeType:'image/jpeg',buffer:fs.readFileSync(process.env.INVOICE_IMAGE)}:{name:'factura.png',mimeType:'image/png',buffer:Buffer.from(await p.evaluate(()=>{const c=document.createElement('canvas');c.width=900;c.height=1600;c.getContext('2d').fillRect(0,0,900,1600);return c.toDataURL().split(',')[1];}),'base64')};
 await p.evaluate(()=>{window.__readerCalls=0;window.__beforeStock=JSON.stringify(db.productos);sb.functions.invoke=async(name,{body})=>{window.__readerCalls++;window.__readerInput={name,parts:body.imageParts.length,partTypes:body.imageParts.map(p=>p.mediaType),bytes:body.imageParts.reduce((n,p)=>n+p.imageBase64.length*3/4,0)};return {error:{context:new Response(JSON.stringify({code:'IA_NO_DISPONIBLE',diagnostic:{provider:'openai',stage:'provider',providerCategory:'UNAVAILABLE',providerStatus:503}}),{status:503})}};};panelIngreso(true,'ia');});
 await p.setInputFiles('#facFoto',image);await p.locator('#facError').waitFor({state:'visible'});
 assert.match(await p.locator('#facError').innerText(),/OpenAI.*temporalmente/);assert.equal(await p.evaluate(()=>window.__readerCalls),1);
 const input=await p.evaluate(()=>window.__readerInput);assert.equal(input.parts,3);assert.deepEqual(input.partTypes,Array(3).fill(await p.evaluate(()=>MICOMERCIO_BUILD.packageRevision>=84?'image/jpeg':'image/png')));assert.ok(input.bytes<=8*1024*1024);
 await p.locator('#facError summary').click();assert.match(await p.locator('#facError').innerText(),/Solicitud a OpenAI/);assert.doesNotMatch(await p.locator('#facError').innerText(),/Google/);
 assert.equal(await p.locator('#facManualContent').isVisible(),true);assert.equal(await p.evaluate(()=>JSON.stringify(db.productos)===window.__beforeStock),true);
 await p.evaluate(()=>{sb.functions.invoke=async()=>{window.__readerCalls++;return {data:{iaProvider:'gemini',iaFallbackUsed:true,items:[],iaUsage:{}},error:null};};});
 await p.setInputFiles('#facFoto',image);await p.waitForFunction(()=>document.querySelector('#facError').innerText.includes('Google terminó'));
 assert.equal(await p.evaluate(()=>window.__readerCalls),2);assert.doesNotMatch(await p.locator('#facError').innerText(),/OpenAI|503/);
 await p.evaluate(()=>{sb.functions.invoke=async()=>{window.__readerCalls++;return {data:{iaProvider:'openai',proveedor:'Proveedor',nroComprobante:'1',total:100,descuentoGlobal:0,saldoAnterior:0,pagosACuenta:0,items:[{producto:'Producto de ejemplo X 12 UNI',codigo:'001',descripcion:'Producto de ejemplo',cantidad:1,unidadesPorBulto:12,precioUnit:100,descuento:0}],iaUsage:{}},error:null};};rev70SincronizarMemoria=async()=>({});});
 await p.setInputFiles('#facFoto',image);await p.waitForFunction(()=>revisionFactura.length===1);
 assert.equal(await p.evaluate(()=>window.__readerCalls),3);assert.equal(await p.evaluate(()=>JSON.stringify(db.productos)===window.__beforeStock),true);assert.equal(await p.evaluate(()=>revisionFactura[0].cantidad),1);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.equal(h.errors.filter(e=>e.startsWith('pageerror:')).length,0);
 const out=path.resolve(__dirname,'../entregables/publicacion-REV83-2026-10-03');fs.mkdirSync(out,{recursive:true});await p.screenshot({path:path.join(out,`${process.env.PUBLIC_BETA?'publico':'local'}-revision-${width}.png`)});
 console.log(JSON.stringify({revision:83,width,public:Boolean(process.env.PUBLIC_BETA),imageParts:input.parts,imagePartBytes:Math.round(input.bytes),calls:3,stockWrites:0,passed:true}));
 }finally{await h.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
