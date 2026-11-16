'use strict';
process.env.PW||='C:/Users/valen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
process.env.CHROME||='C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=require('node:assert/strict');const {openShadow}=require('./browser-fixture/shadow.cjs');
async function main(){
 const width=Number(process.env.WIDTH)||1366,h=await openShadow({width,height:900}),p=h.page,accountId='40000000-0000-4000-8000-000000000001',calls=[];
 await p.route(/\/(?:api|functions\/v1)\/mercadopago(?:\?.*)?$/,async route=>{
  const b=route.request().postDataJSON();calls.push(b.action);
  if(b.action==='accounts')return route.fulfill({json:{configured:true,accounts:[{id:accountId,primary:true}]}});
  assert.equal(b.action,'transfer-coverage');assert.equal(b.accountId,accountId);assert.equal(b.minutes,10);
  return route.fulfill({json:{coverage:{minutes:10,total:1,truncated:false,groups:[{operation:'money_transfer',accepted:true,count:1}],otherGroups:0}}});
 });
 try{
  assert.equal(await p.evaluate(()=>typeof window.mpRequest),'function');
  await p.evaluate(()=>mpRequest('accounts').then(r=>mpRequest('transfer-coverage',{accountId:r.accounts.find(a=>a.primary).id,minutes:10})).then(r=>console.log(JSON.stringify(r.coverage,null,1))));
  assert.deepEqual(calls,['accounts','transfer-coverage']);
  assert.deepEqual(h.errors.filter(e=>e.startsWith('pageerror:')),[]);
  console.log(JSON.stringify({ok:true,width,publicClient:!!process.env.PUBLIC_URL,consoleExpressionWorks:true,minutes:10,backend:'synthetic',realWrites:0}));
 }finally{await h.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
