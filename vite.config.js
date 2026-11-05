import {defineConfig} from 'vite';
import {inventory} from './assets/realistic/inventory.mjs';
// GitHub Pages 하위 경로 배포는 BASE_PATH=/gwanak-hiking/ 로 빌드한다(scripts/deploy-pages.mjs). 기본은 '/'.
const base=process.env.BASE_PATH||'/';
// 그래픽 모드별 코드 분할(기획서 §2.3). 동적 import가 이미 청크를 나누므로 manualChunks는 쓰지 않는다
// (manualChunks는 공용 의존성 three까지 그 청크로 끌어가 실사 모드도 카툰 파일을 받게 된다).
// 대신 모드 전용 동적 청크에 이름을 붙여 scripts/verify-style-network.mjs가 다른 모드의 코드 요청을 파일 이름으로 찾게 한다.
const MODE_CHUNKS=[['/src/toon/','mode-toon'],['/assets/realistic/terrain-material.js','mode-realistic'],['/loaders/RGBELoader.js','mode-realistic'],['/postprocessing/SSAOPass.js','mode-realistic']];
function chunkFileNames(info){
 const facade=(info.facadeModuleId??'').split('?')[0].replaceAll('\\','/');
 const mode=MODE_CHUNKS.find(([path])=>facade.includes(path))?.[1];
 return mode?`assets/${mode}-[name]-[hash].js`:'assets/[name]-[hash].js';
}
export default defineConfig({base,build:{sourcemap:true,rollupOptions:{output:{chunkFileNames}}},plugins:[{name:'realistic-inventory',configureServer(server){server.middlewares.use('/assets/realistic/generated/inventory.json',(_req,res)=>{try{res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(inventory()));}catch(e){res.statusCode=500;res.end(JSON.stringify({error:e.message}));}});}}]});
