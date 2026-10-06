const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function client(){
 const html=fs.readFileSync('beta/index.html','utf8'),c={numFactura:Number,detectarBulto:()=>1,localStorage:{getItem:()=>null,setItem(){}},navigator:{onLine:false}};
 vm.createContext(c);vm.runInContext(html.slice(html.indexOf('/* REV70_EMPAREJADOR_START */'),html.indexOf('/* REV70_MEMORIA_END */')),c);return c;
}
const item=(producto,n)=>({producto,cantidad:2,precioUnit:9000,unidadesPorBulto:n,descuento:0,subtotal:18000,impuestoFila:0});
const doc=i=>({proveedor:'Proveedor',nroComprobante:'1',total:18000,descuentoGlobal:0,saldoAnterior:0,pagosACuenta:0,items:[i]});
const encoders=[d=>({status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(d)}]}]}),d=>({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(d)}]}]})];
async function readers(){return [(await import('../supabase/functions/_shared/f6-invoice-reader.mjs')).extractGeminiInvoice,(await import('../supabase/functions/_shared/f6-openai-invoice-reader.mjs')).extractOpenAIInvoice];}
test('R-01 ningún bulto de IA se multiplica antes de decidir, aunque el texto no lo revele',async()=>{
 const fns=await readers();
 for(const [texto,n] of [['COCA COLA 2.25X6',6],['GAS.MANAOS COLA 2,25LTX6',6],['ALFAJOR GUAYMALLEN (X40)',40],['Gaseosa 6U',6],['Cerveza 6X473',6],['Galletas 36X118G',36],['Producto sin pack escrito',6]]){
  for(let j=0;j<fns.length;j++){
   const c=client(),parsed=fns[j](encoders[j](doc(item(texto,n))),{reviewMode:true}),products=[{id:'p',nombre:texto}];
   let r=c.rev70PrepararFilas(parsed,products,c.rev70MemoriaVacia())[0];r.prodId='p';
   assert.equal(c.rev84PuedeCargar([r]).ok,false,texto);assert.equal(c.rev84CostoFila(r).unidades,2,texto);
   c.rev84ElegirStock(r,n);assert.equal(c.rev84PuedeCargar([r]).ok,true);assert.equal(c.rev84CostoFila(r).unidades,2*n);assert.equal(c.rev84CostoFila(r).importeCentavos,1800000);
   c.rev84ElegirStock(r,1);assert.equal(c.rev84CostoFila(r).unidades,2);assert.equal(c.rev84CostoFila(r).costoUnitario,9000);
  }
 }
});
test('R-01 decisión de IA sin texto se recuerda solo para mismo proveedor, producto y bulto',()=>{
 const c=client(),mem=c.rev70MemoriaVacia(),products=[{id:'p',nombre:'Producto'}];
 const prepare=(n=6,proveedor='Proveedor')=>c.rev70PrepararFilas({proveedor,items:[{...item('Producto',n),revisionImporte:{status:'ok'},packDetectado:null}]},products,mem)[0];
 let r=prepare();r.prodId='p';c.rev84ElegirStock(r,6);c.rev70RecordarRevision(mem,[r],'Proveedor');
 r=prepare();assert.equal(c.rev84PuedeCargar([r]).ok,true);assert.equal(c.rev84CostoFila(r).unidades,12);
 for(const r of [prepare(40),prepare(6,'Otro proveedor')])assert.equal(c.rev84PuedeCargar([r]).ok,false);
 mem.decisionAvailable=false;assert.equal(c.rev84PuedeCargar([prepare()]).ok,false);
});
test('R-01 editar un multiplicador sin evidencia exige confirmarlo explícitamente',()=>{
 const c=client(),r={_rev84:true,cantidad:2,costoU:9000,subtotal:18000,packDetectado:null,porBulto:6,porBultoIa:1,prodId:'p'};
 assert.equal(c.rev84PuedeCargar([r]).ok,false);c.rev84ElegirStock(r,6);assert.equal(c.rev84PuedeCargar([r]).ok,true);
});
test('R-01 filas inicialmente cero o financieras exigen decisión al convertirse en mercadería',()=>{
 const c=client(),products=[{id:'p',nombre:'Producto'}];
 for(const [producto,cantidad,subtotal] of [['Producto',0,0],['SALDO ANTERIOR',2,18000]]){
  const r=c.rev70PrepararFilas({proveedor:'Proveedor',items:[{...item(producto,6),cantidad,subtotal,revisionImporte:{status:'ok'}}]},products,c.rev70MemoriaVacia())[0];
  assert.equal(c.rev84PuedeCargar([r]).ok,true);
  r.cantidad=2;r.subtotal=18000;c.rev84ElegirProducto(r,'p');
  assert.equal(c.rev84PuedeCargar([r]).ok,false,producto);assert.equal(c.rev84CostoFila(r).unidades,2);
  c.rev84ElegirStock(r,6);assert.equal(c.rev84PuedeCargar([r]).ok,true);assert.equal(c.rev84CostoFila(r).unidades,12);
 }
});
test('R-01 conservar evidencia financiera no vuelve a repartir su descuento sobre mercadería',async()=>{
 const c=client(),[gemini]=await readers(),products=[{id:'p',nombre:'Producto'},{id:'q',nombre:'Saldo reclasificado'}];
 const parsed=gemini(encoders[0]({...doc(item('Producto',1)),descuentoGlobal:20,items:[{...item('SALDO ANTERIOR',6),cantidad:1,precioUnit:100,subtotal:100},{...item('Producto',1),cantidad:1,precioUnit:100,subtotal:100}]}),{reviewMode:true});
 const rows=c.rev70PrepararFilas(parsed,products,c.rev70MemoriaVacia());rows[1].prodId='p';
 assert.equal(c.rev84PuedeCargar(rows).ok,true);assert.equal(c.rev84CostoFila(rows[1]).importeCentavos,9000);
 c.rev84ElegirProducto(rows[0],'q');c.rev84ElegirStock(rows[0],1);
 assert.equal(c.rev84PuedeCargar(rows).ok,true);assert.equal(c.rev84CostoFila(rows[0]).importeCentavos,9000);assert.equal(c.rev84CostoFila(rows[1]).importeCentavos,9000);
});
test('R-03 ambos lectores excluyen medidas decimales, abreviadas y sin sufijo de gran tamaño',async()=>{
 const fns=await readers();
 const textos=['FERNET BRANCA X750','ARROZ GALLO X 500 GRS','GASEOSA X 2 LTS','HARINA X 2 KGS','GASEOSA COCA COLA X2.25L','GASEOSA X 2,25 L','X 473 CM3','X 400 MG','X 10 MTS','X 2 LT','X 10 M','X 2.25','X 2,25'];
 for(let j=0;j<fns.length;j++)for(const texto of textos){const r=fns[j](encoders[j](doc(item(texto,1))),{reviewMode:true}).items[0];assert.equal(r.packDetectado,null,texto);assert.equal(!!r.packAmbiguo,false,texto);}
});
test('R-03 el detector limita la sugerencia a 144 y conserva packs pequeños junto a medidas',async()=>{
 const {invoicePackEvidence}=await import('../supabase/functions/_shared/f6-invoice-review.mjs');
 for(const [texto,n] of [['X144',144],['CAJA X144 U',144],['COCA COLA X2.25L X6',6],['ARROZ X500 GRS PACK X12',12]])assert.equal(invoicePackEvidence(texto).count,n,texto);
 for(const texto of ['X145','X750','CAJA X750 U'])assert.equal(invoicePackEvidence(texto).count,null,texto);
});
test('r3 HTML, caché y manifiesto identifican la misma entrega',()=>{
 const html=fs.readFileSync('beta/index.html','utf8'),c={};
 vm.runInNewContext(html.match(/const MICOMERCIO_BUILD=Object.freeze\([\s\S]*?\);/)[0]+';globalThis.build=MICOMERCIO_BUILD;',c);
 const manifest=JSON.parse(fs.readFileSync('integrity-manifest.json','utf8')),sw={};
 vm.runInNewContext(fs.readFileSync('beta/sw.js','utf8').match(/const CACHE=.*?;/)[0]+';globalThis.cache=CACHE;',sw);
 assert.equal(c.build.packageEdition,'2026-10-05-r3');assert.equal(c.build.packageEdition,manifest.packageEdition);
 assert.equal(sw.cache,`micomercio-beta-${c.build.version}-rev${c.build.packageRevision}-r3`);
});
