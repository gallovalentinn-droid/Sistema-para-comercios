import {fail} from './mp-core.mjs';

// Credentials never leave the trusted backend; callers must authorize before this adapter.
export class RpcStore {
  constructor(config,fetcher=fetch){this.config=config;this.fetcher=fetcher;}
  async call(op,args={}){
    let r;
    try {r=await this.fetcher(this.config.url+'/rest/v1/rpc/mp_publico_store',{method:'POST',headers:{'content-type':'application/json',apikey:this.config.serviceKey,authorization:'Bearer '+this.config.serviceKey},body:JSON.stringify({p_op:op,p_args:args}),signal:AbortSignal.timeout(10000)});}catch {fail('CONEXION_NO_DISPONIBLE',503);}
    if(!r.ok){let data;try{data=await r.json();}catch{/* no raw errors */}
      const code=data?.message;
      const allowed=new Set(['CUENTA_NO_DISPONIBLE','CUENTA_OTRO_COMERCIO','COBRO_PENDIENTE','TICKET_CAMBIO','TRANSFERENCIA_UTILIZADA','VENTA_YA_VERIFICADA','COBRO_OCUPADO','RECONECTAR_CUENTA','QR_PENDIENTE','COBRO_FINALIZADO_MANUAL']);
      fail(allowed.has(code)?code:'CONEXION_NO_DISPONIBLE');
    }
    try{return await r.json();}catch{fail('CONEXION_NO_DISPONIBLE',503);}
  }
}
