// Compara el emparejador de REV69 con el de REV77 sobre un catálogo exportado.
// Uso: node evaluar.cjs catalogo.json   (catalogo.json = [{id, nombre, proveedor}], por ejemplo exportado de la tabla productos)
// El catálogo real no se incluye en el paquete.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../../beta/index.html'), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(html.slice(html.indexOf('/* REV70_EMPAREJADOR_START */'), html.indexOf('/* REV70_EMPAREJADOR_END */')), ctx);
const catalogo = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const {ajuste, control, revision, facturaReal} = require('./casos.cjs');

function normalizarTexto(s){return (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();}
function rev69(nombre){ // copia de coincidenciaProducto de REV69
  const q=normalizarTexto(nombre);if(!q)return null;const qWords=q.split(' ').filter(w=>w.length>1);let mejor=null,mejorScore=0;
  catalogo.forEach(p=>{const n=normalizarTexto(p.nombre);if(!n)return;const nWords=n.split(' ');let score=n===q?10:0;
    qWords.forEach(w=>{if(nWords.includes(w))score+=2;else if(n.includes(w))score+=1;});if(score>mejorScore){mejorScore=score;mejor=p;}});
  return mejorScore>=2?mejor:null;
}
const idx = ctx.rev70Indice(catalogo);
function correr(nombreLote, casos) {
  const r = {lote: nombreLote, renglones: 0, rev69: {bien: 0, mal: 0, nada: 0}, rev77: {solo: 0, soloMal: 0, elegir: 0, elegirSinCorrecto: 0, nada: 0},
    ajenos: 0, ajenosRev69Mal: 0, ajenosRev77Seguro: 0};
  for (const [texto, esperado] of casos) {
    const v = rev69(texto), n = ctx.rev70Emparejar(texto, idx);
    if (!esperado) { r.ajenos++; if (v) r.ajenosRev69Mal++; if (n.estado === 'seguro') r.ajenosRev77Seguro++; continue; }
    r.renglones++;
    if (!v) r.rev69.nada++; else if (v.nombre === esperado) r.rev69.bien++; else r.rev69.mal++;
    if (n.estado === 'seguro') n.producto.nombre === esperado ? r.rev77.solo++ : r.rev77.soloMal++;
    else if (n.estado === 'dudoso') n.candidatos.some(c => c.producto.nombre === esperado) ? r.rev77.elegir++ : r.rev77.elegirSinCorrecto++;
    else r.rev77.nada++;
  }
  return r;
}
console.log(JSON.stringify([correr('ajuste', ajuste), correr('control', control), correr('factura real (Mi Barrio)', facturaReal)], null, 1));
const fallas = revision.filter(([t, d, no]) => { const r = ctx.rev70Emparejar(t, idx, d ? {descripcion: d} : {}); return r.estado === 'seguro' && r.producto.nombre === no; });
console.log(`Contraejemplos de la revisión: ${revision.length - fallas.length} de ${revision.length} sin elección automática errónea`, fallas.length ? JSON.stringify(fallas) : '');
console.log('Nota: REV69 desempata por el orden del catálogo; con otro orden, sus aciertos por empate pueden cambiar.');
