// Mutación sistemática REV77 con oráculo independiente del emparejador.
// Uso: node mutaciones.cjs catalogo.json [raíz de otro paquete]
//
// Generador, por cada nombre del catálogo:
//   - cambia cada número (doble, +1, mitad);
//   - cambia unidades (mg<->mcg, ml<->L, g<->kg);
//   - agrega una unidad a un número suelto (600 -> 1200mg) y quita la unidad a una medida (200mg -> 201);
//   - intercambia el número de una medida con el de un paquete (20g x10 -> 10g x20);
//   - REV75: intercambia los valores de dos medidas del mismo tipo (Crema 125g Jabon 75g -> Crema 75g Jabon 125g).
// Cada texto se prueba dos veces: solo y con la descripción de la IA igual al nombre original del producto
// (el peor caso: la IA «corrige» el renglón hacia el catálogo). REV75, por el hallazgo R74-02.
// Oráculo (implementación propia, no usa código del emparejador):
//   1) el producto original nunca queda elegido solo con el nombre alterado;
//   2) si queda elegido solo OTRO producto, ese producto explica cada dato numérico del texto, respetando
//      de dónde viene cada número (medida, número suelto, paquete) y consumiendo cada aparición una sola vez.
//      Un paquete de más en el texto se acepta como embalaje si el producto quedó explicado o no tiene paquetes.
//      REV75: dos medidas del mismo tipo que quedan sin par (10g contra 20g) son una contradicción, aunque haya
//      números sueltos que las «expliquen» (R74-03). Y si un lado tiene dos o más medidas del mismo tipo, cada una
//      tiene que corresponder al mismo componente (las palabras que la preceden) o, si no se puede saber, al mismo orden.
//      REV77: un número de un dígito pegado a una palabra (FUSION2) es parte del nombre: si el producto no lo tiene,
//      se acepta solo cuando al producto no le queda ningún número propio sin explicar.
const fs=require('fs'),path=require('path'),vm=require('vm');

const UNIDAD=[['mcg','g',1e-6],['ug','g',1e-6],['mg','g',1e-3],['kg','g',1000],['grs','g',1],['gr','g',1],['g','g',1],
  ['ml','ml',1],['cc','ml',1],['cm3','ml',1],['lts','ml',1000],['lt','ml',1000],['l','ml',1000]];
