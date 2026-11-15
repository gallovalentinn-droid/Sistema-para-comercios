const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../beta/index.html'),'utf8');
function cargar(){
  const c={prod:id=>({p:{rubro:'Bebidas'}}[id])};
  vm.createContext(c);
  for(const nombre of ['normalizarBusqueda','ventaCoincideBusqueda','rubrosVenta','filtrarVentasPorBusqueda']){
    const inicio=html.indexOf(`function ${nombre}(`);assert.ok(inicio>=0,`falta ${nombre}`);
    vm.runInContext(html.slice(inicio,html.indexOf('\n}',inicio)+2),c);
  }
  return c;
}
test('combina texto y rubro sin alterar la venta ni sus totales',()=>{
  const c=cargar(),ventas=[{id:'a',total:4000,items:[{nombre:'Gaseosa',rubro:'Bebidas'},{nombre:'Alfajor',rubro:'Golosinas'}]},{id:'b',total:1000,items:[{nombre:'Caramelo',rubro:'Golosinas'}]}];
  const antes=JSON.stringify(ventas);
  assert.deepEqual(c.filtrarVentasPorBusqueda(ventas,'gaseosa','bebidas').map(v=>v.id),['a']);
  assert.equal(c.filtrarVentasPorBusqueda(ventas,'gaseosa','Cigarrillos').length,0);
  assert.equal(c.filtrarVentasPorBusqueda(ventas,'','').length,2);
  assert.equal(JSON.stringify(ventas),antes);
});
test('incluye rubros de componentes y prioriza el rubro guardado sobre el catálogo',()=>{
  const c=cargar(),venta={items:[{tipo:'combo',componentes:[{prodId:'p',nombre:'Gaseosa',rubro:'Promoción'},{prodId:'p',nombre:'Agua'}]}]};
  assert.deepEqual(Array.from(c.rubrosVenta(venta)),['Promoción','Bebidas']);
  assert.equal(c.filtrarVentasPorBusqueda([venta],'agua','bebidas').length,1);
});
test('permite encontrar líneas sin rubro aunque el producto ya no esté en catálogo',()=>{
  const c=cargar(),venta={items:[{nombre:'Producto anterior',prodId:'borrado'}]};
  assert.deepEqual(Array.from(c.rubrosVenta(venta)),['Sin rubro']);
  assert.equal(c.filtrarVentasPorBusqueda([venta],'anterior','sin rubro').length,1);
});
test('varios rubros incluyen cualquiera de los elegidos, sin duplicar ventas y combinando texto',()=>{
  const c=cargar(),ventas=[{id:'a',items:[{nombre:'Agua',rubro:'Bebidas'},{nombre:'Alfajor',rubro:'Golosinas'}]},{id:'b',items:[{nombre:'Caramelo',rubro:'Golosinas'}]},{id:'c',items:[{nombre:'Atado',rubro:'Cigarrillos'}]}];
  assert.deepEqual(c.filtrarVentasPorBusqueda(ventas,'',['bebidas','golosinas']).map(v=>v.id),['a','b']);
  assert.deepEqual(c.filtrarVentasPorBusqueda(ventas,'agua',['bebidas','golosinas']).map(v=>v.id),['a']);
  assert.equal(c.filtrarVentasPorBusqueda(ventas,'',[]).length,3);
});
