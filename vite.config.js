import {defineConfig} from 'vite';
import {inventory} from './assets/realistic/inventory.mjs';
// GitHub Pages 하위 경로 배포는 BASE_PATH=/gwanak-hiking/ 로 빌드한다(scripts/deploy-pages.mjs). 기본은 '/'.
const base=process.env.BASE_PATH||'/';
export default defineConfig({base,build:{sourcemap:true},plugins:[{name:'realistic-inventory',configureServer(server){server.middlewares.use('/assets/realistic/generated/inventory.json',(_req,res)=>{try{res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(inventory()));}catch(e){res.statusCode=500;res.end(JSON.stringify({error:e.message}));}});}}]});
