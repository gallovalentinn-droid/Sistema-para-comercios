const assert=require('node:assert/strict'),crypto=require('node:crypto');
module.exports=async({queryClient,database,c})=>{
 const commerce='00000000-0000-4000-8000-000000000001',actor='00000000-0000-4000-8000-0000000000aa';
 const reset=async limit=>{await c.query('delete from private.factura_ai_intentos_rev84;delete from public.factura_ai_uso_v4');await c.query('update public.comercio_licencias set limite_ia_mensual=$1',[limit])};
 const clients=await Promise.all([queryClient(database),queryClient(database)]);
 const reserve=cl=>cl.query('select public.f6_service_reservar_lectura_factura_rev84($1,$2,$3,2) r',[actor,commerce,crypto.randomUUID()]);
 try{
  await reset(1);let outcomes=await Promise.all(clients.map(reserve));assert.equal(outcomes.filter(x=>x.rows[0].r.ok).length,1,'one monthly slot admits one concurrent request');
  await reset(100);await c.query("insert into private.factura_ai_intentos_rev84(comercio_id,user_id,operation_id,provider,attempt) select $1,$2,gen_random_uuid(),'openai',1 from generate_series(1,3)",[commerce,actor]);
  outcomes=await Promise.all(clients.map(reserve));assert.equal(outcomes.filter(x=>x.rows[0].r.ok).length,1,'pending slots make 3 + 2 + 2 reject second');
  await reset(100);outcomes=await Promise.all(clients.map(reserve));assert.equal(outcomes.filter(x=>x.rows[0].r.ok).length,2);
  assert.equal((await reserve(c)).rows[0].r.code,'IA_LECTURAS_EN_CURSO');
  await reset(100);const request=crypto.randomUUID();const params=[actor,commerce,request];
  await c.query('select public.f6_service_reservar_lectura_factura_rev84($1,$2,$3,2)',params);
  await clients[0].query('begin');
  await clients[0].query("select public.f6_service_registrar_resultado_lectura_factura_rev84($1,$2,$3,'gpt-6-luna',$4,array['items'],1)",[...params,{inputTokens:1,outputTokens:1,thoughtTokens:0,cachedTokens:0,toolUseTokens:0,totalTokens:2}]);
  const closure=clients[1].query('select public.f6_service_finalizar_lectura_factura_rev84($1,$2,$3) r',params);
  await clients[0].query('commit');assert.equal((await closure).rows[0].r.confirmed,true,'commit before lost response is never refunded');
  const caps=(await c.query('select public.f6_service_capacidades_lector_factura_rev84($1,$2) r',[actor,commerce])).rows[0].r;assert.equal(caps.usados,1);assert.equal(caps.reservados,0);
 }finally{await Promise.all(clients.map(cl=>cl.end()))}
};
