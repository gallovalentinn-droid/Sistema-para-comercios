const {test}=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const mod=import(pathToFileURL(path.join(__dirname,'../supabase/functions/_shared/mp-core.mjs')));
const id='10000000-0000-4000-8000-000000000001';
const ctx={commerceId:id,userId:id,role:'duenio',permissions:[]};
async function fixture(rows,{losePatchResponse=false}={}){
 const m=await mod,key=crypto.getRandomValues(new Uint8Array(32)),writes=[],requests=[];
 const account={id,active:true,providerId:'77',refreshState:'idle',credentials:await m.encrypt({access_token:'synthetic',expiresAt:Date.now()+3600000},key,'account:'+id)};
 const provider=new m.Provider({},async(url,init)=>{
  requests.push({url,method:init.method||'GET',body:init.body,headers:init.headers});
  if(init.method==='PATCH') {const p=rows.find(p=>url.endsWith('/'+p.id));Object.assign(p,JSON.parse(init.body));if(losePatchResponse){losePatchResponse=false;throw Error('synthetic lost response');}return Response.json(p);}
  return Response.json({data:rows,paging:{total:rows.length,limit:30,offset:0}});
 });
 const service=new m.Service({config:{configured:true,key},provider,store:{call:async(op,args)=>{if(op==='account')return account;if(op==='position'){writes.push(args);return true;}throw Error(op);}}});
 return {service,writes,requests};
}
test('web-created POS without external ID is listed and prepared only on owner selection',async()=>{
 const f=await fixture([{id:123,name:'Caja del local',user_id:77,status:'active',external_id:null}]);
 const r=await f.service.handle(ctx,{action:'positions',accountId:id});
 assert.equal(r.positions.length,1);assert.equal(r.positions[0].name,'Caja del local');assert.equal(f.requests.some(r=>r.method==='PATCH'),false);
 await f.service.handle(ctx,{action:'set-position',accountId:id,posId:r.positions[0].id});
 assert.equal(f.writes.length,1);assert.match(f.writes[0].posId,/^[a-zA-Z0-9]{1,40}$/);
 const patch=f.requests.find(r=>r.method==='PATCH');assert.ok(patch);assert.deepEqual(JSON.parse(patch.body),{external_id:f.writes[0].posId});assert.ok(patch.headers['X-Idempotency-Key']);
 assert.match(patch.url,/\/v2\/pos\/123$/);
});
test('existing external ID is preserved and unknown or foreign or inactive POS cannot be selected',async()=>{
 const f=await fixture([{id:123,name:'Caja',user_id:77,status:'active',external_id:'OTHER001'},{id:456,user_id:88,status:'active',external_id:'FOREIGN'},{id:789,user_id:77,status:'inactive',external_id:'CLOSED'}]);
 const r=await f.service.handle(ctx,{action:'positions',accountId:id});assert.deepEqual(r.positions,[{id:'OTHER001',name:'Caja'}]);
 await f.service.handle(ctx,{action:'set-position',accountId:id,posId:'OTHER001'});assert.equal(f.writes[0].posId,'OTHER001');assert.equal(f.requests.some(r=>r.method==='PATCH'),false);
 for(const posId of ['@pos:999','FOREIGN','CLOSED'])await assert.rejects(f.service.handle(ctx,{action:'set-position',accountId:id,posId}),/CAJA_NO_DISPONIBLE/);
 assert.equal(f.writes.length,1);
});
test('current POS API reads data and paginates with supported limit',async()=>{
 const m=await mod,urls=[];const p=new m.Provider({},async url=>{urls.push(url);const offset=Number(new URL(url).searchParams.get('offset'));return Response.json({data:[{id:offset+1}],paging:{total:31,limit:30,offset}});});
 assert.deepEqual(await p.positions({access_token:'synthetic'}),[{id:1},{id:31}]);assert.equal(urls.length,2);
 for(const url of urls){assert.equal(new URL(url).pathname,'/v2/pos');assert.equal(new URL(url).searchParams.get('limit'),'30');}
});
test('retry after lost preparation response selects same provider POS without overwriting external ID',async()=>{
 const f=await fixture([{id:123,name:'Caja',user_id:77,status:'active',external_id:null}],{losePatchResponse:true});
 await assert.rejects(f.service.handle(ctx,{action:'set-position',accountId:id,posId:'@pos:123'}),/MERCADO_PAGO_NO_DISPONIBLE/);
 assert.equal(f.writes.length,0);
 await f.service.handle(ctx,{action:'set-position',accountId:id,posId:'@pos:123'});
 assert.equal(f.writes.length,1);assert.equal(f.requests.filter(r=>r.method==='PATCH').length,1);
});
