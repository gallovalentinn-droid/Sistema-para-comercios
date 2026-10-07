// REV74: trasplante de números entre productos de la misma familia.
// REV75: conserva la palabra de cantidad del donante («400mg 20 comprimidos» sigue siendo un paquete de 20, no un 20
// suelto) y prueba cada texto también con la descripción de la IA igual al nombre del producto que dio las palabras.
// Para cada par (A, B) que comparte la primera palabra, arma un texto con las palabras de A y los datos numéricos
// de B (con sus unidades y paquetes). Si el emparejador elige solo un producto, el oráculo tiene que poder explicarlo.
// Uso: node trasplantes.cjs catalogo.json [raíz del paquete]
const fs=require('fs'),path=require('path');
const {cargar,explica}=require('./mutaciones.cjs');
const RE=/(x\s*)?\d+(?:[.,]\d+)?(\s*(?:mcg|ug|mg|ml|cc|cm\s*[´`']?\s*3|lts|lt|l|grs|gr|g|kg)(?![a-wyz]))?(\s+(?:unidades|unidad|unid|un|u|comprimidos|comp|capsulas|caps|sobres|saquitos|atados|rollos)(?![a-z]))?/gi;
function partes(nombre){return nombre.match(RE)||[];}
function textos(cat){
  const fam=new Map();for(const p of cat){const k=p.nombre.toLowerCase().split(/\s+/)[0];if(!fam.has(k))fam.set(k,[]);fam.get(k).push(p);}
  const out=[];
  for(const grupo of fam.values())for(const a of grupo)for(const b of grupo){
    if(a===b)continue;const nb=partes(b.nombre);if(!nb.length)continue;
    const palabras=a.nombre.replace(RE,' ').replace(/\s+/g,' ').trim();
    out.push({texto:`${palabras} ${nb.join(' ')}`,donante:a.nombre});
  }
  return out;
}
function correr(c,cat){const idx=c.rev70Indice(cat);const malos=[];const ts=textos(cat);let solos=0,total=0;
  for(const {texto,donante} of ts)for(const descripcion of ['',donante]){
    total++;const r=c.rev70Emparejar(texto,idx,descripcion?{descripcion}:{});if(r.estado!=='seguro')continue;solos++;
    if(!explica(texto,r.producto.nombre))malos.push(`${texto} -> ${r.producto.nombre}${descripcion?` [descripción IA: ${descripcion}]`:''}`);}
  return {textos:ts.length,total,solos,malos};}
module.exports={textos,correr};
if(require.main===module){const cat=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));const root=process.argv[3]||path.join(__dirname,'../..');
  const r=correr(cargar(root),cat);console.log(JSON.stringify({catalogo:cat.length,textos:r.textos,pruebas:r.total,eligeSolo:r.solos,eleccionesQueNoExplica:r.malos.length,deEllasConDescripcion:r.malos.filter(x=>x.includes('[descripción IA')).length}));
  r.malos.slice(0,Number(process.env.N||20)).forEach(x=>console.log('  ',x));}