const CUENTA=['unidades','unidad','unid','un','u','comprimidos','comp','capsulas','caps','sobres','saquitos','atados','rollos'];
function plano(t){return String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/µ/g,'u').replace(/cm\s*[´`']?\s*3/g,'cm3');}
// Devuelve [{k:'m',dim,valor,n} | {k:'s',n} | {k:'p',n}] sin recortar números (400MGX20 -> 400 mg y x20).
function datos(texto){
  const t=plano(texto);const out=[];const re=/\d+(?:[.,]\d+)?/g;let m;
  while((m=re.exec(t))){
    const n=parseFloat(m[0].replace(',','.'));const fin=m.index+m[0].length;
    const antes=t.slice(0,m.index),despues=t.slice(fin);
    if(/[a-z]$/.test(antes)&&!/x$/.test(antes)&&/cm$/.test(antes))continue;
    const u=UNIDAD.find(([s])=>new RegExp(`^\\s*${s}(?![a-wyz])`).test(despues));
    if(u){out.push({k:'m',dim:u[1],valor:n*u[2],n});re.lastIndex=fin+despues.match(new RegExp(`^\\s*${u[0]}`))[0].length;continue;}
    if(/x\s*$/.test(antes)){out.push({k:'p',n});continue;}
    const c=CUENTA.find(w=>new RegExp(`^\\s*${w}(?![a-z])`).test(despues));
    out.push({k:c?'p':(/[a-z]$/.test(antes)&&/^\d$/.test(m[0])?'g':'s'),n});
  }
  return out;
}
const igual=(a,b)=>Math.abs(a-b)<=Math.abs(b)*1e-9+1e-12;
// REV75: medidas con las palabras que las preceden. En el primer tramo, solo la última palabra es el componente
// (lo anterior nombra al producto entero: «Pack Nivea Crema 125g» -> crema).
const NO_PALABRA=new Set(['de','del','la','el','los','las','con','sin','en','pack','combo','x']);
function componentes(texto){
  const t=plano(texto);const out=[];let desde=0;const re=/\d+(?:[.,]\d+)?/g;let m;
  while((m=re.exec(t))){
    const despues=t.slice(m.index+m[0].length);
    const u=UNIDAD.find(([s])=>new RegExp(`^\\s*${s}(?![a-wyz])`).test(despues));
    if(!u)continue;
    const n=parseFloat(m[0].replace(',','.'));
    const palabras=(t.slice(desde,m.index).match(/[a-z]{3,}/g)||[]).filter(w=>!NO_PALABRA.has(w)&&!UNIDAD.some(([s])=>s===w));
    out.push({dim:u[1],valor:n*u[2],palabras:desde===0?palabras.slice(-1):palabras,todas:palabras});
    desde=m.index+m[0].length+despues.match(new RegExp(`^\\s*${u[0]}`))[0].length;re.lastIndex=desde;
  }
  return out;
}
const misma=(a,b)=>a===b||(a.length>=4&&b.length>=4&&(a.startsWith(b)||b.startsWith(a)));
// ¿Las medidas repetidas del texto corresponden a los mismos componentes del producto?
function componentesOk(texto,nombre){
  const T=componentes(texto),X=componentes(nombre);
  for(const dim of new Set([...T,...X].map(x=>x.dim))){
    const ts=T.filter(x=>x.dim===dim),xs=X.filter(x=>x.dim===dim);
    if(ts.length<2&&xs.length<2)continue;
    if(!ts.length||!xs.length)continue;
    if(xs.length>=2&&ts.length<xs.length)return false; // el texto nombra menos componentes que el producto
    const propias=xs.map((x,i)=>x.palabras.filter(w=>!xs.some((o,j)=>j!==i&&o.todas.some(v=>misma(w,v)))));
    let sinPar=false;
    for(const a of ts){
      const c=propias.map(ws=>ws.filter(w=>a.todas.some(v=>misma(v,w))).length);
      const max=Math.max(...c);
      if(max>0&&c.filter(x=>x===max).length===1){if(!igual(a.valor,xs[c.indexOf(max)].valor))return false;}
      else sinPar=true;
    }
    if(sinPar&&!(ts.length===xs.length&&ts.every((a,i)=>igual(a.valor,xs[i].valor))))return false;
  }
  return true;
}
// ¿El producto (nombre) explica todos los datos del texto?
function explica(texto,nombre){
  const T=datos(texto),X=datos(nombre);
  const usar=(pred)=>{for(let i=T.length-1;i>=0;i--){const j=X.findIndex(x=>pred(T[i],x));if(j>=0){X.splice(j,1);T.splice(i,1);}}};
  usar((a,b)=>a.k==='m'&&b.k==='m'&&a.dim===b.dim&&igual(a.valor,b.valor));
  // R74-03: una medida del texto y una del producto del mismo tipo que quedaron sin par se contradicen (10g contra 20g);
  // ningún número suelto puede taparlo.
  if(T.some(a=>a.k==='m'&&X.some(b=>b.k==='m'&&b.dim===a.dim)))return false;
  if(!componentesOk(texto,nombre))return false;
  usar((a,b)=>a.k!=='m'&&b.k!=='m'&&a.n===b.n);
  usar((a,b)=>(a.k==='s'||a.k==='g')&&b.k==='m'&&(igual(a.n,b.n)||igual(a.n,b.valor)));
  usar((a,b)=>a.k==='m'&&(b.k==='s'||b.k==='g')&&igual(a.n,b.n));
  // Un paquete de más en el texto es embalaje del mayorista si el producto quedó completamente explicado
  // o si el producto no tiene paquetes propios.
  const productoTienePaquetes=datos(nombre).some(x=>x.k==='p');
  return T.every(a=>(a.k==='p'&&(X.length===0||!productoTienePaquetes))||(a.k==='g'&&!X.some(b=>b.k!=='m')));
}
function mutaciones(p){
  const out=[];const nombre=p.nombre;const re=/\d+(?:[.,]\d+)?/g;let m;
  while((m=re.exec(nombre))){
    if(/cm[´`']?$/i.test(nombre.slice(0,m.index)))continue;
    const v=parseFloat(m[0].replace(',','.'));
    for(const nv of [v*2,v+1,v>1?Math.max(1,Math.round(v/2)):v+2]){if(nv!==v)out.push(nombre.slice(0,m.index)+String(nv).replace('.',',')+nombre.slice(m.index+m[0].length));}
    const sig=nombre.slice(m.index+m[0].length);
    if(!/^\s*(mcg|ug|mg|ml|cc|cm|l|lt|lts|g|gr|grs|kg)\b/i.test(sig))out.push(nombre.slice(0,m.index)+String(v*2)+'mg'+sig);
    else out.push(nombre.slice(0,m.index)+String(v+1)+sig.replace(/^\s*(mcg|ug|mg|ml|cc|cm3?|lts|lt|l|grs|gr|g|kg)\b/i,''));
  }
  for(const [a,b] of [[/(\d)\s*mg\b/i,'$1mcg'],[/(\d)\s*mcg\b/i,'$1mg'],[/(\d)\s*ml\b/i,'$1 L'],[/(\d)\s*(gr|g)\b/i,'$1kg'],[/(\d)\s*kg\b/i,'$1gr'],[/(\d)\s*(l|lt)\b/i,'$1ml']])
    if(a.test(nombre))out.push(nombre.replace(a,b));
  // REV75: intercambio de los valores de dos medidas del mismo tipo (componentes de un pack)
  const meds=[...nombre.matchAll(/(\d+(?:[.,]\d+)?)(\s*(mcg|mg|ml|cc|g|gr|grs|kg|l|lt|lts)\b)/gi)];
  for(let i=0;i<meds.length;i++)for(let j=i+1;j<meds.length;j++){
    const a=meds[i],b=meds[j];const ua=a[3].toLowerCase(),ub=b[3].toLowerCase();
    const dim=u=>/^(ml|cc|l|lt|lts)$/.test(u)?'ml':'g';
    if(dim(ua)!==dim(ub)||a[0].toLowerCase()===b[0].toLowerCase())continue;
    out.push(nombre.slice(0,a.index)+b[0]+nombre.slice(a.index+a[0].length,b.index)+a[0]+nombre.slice(b.index+b[0].length));
  }
  // intercambio medida <-> paquete
  const med=/(\d+(?:[.,]\d+)?)(\s*(?:mcg|mg|ml|cc|g|gr|kg|l|lt)\b)/i.exec(nombre),pq=/(x\s*)(\d+)/i.exec(nombre);
  if(med&&pq&&med[1]!==pq[2]){
    let t=nombre.replace(med[0],'§M§').replace(pq[0],'§P§');
    out.push(t.replace('§M§',pq[2]+med[2]).replace('§P§',pq[1]+med[1]));
  }
  return out;
}
function cargar(root){const h=fs.readFileSync(path.join(root,'beta/index.html'),'utf8');const c=vm.createContext({});
  vm.runInContext(h.slice(h.indexOf('/* REV70_EMPAREJADOR_START */'),h.indexOf('/* REV70_EMPAREJADOR_END */')),c);return c;}
