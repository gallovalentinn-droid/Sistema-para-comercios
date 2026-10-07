const assert=require('node:assert/strict');
const path=require('node:path');
const {open}=require('../pruebas-navegador-REV58/harness.cjs');

(async()=>{
  const app=await open({width:1440,height:900});
  try{
    for(const modo of ['unica','unica_separa_cigarrillos','dos_cajas']){
      const state=await app.page.evaluate(modo=>{
        db=VACIA();
        db.config.fondoCaja=15550;
        db.config.fondoCajaCigarros=modo==='dos_cajas'?5000:0;
        db.config.moduloCigarros=modo==='dos_cajas';
        db.config.separaCigarrillosAlCierre=modo==='unica_separa_cigarrillos';
        const desde=new Date(Date.now()-135*60000).toISOString();
        const fecha=min=>new Date(Date.now()-min*60000).toISOString();
        f3Estado.session={estado:'abierta',abiertoPor:'Tiago',fondoGeneral:15550,fondoCigarros:db.config.fondoCajaCigarros,openedAtDevice:desde,cajaSeparadaCigarros:modo==='dos_cajas'};
        db.ventas=[
          {id:'v1',fecha:desde,total:48200,subtotal:48200,forma:'efectivo',items:[{nombre:'Alimentos',precio:48200,cant:1,neto:48200,rubro:'Almacén',costo:25000}]},
          {id:'v2',fecha:fecha(75),total:12600,subtotal:12600,forma:'efectivo',items:[{nombre:'Cigarrillos',precio:12600,cant:1,neto:12600,rubro:'Cigarrillos',costo:9500}]},
          {id:'v3',fecha:fecha(45),total:22300,subtotal:22300,forma:'transferencia',items:[{nombre:'Bebidas',precio:22300,cant:1,neto:22300,rubro:'Bebidas',costo:15000}]},
          {id:'v4',fecha:fecha(17),total:6400,subtotal:6400,forma:'fiado',items:[{nombre:'Golosinas',precio:6400,cant:1,neto:6400,rubro:'Golosinas',costo:3200}]},
        ];
        db.clientes=[{id:'c1',nombre:'Marta G.'}];
        db.pagos=[{id:'p1',fecha:fecha(21),monto:3000,forma:'efectivo',clienteId:'c1'}];
        db.egresos=[
          {id:'e1',fecha:fecha(30),monto:4500,forma:'efectivo',motivo:'Gastos varios',caja:'general',nota:'Proveedor'},
          {id:'e2',fecha:fecha(24),monto:10000,forma:'efectivo',motivo:'Retiro del dueño',caja:'general'},
        ];
        globalThis.__miCajaVista='turno';
        ir('caja');
        return {boxes:document.querySelectorAll('.cash-box-card').length,
          cash:[...document.querySelectorAll('.cash-box-amount')].map(x=>x.textContent),
          sold:document.querySelector('.cash-sales-head b')?.textContent,
          recent:document.querySelectorAll('.cash-movements-card .cash-movement-row').length,
          opener:document.querySelector('.cash-turn-status')?.textContent,
          actions:[...document.querySelectorAll('.cash-turn-actions button')].map(x=>x.textContent.trim())};
      },modo);
      assert.equal(state.boxes,modo==='dos_cajas'?2:1,modo);
      assert.equal(state.cash[0],modo==='dos_cajas'?'$52.250,00':'$64.850,00',modo);
      if(modo==='dos_cajas')assert.equal(state.cash[1],'$17.600,00');
      assert.equal(state.recent,5,modo);
      assert.match(state.opener,/Tiago/);
      assert.match(state.sold,/89\.500/);
      assert.ok(state.actions.some(x=>x.includes('Registrar gasto')));
      assert.ok(state.actions.some(x=>x.includes('Sacar plata')));
      await app.page.screenshot({path:path.join(__dirname,`caja-${modo}.png`),fullPage:true});
      await app.page.click('#verTodosMovCaja');
      assert.equal(await app.page.locator('#detalleMovimientosCaja').evaluate(el=>el.open),true);
      assert.equal(await app.page.locator('#detalleMovimientosCaja .cash-movement-row').count(),7);
      console.log(modo,JSON.stringify(state));
    }
    await app.page.setViewportSize({width:390,height:844});
    await app.page.screenshot({path:path.join(__dirname,'caja-movil.png'),fullPage:true});
    const overflow=await app.page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
    assert.equal(overflow,false,'la vista móvil no debe tener desborde horizontal');
    assert.deepEqual(app.errors.filter(error=>error.startsWith('pageerror:')),[]);
  }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
