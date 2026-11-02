import {defineConfig} from 'vite';
import {inventory} from './assets/realistic/inventory.mjs';
export default defineConfig({plugins:[{name:'realistic-inventory',configureServer(server){server.middlewares.use('/assets/realistic/generated/inventory.json',(_req,res)=>{try{res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(inventory()));}catch(e){res.statusCode=500;res.end(JSON.stringify({error:e.message}));}});}}]});
