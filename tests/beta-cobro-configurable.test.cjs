const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('transferencia manual es el modo inicial y nunca oculta la recuperación de un cobro pendiente',()=>{
  const storage=new Map(),c=vm.createContext({db:{config:{}},sesion:{user:{id:'u'}},f3Estado:{comercioId:'c'},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../beta/mercadopago.js'),'utf8'),c);
  assert.equal(typeof c.mpCobroConectado,'function');
  assert.equal(c.mpCobroConectado(),false);
  c.db.config.verificarCobrosMP=true;assert.equal(c.mpCobroConectado(),true);
  c.db.config.verificarCobrosMP=false;c.mpGuardarPendiente({saleId:'pendiente',stage:'qr'});
  assert.equal(c.mpCobroConectado(),true);
});
test('una caja atrasada no reenvía la preferencia cuando solo cambió otro ajuste',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../beta/index.html'),'utf8'),c=vm.createContext({});
  vm.runInContext(html.split('/* F5_CONFIG_CONTRACT_START */')[1].split('/* F5_CONFIG_CONTRACT_END */')[0],c);
  for(const valor of [undefined,false,true]){
    const cfg={avisoTurnoHoras:12,...(valor===undefined?{}:{verificarCobrosMP:valor})};
    assert.equal(Object.hasOwn(c.f3PayloadConfig(cfg,['avisoTurnoHoras']),'verificar_cobros_mp'),false);
  }
  assert.equal(c.f3PayloadConfig({verificarCobrosMP:false},['verificarCobrosMP']).verificar_cobros_mp,false);
});
test('la comparación F34 distingue verificación activada y apagada entre V3 y V4',async()=>{
  const html=fs.readFileSync(path.join(__dirname,'../beta/index.html'),'utf8'),c=vm.createContext({f34Round:Number,f34Str:String,f34Num:(v,d=0)=>v??d,f34QueryError(){},f3Estado:{comercioId:'c'},sb:{from:()=>({select:()=>({eq:()=>({limit:async()=>({data:[{verificar_cobros_mp:false}]})})})})}});
  for(const name of ['f34ConfigLocal','f34ActualConfig']){
    const re=new RegExp('(?:async )?function '+name+'\\([^\\n]+');vm.runInContext(html.match(re)[0],c);
  }
  assert.equal(c.f34ConfigLocal({verificarCobrosMP:true}).verificar_cobros_mp,true);
  assert.equal((await c.f34ActualConfig()).verificar_cobros_mp,false);
});
test('la preferencia de cobro viaja en configuración privilegiada, con falso explícito',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../beta/index.html'),'utf8'),c=vm.createContext({});
  vm.runInContext(html.split('/* F5_CONFIG_CONTRACT_START */')[1].split('/* F5_CONFIG_CONTRACT_END */')[0],c);
  for(const valor of [true,false]){
    const payload=c.f3PayloadConfig({verificarCobrosMP:valor});
    assert.equal(payload.verificar_cobros_mp,valor);
    assert.equal(c.f5SepararConfigPayload(payload).privilegiada.verificar_cobros_mp,valor);
    assert.equal(Object.hasOwn(c.f5SepararConfigPayload(payload).operativa,'verificar_cobros_mp'),false);
  }
});
