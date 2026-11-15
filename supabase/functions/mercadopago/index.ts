import { configuration, createApiHandler } from '../_shared/mp-core.mjs';
import { RpcStore } from '../_shared/mp-store.mjs';

const config = configuration(Deno.env.toObject());
Deno.serve(createApiHandler({ config, store: new RpcStore(config) }));