function correr(c,cat){
  const idx=c.rev70Indice(cat);let total=0;const original=[],otro=[];
  for(const p of cat)for(const txt of mutaciones(p))for(const descripcion of ['',p.nombre]){
    total++;const r=c.rev70Emparejar(txt,idx,descripcion?{descripcion}:{});if(r.estado!=='seguro')continue;
    const con=descripcion?` [descripción IA: ${descripcion}]`:'';
    if(r.producto===p)original.push(`${txt} -> ${p.nombre}${con}`);
    else if(!explica(txt,r.producto.nombre))otro.push(`${txt} -> ${r.producto.nombre}${con}`);}
  return {total,original,otro};
}
module.exports={cargar,correr,mutaciones,datos,explica,componentes};
if(require.main===module){const cat=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));const root=process.argv[3]||path.join(__dirname,'../..');
  const r=correr(cargar(root),cat);console.log(JSON.stringify({catalogo:cat.length,pruebas:r.total,eligeSoloElOriginal:r.original.length,eligeSoloOtroQueNoExplica:r.otro.length,conDescripcion:[...r.original,...r.otro].filter(x=>x.includes('[descripción IA')).length}));
  [...r.original,...r.otro].slice(0,Number(process.env.N||20)).forEach(x=>console.log('  ',x));}
