const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
// El registro del resultado rechaza modelos fuera de su lista: el modelo de respaldo y la migración deben coincidir.
test('REV95 la migración habilita el modelo de respaldo que usa la función y conserva los anteriores',async()=>{
  const {F6_INVOICE_MODEL}=await import('../supabase/functions/_shared/f6-invoice-reader.mjs');
  const {F6_OPENAI_INVOICE_MODEL}=await import('../supabase/functions/_shared/f6-openai-invoice-reader.mjs');
  const sql=fs.readFileSync(path.join(__dirname,'../REV95-LECTOR-RESPALDO.sql'),'utf8');
  const nueva=sql.match(/v_new constant text := \$\$p_model not in \(([^)]*)\)\$\$/)?.[1].split(',').map(x=>x.replace(/'/g,''));
  assert.ok(nueva,'la migración declara la lista nueva');
  assert.equal(F6_INVOICE_MODEL,'gemini-3.5-flash-lite');
  for(const modelo of [F6_INVOICE_MODEL,F6_OPENAI_INVOICE_MODEL,'gemini-3.8-flash'])assert.ok(nueva.includes(modelo),modelo);
  const instalada=fs.readFileSync(path.join(__dirname,'../REV83-LECTOR-DOBLE.sql'),'utf8').match(/v_new constant text := (\$\$.*\$\$);/)[1];
  assert.ok(sql.includes(`v_old constant text := ${instalada};`),'parte de la lista que dejó REV83');
});
