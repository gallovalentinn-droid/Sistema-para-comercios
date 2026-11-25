const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../beta/index.html'),'utf8');
const block=(from,to)=>html.slice(html.indexOf(from),html.indexOf(to));
function core(){
  const c=vm.createContext({numCantidad:s=>Number(String(s).replace(',','.'))});
  const start=html.indexOf('function numImportacion('),end=html.indexOf('\n}',start)+2;
  vm.runInContext(html.slice(start,end)+block('function numeroEditorProducto(', 'function formProducto(')+block('function calcularVentaGranel(', 'function pedirPeso('),c);
  return c;
}
test('un importe conserva sus centavos y convierte el stock a gramos enteros aproximados',()=>{
  const c=core(),p={nombre:'Pan',precio:3000};
  assert.equal(typeof c.calcularVentaGranel,'function');
  const r=c.calcularVentaGranel(p,'importe','2.000');
  assert.equal(r.gramos,667);assert.equal(r.kg,.667);assert.equal(r.importe,2000);assert.equal(r.aproximado,true);
  assert.equal(r.presentacion.precio,2000);assert.equal(r.presentacion.ventaPorMonto,true);
  const exacto=c.calcularVentaGranel(p,'importe','1.500,50');
  assert.equal(exacto.importe,1500.5);assert.equal(exacto.gramos,500);
});
test('peso e importe rechazan texto, negativos, cero y valores fuera de rango',()=>{
  const c=core();
  for(const modo of ['gramos','importe'])for(const valor of ['', 'abc','2 /','-10','0','1e3','Infinity','999999999999999'])
    assert.equal(c.calcularVentaGranel({nombre:'Pan',precio:3000},modo,valor),null,modo+': '+valor);
  for(const precio of [0,-1,NaN,Infinity])assert.equal(c.calcularVentaGranel({precio},'importe','2000'),null);
  assert.equal(c.calcularVentaGranel({precio:100000},'importe','0,01'),null,'No se puede descontar cero gramos');
  const r=c.calcularVentaGranel({nombre:'Pan',precio:3000},'gramos','250');
  assert.equal(r.kg,.25);assert.equal(r.importe,750);assert.equal(r.presentacion,null);
});
test('dos ventas por monto no se mezclan con peso libre ni una presentación fija',()=>{
  let seq=0;const pan={id:'pan',nombre:'Pan',unidad:'kg',precio:3000,costo:1800,stock:5};
  const c=core();Object.assign(c,{ticket:[],uid:()=>String(++seq),pintarPOS(){},mostrarFeedbackProducto(){},aviso(){},prod:()=>pan,promoParaProducto:()=>0});
  vm.runInContext(block('function nombrePresentacionPeso(', 'function buscarProductosVenta(')+block('function agregarAlTicket(', 'function comboStockDisponible(')+block('function buildVentaItem(', '// Asigna el neto real por línea.'),c);
  c.pan=pan;
  vm.runInContext("const r=calcularVentaGranel(pan,'importe','2000');agregarAlTicket(pan,r.kg,r.presentacion);agregarAlTicket(pan,r.kg,r.presentacion);agregarAlTicket(pan,.25);agregarAlTicket(pan,.667,{nombre:'Pan',gramos:667,precio:2000});this.items=ticket.map(buildVentaItem);",c);
  assert.equal(c.items.length,3);
  assert.equal(c.items[0].cant,1.334);assert.equal(Math.round(c.items[0].cant*c.items[0].precio*100)/100,4000);
  assert.equal(c.items[0].costo,1800);assert.equal(c.ticket[0].ventaPorMonto,true);
  assert.equal(c.items[1].cant,.25);assert.equal(c.items[2].cant,.667);
});
