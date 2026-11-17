const test=require('node:test'),assert=require('node:assert/strict');
const header='USER_ID;SOURCE_ID;PAYER_NAME;TRANSACTION_AMOUNT;TRANSACTION_CURRENCY;TRANSACTION_TYPE;SETTLEMENT_DATE';
const payment={id:'101',collector_id:77,operation_type:'money_transfer',status:'approved',status_detail:'accredited',currency_id:'ARS',transaction_amount:300};
test('reporte vincula remitente solo con cuenta, ID, importe y moneda exactos',async()=>{
 const {reportSenders}=await import('../supabase/functions/_shared/mp-core.mjs');
 const csv='\ufeff'+header+'\r\n77;101;"Ana; ""Prueba""";300.00;ARS;SETTLEMENT;2026-11-17\r\n88;101;Intruso;300;ARS;SETTLEMENT;x\n77;102;Otro;300;ARS;SETTLEMENT;x';
 assert.deepEqual([...reportSenders(csv,{providerId:'77'},[payment])],[['101','Ana; "Prueba"']]);
 for(const row of ['77;101;Nombre;301;ARS;SETTLEMENT;x','77;101;Nombre;300;USD;SETTLEMENT;x','77;101;Nombre;300;ARS;REFUND;x'])assert.equal(reportSenders(header+'\n'+row,{providerId:'77'},[payment]).size,0);
 assert.equal(reportSenders(csv,{providerId:'77'},[{...payment,status:'refunded'}]).size,0);
});
test('CSV rechaza estructura incompleta, ambigüedad y tamaño excesivo sin texto privado en error',async()=>{
 const {reportSenders}=await import('../supabase/functions/_shared/mp-core.mjs');
 for(const csv of ['PRIVATE\nname',header+'\n77;101;"PRIVATE',header+';SOURCE_ID\n', 'X'.repeat(2097153)])assert.throws(()=>reportSenders(csv,{providerId:'77'},[payment]),/^Error: REPORTE_NO_VALIDO$/);
 assert.equal(reportSenders(header+'\n77;101;Ana;300;ARS;SETTLEMENT;x\n77;101;Otra;300;ARS;SETTLEMENT;x',{providerId:'77'},[payment]).size,0);
});
test('descarga usa host fijo, sin redirecciones ni token en URL y limita bytes',async()=>{
 const {Provider}=await import('../supabase/functions/_shared/mp-core.mjs');let observed;
 const p=new Provider({},async(url,options)=>{observed={url,options};return new Response(header);});
 assert.equal(await p.reportFile({access_token:'synthetic'},'micomercio-remitentes-1.csv'),header);
 assert.equal(observed.options.redirect,'error');assert.equal(observed.url,'https://api.mercadopago.com/v1/account/settlement_report/micomercio-remitentes-1.csv');
 await assert.rejects(p.reportFile({},'../PRIVATE'),/REPORTE_NO_VALIDO/);
 p.fetcher=async()=>new Response('x'.repeat(2097153));await assert.rejects(p.reportFile({},'ok.csv'),/REPORTE_NO_VALIDO/);
});
test('diagnóstico de CVU distingue nombre vacío de ID ausente sin copiar valores',async()=>{const {reportSenders}=await import('../supabase/functions/_shared/mp-core.mjs'),stats={};reportSenders(header+'\n77;101;;300;ARS;SETTLEMENT;x',{providerId:'77'},[{...payment,operation_type:'account_fund',payment_type_id:'bank_transfer',payment_method_id:'cvu'}],stats);assert.deepEqual(stats.cvu,{source:1,account:1,amount:1,currency:1,settlement:1,name:0});assert.equal(JSON.stringify(stats).includes('101'),false);});
