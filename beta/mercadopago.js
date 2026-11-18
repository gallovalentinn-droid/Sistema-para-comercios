'use strict';
let mpOperacionOcupada=false,mpCierreAutorizado=false,mpPersistenciaPendiente=null,mpOperacionActual=null,mpCierreEnCurso=null,mpSolicitaCierre=false;
function mpScope(){return JSON.stringify([sesion?.user?.id||'',f3Estado?.comercioId||'']);}
function mpPendingKey(){return 'micomercio:mp-cobro-v1:'+mpScope();}
function mpLeerPendiente(){try{return JSON.parse(localStorage.getItem(mpPendingKey())||'null');}catch{return null;}}
function mpGuardarPendiente(p){localStorage.setItem(mpPendingKey(),JSON.stringify(p));}
function mpBorrarPendiente(scope=mpScope()){localStorage.removeItem('micomercio:mp-cobro-v1:'+scope);}
function mpBloqueaCobro(){return !mpCierreAutorizado&&!!mpLeerPendiente();}
function mpMensaje(code){return ({APLICACION_NO_CONFIGURADA:'La conexión de MiComercio con Mercado Pago todavía no está habilitada. Falta configurar su aplicación.',CONFIGURAR_CAJA_QR:'El dueño debe elegir la caja de Mercado Pago en Configuración.',SESION_INVALIDA:'Volvé a ingresar para consultar Mercado Pago.',AUTORIDAD_NO_VIGENTE:'No pudimos validar tu acceso para consultar cobros.',TRANSFERENCIA_UTILIZADA:'Esta transferencia ya se usó en otra venta.',INGRESO_MONTO_DISTINTO:'El importe recibido no coincide con este cobro.',INGRESO_NO_VALIDO:'Mercado Pago no confirmó una transferencia acreditada para esta cuenta.',TICKET_CAMBIO:'El ticket cambió. Cerrá este cobro e iniciá uno nuevo.',RECONECTAR_CUENTA:'El dueño debe volver a conectar esta cuenta de Mercado Pago.',COBRO_PENDIENTE:'Primero resolvé el cobro pendiente.',COBROS_NO_HABILITADOS:'Los nuevos cobros de Mercado Pago están pausados. Podés resolver los pendientes o confirmar manualmente.',NUEVOS_COBROS_DESHABILITADOS:'Los nuevos cobros de Mercado Pago están pausados. Podés resolver los pendientes o confirmar manualmente.',TRANSFERENCIAS_NO_HABILITADAS:'La comprobación de transferencias todavía no está habilitada. Podés confirmar este cobro manualmente.',COBRO_CANCELADO:'Este cobro fue cancelado. Iniciá uno nuevo.',COBRO_NO_INICIADO:'Iniciá el cobro de esta venta antes de consultar o elegir un ingreso.',INGRESO_FUERA_DE_VENTANA:'La acreditación está fuera de la ventana de esta venta. No se registró el cobro.',INGRESO_VINCULADO_ORDEN:'Este pago pertenece a una orden y no se puede usar como transferencia.',COBRO_OCUPADO:'La consulta anterior sigue en curso.',ORDEN_INVALIDA:'Mercado Pago devolvió una orden que no pudimos validar (ORDEN_INVALIDA).',ORDEN_SIN_ACREDITAR:'Mercado Pago informa la orden como procesada, pero MiComercio no pudo validar la acreditación (ORDEN_SIN_ACREDITAR). La venta todavía no se registró.',ORDEN_MONTO_DISTINTO:'El importe de la orden de Mercado Pago no coincide con esta venta (ORDEN_MONTO_DISTINTO).',MERCADO_PAGO_NO_DISPONIBLE:'No pudimos consultar Mercado Pago en este momento.',MERCADO_PAGO_OCUPADO:'Mercado Pago está ocupado. Consultá otra vez en unos segundos.'})[code]||'No pudimos recuperar el estado del cobro. Reintentá antes de continuar.';}
function mpPublico(){return !['127.0.0.1','localhost','[::1]'].includes(location.hostname);}
let mpRetornoOAuth=null;
function mpProcesarRetorno(){
 const url=new URL(location.href),resultado=url.searchParams.get('mercadopago');
 if(!['conectado','error'].includes(resultado)||typeof f5MembresiaActual!=='function'||f5MembresiaActual()?.rol!=='duenio')return;
 mpRetornoOAuth=resultado;url.searchParams.delete('mercadopago');history.replaceState(null,'',url.pathname+url.search+url.hash);vista='config';
}
function mpEndpoint(){return mpPublico()?SUPABASE_URL.replace(/\/$/,'')+'/functions/v1/mercadopago':'/api/mercadopago';}
async function mpRequest(action,body={}){
 if(!sesion?.access_token||!f3Estado?.comercioId)throw new Error('SESION_INVALIDA');
 const scope=mpScope(),r=await fetch(mpEndpoint(),{method:'POST',cache:'no-store',headers:{...(mpPublico()?{apikey:SUPABASE_ANON_KEY}:{}),'content-type':'application/json',authorization:'Bearer '+sesion.access_token},body:JSON.stringify({...body,action,commerceId:f3Estado.comercioId,deviceId:f3Estado.deviceUuid}),signal:AbortSignal.timeout(20000)});
 if(scope!==mpScope())throw new Error('SESION_INVALIDA');let data;try{data=await r.json();}catch{throw new Error('CONEXION_NO_DISPONIBLE');}if(!r.ok)throw new Error(data.code||'CONEXION_NO_DISPONIBLE');return data;
}
function mpPayload(p){return {accountId:p.accountId,saleId:p.saleId,fingerprint:p.fingerprint,amount:p.amount};}
function mpSnapshot(){return {ticket:structuredClone(ticket),pago,pagoMixto:structuredClone(pagoMixto),dto:structuredClone(dto),recibido,clienteFiado,calculo:{items:ticket.map(buildVentaItem),subtotal:subtotalTicket(),descuento:montoDescuento(),descuentoDetalle:montoDescuento()>0?{tipo:dto.tipo,valor:num(dto.valor),motivo:dto.motivo}:null,promoAuto:descuentoPromoAuto(),promoAutoDetalle:structuredClone(detallePromoAuto()),promoPago:descuentoPromoPago(),promoPagoDetalle:promoPagoPct(pago)>0?{forma:pago,porcentaje:promoPagoPct(pago)}:null,total:totalTicket()}};}
// La identidad del ticket no cambia cuando vence una promoción: su cálculo se conserva aparte.
async function mpFingerprint(snapshot=mpSnapshot()){const {calculo,...identity}=snapshot;const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(identity)));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function mpPreparar(accountId){const scope=mpScope(),snapshot=mpSnapshot(),fingerprint=await mpFingerprint(snapshot);if(scope!==mpScope())throw new Error('SESION_INVALIDA');const previous=mpLeerPendiente();if(previous){if(previous.stage==='manual')throw new Error('COBRO_MANUAL_PENDIENTE');if(previous.fingerprint!==fingerprint||previous.accountId!==accountId)throw new Error('TICKET_CAMBIO');return previous;}const amount=snapshot.calculo.total;if(!(amount>0))throw new Error('MONTO_INVALIDO');const p={saleId:uid(),accountId,fingerprint,amount:amount.toFixed(2),snapshot,stage:'prepared',scope};mpGuardarPendiente(p);return p;}
function mpRestaurarDatos(snapshot){ticket=structuredClone(snapshot.ticket);pago=snapshot.pago;pagoMixto=structuredClone(snapshot.pagoMixto);dto=structuredClone(snapshot.dto);recibido=snapshot.recibido;clienteFiado=snapshot.clienteFiado;}
function mpRestaurarPendiente(){const p=mpLeerPendiente();if(!p)return;mpRestaurarDatos(p.snapshot);abrirModalPago(true);}
function mpMontarRecuperacion(root){
 root?.querySelector('#mpRecuperacion')?.remove();const pending=mpLeerPendiente();
 if(pending&&!ticket.length&&!mpCierreAutorizado&&!mpOperacionOcupada)mpRestaurarDatos(pending.snapshot);
}
async function mpTerminarCobro(){
 if(mpCierreEnCurso)return mpCierreEnCurso;
 const scope=mpScope(),saleId=mpLeerPendiente()?.saleId;mpSolicitaCierre=true;
 mpCierreEnCurso=(async()=>{
  if(mpOperacionActual)await mpOperacionActual;
  if(scope!==mpScope())return null;
  const p=mpLeerPendiente();if(!p)return 'canceled';if(saleId&&p.saleId!==saleId)return null;
  const panel=document.querySelector('#mpPanel'),state=panel?.querySelector('#mpEstado');mpOperacionOcupada=true;
  panel?.querySelectorAll('button,select').forEach(b=>b.disabled=true);if(state)state.textContent='Cancelando el cobro…';
  try{
   let receipt=p.receipt;
   if(p.stage!=='manual'&&!receipt&&!db.ventas.some(v=>v.id===p.saleId)){
    const r=await mpRequest('qr-cancel',mpPayload(p));if(scope!==mpScope())return null;receipt=r.receipt;
    if(!receipt&&!['canceled','expired','manual'].includes(r.attempt?.status))throw new Error('COBRO_PENDIENTE');
    if(!receipt&&r.attempt?.status==='manual'){p.stage='manual';mpGuardarPendiente(p);}
   }
   if(scope!==mpScope()||mpLeerPendiente()?.saleId!==p.saleId)return null;
   if(receipt||p.stage==='manual'||db.ventas.some(v=>v.id===p.saleId)){
    const draft=mpSnapshot(),preserve=draft.ticket.length>0&&await mpFingerprint(draft)!==p.fingerprint;
    if(scope!==mpScope())return null;mpRestaurarDatos(p.snapshot);
    try{await mpCompletar(receipt,p,!receipt);}finally{if(preserve&&scope===mpScope()){mpRestaurarDatos(draft);pintarPOS();}}
    if(scope!==mpScope())return null;return 'completed';
   }
   mpBorrarPendiente(scope);pintarPOS();return 'canceled';
  }catch(e){if(scope===mpScope()){const message='No pudimos cancelar el cobro. '+mpMensaje(e.message)+' Reintentá cerrar el panel.';if(state?.isConnected)state.textContent=message;else aviso(message,'bad');}return null;}
  finally{mpOperacionOcupada=false;if(scope===mpScope()&&panel?.isConnected){panel.querySelectorAll('button,select').forEach(b=>b.disabled=false);panel.querySelector('#mpCuenta').disabled=!!mpLeerPendiente();panel.querySelectorAll('[data-mp-ingreso]').forEach(b=>b.disabled=b.dataset.mpDisponible!=='1');}}
 })();
 try{return await mpCierreEnCurso;}finally{mpCierreEnCurso=null;mpSolicitaCierre=false;}
}
async function mpCompletar(receipt,p,manual=false,onVerified=null){
 if(p.scope!==mpScope())throw new Error('SESION_INVALIDA');const fingerprint=await mpFingerprint();if(p.scope!==mpScope())throw new Error('SESION_INVALIDA');if(p.fingerprint!==fingerprint)throw new Error('TICKET_CAMBIO');
 if(!manual){if(receipt?.amountCents!==Math.round(p.snapshot.calculo.total*100))throw new Error('INGRESO_MONTO_DISTINTO');p.receipt=receipt;p.stage='verified';mpGuardarPendiente(p);onVerified?.();}
 const existing=db.ventas.find(v=>v.id===p.saleId);
 if(existing){if(mpPersistenciaPendiente?.saleId===p.saleId){await mpPersistenciaPendiente.persistencia.reintentar();if(p.scope===mpScope())mpPersistenciaPendiente.finalizar();mpPersistenciaPendiente=null;}else{ticket=[];recibido='';pago='efectivo';pagoMixto=[];clienteFiado='';limpiarDescuento();pintarPOS();ticketImpreso(existing);}mpBorrarPendiente(p.scope);return;}
 mpCierreAutorizado=true;try{const result=await cerrarVenta('transferencia',{saleId:p.saleId,estado:manual?'manual':'verified',receipt:manual?null:receipt,calculo:p.snapshot.calculo,scope:p.scope});if(!result)throw new Error('VENTA_NO_GUARDADA');mpBorrarPendiente(p.scope);}finally{mpCierreAutorizado=false;}
}
function mpEstadoHTML(v){const t=formaKey(v.forma)==='transferencia'||(v.pagos||[]).some(p=>formaKey(p.forma)==='transferencia');return t?`<div class="hint" data-mp-venta="${esc(v.id)}" style="margin-top:12px"><b>${v.mpCobro?.estado==='manual'?'Confirmada manualmente · sin verificación de Mercado Pago':'Consultando verificación de Mercado Pago…'}</b></div>`:'';}
async function mpConsultarVenta(root,v){const el=root.querySelector('[data-mp-venta]');if(!el||v.mpCobro?.estado==='manual')return;try{const r=await mpRequest('sale-receipts',{saleIds:[v.id]});if(!el.isConnected)return;const receipt=r.receipts?.[0];el.textContent=receipt?(receipt.kind==='qr'?'QR verificado con Mercado Pago':'Transferencia verificada con Mercado Pago'):'Sin verificación de Mercado Pago registrada';}catch{if(el.isConnected)el.textContent='No se pudo consultar la verificación de Mercado Pago';}}
function mpCobroHTML(){return `<div id="mpPanel">
 <label class="f" for="mpCuenta">Recibir en</label><select class="inp" id="mpCuenta"><option value="">Consultando cuentas…</option></select>
 <div id="mpInicioCobro" class="mp-opciones">
  <div class="mp-metodos" role="group" aria-label="Elegir cómo cobrar">
   <button class="mp-metodo" type="button" id="mpGenerarQR" data-mp-metodo="qr" aria-pressed="false"><span aria-hidden="true">${ic('qr-cobro')}</span><strong>QR</strong><small>Escanea el cliente</small></button>
   <button class="mp-metodo" type="button" id="mpIniciarCobro" data-mp-metodo="transfer" aria-pressed="false"><span aria-hidden="true">${ic('reponer')}</span><strong>Transferencia</strong><small>Envía a tu cuenta</small></button>
  </div>
  <button class="btn big" type="button" id="mpContinuarCobro" disabled>Elegí una opción</button>
 </div>
 <section id="mpComprobarCobro" hidden aria-labelledby="mpPasoTitulo">
  <h3 id="mpPasoTitulo" tabindex="-1" style="margin:16px 0 12px">Ingresos recientes</h3>
  <button class="btn" type="button" id="mpReintentarInicio" hidden>Reintentar inicio del cobro</button>
  <button class="btn ghost sm" type="button" id="mpBuscar" hidden>Reintentar consulta</button>
  <div id="mpIngresos"></div><div id="mpQR" aria-label="Código QR de cobro"></div>
  <p class="hint" id="mpVentana"></p><p class="ux-banner warn" id="mpAmbiguedad" role="status" hidden></p>
  <p class="hint" id="mpAyudaQR" hidden>Para probar este QR, pagá desde una cuenta distinta de la que recibe el cobro: el dueño no puede pagarse a sí mismo. Mantené el panel abierto para detectar el pago; al cerrarlo se cancela el intento o se registra el pago si ya se acreditó.</p>
  <div id="mpIngresoSeleccionado" class="mp-acreditado" role="status" hidden></div>
  <button class="btn verde big" type="button" id="mpConfirmarIngreso" hidden>Confirmar venta</button>
  <button class="btn ghost sm" id="mpActualizarQR" type="button" hidden>Consultar estado del QR</button>
  <button class="btn ghost big" id="mpCobroManual" type="button">Confirmar sin verificar</button>
  <div id="mpManualConfirmacion" hidden><p>Se registrará como cobro manual.</p><div class="row"><button class="btn ghost" type="button" id="mpManualVolver">Volver</button><button class="btn" type="button" id="mpManualConfirmar">Confirmar cobro manual</button></div></div>
  <button class="btn ghost sm" type="button" id="mpVolverCobro" style="margin-top:12px">Volver al cobro</button>
 </section>
 <p class="hint" id="mpEstado" role="status" aria-live="polite">Consultando Mercado Pago…</p>
 </div>`;}
