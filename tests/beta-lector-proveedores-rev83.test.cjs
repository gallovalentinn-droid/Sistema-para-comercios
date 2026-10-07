const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.resolve(__dirname,'../beta/index.html'),'utf8');
function context(extra={}){const c={...extra};vm.runInNewContext(html.match(/\/\/ REV82_DIAGNOSTICO_INICIO([\s\S]*?)\/\/ REV82_DIAGNOSTICO_FIN/)[1],c);return c;}
test('REV83 diagnóstico identifica OpenAI, saldo y validación de importe sin texto privado',()=>{
 const c=context();const error=c.f82DescribirFalloFactura({code:'IA_NO_DISPONIBLE',diagnostic:{provider:'openai',stage:'provider',providerCategory:'UNAVAILABLE',providerStatus:503}});
 assert.match(error.message,/OpenAI/);assert.match(error.detail,/Solicitud a OpenAI/);assert.doesNotMatch(error.detail,/Google/);
 const saldo=c.f82DescribirFalloFactura({code:'IA_SALDO_AGOTADO',diagnostic:{provider:'openai'}});assert.match(saldo.message,/saldo|créditos/);
 const row=c.f82DescribirFalloFactura({code:'FACTURA_NO_RECONOCIDA',diagnostic:{provider:'openai',stage:'validation',field:'subtotal',reason:'ROW_AMOUNT_MISMATCH',row:3}});assert.match(row.message,/fila 3.*subtotal/);
 const privateValue=c.f82DescribirFalloFactura({diagnostic:{provider:'PRIVATE SECRET'}});assert.doesNotMatch(JSON.stringify(privateValue),/PRIVATE|SECRET/);
});
function sectors(extra){const match=html.match(/\/\/ REV83_SECTORES_INICIO([\s\S]*?)\/\/ REV83_SECTORES_FIN/);assert.ok(match,'preparación de sectores en beta');const c={...extra};vm.runInNewContext(match[1],c);return c.f83SectoresFactura;}
test('REV83 tres sectores superpuestos preservan bordes y acotan resolución',async()=>{
 const crops=[],canvases=[];class Image{naturalWidth=900;naturalHeight=1600;async decode(){}}
 const f=sectors({Image,document:{createElement:()=>{const canvas={getContext:()=>({drawImage:(...a)=>crops.push(a.slice(1))}),toDataURL:(type,quality)=>{assert.equal(type,'image/jpeg');assert.equal(quality,.9);return 'data:image/jpeg;base64,AAAA'}};canvases.push(canvas);return canvas;}}});
 const parts=await f('AAAA','image/jpeg');assert.equal(parts.length,3);assert.deepEqual(crops.map(a=>[a[1],a[3]]),[[0,720],[560,720],[1120,480]]);assert.ok(canvases.every(c=>c.width<=2048&&c.height<=2048));
 assert.equal(parts[0].mediaType,'image/jpeg');assert.equal(parts[0].imageBase64,'AAAA');
});
test('REV83 sectores que no decodifican o exceden presupuesto permiten enviar original',async()=>{
 const bad=sectors({Image:class{async decode(){throw new Error('unsupported')}}});assert.equal((await bad('AAAA','image/heic')).length,0);
 const large=sectors({Image:class{naturalWidth=900;naturalHeight=1600;async decode(){}},document:{createElement:()=>({getContext:()=>({drawImage(){}}),toDataURL:()=> 'data:image/png;base64,'+'A'.repeat(4*1024*1024)})}});assert.equal((await large('AAAA','image/png')).length,0);
});
