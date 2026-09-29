const assert=require('node:assert/strict');
const path=require('node:path');
const {open}=require('../pruebas-navegador-REV58/harness.cjs');

(async()=>{
  const app=await open({width:1366,height:850});
  try{
    const caja=await app.page.evaluate(()=>{
      db=VACIA();db.config.fondoCaja=15550;
      const desde=new Date(Date.now()-60*60000).toISOString();
      f3Estado.session={estado:'abierta',fondoGeneral:15550,fondoCigarros:0,openedAtDevice:desde};
      db.ventas=[{id:'v1',fecha:desde,total:2000,subtotal:2000,forma:'efectivo',items:[{nombre:'Producto',precio:2000,cant:1,neto:2000,rubro:'Almacén',costo:1000}]}];
      const m=document.querySelector('#main');
      sesion=null;interfazProtegida=false;vCaja(m);
      const duenio={esperado:m.querySelectorAll('.cash-box-card').length,ganancia:m.querySelectorAll('.cash-extra-metrics span').length};
      interfazProtegida=true;vCaja(m);
      const bloqueado={esperado:m.querySelectorAll('.cash-box-card').length,detalle:!!m.querySelector('.cash-sales-card,.cash-movements-card,.cash-detail')};
      interfazProtegida=false;sesion={user:{id:'usuario',email:'empleado@ejemplo.test'}};
      f3Estado.rol='empleado';f3Estado.contextoCargado=true;f3ContextoServidorVerificado=true;
      vCaja(m);
      const empleado={esperado:m.querySelectorAll('.cash-box-card').length,detalle:!!m.querySelector('.cash-sales-card,.cash-movements-card,.cash-detail')};
      return {duenio,bloqueado,empleado};
    });
    assert.equal(caja.duenio.esperado,1);
    assert.equal(caja.bloqueado.esperado,0);
    assert.equal(caja.bloqueado.detalle,false);
    assert.equal(caja.empleado.esperado,0);
    assert.equal(caja.empleado.detalle,false);
    await app.page.screenshot({path:path.join(__dirname,'caja-empleado.png'),fullPage:true});

    const sesion=await app.page.evaluate(async()=>{
      const ventas=db.ventas.length;
      const response=new Response('Unauthorized',{status:401});
      await f61VigilarRespuesta(response,'https://qrvdfqpxutymmlcplsal.supabase.co/rest/v1/rpc/f5_obtener_proyeccion');
      return {cerrada:f61SesionCerrada,ventasAntes:ventas,ventasDespues:db.ventas.length,
        aviso:document.querySelector('#sesionAviso')?.textContent,
        visible:!document.querySelector('#sesionAviso')?.hidden,
        pie:document.querySelector('#railFoot')?.textContent};
    });
    assert.equal(sesion.cerrada,true);
    assert.equal(sesion.ventasDespues,sesion.ventasAntes);
    assert.equal(sesion.visible,true);
    assert.match(sesion.aviso,/Volvé a ingresar para subir las ventas/);
    assert.match(sesion.pie,/Sesión cerrada/);
    await app.page.screenshot({path:path.join(__dirname,'sesion-cerrada.png'),fullPage:false});
    await app.page.setViewportSize({width:390,height:844});
    const mobile=await app.page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,
      aviso:document.querySelector('#sesionAviso').getBoundingClientRect().bottom,
      contenido:document.querySelector('#main').getBoundingClientRect().top}));
    assert.equal(mobile.overflow,false);
    assert.ok(mobile.contenido>=mobile.aviso,'el aviso no debe tapar la caja en celular');
    await app.page.screenshot({path:path.join(__dirname,'sesion-cerrada-movil.png'),fullPage:false});
    assert.deepEqual(app.errors.filter(error=>error.startsWith('pageerror:')),[]);
    console.log(JSON.stringify({caja,sesion:{...sesion,pie:undefined,aviso:undefined},mobile}));
  }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
