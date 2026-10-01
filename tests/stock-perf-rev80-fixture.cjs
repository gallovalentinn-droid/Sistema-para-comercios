const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const candidatePath = path.resolve(__dirname, '../beta/index.html');
const patchPath = path.resolve(__dirname, '../entregables/respuesta-revision-REV79/stock-patch.json');
function baselineHtml(html, {includeUI = false} = {}) {
  const patches = JSON.parse(fs.readFileSync(patchPath, 'utf8'));
  const chosen = includeUI ? patches : patches.filter(p => p.old.startsWith('function f79CompararStockTurnos('));
  if (!includeUI && chosen.length !== 1) throw new Error('Expected one bundled comparator baseline');
  for (const {old, new: replacement} of [...chosen].reverse()) {
    if (html.split(replacement).length !== 2) throw new Error('Bundled REV80 fragment must appear exactly once');
    html = html.replace(replacement, old);
  }
  return html;
}
function load(html) {
  const ctx = vm.createContext({});
  for (const name of ['UX_BUSQUEDAS_PAGOS_HELPERS', 'F5_SESSION_CORE', 'F6_TURNOS_CORE', 'REV79_MOVIMIENTOS']) {
    const start = html.indexOf(`/* ${name}_START */`), end = html.indexOf(`/* ${name}_END */`);
    if (start < 0 || end <= start) throw new Error(`Missing block ${name}`);
    vm.runInContext(html.slice(start, end), ctx);
  }
  return ctx;
}
function fixture({products = 850, shifts = 120, movements = 100000} = {}) {
  const base = Date.parse('2026-01-01T08:00:00Z');
  const iso = n => new Date(n).toISOString();
  const productos = Array.from({length: products}, (_, i) => ({id: `p${i}`, nombre: `Producto ${String(i).padStart(4, '0')}`, stockBase: 1000, rubro: 'Almacén'}));
  const turnos = Array.from({length: shifts}, (_, i) => ({id: `s${i}`, desde: iso(base + i * 8 * 3600000), hasta: iso(base + (i + 1) * 8 * 3600000 - 1), responsable: `Responsable ${i}`, estado: 'Cerrado'}));
  const movs = Array.from({length: movements}, (_, i) => {
    const shift = i % shifts, tipo = i % 13 === 0 ? 'ingreso' : i % 17 === 0 ? 'ajuste' : 'venta';
    return {prodId: `p${i % products}`, tipo, cant: tipo === 'venta' ? -0.125 : 2, fecha: iso(base + shift * 8 * 3600000 + (i % 7200) * 1000), _v4sessionSegmentId: `s${shift}`};
  });
  return {productos, movimientos: movs, turnos: [turnos[0], turnos[shifts - 1]], ventas: [], allTurnos: turnos};
}
const plain = value => JSON.parse(JSON.stringify(value));
module.exports = {fs, path, vm, load, fixture, plain, baselineHtml, candidatePath};