function mpMontarCobro(root){
 const pending=mpLeerPendiente();if(pago!=='transferencia')return;
 const panel=root.querySelector('#mpPanel');if(!panel)return;const scope=mpScope(),state=panel.querySelector('#mpEstado'),account=panel.querySelector('#mpCuenta');let poll=null,transferEnabled=!mpPublico(),newPaymentsEnabled=!mpPublico(),selectedIncome=null,latestCandidates=[],metodoElegido=null,cuentasListas=false;
 const actualizarEleccion=()=>{
  if(metodoElegido==='qr'&&!newPaymentsEnabled)metodoElegido=null;
  panel.querySelectorAll('[data-mp-metodo]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mpMetodo===metodoElegido)));
  const button=panel.querySelector('#mpContinuarCobro');button.textContent=metodoElegido==='qr'?'Mostrar QR':metodoElegido==='transfer'?'Esperar transferencia':'Elegí una opción';button.disabled=!metodoElegido||!cuentasListas||mpOperacionOcupada;
 };
 panel.querySelectorAll('[data-mp-metodo]').forEach(b=>b.onclick=()=>{if(mpOperacionOcupada||mpLeerPendiente()||!root.isConnected||scope!==mpScope())return;metodoElegido=b.dataset.mpMetodo;actualizarEleccion();});
 panel.querySelector('#mpContinuarCobro').onclick=()=>{if(!metodoElegido||!cuentasListas||mpOperacionOcupada||mpSolicitaCierre||!active())return;return metodoElegido==='qr'?generarQR():iniciarTransferencia();};
 const descartarIngreso=()=>{selectedIncome=null;panel.querySelector('#mpConfirmarIngreso').hidden=true;panel.querySelector('#mpIngresoSeleccionado').hidden=true;panel.querySelector('#mpIngresos').innerHTML='';panel.querySelector('#mpAmbiguedad').hidden=true;};
 account.onchange=()=>{descartarIngreso();setState('Cuenta cambiada. Consultá sus ingresos antes de elegir uno.');};
 panel.querySelector('#mpGenerarQR').hidden=!newPaymentsEnabled;
 const active=()=>root.isConnected&&scope===mpScope()&&panel.isConnected;
 const setState=m=>{if(active())state.textContent=m;};
 const mostrarComprobacion=(qr=false)=>{
  panel.querySelector('#mpInicioCobro').hidden=true;
  panel.querySelector('#mpComprobarCobro').hidden=false;
  panel.querySelector('#mpBuscar').hidden=true;
  panel.querySelector('#mpActualizarQR').hidden=!qr;
  panel.querySelector('#mpAyudaQR').hidden=!qr;
  panel.querySelector('#mpReintentarInicio').hidden=qr||!transferEnabled||!newPaymentsEnabled||mpLeerPendiente()?.stage!=='prepared';
  panel.querySelector('#mpVolverCobro').hidden=!!mpLeerPendiente();
  panel.querySelector('#mpPasoTitulo').textContent=qr?'Cobro con QR de Mercado Pago':'Transferencia';
  if(qr)descartarIngreso();
  panel.querySelector('#mpCobroManual').textContent=qr?'Cancelar QR y confirmar manualmente':mpLeerPendiente()?.stage==='verified'?'Registrar venta con el pago verificado':'Confirmar sin verificar';
 };
 const iniciarTransferencia=async()=>{await run(async()=>{mostrarComprobacion();panel.querySelector('#mpPasoTitulo').focus();if(!newPaymentsEnabled){setState('Los nuevos cobros de Mercado Pago están pausados. Podés confirmar este cobro manualmente.');return;}if(!transferEnabled){setState('La comprobación de transferencias todavía no está habilitada. Podés confirmar este cobro manualmente.');return;}if(!account.value){setState('Primero hay que conectar una cuenta. Podés confirmar manualmente.');return;}setState('Iniciando el cobro de esta venta…');const p=await mpPreparar(account.value),r=await mpRequest('transfer-start',mpPayload(p));if(!active())return;if(r.receipt){await mpCompletar(r.receipt,p);return;}if(!r.attempt?.createdAt)throw new Error('COBRO_NO_INICIADO');p.stage='transfer';p.startedAt=r.attempt.createdAt;mpGuardarPendiente(p);mostrarComprobacion();panel.querySelector('#mpVentana').textContent='Cobro iniciado: '+mpFechaIngreso(p.startedAt)+' · Plazo: 30 min';setState('');})();if(active()&&mpLeerPendiente()?.stage==='transfer')await updateTransfer(true);};
 panel.querySelector('#mpReintentarInicio').onclick=()=>iniciarTransferencia();
 panel.querySelector('#mpVolverCobro').onclick=()=>{if(!mpOperacionOcupada&&!mpLeerPendiente()&&active()){panel.querySelector('#mpComprobarCobro').hidden=true;panel.querySelector('#mpInicioCobro').hidden=false;panel.querySelector('#mpIniciarCobro').focus();}};
 // Las consultas automáticas (quiet) no deshabilitan los controles. Una acción del usuario
 // espera a que termine la consulta en curso y se descarta si el cobro cambió mientras tanto.
 let consultaEnCurso=null,fallosSeguidos=0;const marcaPendiente=()=>{const p=mpLeerPendiente();return JSON.stringify([p?.saleId||'',p?.stage||'']);};
 const run=(fn,quiet=false)=>async()=>{if(!active())return;if(mpOperacionOcupada){if(quiet||!consultaEnCurso)return;const antes=marcaPendiente();await consultaEnCurso;if(mpOperacionOcupada||!active()||antes!==marcaPendiente())return;}let resolverOperacion;mpOperacionActual=new Promise(r=>resolverOperacion=r);let terminar;if(quiet)consultaEnCurso=new Promise(r=>terminar=r);mpOperacionOcupada=true;if(!quiet)panel.querySelectorAll('button,select').forEach(x=>x.disabled=true);try{await fn();fallosSeguidos=0;}catch(e){fallosSeguidos++;if(active()&&panel.querySelector('#mpQR').getAttribute('aria-busy')==='true'){panel.querySelector('#mpQR').setAttribute('aria-busy','false');panel.querySelector('#mpQR').innerHTML='';}setState((mpLeerPendiente()?.stage==='verified'?'Pago confirmado por Mercado Pago. Falta terminar de registrar la venta. ':'')+mpMensaje(e.message)+(mpLeerPendiente()&&['creating','qr'].includes(mpLeerPendiente().stage)?' Seguimos consultando automáticamente.':''));}finally{mpOperacionOcupada=false;mpOperacionActual=null;resolverOperacion();if(terminar){consultaEnCurso=null;terminar();}if(active()){panel.querySelectorAll('button,select').forEach(x=>x.disabled=false);account.disabled=!!mpLeerPendiente();panel.querySelector('#mpReintentarInicio').hidden=!transferEnabled||!newPaymentsEnabled||mpLeerPendiente()?.stage!=='prepared';panel.querySelectorAll('[data-mp-ingreso]').forEach(x=>x.disabled=x.dataset.mpDisponible!=='1');actualizarEleccion();}}};
 // Con errores repetidos se espacian las consultas: 3 s, 6 s, 12 s y luego 15 s.
 const schedulePoll=()=>{clearTimeout(poll);const stage=mpLeerPendiente()?.stage;if(active()&&!mpSolicitaCierre&&['creating','qr','transfer','claiming'].includes(stage))poll=setTimeout(()=>['transfer','claiming'].includes(mpLeerPendiente()?.stage)?updateTransfer(true):update(true),Math.min(3000*2**Math.min(fallosSeguidos,3),15000));};
 const handleOrder=async(r,p)=>{
  if(!active())return;panel.querySelector('#mpQR').setAttribute('aria-busy','false');if(r.receipt){clearTimeout(poll);await mpCompletar(r.receipt,p,false,()=>{setState('Pago confirmado por Mercado Pago. Registrando la venta…');panel.querySelector('#mpQR').textContent='✓ Pago confirmado';});return;}mostrarComprobacion(true);
  if(['canceled','expired','manual'].includes(r.attempt?.status)){p.stage=r.attempt.status;mpGuardarPendiente(p);panel.querySelector('#mpQR').innerHTML='';setState(r.attempt.status==='expired'?'El QR venció. Podés confirmar el cobro manual.':r.attempt.status==='manual'?'El cobro fue confirmado manualmente. Cerrá el panel para terminar el registro.':'QR cancelado. Podés confirmar el cobro manual.');return;}
  p.stage='qr';mpGuardarPendiente(p);setState('Esperando el pago en Mercado Pago. Todavía no se registró la venta.');
  if(r.attempt?.qrData){const qr=qrcode(0,'M');qr.addData(r.attempt.qrData);qr.make();panel.querySelector('#mpQR').innerHTML=qr.createSvgTag({cellSize:4,margin:16,scalable:true});}
  schedulePoll();
 };
 const queryOrder=quiet=>run(async()=>{const p=mpLeerPendiente();if(p?.stage==='manual'){setState('Falta terminar de guardar el cobro manual.');return;}if(p)await handleOrder(await mpRequest('qr-status',mpPayload(p)),p);},quiet)();
 const update=async(quiet=false)=>{await queryOrder(quiet===true);schedulePoll();};
 panel.querySelector('#mpActualizarQR').onclick=()=>update();
 const generarQR=async()=>{await run(async()=>{if(!newPaymentsEnabled)throw new Error('NUEVOS_COBROS_DESHABILITADOS');if(!account.value){setState('Primero hay que conectar una cuenta desde Configuración.');return;}mostrarComprobacion(true);setState('Generando QR de Mercado Pago…');const qr=panel.querySelector('#mpQR');qr.setAttribute('aria-busy','true');qr.innerHTML='<div role="status" style="display:flex;align-items:center;gap:12px;padding:24px"><svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="50 26"><animateTransform attributeName="transform" type="rotate" from="0 16 16" to="360 16 16" dur="1s" repeatCount="indefinite"/></circle></svg><b>Generando QR…</b></div>';const p=await mpPreparar(account.value);p.stage='creating';mpGuardarPendiente(p);await handleOrder(await mpRequest('qr-create',mpPayload(p)),p);})();schedulePoll();};
 const renderTransfers=(r,p)=>{
  const list=panel.querySelector('#mpIngresos'),amount=totalTicket().toFixed(2),previous=selectedIncome;
  latestCandidates=mpCandidatosTransferencia(r.receipts,p.startedAt,r.truncated===true);
  selectedIncome=latestCandidates.length===1?{id:latestCandidates[0].id,saleId:p.saleId,accountId:p.accountId,amount,automatic:true}:previous&&!previous.automatic&&previous.saleId===p.saleId&&latestCandidates.some(t=>t.id===previous.id)?previous:null;
  const signature=JSON.stringify([latestCandidates,r.truncated===true]);
  if(list.dataset.mpSignature!==signature){list.dataset.mpSignature=signature;list.innerHTML=mpTransferenciaHTML(latestCandidates,r.truncated===true);
   list.querySelectorAll('[data-mp-ingreso]').forEach(b=>b.onclick=run(async()=>{if(!latestCandidates.some(t=>t.id===b.dataset.mpIngreso)||!active()||mpLeerPendiente()?.saleId!==p.saleId)return;selectedIncome={id:b.dataset.mpIngreso,saleId:p.saleId,accountId:p.accountId,amount,automatic:false};list.querySelectorAll('[data-mp-ingreso]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.mpIngreso===selectedIncome.id)));panel.querySelector('#mpConfirmarIngreso').hidden=!panel.querySelector('#mpManualConfirmacion').hidden;}));
  }
  list.querySelectorAll('[data-mp-ingreso]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mpIngreso===selectedIncome?.id)));
  panel.querySelector('#mpConfirmarIngreso').hidden=!selectedIncome||!panel.querySelector('#mpManualConfirmacion').hidden;
  const warning=panel.querySelector('#mpAmbiguedad');warning.hidden=latestCandidates.length<2;warning.textContent='Compará la hora con el comprobante del cliente. Si hay dudas, confirmá sin verificar.';
  panel.querySelector('#mpBuscar').hidden=!r.truncated;setState('');
 };
 const readTransfers=async()=>{
  if(!newPaymentsEnabled)throw new Error('NUEVOS_COBROS_DESHABILITADOS');if(!transferEnabled)throw new Error('TRANSFERENCIAS_NO_HABILITADAS');
  const p=mpLeerPendiente();if(!p||p.accountId!==account.value)throw new Error('COBRO_NO_INICIADO');
  const fingerprint=p.fingerprint,amount=totalTicket().toFixed(2),list=panel.querySelector('#mpIngresos');list.setAttribute('aria-busy','true');
  try{
   if(p.stage==='claiming'){const saved=await mpRequest('sale-receipts',{saleIds:[p.saleId]});if(!active()||mpSolicitaCierre||mpLeerPendiente()?.saleId!==p.saleId)return false;if(saved.receipts?.length){await mpCompletar(saved.receipts[0],p);return false;}}
   const r=await mpRequest('receipts',mpPayload(p));
   if(!active()||mpSolicitaCierre||mpLeerPendiente()?.saleId!==p.saleId||account.value!==p.accountId||totalTicket().toFixed(2)!==amount||fingerprint!==mpLeerPendiente()?.fingerprint)return false;
   renderTransfers(r,p);return true;
  }catch(e){selectedIncome=null;latestCandidates=[];if(active()){panel.querySelector('#mpConfirmarIngreso').hidden=true;panel.querySelector('#mpAmbiguedad').hidden=true;panel.querySelector('#mpBuscar').hidden=false;list.innerHTML='';delete list.dataset.mpSignature;}throw e;}finally{if(active())list.setAttribute('aria-busy','false');}
 };
 const updateTransfer=async(quiet=true)=>{await run(readTransfers,quiet)();schedulePoll();};
 panel.querySelector('#mpBuscar').onclick=()=>updateTransfer(false);
 panel.querySelector('#mpConfirmarIngreso').onclick=()=>{const chosen=selectedIncome?{...selectedIncome}:null;return run(async()=>{
  if(!chosen||chosen.saleId!==mpLeerPendiente()?.saleId||chosen.accountId!==account.value||chosen.amount!==totalTicket().toFixed(2))throw new Error('TICKET_CAMBIO');
  const fresh=await readTransfers();if(fresh!==true||!active()||mpSolicitaCierre||mpLeerPendiente()?.saleId!==chosen.saleId)return;
  if(!selectedIncome||selectedIncome.id!==chosen.id||chosen.automatic&&latestCandidates.length!==1){setState('Los ingresos cambiaron. Revisá la hora antes de confirmar.');return;}
  const p=await mpPreparar(chosen.accountId);if(!active()||mpSolicitaCierre||p.saleId!==chosen.saleId||mpLeerPendiente()?.saleId!==chosen.saleId)return;p.stage='claiming';mpGuardarPendiente(p);setState('Verificando el ingreso con Mercado Pago…');const r=await mpRequest('claim',{...mpPayload(p),paymentId:chosen.id});if(active())await mpCompletar(r.receipt,p);
 })();};
 panel.querySelector('#mpCobroManual').onclick=()=>{if(!active()||mpOperacionOcupada&&!consultaEnCurso)return;panel.querySelector('#mpManualConfirmacion').hidden=false;panel.querySelector('#mpCobroManual').hidden=true;panel.querySelector('#mpConfirmarIngreso').hidden=true;panel.querySelector('#mpManualConfirmar').focus();};
 panel.querySelector('#mpManualVolver').onclick=()=>{if(!active()||mpOperacionOcupada&&!consultaEnCurso)return;panel.querySelector('#mpManualConfirmacion').hidden=true;panel.querySelector('#mpCobroManual').hidden=false;panel.querySelector('#mpConfirmarIngreso').hidden=!selectedIncome;panel.querySelector('#mpCobroManual').focus();};
 panel.querySelector('#mpManualConfirmar').onclick=run(async()=>{
  let p=mpLeerPendiente();if(p){if(p.scope!==scope||p.fingerprint!==await mpFingerprint())throw new Error('TICKET_CAMBIO');
   if(['creating','qr'].includes(p.stage)){const r=await mpRequest('qr-cancel',mpPayload(p));if(r.receipt){await mpCompletar(r.receipt,p);return;}if(!['canceled','expired'].includes(r.attempt?.status))throw new Error('COBRO_PENDIENTE');p.stage=r.attempt.status;mpGuardarPendiente(p);}
   if(['claiming','verified'].includes(p.stage)){const r=await mpRequest('sale-receipts',{saleIds:[p.saleId]});if(r.receipts?.length){await mpCompletar(r.receipts[0],p);return;}}
   if(p.accountId&&p.stage!=='manual'){const r=await mpRequest('manual',mpPayload(p));if(r.receipt){await mpCompletar(r.receipt,p);return;}p.stage='manual';mpGuardarPendiente(p);}
  }else{const snapshot=mpSnapshot(),fingerprint=await mpFingerprint(snapshot);if(scope!==mpScope())throw new Error('SESION_INVALIDA');p={saleId:uid(),accountId:account.value,fingerprint,amount:snapshot.calculo.total.toFixed(2),snapshot,stage:'manual',scope};}
  mpGuardarPendiente(p);await mpCompletar(null,p,true);
 });
 if(pending){mostrarComprobacion(['creating','qr','canceled','expired'].includes(pending.stage));setState('Comprobando el estado del cobro…');}
 mpRequest('accounts').then(r=>{if(!active())return;cuentasListas=true;newPaymentsEnabled=r.capabilities?.newPayments!==false;panel.querySelector('#mpGenerarQR').hidden=!newPaymentsEnabled;transferEnabled=r.capabilities?.transferVerification===true||(!mpPublico()&&r.capabilities?.transferVerification!==false);panel.querySelector('#mpBuscar').hidden=true;account.innerHTML=(r.accounts||[]).map(a=>`<option value="${esc(a.id)}">${esc(a.alias)}${a.primary?' · principal':''}</option>`).join('')||'<option value="">Sin cuenta conectada</option>';account.value=pending?.accountId||(r.accounts||[]).find(a=>a.primary)?.id||r.accounts?.[0]?.id||'';account.disabled=!!pending;panel.querySelector('#mpReintentarInicio').hidden=!transferEnabled||!newPaymentsEnabled||mpLeerPendiente()?.stage!=='prepared';if(pending&&['transfer','claiming'].includes(mpLeerPendiente()?.stage)&&transferEnabled&&newPaymentsEnabled)void updateTransfer(true);actualizarEleccion();if(!pending)setState(r.accounts?.length?'':'Podés cobrar manualmente. Para verificar ingresos o cobrar con QR, falta conectar Mercado Pago en Configuración.');}).catch(()=>{cuentasListas=true;if(active())actualizarEleccion();if(!pending)setState('Podés cobrar manualmente. No pudimos consultar las cuentas conectadas.');});
 if(pending?.startedAt)panel.querySelector('#mpVentana').textContent='Inicio de este cobro: '+mpFechaIngreso(pending.startedAt)+' · Plazo original: 30 min';
 if(pending){account.innerHTML=`<option value="${esc(pending.accountId||'')}">Cuenta del cobro pendiente</option>`;account.disabled=true;if(['creating','qr'].includes(pending.stage)){setState('Consultando el cobro pendiente con Mercado Pago…');update(true);}else if(pending.stage==='verified')setState('El pago está verificado. Cerrá el panel para terminar de registrar la venta.');}
}
function mpCandidatosTransferencia(rows,startedAt,truncated=false){
 const start=Date.parse(startedAt);if(truncated||!Number.isFinite(start))return [];
 return [...new Map((Array.isArray(rows)?rows:[]).filter(t=>typeof t?.id==='string'&&t.id&&t.matches===true&&t.eligible===true&&!t.used&&Number.isFinite(Date.parse(t.date))&&Date.parse(t.date)>=start&&Date.parse(t.date)<=start+1800000).map(t=>[t.id,t])).values()];
}
function mpHoraIngreso(value){const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleTimeString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'}):'Hora no disponible';}
function mpTransferenciaHTML(rows,truncated=false){
 if(truncated)return '<p class="hint" role="status">Consulta incompleta. Volvé a intentar o confirmá sin verificar.</p>';
 if(!rows?.length)return '<p class="hint" role="status">Esperando la transferencia…</p>';
 if(rows.length===1){const t=rows[0];return `<div class="mp-ingreso-recibido" role="status"><b>Llegó ${$m(t.amountCents/100)} ✓</b><small>A las ${esc(mpHoraIngreso(t.date))}${t.payer?' · '+esc(t.payer):''}</small></div>`;}
 return `<p class="mp-ingresos-titulo">${rows.length} ingresos del mismo importe</p>`+rows.map(t=>`<button type="button" class="mp-ingreso-elegible" data-mp-ingreso="${esc(t.id)}" data-mp-disponible="1" aria-pressed="false"><span class="mp-ingreso-persona"><b>${esc(mpHoraIngreso(t.date))}</b>${t.payer?`<small>${esc(t.payer)}</small>`:''}</span><strong>${$m(t.amountCents/100)}</strong><span class="mp-ingreso-check" aria-hidden="true">✓</span><span class="sr-only">Elegir este ingreso</span></button>`).join('');
}
function mpFechaIngreso(value){const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'})+' (Argentina)':'Hora no disponible';}
function mpIngresosHTML(receipts,selectable=false,truncated=false){
 if(selectable){
  const available=(receipts||[]).filter(t=>t.matches&&t.eligible===true&&!t.used),unavailable=(receipts||[]).filter(t=>!available.includes(t));
  const content=t=>`<span class="mp-ingreso-persona"><b data-mp-payer="${esc(t.id)}" data-mp-sin-remitente="${t.payer?'0':'1'}">${esc(t.payer||'Remitente no informado')}</b><small>${esc(mpFechaIngreso(t.date))}</small></span><strong>${$m(t.amountCents/100)}</strong>`;
  const rows=available.map(t=>`<button type="button" class="mp-ingreso-elegible" data-mp-ingreso="${esc(t.id)}" data-mp-disponible="1" aria-pressed="false">${content(t)}<span class="mp-ingreso-check" aria-hidden="true">✓</span><span class="sr-only">Acreditado · Elegir este ingreso</span></button>`).join('');
  const blocked=unavailable.map(t=>`<div class="mp-ingreso-bloqueado">${content(t)}<small>${t.used?'Usado en otra venta':!t.matches?'Otro importe':'Anterior a este cobro o fuera del plazo'}</small></div>`).join('');
  return `<p class="mp-ingresos-titulo">Para esta venta</p>${rows||'<p class="hint">Todavía no hay ingresos disponibles.</p>'}${blocked?`<details class="mp-ingresos-no-disponibles"><summary>${unavailable.length} ingresos no disponibles</summary>${blocked}</details>`:''}`;
 }
 return (receipts||[]).map(t=>`<div class="mp-ingreso"><div><b>${$m(t.amountCents/100)}</b> <span class="mp-acreditado">Acreditado</span><small>${esc(mpFechaIngreso(t.date))}${t.payer?' · '+esc(t.payer):''}</small></div>${selectable?`<button type="button" class="btn ghost sm" data-mp-ingreso="${esc(t.id)}" data-mp-disponible="${t.matches&&t.eligible===true&&!t.used?'1':'0'}" aria-pressed="false" ${t.matches&&t.eligible===true&&!t.used?'':'disabled'}>${t.used?'Usado en una venta':!t.matches?'Otro importe':t.eligible!==true?'Fuera de la ventana':'Elegir'}</button>`:`<span class="hint">${t.used?'Usado en una venta':'Sin asociar a una venta'}</span>`}</div>`).join('')||`<div class="hint">${truncated?'No hay ingresos compatibles en la parte consultada. Puede haber más movimientos.':'No se encontraron ingresos acreditados compatibles en los últimos 3 días.'}</div>`;
}
function mpMontarIngresosCaja(root){
 if(root.querySelector('#mpVerIngresos')||typeof f5MembresiaActual!=='function')return;
 const member=f5MembresiaActual();if(!member||member.rol==='empleado'&&member.permisos?.ventas_registrar!==true)return;
 const head=root.querySelector('.head');if(!head)return;const button=document.createElement('button');button.type='button';button.className='btn ghost';button.id='mpVerIngresos';button.textContent='Ingresos de Mercado Pago';head.append(button);
 button.onclick=()=>modal({titulo:'Ingresos de la cuenta',cuerpo:'<p class="hint">Ingresos acreditados de los últimos 3 días. Consultarlos no registra ventas.</p><label class="f" for="mpHistorialCuenta">Cuenta receptora</label><select class="inp" id="mpHistorialCuenta"><option value="">Consultando cuentas…</option></select><button type="button" class="btn" id="mpHistorialConsultar" style="margin-top:12px" disabled>Consultar ingresos</button><p class="hint" id="mpHistorialEstado" role="status" aria-live="polite">Consultando cuentas conectadas…</p><div id="mpHistorialLista" aria-busy="false"></div>',pie:'<button class="btn ghost" data-cerrar>Volver a Caja</button>',alAbrir:ov=>{
  const scope=mpScope(),select=ov.querySelector('#mpHistorialCuenta'),consult=ov.querySelector('#mpHistorialConsultar'),state=ov.querySelector('#mpHistorialEstado'),list=ov.querySelector('#mpHistorialLista');const current=()=>ov.isConnected&&scope===mpScope();let busy=false;
  select.onchange=()=>{list.innerHTML='';state.textContent='Cuenta cambiada. Consultá sus ingresos.';};
  consult.onclick=async()=>{if(busy||!current()||!select.value)return;busy=true;consult.disabled=true;select.disabled=true;list.innerHTML='';list.setAttribute('aria-busy','true');consult.textContent='Consultando…';state.textContent='Consultando ingresos acreditados…';const accountId=select.value;try{const r=await mpRequest('income-history',{accountId});if(!current()||select.value!==accountId)return;list.innerHTML=mpIngresosHTML(r.receipts,false,r.truncated);state.textContent=(r.truncated?'Consulta recortada: puede haber más ingresos. ':'')+'Actualizado: '+new Date().toLocaleTimeString('es-AR')+'. Para asociar un ingreso, abrí el ticket en Vender.';}catch(e){if(current())state.textContent=mpMensaje(e.message);}finally{busy=false;if(current()){consult.disabled=!select.value;select.disabled=false;consult.textContent='Consultar ingresos';list.setAttribute('aria-busy','false');}}};
  mpRequest('accounts').then(r=>{if(!current())return;select.innerHTML=(r.accounts||[]).map(a=>`<option value="${esc(a.id)}">${esc(a.alias)}${a.primary?' · principal':''}</option>`).join('')||'<option value="">Sin cuenta conectada</option>';select.value=r.accounts?.find(a=>a.primary)?.id||r.accounts?.[0]?.id||'';consult.disabled=!select.value;state.textContent=select.value?'Consultá los ingresos de esta cuenta.':'Conectá una cuenta desde Configuración.';}).catch(e=>{if(current())state.textContent=mpMensaje(e.message);});
 }});
}
function mpMontarConfiguracion(root){
 if(typeof f5MembresiaActual!=='function'||f5MembresiaActual()?.rol!=='duenio')return;
 if(root.querySelector('#mpConfiguracion'))return;const card=document.createElement('div');card.className='card config-card';card.id='mpConfiguracion';card.style.marginBottom='16px';card.innerHTML='<div class="card-h"><h2>Mercado Pago</h2></div><div class="card-b"><p>Conectá las cuentas donde recibís los cobros. El personal autorizado podrá verificar transferencias y cobrar con QR desde Vender.</p><div id="mpCuentasEstado" role="status" aria-live="polite">Consultando conexión…</div><div id="mpCuentasLista"></div><a class="btn" id="mpPrepararConexion" href="https://www.mercadopago.com.ar/developers/panel/app" target="_blank" rel="noopener noreferrer" style="margin-top:12px" hidden>Configurar aplicación en Mercado Pago</a><div id="mpAltaCuenta" hidden><label class="f" for="mpCuentaNombre">Nombre de la cuenta (opcional)</label><input class="inp" id="mpCuentaNombre" maxlength="80" placeholder="Por ejemplo: Mercado Pago del local"><button type="button" class="btn" style="margin-top:12px" id="mpConectar" disabled>Conectar otra cuenta</button><p class="hint">Se abre Mercado Pago para iniciar sesión y autorizar esta cuenta. Una cuenta se usa como principal.</p></div></div>';root.querySelector('#cf-caja')?.after(card);
 const scope=mpScope(),state=card.querySelector('#mpCuentasEstado'),list=card.querySelector('#mpCuentasLista'),connect=card.querySelector('#mpConectar');let busy=false,configured=false;const current=()=>card.isConnected&&scope===mpScope();
 const mostrarConexion=enabled=>{configured=enabled===true;card.querySelector('#mpAltaCuenta').hidden=!configured;card.querySelector('#mpPrepararConexion').hidden=configured||mpPublico();connect.disabled=!configured||busy;state.textContent=configured?'Conectá una cuenta o administrá las existentes.':mpPublico()?'La conexión de MiComercio con Mercado Pago está pendiente de activación. Podés seguir cobrando manualmente.':'La conexión de MiComercio con Mercado Pago todavía no está habilitada. Primero hay que configurar su aplicación; iniciar sesión en el panel por sí solo no vincula una cuenta. Podés seguir cobrando manualmente.';};
 const run=fn=>async()=>{if(busy||!current())return;busy=true;connect.disabled=true;try{await fn();}catch(e){if(current()){if(e.message==='APLICACION_NO_CONFIGURADA')mostrarConexion(false);else state.textContent=mpMensaje(e.message);}}finally{busy=false;if(current())connect.disabled=!configured;}};
 const load=async()=>{const r=await mpRequest('accounts');if(!current())return;mostrarConexion(r.configured);if(mpRetornoOAuth){const resultado=mpRetornoOAuth;mpRetornoOAuth=null;state.textContent=resultado==='conectado'&&r.configured&&r.accounts?.length?'Cuenta conectada. Elegí su caja de Mercado Pago para cobrar con QR.':'No se pudo completar la autorización. Volvé a conectar tu cuenta.';}list.innerHTML=(r.accounts||[]).map(a=>`<div class="mp-ingreso"><div><b>${esc(a.alias)}</b><small>${a.primary?'Cuenta principal':'Cuenta adicional'} · ${a.posId?'QR configurado':'Falta elegir caja para QR'}</small></div><div class="row"><button class="btn ghost sm" data-mp-principal="${esc(a.id)}" ${a.primary?'disabled':''}>Usar como principal</button><button class="btn ghost sm" data-mp-caja="${esc(a.id)}">Elegir caja QR</button><button class="btn ghost sm" data-mp-desconectar="${esc(a.id)}">Desconectar</button></div></div>`).join('');
  list.querySelectorAll('[data-mp-principal]').forEach(b=>b.onclick=run(async()=>{await mpRequest('primary',{accountId:b.dataset.mpPrincipal});await load();}));
  list.querySelectorAll('[data-mp-desconectar]').forEach(b=>b.onclick=()=>confirmar('Desconectar cuenta','No se podrán consultar nuevos ingresos ni generar QR con esta cuenta.',()=>run(async()=>{await mpRequest('disconnect',{accountId:b.dataset.mpDesconectar});await load();})(),'Desconectar'));
  list.querySelectorAll('[data-mp-caja]').forEach(b=>b.onclick=run(async()=>{const r=await mpRequest('positions',{accountId:b.dataset.mpCaja});if(!current())return;modal({titulo:'Caja de Mercado Pago',cuerpo:r.positions.length?`<label class="f" for="mpCajaQR">Dónde se cobran los QR</label><select class="inp" id="mpCajaQR">${r.positions.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select>`:'Primero creá una caja en la configuración de tu cuenta de Mercado Pago. Después volvé a elegirla acá.',pie:'<button class="btn ghost" data-cerrar>Volver</button>'+(r.positions.length?'<button class="btn" id="mpGuardarCaja">Guardar caja</button>':''),alAbrir:ov=>{ov.querySelector('#mpGuardarCaja')?.addEventListener('click',run(async()=>{await mpRequest('set-position',{accountId:b.dataset.mpCaja,posId:ov.querySelector('#mpCajaQR').value});cerrarModal();await load();}));}});}));
 };
 connect.onclick=run(async()=>{if(!configured){mostrarConexion(false);return;}const alias=card.querySelector('#mpCuentaNombre').value.trim()||'Mercado Pago';state.textContent='Abriendo la autorización de Mercado Pago…';const r=await mpRequest('oauth-start',{alias});if(!current())return;if(!r.url?.startsWith('https://auth.mercadopago.com/authorization?'))throw new Error('CONEXION_NO_DISPONIBLE');location.assign(r.url);});load().catch(()=>{if(current())state.textContent='La conexión con Mercado Pago no está disponible. Podés seguir cobrando manualmente.';});
}
