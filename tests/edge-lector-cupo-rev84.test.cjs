const test=require('node:test'),assert=require('node:assert/strict');
const {run}=require('./edge-fixture/invoice.cjs');
const invoice={proveedor:'P',nroComprobante:'1',total:100,descuentoGlobal:0,saldoAnterior:0,pagosACuenta:0,items:[{producto:'Producto',cantidad:1,unidadesPorBulto:1,precioUnit:100,descuento:0,subtotal:100,impuestoFila:0}]};
const body={status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(invoice)}]}]};
const base=name=>name.includes('capacidades')?{data:{contract:'f6-reader-quota-rev84'}}:{data:{ok:true}};
test('REV84 detecta migración en cada invocación; solo la ausencia de su propia firma activa legacy',async()=>{
 let applied=false;const rpcImpl=name=>name.includes('capacidades')&&!applied?{error:{code:'PGRST202',message:'public.f6_service_capacidades_lector_factura_rev84 missing'}}:base(name);
 const old=await run({status:200,body,rpcImpl});assert.equal(old.status,200);assert.equal(old.data.iaQuotaMode,'legacy-rev83');assert.equal(old.rpcs.filter(n=>n.endsWith('_rev84')).length,1);
 applied=true;const modern=await run({status:200,body,rpcImpl});assert.equal(modern.status,200);assert.equal(modern.data.iaQuotaMode,'rev84');assert.ok(modern.rpcs.some(n=>n.includes('iniciar_intento')));assert.ok(modern.rpcs.some(n=>n.includes('finalizar')));
 for(const error of [{code:'PGRST202',message:'other_function missing'},{code:'42501',message:'denied'},{code:'NETWORK',message:'public.f6_service_capacidades_lector_factura_rev84'}]){const r=await run({rpcImpl:()=>({error})});assert.equal(r.calls,0);assert.equal(r.status,503);assert.equal(r.rpcs.length,1)}
 const unknown=await run({rpcImpl:()=>({data:{contract:'unknown'}})});assert.equal(unknown.calls,0);assert.equal(unknown.status,503);
});
test('REV84 duplica sin llamar: activo 202, cerrado 409 y legado 409',async()=>{
 for(const code of ['LECTURA_EN_CURSO','LECTURA_NO_RECUPERABLE']){const r=await run({rpcImpl:n=>n.includes('reservar')?{data:{ok:false,replayed:true,code,retryAfterSeconds:5}}:base(n)});assert.equal(r.status,code==='LECTURA_EN_CURSO'?202:409);assert.equal(r.calls,0);assert.equal(r.data.code,code)}
 const legacy=await run({rpcImpl:n=>n.includes('capacidades')?{error:{code:'42883',message:'function public.f6_service_capacidades_lector_factura_rev84 does not exist'}}:{data:{ok:true,replayed:true}}});assert.equal(legacy.status,409);assert.equal(legacy.calls,0);
});
test('REV84 entrega factura válida aunque fallen registro y cierre, sin devolver un commit desconocido',async()=>{
 for(const committed of [false,true]){let confirmed=false;const r=await run({status:200,body,rpcImpl:n=>{
  if(n.includes('registrar_resultado')){confirmed=committed;throw new Error('PRIVATE provider unknown commit')}
  if(n.includes('finalizar'))throw new Error('PRIVATE closure unavailable');return base(n);
 }});assert.equal(r.status,200);assert.equal(r.data.items.length,1);assert.equal(r.data.iaAccountingStatus,'pending');assert.equal(confirmed,committed);assert.equal(r.data.iaAccountingDiagnostic.stage,'telemetry');assert.doesNotMatch(JSON.stringify(r.logs),/PRIVATE|Producto|subtotal/);assert.ok(!r.rpcs.some(n=>/borrar|devolver|compensar/.test(n)))}
 const legacy=await run({status:200,body,telemetryError:true});assert.equal(legacy.status,200);assert.equal(legacy.data.iaAccountingStatus,'pending');assert.equal(legacy.data.iaQuotaMode,'legacy-rev83');
});
test('REV84 reserva dos plazas para principal/respaldo, una para HEIC o proveedor único',async()=>{
 const r=await run({openai:true,responses:[new Response('{}',{status:503}),new Response(JSON.stringify(body))],rpcImpl:base});assert.equal(r.status,200);assert.equal(r.rpcParams.find(p=>p.p_max_attempts).p_max_attempts,2);assert.equal(r.rpcs.filter(n=>n.includes('iniciar_intento')).length,2);assert.equal(r.rpcs.filter(n=>n.includes('reservar')).length,1);
 const single=await run({status:200,body,rpcImpl:base});assert.equal(single.rpcParams.find(p=>p.p_max_attempts).p_max_attempts,1);
 const hook=await run({rpcImpl:n=>n.includes('iniciar_intento')?{error:{code:'PRIVATE'}}:base(n)});assert.equal(hook.calls,0);assert.equal(hook.status,503);assert.ok(hook.rpcs.some(n=>n.includes('finalizar')));
 const empty=await run({status:200,body:{...body,steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify({...invoice,items:[]})}]}]},rpcImpl:base});assert.equal(empty.status,422);assert.ok(!empty.rpcs.some(n=>n.includes('registrar_resultado')));assert.ok(empty.rpcs.some(n=>n.includes('finalizar')));
});
