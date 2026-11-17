const {test}=require('node:test');
const assert=require('node:assert/strict');
const m=import('../supabase/functions/_shared/mp-core.mjs');
const accountId='40000000-0000-4000-8000-000000000001';
const ctx={commerceId:'10000000-0000-4000-8000-000000000001',userId:'20000000-0000-4000-8000-000000000001',role:'duenio'};
const cvu=()=>({id:'901',collector_id:77,currency_id:'ARS',status:'approved',status_detail:'accredited',operation_type:'account_fund',payment_type_id:'bank_transfer',payment_method_id:'cvu',transaction_amount:300,date_approved:'2026-11-16T21:20:00Z'});
test('CVU observado: admite solo account_fund bank_transfer cvu acreditado por el importe exacto',async()=>{
 const core=await m,p=cvu(),a={providerId:'77'};core.validatePayment(p,a,30000);
 for(const patch of [{operation_type:'regular_payment'},{payment_type_id:'credit_card'},{payment_method_id:'debin_transfer'},{collector_id:88},{status:'pending'},{status_detail:'partially_refunded'},{currency_id:'USD'},{transaction_amount:299.99},{transaction_amount_refunded:1}])assert.throws(()=>core.validatePayment({...p,...patch},a,30000));
});
test('busqueda de ingresos incluye CVU y rechaza respuestas incompletas',async()=>{
 const {Provider}=await m,urls=[];const provider=new Provider({},async url=>{urls.push(new URL(url));return Response.json({results:[cvu()],paging:{total:1}});});
 const result=await provider.searchTransfers({access_token:'synthetic'});assert.equal(result.rows.length,1);assert.equal(result.available,1);assert.equal(urls[0].searchParams.has('operation_type'),false);assert.equal(urls[0].searchParams.get('status'),'approved');
 for(const body of [{},{results:[]},{results:[],paging:{total:'0'}}])await assert.rejects(new Provider({},async()=>Response.json(body)).searchTransfers({}),/MERCADO_PAGO_NO_DISPONIBLE/);
});
async function fixture({usedError=false,transferVerification=false}={}){
 const core=await m,key=crypto.getRandomValues(new Uint8Array(32)),ops=[];
 const account={id:accountId,providerId:'77',active:true,refreshState:'idle',credentials:await core.encrypt({access_token:'synthetic',expiresAt:Date.now()+3600000},key,'account:'+accountId)};
 const store={call:async(op,args)=>{ops.push(op);if(op==='account')return account;if(op==='used'){if(usedError)throw Error('CONEXION_NO_DISPONIBLE');return args.paymentId==='902'?{saleId:'previous'}:null;}if(op==='attempt')return null;if(op==='sale-begin')return {...args,status:'prepared'};if(op==='receipts')return [];if(op==='claim')return {saleId:args.saleId,paymentId:args.paymentId,kind:'transfer',amountCents:30000};return true;}};
 const provider={search:async()=>[{...cvu(),operation_type:'money_transfer'}],searchTransfers:async()=>({rows:[cvu(),{...cvu(),id:'902',transaction_amount:1200}],available:501}),payment:async()=>cvu()};
 return {ops,service:new core.Service({config:{configured:true,key,transferVerification},store,provider})};
}
test('historial muestra ingresos acreditados y uso sin habilitar reclamos ni escribir negocio',async()=>{
 const {service,ops}=await fixture();const r=await service.handle(ctx,{action:'income-history',accountId});assert.equal(r.receipts.length,2);assert.equal(r.receipts[1].used,true);assert.equal(r.truncated,true);assert.deepEqual(ops,['account','used','used']);
 await assert.rejects(service.handle({...ctx,role:'empleado',permissions:[]},{action:'income-history',accountId}),/PERMISO_VENDER/);
 await assert.rejects(service.handle(ctx,{action:'claim',accountId,saleId:'sale',fingerprint:'x',amount:'300',paymentId:'901'}),/TRANSFERENCIAS_NO_HABILITADAS/);
});
test('fallo al comprobar uso se propaga, nunca presenta como disponible',async()=>{
 const {service}=await fixture({usedError:true,transferVerification:true});await assert.rejects(service.handle(ctx,{action:'receipts',accountId,amount:'300'}),/CONEXION_NO_DISPONIBLE/);
});
test('claim vuelve a leer CVU individual antes de asociarlo a una venta',async()=>{
 const {service,ops}=await fixture({transferVerification:true});const r=await service.handle(ctx,{action:'claim',accountId,saleId:'sale',fingerprint:'x',amount:'300',paymentId:'901'});assert.equal(r.receipt.paymentId,'901');assert.ok(ops.includes('claim'));
});
test('historial limita filas y consulta uso en lotes sin serializar cien solicitudes',async()=>{
 const core=await m,key=crypto.getRandomValues(new Uint8Array(32));let inflight=0,max=0,usedCalls=0;
 const account={id:accountId,providerId:'77',active:true,refreshState:'idle',credentials:await core.encrypt({access_token:'synthetic',expiresAt:Date.now()+3600000},key,'account:'+accountId)};
 const service=new core.Service({config:{configured:true,key},provider:{searchTransfers:async()=>({rows:Array.from({length:150},(_,i)=>({...cvu(),id:String(1000+i)})),available:150})},store:{call:async(op)=>{if(op==='account')return account;if(op==='used'){usedCalls++;inflight++;max=Math.max(max,inflight);await new Promise(r=>setTimeout(r,2));inflight--;return null;}throw Error('unexpected write');}}});
 const r=await service.handle(ctx,{action:'income-history',accountId});assert.equal(r.receipts.length,100);assert.equal(usedCalls,100);assert.equal(r.truncated,true);assert.ok(max>1&&max<=10);
});
