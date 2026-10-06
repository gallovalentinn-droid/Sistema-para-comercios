const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function context(){const html=fs.readFileSync('beta/index.html','utf8'),c={numFactura:Number};vm.createContext(c);vm.runInContext(html.slice(html.indexOf('/* REV70_EMPAREJADOR_START */'),html.indexOf('/* REV70_MEMORIA_END */')),c);return c;}
const row=(extra={})=>({_rev84:true,original:'CERVEZA X12 710',cantidad:2,costoU:600,subtotal:1200,packDetectado:12,porBultoIa:12,porBulto:1,prodId:'p',...extra});
test('REV86 pack explícito y botella individual: dos packs cargan 24 unidades sin preguntar',()=>{
 const c=context(),r=row();c.rev86AplicarStockAutomatico(r,{id:'p',nombre:'Botella Cerveza 710ml',unidad:'unidad'});
 assert.equal(c.rev84PuedeCargar([r]).ok,true);assert.equal(c.rev84CostoFila(r).unidades,24);assert.equal(c.rev84CostoFila(r).costoUnitario,50);
 assert.equal(c.rev86Presentacion(r).label,'Pack x12');
});
test('REV86 mismo pack en catálogo: dos packs conservan dos productos',()=>{
 const c=context(),r=row();c.rev86AplicarStockAutomatico(r,{id:'p',nombre:'Cerveza Pack x12 710ml',unidad:'unidad'});
 assert.equal(c.rev84PuedeCargar([r]).ok,true);assert.equal(c.rev84CostoFila(r).unidades,2);assert.equal(c.rev84CostoFila(r).costoUnitario,600);
});
test('REV86 IA sin evidencia, catálogo incierto y contradicciones requieren elegir',()=>{
 const c=context();for(const [extra,p] of [
  [{original:'Cerveza'}, {id:'p',nombre:'Botella Cerveza',unidad:'unidad'}],
  [{},{id:'p',nombre:'Producto',unidad:'unidad'}],
  [{porBultoIa:6},{id:'p',nombre:'Botella Cerveza',unidad:'unidad'}],
  [{packAmbiguo:true},{id:'p',nombre:'Botella Cerveza',unidad:'unidad'}],
  [{},{id:'p',nombre:'Cerveza Pack x6',unidad:'unidad'}],
  ...['Cerveza 6X710ml','Cerveza 2,25LTX6','Cerveza 710ml 6U','Cerveza 710ml (X6)','Cerveza 710ml x750U','Cerveza Pack x12 710ml (X6)'].map(nombre=>[{}, {id:'p',nombre,unidad:'unidad'}]),
  [{},{id:'p',nombre:'Botella Cerveza',unidad:'kg'}],
  [{prodId:'__nuevo__'},{id:'__nuevo__',nombre:'Botella Cerveza',unidad:'unidad'}]
 ]){const r=row(extra);c.rev86AplicarStockAutomatico(r,p);assert.equal(c.rev84PuedeCargar([r]).ok,false,JSON.stringify([extra,p]));assert.equal(r.porBulto,1);}
});
test('REV86 una decisión manual vigente tiene prioridad y editar el bulto no reactiva el automático',()=>{
 const c=context(),r=row(),p={id:'p',nombre:'Botella Cerveza',unidad:'unidad'};c.rev84ElegirStock(r,1);c.rev86AplicarStockAutomatico(r,p);assert.equal(r.porBulto,1);
 r.modoStock=null;r.stockEditado=true;c.rev86AplicarStockAutomatico(r,p);assert.equal(c.rev84PuedeCargar([r]).ok,false);
});
test('REV86 medidas y pack excesivo se distinguen de presentaciones claras',()=>{
 const c=context();for(const text of ['Bebida X750ML','Producto X500GRS','Aceite X2,25LT'])assert.equal(c.rev86Presentacion(row({original:text,packDetectado:null,porBultoIa:1})).label,'Unidad');
 assert.equal(c.rev86Presentacion(row({packAmbiguo:true,packDetectado:null,porBultoIa:750})).label,'Presentación a revisar');
 assert.equal(c.rev86Presentacion(row({original:'FERNET X750',packDetectado:null,porBultoIa:1})).label,'Presentación a revisar');
});
test('REV86 texto de pack sin confirmación IA exige resolver stock',()=>{
 const c=context(),r=row({packDetectado:null,porBultoIa:1});c.rev86PrepararPresentacion(r,{id:'p',nombre:'Botella Cerveza 710ml',unidad:'unidad'});
 assert.equal(r.packDetectado,12);assert.equal(c.rev84PuedeCargar([r]).ok,false);assert.equal(r.porBulto,1);
});
