// Toda IA y escritura externa simulada. Se prueba el botón real y los bytes originales.
process.env.PW||='C:/Users/valen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
process.env.CHROME||='C:/Program Files/Google/Chrome/Application/chrome.exe';
const {openShadow}=require('./browser-fixture/shadow.cjs'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
(async()=>{for(const width of [1366,390])for(const mode of ['legacy-rev83','rev84']){
 const h=await openShadow({width});try{const p=h.page;
 assert.equal(await p.evaluate(()=>MICOMERCIO_BUILD.packageRevision),86);
 const image=process.env.INVOICE_IMAGE?{name:'factura.jpeg',mimeType:'image/jpeg',buffer:fs.readFileSync(process.env.INVOICE_IMAGE)}:{name:'factura.png',mimeType:'image/png',buffer:Buffer.from(await p.evaluate(()=>{const c=document.createElement('canvas');c.width=900;c.height=1600;const g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,900,1600);g.fillStyle='black';g.font='24px sans-serif';for(let i=0;i<38;i++)g.fillText(`Fila ${i+1}  2  100,00  200,00`,35,250+i*23);return c.toDataURL('image/png').split(',')[1]}),'base64')};
 await p.evaluate(mode=>{window.__ids=[];window.__stock=JSON.stringify(db.productos);window.__mode=mode;
 sb.functions.invoke=async(name,{body})=>{__ids.push(body.requestId);window.__input=body;if(__ids.length===1)return {error:{context:new Response(JSON.stringify({code:'IA_NO_DISPONIBLE',iaQuotaMode:mode,diagnostic:{provider:'openai',stage:'provider'}}),{status:503})}};
 return new Promise(resolve=>window.__finish=()=>resolve({data:{iaQuotaMode:mode,iaProvider:'openai',proveedor:'Prueba',total:100,items:[{producto:'Producto',codigo:'1',cantidad:1,unidadesPorBulto:1,precioUnit:100,descuento:0,subtotal:100,impuestoFila:0,revisionImporte:{status:'ok'}}]}}));};
 let sync=0;rev70SincronizarMemoria=async()=>{if(++sync===1)throw new Error('fixture alias unavailable');return {}};panelIngreso(true,'ia');},mode);
 await p.setInputFiles('#facFoto',image);await p.locator('#facReintentar').waitFor();assert.equal(await p.evaluate(()=>__ids.length),1);
 if(mode==='legacy-rev83')assert.match(await p.locator('#facError').innerText(),/consume otra lectura mensual, aun si falla/);
 const input=await p.evaluate(()=>__input);assert.equal(input.mediaType,image.mimeType);assert.equal(crypto.createHash('sha256').update(Buffer.from(input.imageBase64,'base64')).digest('hex'),crypto.createHash('sha256').update(image.buffer).digest('hex'));
 assert.equal(input.imageParts.length,3);assert.ok(input.imageParts.every(p=>p.mediaType==='image/jpeg'));assert.ok(input.imageParts.reduce((n,p)=>n+Buffer.from(p.imageBase64,'base64').length,0)<1024*1024);
 const dimensions=await p.evaluate(async()=>Promise.all(__input.imageParts.map(async p=>{const i=new Image();i.src=`data:${p.mediaType};base64,${p.imageBase64}`;await i.decode();return [i.naturalWidth,i.naturalHeight]})));assert.ok(dimensions.every(d=>d.every(n=>n<=2048)));
 await p.click('#facReintentar');await p.waitForFunction(()=>__ids.length===2);assert.equal(await p.locator('#facFotoLabel').getAttribute('aria-busy'),'true');
 await p.evaluate(()=>leerFacturaFoto(new File(['test'],'same.png',{type:'image/png'}),document.querySelector('#ov')));assert.equal(await p.evaluate(()=>__ids.length),2);
 await p.evaluate(()=>__finish());await p.waitForFunction(()=>document.querySelector('#facReintentar')?.textContent==='Volver a revisar la lectura');
 const ids=await p.evaluate(()=>__ids);assert.notEqual(ids[0],ids[1]);await p.click('#facReintentar');await p.waitForFunction(()=>revisionFactura.length===1);assert.equal(await p.evaluate(()=>__ids.length),2);
 assert.equal(await p.evaluate(()=>JSON.stringify(db.productos)===__stock),true);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(h.errors.filter(e=>e.startsWith('pageerror:')).length,0);
 console.log(JSON.stringify({width,quotaMode:mode,retryNewId:true,responseReused:true,originalUnchanged:true,sectorsJPEG:true,stockWrites:0}));
 }finally{await h.close()}
}})().catch(e=>{console.error(e);process.exitCode=1});
