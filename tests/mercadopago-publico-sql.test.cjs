const {test}=require('node:test');
const assert=require('node:assert/strict');
const {execFile}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const enabled=process.env.MP_SQL_TEST==='true';
const database='mp_publico_test_20261115';
function sql(query){return new Promise((resolve,reject)=>{const child=execFile('docker',['exec','-i','supabase_db_micomercio-prueba-local','psql','-X','-q','-tA','-v','ON_ERROR_STOP=1','-U','postgres','-d',database],{maxBuffer:2*1024*1024},(e,out,err)=>e?reject(new Error(err)):resolve(out.trim()));child.stdin.end(query);});}
const literal=s=>"'"+String(s).replaceAll("'","''")+"'";
const commerceId='10000000-0000-4000-8000-000000000001',otherCommerce='10000000-0000-4000-8000-000000000002',userId='20000000-0000-4000-8000-000000000001',deviceId='30000000-0000-4000-8000-000000000001';
const ctx={commerceId,userId,deviceId,role:'duenio',permissions:[]};
const call=async(op,args={})=>{const value=await sql('SET ROLE service_role; SELECT public.mp_publico_store('+literal(op)+','+literal(JSON.stringify({commerceId,actor:userId,...args}))+'::jsonb);');return value?JSON.parse(value):null;};
const accountId='40000000-0000-4000-8000-000000000001';
const sale=(id,owner=crypto.randomUUID())=>({saleId:id,accountId,amountCents:1950,fingerprint:'frozen',owner,posId:'Caja1'});
const reset=()=>sql('TRUNCATE mp_private.accounts,mp_private.attempts,mp_private.receipts,mp_private.oauth,mp_private.audit;');
test('PostgreSQL enforces private MP persistence and cross-worker payment invariants',{skip:!enabled},async t=>{
  assert.equal(await sql("SELECT to_regprocedure('public.mp_publico_store(text,jsonb)') IS NOT NULL"),'t','Missing MP migration');
  const m=await import(pathToFileURL(path.join(__dirname,'../supabase/functions/_shared/mp-core.mjs')));
  await t.test('anon and authenticated cannot read tables or execute privileged RPC',async()=>{
    for(const role of ['anon','authenticated']){
      await assert.rejects(sql('SET ROLE '+role+'; SELECT * FROM mp_private.accounts;'),/permission denied/);
      await assert.rejects(sql('SET ROLE '+role+"; SELECT public.mp_publico_store('accounts','{}');"),/permission denied/);
    }
    assert.equal(await sql("SELECT bool_and(relrowsecurity) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='mp_private' AND relkind='r'"),'t');
  });
  await reset();
  await t.test('OAuth state consumed exactly once by concurrent workers and expires',async()=>{
    await call('state-save',{stateHash:'a'.repeat(64),encrypted:'synthetic'});
    const responses=await Promise.all([call('state-consume',{stateHash:'a'.repeat(64)}),call('state-consume',{stateHash:'a'.repeat(64)})]);assert.equal(responses.filter(Boolean).length,1);
    await call('state-save',{stateHash:'b'.repeat(64),encrypted:'synthetic'});await sql("UPDATE mp_private.oauth SET expires_at=now()-interval '1 second'");assert.equal(await call('state-consume',{stateHash:'b'.repeat(64)}),null);
  });
  const key=crypto.getRandomValues(new Uint8Array(32));
  const config={configured:true,key,clientId:'123',clientSecret:'synthetic',redirectUri:'https://fixture/callback',transferVerification:true};
  const encrypted=await m.encrypt({access_token:'synthetic',refresh_token:'synthetic',user_id:'77',expiresAt:Date.now()+3600000},key,'account:'+accountId);
  async function account(id=accountId,providerId='77'){return call('account-save',{id,providerId,alias:'Synthetic account',credentials:id===accountId?encrypted:await m.encrypt({access_token:'synthetic',refresh_token:'synthetic',user_id:providerId,expiresAt:Date.now()+3600000},key,'account:'+id)});}
  await account();
  await t.test('provider account cannot cross commerces; concurrent primary leaves exactly one',async()=>{
    await assert.rejects(call('account-save',{commerceId:otherCommerce,id:crypto.randomUUID(),providerId:'77',alias:'Foreign',credentials:'synthetic'}),/CUENTA_OTRO_COMERCIO/);
    const second=await account('40000000-0000-4000-8000-000000000002','88');
    await Promise.all([call('primary',{accountId}),call('primary',{accountId:second.id})]);
    const accounts=await call('accounts');assert.equal(accounts.filter(a=>a.primary&&a.active).length,1);
  });
  await t.test('sale lease excludes other workers and prevents stale CAS after reclaim',async()=>{
    const first=sale('lease');assert.ok(await call('sale-begin',first));assert.equal(await call('sale-begin',{...first,owner:crypto.randomUUID()}),null);
    await sql("UPDATE mp_private.attempts SET lease_until=now()-interval '1 second' WHERE sale='lease'");const next=crypto.randomUUID();assert.ok(await call('sale-begin',{...first,owner:next}));
    await assert.rejects(call('sale-update',{saleId:'lease',owner:first.owner,patch:{status:'manual'}}),/COBRO_OCUPADO/);
    await call('sale-release',{saleId:'lease',owner:next});
  });
  await t.test('sale snapshot freezes account amount and fingerprint',async()=>{
    const first=sale('snapshot');await call('sale-begin',first);await call('sale-release',{saleId:first.saleId,owner:first.owner});
    for(const patch of [{amountCents:1951},{fingerprint:'changed'},{accountId:'40000000-0000-4000-8000-000000000002'}])await assert.rejects(call('sale-begin',{...first,...patch,owner:crypto.randomUUID()}),/TICKET_CAMBIO/);
  });
  await t.test('same payment cannot claim two sales and same sale cannot claim two payments',async()=>{
    const a=sale('claimA'),b=sale('claimB');await Promise.all([call('sale-begin',a),call('sale-begin',b)]);
    const claims=await Promise.allSettled([call('claim',{saleId:a.saleId,owner:a.owner,paymentId:'12',kind:'transfer'}),call('claim',{saleId:b.saleId,owner:b.owner,paymentId:'12',kind:'transfer'})]);assert.equal(claims.filter(x=>x.status==='fulfilled').length,1);assert.match(claims.find(x=>x.status==='rejected').reason.message,/TRANSFERENCIA_UTILIZADA/);
    const winner=claims[0].status==='fulfilled'?a:b;await assert.rejects(call('claim',{saleId:winner.saleId,owner:winner.owner,paymentId:'13',kind:'transfer'}),/VENTA_YA_VERIFICADA/);
    assert.equal((await call('receipts',{saleIds:[a.saleId,b.saleId]})).length,1);
  });
  await t.test('disconnect blocked while pending and account position freezes in attempt',async()=>{
    await assert.rejects(call('disconnect',{accountId}),/COBRO_PENDIENTE/);
    const a=sale('posFreeze');await call('sale-begin',a);await call('sale-release',{saleId:a.saleId,owner:a.owner});await call('position',{accountId,posId:'Caja2'});const retry=await call('sale-begin',{...a,posId:'Caja2',owner:crypto.randomUUID()});assert.equal(retry.posId,'Caja1');
  });
  const store={call};
  // https://www.mercadopago.com.ar/developers/es/docs/qr-code/resources/status-order-transaction (2026-11-15)
  const order=(a,status='created')=>({id:'ORD01K371WBFDS4MD9JG0K8ZMECBE',type:'qr',user_id:'77',currency:'ARS',external_reference:a.reference,total_amount:'19.50',status,status_detail:status,type_response:{qr_data:'synthetic QR'},transactions:{payments:[{id:'44',amount:'19.50',status:'processed',status_detail:'accredited'}]}});
  await t.test('QR timeout retries identical idempotency and manual remains blocked until provider cancellation',async()=>{
    let attempt,firstKey,firstBody,creates=0,canceled=false;
    const provider={create:async(c,body,key)=>{creates++;if(!attempt)attempt=await call('attempt',{saleId:'qrTimeout'});if(creates===1){firstKey=key;firstBody=body;throw Error('timeout');}assert.equal(key,firstKey);assert.deepEqual(body,firstBody);return order(attempt);},order:async()=>order(attempt,canceled?'canceled':'created'),cancel:async()=>{canceled=true;}};
    const service=new m.Service({store,provider,config}),input={action:'qr-create',accountId,saleId:'qrTimeout',amount:'19.50',fingerprint:'frozen'};
    await assert.rejects(service.handle(ctx,input));assert.equal((await call('attempt',{saleId:input.saleId})).status,'creating');
    await assert.rejects(service.handle(ctx,{...input,action:'manual'}),/QR_PENDIENTE/);
    assert.equal((await service.handle(ctx,input)).attempt.orderId,'ORD01K371WBFDS4MD9JG0K8ZMECBE');
    await assert.rejects(service.handle(ctx,{...input,action:'manual'}),/QR_PENDIENTE/);
    assert.equal((await service.handle(ctx,{...input,action:'qr-cancel'})).attempt.status,'canceled');
    assert.equal((await service.handle(ctx,{...input,action:'manual'})).ok,true);
  });
  await t.test('simultaneous QR calls across service instances produce one creation',async()=>{
    let release,startedResolve;const started=new Promise(r=>startedResolve=r),wait=new Promise(r=>release=r);let count=0;
    const provider={create:async()=>{count++;startedResolve();await wait;return order(await call('attempt',{saleId:'workers'}));}};
    const a=new m.Service({store,provider,config}),b=new m.Service({store,provider,config}),input={action:'qr-create',accountId,saleId:'workers',amount:'19.50',fingerprint:'frozen'};
    const first=a.handle(ctx,input);await started;await assert.rejects(b.handle(ctx,input),/COBRO_OCUPADO/);release();await first;assert.equal(count,1);
  });
  await t.test('missing POS does not freeze a new sale and old untouched prepared rows can acquire POS',async()=>{
    await call('position',{accountId,posId:'Missing'});await sql("UPDATE mp_private.accounts SET data=data||'{\"posId\":\"\"}'::jsonb WHERE id='"+accountId+"'");
    const service=new m.Service({store,config,provider:{create:async(c,body)=>{assert.equal(body.config.qr.external_pos_id,'Caja3');return order(await call('attempt',{saleId:'oldEmptyPos'}));}}});const input={action:'qr-create',accountId,saleId:'noPos',amount:'19.50',fingerprint:'frozen'};
    await assert.rejects(service.handle(ctx,input),/CONFIGURAR_CAJA_QR/);assert.equal(await call('attempt',{saleId:'noPos'}),null);
    const old=sale('oldEmptyPos');await call('sale-begin',{...old,posId:''});await call('sale-release',{saleId:old.saleId,owner:old.owner});await call('position',{accountId,posId:'Caja3'});assert.equal((await service.handle(ctx,{...input,saleId:'oldEmptyPos'})).attempt.posId,'Caja3');
  });
  await t.test('definitive first creation rejection permits cancellation/manual but does not clear earlier ambiguity',async()=>{
    let count=0;const rejected=()=>Object.assign(Error('MERCADO_PAGO_NO_DISPONIBLE'),{definitiveNoOrder:true});const provider={create:async()=>{count++;throw rejected();}};
    const service=new m.Service({store,config,provider}),input={action:'qr-create',accountId,saleId:'posRejected',amount:'19.50',fingerprint:'frozen'};
    await assert.rejects(service.handle(ctx,input));assert.equal((await call('attempt',{saleId:input.saleId})).status,'rejected');assert.equal((await service.handle(ctx,{...input,action:'qr-cancel'})).attempt.status,'canceled');assert.equal((await service.handle(ctx,{...input,action:'manual'})).ok,true);assert.equal(count,1);
    let ambiguousCount=0;const ambiguous=new m.Service({store,config,provider:{create:async()=>{ambiguousCount++;if(ambiguousCount===1)throw Error('timeout');throw rejected();}}}),input2={...input,saleId:'ambiguousThenRejected'};
    await assert.rejects(ambiguous.handle(ctx,input2));await assert.rejects(ambiguous.handle(ctx,{...input2,action:'qr-cancel'}));assert.equal((await call('attempt',{saleId:input2.saleId})).status,'creating');await assert.rejects(ambiguous.handle(ctx,{...input2,action:'manual'}),/QR_PENDIENTE/);
  });
  await t.test('QR accreditation persists receipt and recovery works after transfer gate closes',async()=>{
    let a;const provider={create:async()=>{a=await call('attempt',{saleId:'paid'});return order(a);},order:async()=>order(a,'processed')};
    const service=new m.Service({store,provider,config}),input={action:'qr-create',accountId,saleId:'paid',amount:'19.50',fingerprint:'frozen'};
    await service.handle(ctx,input);const paid=await service.handle(ctx,{...input,action:'qr-status'});assert.equal(paid.receipt.kind,'qr');assert.equal(paid.receipt.amountCents,1950);
    const off=new m.Service({store,provider,config:{...config,transferVerification:false}});assert.equal((await off.handle(ctx,{action:'sale-receipts',saleIds:['paid']})).receipts.length,1);assert.equal((await off.handle(ctx,{...input,action:'qr-status'})).receipt.paymentId,'44');await assert.rejects(off.handle(ctx,{...input,action:'receipts'}),/TRANSFERENCIAS_NO_HABILITADAS/);
  });
  await t.test('kill switch preserves existing receipt recovery and status cannot start an unknown charge',async()=>{
    let providerCalls=0;const provider={create:async()=>{providerCalls++;throw Error('must not create');}},off=new m.Service({store,provider,config:{...config,newPayments:false,transferVerification:false}});
    const input={action:'qr-create',accountId,saleId:'blockedNew',amount:'19.50',fingerprint:'frozen'};
    await assert.rejects(off.handle(ctx,input),/COBROS_NO_HABILITADOS/);assert.equal(await call('attempt',{saleId:input.saleId}),null);
    await assert.rejects(off.handle(ctx,{...input,action:'qr-status'}),/COBRO_NO_EXISTE/);
    const tombstone=await off.handle(ctx,{...input,action:'qr-cancel'});assert.equal(tombstone.attempt.status,'canceled');
    assert.equal((await off.handle(ctx,input)).attempt.status,'canceled');
    const prepared=sale('onlyPrepared');await call('sale-begin',prepared);await call('sale-release',{saleId:prepared.saleId,owner:prepared.owner});assert.equal((await off.handle(ctx,{...input,saleId:'onlyPrepared',action:'qr-status'})).attempt.status,'prepared');
    assert.equal((await off.handle(ctx,{...input,saleId:'paid',action:'claim',paymentId:'44'})).receipt.paymentId,'44');assert.equal(providerCalls,0);
    const capability=await off.handle(ctx,{action:'accounts'});assert.equal(capability.capabilities.newPayments,false);
  });
  await t.test('cancel discovers official paid order and persists one receipt across retries',async()=>{
    let a,cancels=0;const provider={create:async()=>{a=await call('attempt',{saleId:'cancelPaid'});return order(a);},order:async()=>({...order(a,'processed'),transactions:{payments:[{id:'45',amount:'19.50',status:'processed',status_detail:'accredited'}]}}),cancel:async()=>{cancels++;}};
    const service=new m.Service({store,provider,config}),input={action:'qr-create',accountId,saleId:'cancelPaid',amount:'19.50',fingerprint:'frozen'};
    await service.handle(ctx,input);const paid=await service.handle(ctx,{...input,action:'qr-cancel'});assert.equal(paid.receipt.paymentId,'45');assert.equal((await service.handle(ctx,{...input,action:'qr-status'})).receipt.paymentId,'45');assert.equal((await call('receipts',{saleIds:[input.saleId]})).length,1);assert.equal(cancels,0);
  });
  await t.test('disconnected terminal QR recovers exact snapshot and manual completes once without provider credentials',async()=>{
    const recoveryId='40000000-0000-4000-8000-000000000003';await account(recoveryId,'177');let providerCalls=0;
    const service=new m.Service({store,config:{...config,newPayments:false},provider:new Proxy({},{get(){return async()=>{providerCalls++;throw Error('revoked credentials must not be used');};}})});
    for(const status of ['canceled','expired']){const a={...sale('recover_'+status),accountId:recoveryId};await call('sale-begin',a);await call('sale-update',{saleId:a.saleId,owner:a.owner,patch:{status,orderId:'ORD01K371WBFDS4MD9JG0K8ZMECBE'}});await call('sale-release',{saleId:a.saleId,owner:a.owner});}
    const verified={...sale('recover_verified'),accountId:recoveryId};await call('sale-begin',verified);await call('claim',{saleId:verified.saleId,owner:verified.owner,paymentId:'901',kind:'qr'});await call('sale-release',{saleId:verified.saleId,owner:verified.owner});
    await call('disconnect',{accountId:recoveryId});assert.equal(await sql("SELECT data->>'credentials' FROM mp_private.accounts WHERE id='"+recoveryId+"'"),'');
    const input={accountId:recoveryId,amount:'19.50',fingerprint:'frozen'};
    for(const status of ['canceled','expired']){const saleId='recover_'+status;
      // The earlier terminal response was lost: local stage is still QR after reload.
      assert.equal((await service.handle(ctx,{...input,saleId,action:'qr-cancel'})).attempt.status,status);
      assert.equal((await service.handle(ctx,{...input,saleId,action:'qr-status'})).attempt.status,status);
      for(const patch of [{amount:'19.51'},{fingerprint:'changed'},{accountId}])await assert.rejects(service.handle(ctx,{...input,saleId,action:'manual',...patch}),/TICKET_CAMBIO/);
      await assert.rejects(service.handle({...ctx,commerceId:otherCommerce},{...input,saleId,action:'manual'}),/CUENTA_NO_DISPONIBLE/);
      await assert.rejects(service.handle({...ctx,role:'empleado',permissions:[]},{...input,saleId,action:'manual'}),/PERMISO_VENDER/);
      const results=await Promise.all([service.handle(ctx,{...input,saleId,action:'manual'}),service.handle(ctx,{...input,saleId,action:'manual'})]);assert.ok(results.every(r=>r.ok));
      assert.equal((await service.handle(ctx,{...input,saleId,action:'qr-status'})).attempt.status,'manual');assert.equal(await sql("SELECT count(*) FROM mp_private.audit WHERE action='manual' AND reference="+literal(saleId)),'1');
    }
    for(const action of ['manual','qr-status','qr-cancel'])assert.equal((await service.handle(ctx,{...input,saleId:verified.saleId,action})).receipt.paymentId,'901');
    for(const action of ['qr-create','claim','receipts','positions'])await assert.rejects(service.handle(ctx,{...input,saleId:'recover_canceled',action,paymentId:'902'}),/CUENTA_NO_DISPONIBLE/);
    for(const action of ['manual','qr-status','qr-cancel'])await assert.rejects(service.handle(ctx,{...input,saleId:'neverExisted',action}),/CUENTA_NO_DISPONIBLE/);
    assert.equal(await call('attempt',{saleId:'neverExisted'}),null);assert.equal(providerCalls,0);
  });
  await t.test('active or creating QR cannot disconnect or enter terminal recovery, and leased terminal remains excluded',async()=>{
    for(const status of ['creating','created']){const id=crypto.randomUUID();await account(id,String(status==='creating'?277:377));const a={...sale('unsafe_'+status),accountId:id};await call('sale-begin',a);await call('sale-update',{saleId:a.saleId,owner:a.owner,patch:{status}});await call('sale-release',{saleId:a.saleId,owner:a.owner});await assert.rejects(call('disconnect',{accountId:id}),/COBRO_PENDIENTE/);assert.equal(await call('sale-recover',{...a,action:'manual'}),null);}
    const a=sale('leasedTerminal');await call('sale-begin',a);await call('sale-update',{saleId:a.saleId,owner:a.owner,patch:{status:'expired'}});await assert.rejects(call('sale-recover',{...a,action:'manual'}),/COBRO_OCUPADO/);await call('sale-release',{saleId:a.saleId,owner:a.owner});
  });
  await t.test('refresh serialized across workers; ambiguous provider failure forces reconnection forever',async()=>{
    const c=await call('account',{accountId});const expired=await m.encrypt({access_token:'synthetic',refresh_token:'synthetic',user_id:'77',expiresAt:0},key,'account:'+accountId);
    await call('account-save',{id:accountId,providerId:'77',alias:'Expired',credentials:expired});const saved=await call('account',{accountId});let count=0,release,startedResolve;const started=new Promise(r=>startedResolve=r),wait=new Promise(r=>release=r);
    const provider={refresh:async()=>{count++;startedResolve();await wait;throw Error('ambiguous');}};
    const service=new m.Service({store,provider,config}),first=service.credentials(ctx,saved);await started;await assert.rejects(service.credentials(ctx,saved),/CUENTA_OCUPADA/);release();await assert.rejects(first,/RECONECTAR_CUENTA/);await assert.rejects(service.credentials(ctx,await call('account',{accountId})),/RECONECTAR_CUENTA/);assert.equal(count,1);
  });
  await t.test('successful refresh writes rotated credentials once and fences stale finish',async()=>{
    await account();const c=await call('account',{accountId});const owner=crypto.randomUUID();assert.equal(await call('refresh-begin',{accountId,owner,version:c.version}),true);assert.equal(await call('refresh-begin',{accountId,owner:crypto.randomUUID(),version:c.version}),false);
    await account();assert.equal(await call('refresh-finish',{accountId,owner,credentials:'stale'}),false);assert.equal((await call('account',{accountId})).refreshState,'idle');
    const expired=await m.encrypt({access_token:'synthetic',refresh_token:'synthetic',user_id:'77',expiresAt:0},key,'account:'+accountId);await call('account-save',{id:accountId,providerId:'77',alias:'Expired',credentials:expired});
    const service=new m.Service({store,config,provider:{refresh:async()=>({access_token:'rotated synthetic',refresh_token:'rotated synthetic',user_id:'77',expires_in:3600})}});const result=await service.credentials(ctx,await call('account',{accountId}));assert.equal(result.access_token,'rotated synthetic');const next=await call('account',{accountId});assert.equal((await m.decrypt(next.credentials,key,'account:'+accountId)).refresh_token,'rotated synthetic');
  });
  await t.test('transfer window starts durably once, rejects old or QR-linked income, and SQL prevents reuse',async()=>{
    await account();let payment={id:'9876541',collector_id:77,currency_id:'ARS',operation_type:'account_fund',payment_type_id:'bank_transfer',payment_method_id:'cvu',transaction_amount:300,status:'approved',status_detail:'accredited',date_approved:new Date().toISOString()};
    const service=new m.Service({store,config,provider:{payment:async()=>payment,searchTransfers:async()=>({rows:[payment,{...payment,id:'9876542'}],available:2})}}),input={accountId,saleId:'anchoredTransfer',amount:'300',fingerprint:'frozen'};
    await assert.rejects(service.handle(ctx,{...input,action:'claim',paymentId:payment.id}),/COBRO_NO_INICIADO/);assert.equal(await call('attempt',{saleId:input.saleId}),null);
    const first=await service.handle(ctx,{...input,action:'transfer-start',createdAt:'1999-01-01'}),retry=await service.handle(ctx,{...input,action:'transfer-start'});assert.equal(first.attempt.createdAt,retry.attempt.createdAt);assert.ok(Date.parse(first.attempt.createdAt)>Date.now()-60000);
    const r=await service.handle(ctx,{...input,action:'receipts'});assert.equal(r.ambiguous,true);assert.ok(r.receipts.every(x=>x.eligible));payment={...payment,date_approved:new Date(Date.parse(first.attempt.createdAt)-120001).toISOString()};await assert.rejects(service.handle(ctx,{...input,action:'claim',paymentId:payment.id}),/INGRESO_FUERA_DE_VENTANA/);assert.equal((await call('receipts',{saleIds:[input.saleId]})).length,0);
    payment={...payment,date_approved:first.attempt.createdAt,order:{id:'ORDfixture'}};await assert.rejects(service.handle(ctx,{...input,action:'claim',paymentId:payment.id}),/INGRESO_VINCULADO_ORDEN/);delete payment.order;await service.handle(ctx,{...input,action:'claim',paymentId:payment.id});assert.equal((await call('receipts',{saleIds:[input.saleId]})).length,1);
    await service.handle(ctx,{...input,saleId:'anotherTransferSale',action:'transfer-start'});await assert.rejects(service.handle(ctx,{...input,saleId:'anotherTransferSale',action:'claim',paymentId:payment.id}),/TRANSFERENCIA_UTILIZADA/);
  });
  await t.test('cancelar transferencia cierra el intento y rechaza claims posteriores sin recibo',async()=>{
    await account();let providerCalls=0;const service=new m.Service({store,config,provider:{payment:async()=>{providerCalls++;throw Error('No debe consultar pago');}}}),input={accountId,saleId:'canceledTransfer',amount:'300',fingerprint:'frozen'};
    await service.handle(ctx,{...input,action:'transfer-start'});const canceled=await service.handle(ctx,{...input,action:'qr-cancel'});assert.equal(canceled.attempt.status,'canceled');for(const action of ['transfer-start','receipts','claim'])await assert.rejects(service.handle(ctx,{...input,action,paymentId:'901'}),/COBRO_CANCELADO/);assert.equal((await call('receipts',{saleIds:[input.saleId]})).length,0);assert.equal(providerCalls,0);
  });
  await t.test('OAuth callback rechecks original authority and never leaks state code credentials',async()=>{
    const configCb={...config,url:'https://fixture.supabase.co',anonKey:'synthetic'},authFetch=async url=>url.endsWith('/auth/v1/user')?Response.json({id:userId}):url.includes('comercio_miembros')?Response.json([{comercio_id:commerceId,user_id:userId,activo:true,rol:'duenio'}]):Response.json({writable:true,membership:{rol:'duenio',permisos_efectivos:[]}});
    const provider={exchange:async()=>({access_token:'synthetic',refresh_token:'synthetic',user_id:'99',expires_in:3600}),identity:async()=>({id:'99'})};
    const service=new m.Service({store,provider,config:configCb}),start=await service.handle(ctx,{action:'oauth-start',alias:'OAuth fixture'},'synthetic');const url=new URL(start.url);assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('redirect_uri'),config.redirectUri);const state=url.searchParams.get('state');
    const callback=m.createCallbackHandler({config:configCb,store,provider,fetcher:authFetch}),r=await callback(new Request('https://fixture/callback?state='+state+'&code=synthetic'));
    assert.equal(r.headers.get('location'),'https://micomercio.ar/beta/?mercadopago=conectado');assert.equal((await callback(new Request('https://fixture/callback?state='+state+'&code=synthetic'))).headers.get('location'),'https://micomercio.ar/beta/?mercadopago=error');
    const start2=await service.handle(ctx,{action:'oauth-start',alias:'Revoked fixture'},'synthetic');const revoked=m.createCallbackHandler({config:configCb,store,provider,fetcher:async()=>Response.json({},{status:401})});const r2=await revoked(new Request('https://fixture/callback?state='+new URL(start2.url).searchParams.get('state')+'&code=synthetic'));assert.equal(r2.headers.get('location'),'https://micomercio.ar/beta/?mercadopago=error');assert.equal((await call('accounts')).filter(a=>a.providerId==='99').length,1);
    const start3=await service.handle(ctx,{action:'oauth-start',alias:'Canceled fixture'},'synthetic'),state3=new URL(start3.url).searchParams.get('state');assert.equal((await callback(new Request('https://fixture/callback?state='+state3+'&error=access_denied'))).headers.get('location'),'https://micomercio.ar/beta/?mercadopago=error');assert.equal(await call('state-consume',{stateHash:await m.hash(state3)}),null);
    let isRevoked=false;const revokedDuringProvider=m.createCallbackHandler({config:configCb,store,fetcher:url=>isRevoked?Response.json({},{status:401}):authFetch(url),provider:{...provider,identity:async()=>{isRevoked=true;return {id:'199'};},exchange:async()=>({access_token:'synthetic',refresh_token:'synthetic',user_id:'199',expires_in:3600})}});const start4=await service.handle(ctx,{action:'oauth-start',alias:'Revoked midflight'},'synthetic');assert.equal((await revokedDuringProvider(new Request('https://fixture/callback?state='+new URL(start4.url).searchParams.get('state')+'&code=synthetic'))).headers.get('location'),'https://micomercio.ar/beta/?mercadopago=error');assert.equal(await call('provider-account',{providerId:'199'}),null);
  });
});
