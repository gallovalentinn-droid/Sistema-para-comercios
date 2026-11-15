const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../beta/index.html'),'utf8');
function fuente(n){const i=html.indexOf('function '+n+'(');assert.ok(i>=0,'Falta '+n);return html.slice(i,html.indexOf('\n}',i)+2);}
function app(){const c={Number,Math,String};vm.createContext(c);for(const n of ['productoAlertasUX','estadoStockProductoUX'])vm.runInContext(fuente(n),c);return c;}
test('las alertas distinguen stock crítico, precio cero, código vacío y foto existente',()=>{
 const c=app();assert.deepEqual(JSON.parse(JSON.stringify(c.productoAlertasUX({stock:0,stockMin:3,precio:0,ean:'  ',fotoPath:'foto.jpg'}))),{stock:true,precio:true,codigo:true,imagen:false});
 assert.deepEqual(JSON.parse(JSON.stringify(c.productoAlertasUX({stock:6,stockMin:3,precio:100,ean:'779',foto:'data:image/png;base64,x'}))),{stock:false,precio:false,codigo:false,imagen:false});
});
test('la escala de stock usa mínimos y objetivos reales, con cero, negativos y fracciones',()=>{
 const c=app(),p={stockMin:3,stockDeseado:6};
 assert.equal(c.estadoStockProductoUX({...p,stock:0}).estado,'agotado');
 assert.equal(c.estadoStockProductoUX({...p,stock:-2}).porcentaje,0);
 assert.equal(c.estadoStockProductoUX({...p,stock:2}).estado,'bajo');
 assert.equal(c.estadoStockProductoUX({...p,stock:4}).estado,'reponer');
 assert.equal(c.estadoStockProductoUX({...p,stock:6}).estado,'bien');
 assert.equal(c.estadoStockProductoUX({stock:0.5,stockMin:0.3,stockDeseado:1}).porcentaje,50);
});
test('los filtros de atención se combinan con búsqueda, rubro y estado sin incluir archivados',()=>{
 const c=app();c.productoArchivadoRev31=p=>!!p.archivadoAt;c.filtrarRubrosRev31=(l,rs)=>l.filter(p=>!rs?.length||rs.includes(p.rubro));c.actividadProductoRev31=()=> 'nunca';
 vm.runInContext(fuente('filtrarCatalogoRev31'),c);
 const ps=[{id:'uno',nombre:'Alfajor',rubro:'Almacén',stock:0,stockMin:3,precio:0},{id:'dos',nombre:'Alfajor chocolate',rubro:'Almacén',stock:4,stockMin:3,precio:0},{id:'tres',nombre:'Alfajor viejo',rubro:'Almacén',stock:0,stockMin:3,precio:0,archivadoAt:'fecha'}];
 assert.deepEqual(Array.from(c.filtrarCatalogoRev31(ps,[],{q:'alfajor',rubros:['Almacén'],alertas:['stock','precio']},new Date()),p=>p.id),['uno']);
 assert.equal(c.filtrarCatalogoRev31(ps,[],{alertas:[]},new Date()).length,2);
 assert.deepEqual(Array.from(c.filtrarCatalogoRev31(ps,[],{estado:'archivados',alertas:['stock']},new Date()),p=>p.id),['tres']);
});
test('un ideal inválido usa el objetivo de reposición sin dividir por cero',()=>{
 const c=app(),s=c.estadoStockProductoUX({stock:0.5,stockMin:0,stockDeseado:-2});assert.equal(s.objetivo,1);assert.equal(s.porcentaje,50);
});
