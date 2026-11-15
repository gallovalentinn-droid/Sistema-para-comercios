'use strict';
// Exclusivamente datos sintéticos para el comercio de PRUEBA LOCAL. No borra ni modifica el catálogo anterior.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const LOCAL_DIR=path.join(process.env.USERPROFILE||'C:/Users/valen','.codex','.chatgpt-projects','g-p-6a8b192b818c8191ad9447dd21800d7c','github','Sistema-para-comercios','.worktrees','entorno-docker','entorno-local');
function crearDemoStock({comercioId,ownerId,baseDay}){
  const uuid=clave=>{const h=crypto.createHash('sha256').update('stock-demo-v1:'+comercioId+':'+clave).digest('hex').split('');h[12]='4';h[16]='8';const s=h.join('');return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20,32)}`;};
  const dia=n=>{const d=new Date(baseDay+'T12:00:00Z');if(!Number.isFinite(d.getTime()))throw Error('Fecha base inválida');d.setUTCDate(d.getUTCDate()-n);return d.toISOString().slice(0,10);};
  const fecha=(n,h)=>`${dia(n)}T${h}:00-03:00`;
  const productos=[['agua','Agua mineral', 'Bebidas',24,500,1000,'unidad'],['alfajor','Alfajor','Golosinas',30,400,800,'unidad'],['paquete','Cigarrillos paquete','Cigarrillos',6,1200,1600,'unidad'],['suelto','Cigarrillos sueltos','Cigarrillos',0,60,100,'suelto'],['queso','Queso por kilo','Almacén',4.5,1800,3000,'kg']].map(([clave,nombre,rubro,stockBase,costo,precio,unidad])=>({clave,id:uuid('producto:'+clave),nombre:'DEMO · '+nombre,rubro,stockBase,costo,precio,unidad}));
  const porClave=Object.fromEntries(productos.map(p=>[p.clave,p]));
  const turnos=[['A',2,'08:00','12:00','DEMO · Ana (mañana)'],['B',2,'13:00','17:00','DEMO · Bruno (tarde)'],['C',1,'08:00','12:00','DEMO · Ana (mañana)']].map(([clave,n,desde,hasta,responsable])=>({clave,id:uuid('turno:'+clave),cierreId:uuid('cierre:'+clave),desde:fecha(n,desde),hasta:fecha(n,hasta),dia:dia(n),responsable,cantVentas:1}));
  const movs=[],ventas=[];
  const movimiento=(clave,prod,tipo,cant,fecha,turno=null,motivo='',ventaId=null)=>movs.push({id:uuid('mov:'+clave),prodId:porClave[prod].id,tipo,cant,fecha,turnoId:turno?.id||null,motivo:(motivo||'Movimiento sintético')+' · Usuario: '+(turno?.responsable||'DEMO · Reposición'),ventaId});
  const vender=(turno,n,h,lista)=>{const v={id:uuid('venta:'+turno.clave),turnoId:turno.id,nro:99001+ventas.length,ref:'DEMO-STOCK-'+turno.clave,fecha:fecha(n,h),items:lista.map(([clave,cant])=>({prodId:porClave[clave].id,nombre:porClave[clave].nombre,rubro:porClave[clave].rubro,cant,precio:porClave[clave].precio,costo:porClave[clave].costo}))};v.total=v.items.reduce((a,i)=>a+i.cant*i.precio,0);v.costo=v.items.reduce((a,i)=>a+i.cant*i.costo,0);v.cigTotal=v.items.filter(i=>i.rubro==='Cigarrillos').reduce((a,i)=>a+i.cant*i.precio,0);ventas.push(v);lista.forEach(([clave,cant])=>movimiento('venta:'+turno.clave+':'+clave,clave,'venta',-cant,v.fecha,turno,'Venta sintética '+v.ref,v.id));};
  const [A,B,C]=turnos;
  movimiento('A-ingreso','alfajor','ingreso',10,fecha(2,'08:30'),A,'Reposición de alfajores');
  movimiento('A-paquete','paquete','conversion',-1,fecha(2,'09:00'),A,'Apertura de un paquete');movimiento('A-suelto','suelto','conversion',20,fecha(2,'09:00'),A,'Sueltos de un paquete');
  vender(A,2,'10:00',[['agua',4],['alfajor',6],['suelto',5],['queso',0.75]]);
  movimiento('A-ajuste','agua','ajuste',-1,fecha(2,'11:00'),A,'Botella rota');
  movimiento('entre-ingreso','agua','ingreso',12,fecha(2,'12:30'),null,'Entrega entre los dos turnos');movimiento('entre-ajuste','alfajor','ajuste',-2,fecha(2,'12:45'),null,'Corrección entre turnos');
  movimiento('B-ingreso','agua','ingreso',6,fecha(2,'14:00'),B,'Reposición de bebidas');
  vender(B,2,'15:00',[['agua',8],['alfajor',7],['suelto',4],['paquete',2],['queso',1.25]]);
  movimiento('B-negativo','suelto','ajuste',-12,fecha(2,'16:00'),B,'Diferencia de conteo: ejemplo de stock negativo');
  movimiento('C-paquete','paquete','conversion',-1,fecha(1,'09:00'),C,'Apertura de un paquete');movimiento('C-suelto','suelto','conversion',20,fecha(1,'09:00'),C,'Sueltos de un paquete');
  vender(C,1,'10:00',[['agua',3],['alfajor',4],['suelto',6],['queso',0.5]]);
  movimiento('C-ajuste','alfajor','ajuste',1,fecha(1,'11:00'),C,'Unidad encontrada en el conteo');
  for(const t of turnos){const v=ventas.find(v=>v.turnoId===t.id);Object.assign(t,{total:v.total,costo:v.costo,cigTotal:v.cigTotal});}
  return {comercioId,ownerId,cajaId:uuid('caja'),deviceId:uuid('device'),productos,turnos,movs,ventas};
}
function ejecutar(){
  const docker=process.env.DOCKER_BIN||'C:/Users/valen/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe',container='supabase_db_micomercio-prueba-local';
  const [inspection]=JSON.parse(execFileSync(docker,['inspect',container],{encoding:'utf8'}));
  if(JSON.stringify(inspection.NetworkSettings.Ports['5432/tcp'])!==JSON.stringify([{HostIp:'127.0.0.1',HostPort:'55322'}]))throw Error('El destino no es PostgreSQL local autorizado');
  const config=JSON.parse(fs.readFileSync(path.join(LOCAL_DIR,'generado/local.json'),'utf8')),cred=JSON.parse(fs.readFileSync(path.join(LOCAL_DIR,'.credenciales-prueba.json'),'utf8'));
  if(config.apiUrl!=='http://127.0.0.1:55321'||cred.duenio.email!=='duenio@prueba.local'||!cred.nota.includes('ficticios'))throw Error('No es el entorno ficticio');
  const sql=q=>execFileSync(docker,['exec','-i',container,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-qAt'],{input:q,encoding:'utf8',maxBuffer:8*1024*1024}).trim();
  const q=v=>"'"+String(v).replaceAll("'","''")+"'";
  const owner=sql(`select u.id from auth.users u join public.comercio_miembros m on m.user_id=u.id where u.email='duenio@prueba.local' and m.comercio_id=${q(cred.comercio_id)} and m.rol='duenio' and m.activo;`);
  if(!/^[a-f0-9-]{36}$/i.test(owner))throw Error('Dueño ficticio no encontrado');
  const baseDay=process.argv.includes('--fecha-base')?process.argv[process.argv.indexOf('--fecha-base')+1]:new Date().toLocaleDateString('en-CA',{timeZone:'America/Argentina/Buenos_Aires'});
  const d=crearDemoStock({comercioId:cred.comercio_id,ownerId:owner,baseDay}),shop=q(d.comercioId),user=q(owner);
  const ids=d.turnos.map(t=>q(t.cierreId)).join(','),existentes=Number(sql(`select count(*) from public.cierres_caja where comercio_id=${shop} and id in (${ids});`));
  if(existentes===3){sql(`update public.cajas set activa=false where id=${q(d.cajaId)} and comercio_id=${shop} and codigo='DEMO-STOCK';`);console.log(JSON.stringify({ok:true,yaCargado:true,turnos:3,productos:5}));return;}
  if(existentes)throw Error('Hay una carga DEMO parcial: no se modifica automáticamente');
  const statements=['begin;',`select pg_advisory_xact_lock(hashtext(${q('demo-stock:'+d.comercioId)}));`,
   `insert into public.cajas(id,comercio_id,codigo,nombre,activa) values(${q(d.cajaId)},${shop},'DEMO-STOCK','Caja histórica de demostración',false);`,
   `insert into public.comercio_dispositivos(id,comercio_id,user_id,caja_id,nombre) values(${q(d.deviceId)},${shop},${user},${q(d.cajaId)},'Dispositivo de demostración');`];
  for(const p of d.productos)statements.push(`insert into public.productos(id,comercio_id,legacy_id,nombre,rubro,costo,precio,stock_base,unidad,stock_min,stock_deseado,created_at_device,updated_at_device,origen_id,por_atado) values(${q(p.id)},${shop},${q(p.id)},${q(p.nombre)},${q(p.rubro)},${p.costo},${p.precio},${p.stockBase},${q(p.unidad)},${p.unidad==='kg'?1:3},${p.unidad==='kg'?5:12},now(),now(),${p.clave==='suelto'?q(d.productos.find(x=>x.clave==='paquete').id):'null'},${p.clave==='suelto'?20:0});`);
  for(const t of d.turnos){
   statements.push(`insert into public.caja_sesiones(id,comercio_id,caja_id,device_id,abierta_por,cerrada_por,opened_at_device,closed_at_device,closed_at_server,business_date,estado,fondo_inicial_general) values(${q(t.id)},${shop},${q(d.cajaId)},${q(d.deviceId)},${user},${user},${q(t.desde)},${q(t.hasta)},now(),${q(t.dia)},'cerrada',5000);`);
   statements.push(`insert into public.caja_sesion_segmentos(segment_id,comercio_id,root_session_id,opened_at_device,closed_at_device) values(${q(t.id)},${shop},${q(t.id)},${q(t.desde)},${q(t.hasta)});`);
  }
  for(const v of d.ventas){const t=d.turnos.find(t=>t.id===v.turnoId);statements.push(`insert into public.ventas(id,comercio_id,legacy_id,caja_sesion_id,session_segment_id,device_id,ticket_seq,ticket_ref,occurred_at_device,business_date,subtotal,total,forma,recibido) values(${q(v.id)},${shop},${q(v.id)},${q(t.id)},${q(t.id)},${q(d.deviceId)},${v.nro},${q(v.ref)},${q(v.fecha)},${q(t.dia)},${v.total},${v.total},'efectivo',${v.total});`);
   for(const [n,i] of v.items.entries())statements.push(`insert into public.venta_items(id,comercio_id,venta_id,tipo,producto_id,nombre_snapshot,rubro_snapshot,cantidad,precio_unitario,costo_unitario,bruto,neto) values(${q(crypto.createHash('md5').update(v.id+':'+n).digest('hex'))}::uuid,${shop},${q(v.id)},'producto',${q(i.prodId)},${q(i.nombre)},${q(i.rubro)},${i.cant},${i.precio},${i.costo},${i.cant*i.precio},${i.cant*i.precio});`);
   statements.push(`insert into public.venta_pagos(comercio_id,venta_id,forma,monto) values(${shop},${q(v.id)},'efectivo',${v.total});`);
  }
  for(const m of d.movs)statements.push(`insert into public.movimientos_stock(id,comercio_id,legacy_id,producto_id,caja_sesion_id,session_segment_id,device_id,tipo,cantidad,motivo,origen_tipo,origen_id,occurred_at_device,business_date) values(${q(m.id)},${shop},${q(m.id)},${q(m.prodId)},${m.turnoId?q(m.turnoId):'null'},${m.turnoId?q(m.turnoId):'null'},${q(d.deviceId)},${q(m.tipo)},${m.cant},${q(m.motivo)},${m.ventaId?"'venta'":'null'},${m.ventaId?q(m.ventaId):'null'},${q(m.fecha)},${q(m.fecha.slice(0,10))});`);
  for(const t of d.turnos){const v=d.ventas.find(v=>v.turnoId===t.id),efectivo=5000+t.total;statements.push(`insert into public.cierres_caja(id,comercio_id,legacy_id,caja_sesion_id,session_segment_id,cant_ventas,total_ventas,por_forma,cig_total,costo_ventas,esperado_general,contado_general,closed_at_device,cerrado_por,responsable_nombre,nota,modelo_caja,retiro_general,queda_general,apartado_cigarrillos) values(${q(t.cierreId)},${shop},${q(t.cierreId)},${q(t.id)},${q(t.id)},1,${t.total},${q(JSON.stringify({efectivo:t.total}))}::jsonb,${t.cigTotal},${t.costo},${efectivo},${efectivo},${q(t.hasta)},${user},${q(t.responsable)},'DEMO · Datos sintéticos para comparar stock','unica_separa_cigarrillos',${efectivo},0,${t.cigTotal});`);statements.push(`insert into public.cierre_ventas(cierre_id,venta_id,comercio_id) values(${q(t.cierreId)},${q(v.id)},${shop});`);}
  statements.push(`do $$ begin if (select count(*) from public.cierres_caja where id in (${ids}))<>3 then raise exception 'Faltan cierres DEMO';end if; end $$;`,'commit;');
  sql(statements.join('\n'));
  const resumen={ok:true,turnos:d.turnos.map(t=>({id:t.id,nombre:t.responsable,desde:t.desde,hasta:t.hasta})),productos:d.productos.length,ventas:d.ventas.length,movimientos:d.movs.length,comercioId:d.comercioId};
  fs.writeFileSync(path.join(LOCAL_DIR,'generado/turnos-stock-demo.json'),JSON.stringify(resumen,null,2)+'\n');console.log(JSON.stringify(resumen));
}
module.exports={crearDemoStock};if(require.main===module){try{ejecutar();}catch(e){console.error(String(e.stderr||e.message).slice(-1800));process.exitCode=1;}}
