// 그래픽 모드별 네트워크 격리 검사(기획서 §2.3). ?style=realistic / ?style=toon 을 각각 열어 요청 URL을 모두 기록하고
// 다른 모드 전용 코드·에셋 요청이 0건인지 확인한다. 선택 화면(#style-chooser)도 webdriver를 끈 창에서 한 번 확인한다.
// 사용: npm run build && npx vite preview --host 127.0.0.1 --port 4173 을 띄운 뒤
//   BASE_URL=http://127.0.0.1:4173 node scripts/verify-style-network.mjs [출력 폴더]
// 개발 서버(vite dev)는 모듈을 원래 경로로 내보내 assets/realistic/generated/nature/forest-layers.js 같은 공용 코드도
// 금지 경로로 잡힌다. 실제 배포와 같은 빌드(preview)로 검사한다.
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';

const out=process.argv[2]??'artifacts/ab-chunks-2026-11-05',base=process.env.BASE_URL||'http://127.0.0.1:4173';
mkdirSync(out,{recursive:true});
export const FORBIDDEN={
 realistic:[[/\/assets\/toon\//,'카툰 에셋'],[/\/src\/toon\//,'카툰 소스'],[/\/assets\/mode-toon-/,'카툰 코드 청크']],
 toon:[[/-diff\.jpg(\?|$)/,'PBR 색 텍스처'],[/-nor_gl\.png(\?|$)/,'PBR 법선 텍스처'],[/-rough\.jpg(\?|$)/,'PBR 거칠기 텍스처'],[/\.hdr(\?|$)/,'HDR'],
  [/\/assets\/realistic\/generated\/nature\//,'실사 식생 에셋'],[/\/assets\/mode-realistic-/,'실사 코드 청크'],[/terrain-material\.js/,'실사 지형 셰이더']],
};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const summary={base,modes:{}};
for(const style of ['realistic','toon']){
 const ctx=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1});
 const page=await ctx.newPage(),requests=[],errors=[],failed=[];
 page.on('request',r=>requests.push(r.url()));
 page.on('requestfailed',r=>failed.push(`${r.url()} ${r.failure()?.errorText??''}`));
 page.on('response',r=>{if(r.status()>=400)failed.push(`${r.url()} HTTP ${r.status()}`);});
 page.on('pageerror',e=>errors.push(e.message));
 const t0=Date.now();
 await page.goto(`${base}/?style=${style}&outfit=1&start=entrance&time=12:00&weather=clear`);
 let started=false,loadError=null;
 try{await page.waitForFunction(()=>window.hiking?.started===true||window.hiking?.loading?.().phase==='error',null,{timeout:300000});started=await page.evaluate(()=>window.hiking.started===true);if(!started)loadError=await page.evaluate(()=>window.hiking.loading());}
 catch(e){loadError=e.message;}
 const seconds=(Date.now()-t0)/1000;
 await page.waitForTimeout(3000);
 const info=started?await page.evaluate(()=>({style:window.hiking.style,dataset:document.documentElement.dataset.style,chunks:window.hiking.chunks.status(),errors:window.hiking.landscape().errors,shaderErrors:window.hiking.rendering().shaderErrors,memory:window.__hikingMetrics?null:null})):null;
 await (await waitChunks(page)).screenshot({path:`${out}/start-${style}.png`});
 const violations=[];for(const url of requests){const path=new URL(url).pathname;for(const [pattern,label] of FORBIDDEN[style])if(pattern.test(decodeURIComponent(path)))violations.push({label,url:path});}
 const sameOrigin=requests.filter(u=>u.startsWith(base)).map(u=>decodeURIComponent(new URL(u).pathname));
 summary.modes[style]={started,seconds,loadError,info,requests:sameOrigin.length,external:requests.filter(u=>!u.startsWith(base)).map(u=>new URL(u).origin).filter((v,i,a)=>a.indexOf(v)===i),violations,pageErrors:errors,failed:[...new Set(failed)],
  counts:{chunkTerrain:sameOrigin.filter(p=>p.includes('/assets/shared/chunks/terrain/')).length,toonAssets:sameOrigin.filter(p=>p.includes('/assets/toon/')).length,realisticNature:sameOrigin.filter(p=>p.includes('/assets/realistic/generated/nature/')).length,pbr:sameOrigin.filter(p=>/-(diff|rough)\.jpg$|-nor_gl\.png$/.test(p)).length,hdr:sameOrigin.filter(p=>p.endsWith('.hdr')).length}};
 writeFileSync(`${out}/network-${style}.txt`,sameOrigin.join('\n')+'\n');
 await ctx.close();
}
// 선택 화면: 자동화 표시(webdriver)를 끈 창에서 ?style 없이 열면 #style-chooser가 보이고, 카드를 누르면 저장·진입한다.
{
 const ctx=await browser.newContext({viewport:{width:1280,height:800}});
 await ctx.addInitScript(()=>{Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false});});
 const page=await ctx.newPage(),requests=[];page.on('request',r=>requests.push(r.url()));
 await page.goto(`${base}/?outfit=1`);await page.waitForSelector('#style-chooser:not([hidden])',{timeout:20000});
 const beforeMain=requests.filter(u=>/\/(main|three\.module)[-.]|\/src\/main\.js/.test(u)).length;
 await (await waitChunks(page)).screenshot({path:`${out}/chooser.png`});
 await page.click('[data-style="toon"]');
 await page.waitForFunction(()=>document.documentElement.dataset.style==='toon'&&!!window.hiking,null,{timeout:60000});
 const after=await page.evaluate(()=>({stored:localStorage.getItem('gwanak-graphics-style'),dataset:document.documentElement.dataset.style,chooserHidden:document.getElementById('style-chooser').hidden,style:window.hiking.style}));
 await page.reload();await page.waitForFunction(()=>!!window.hiking,null,{timeout:60000});
 const remembered=await page.evaluate(()=>({style:window.hiking.style,chooserHidden:document.getElementById('style-chooser').hidden}));
 summary.chooser={threeOrMainBeforeChoice:beforeMain,after,remembered};
 await ctx.close();
}
await browser.close();
const total=Object.values(summary.modes).reduce((n,m)=>n+m.violations.length,0);
summary.violations=total;summary.ok=total===0&&Object.values(summary.modes).every(m=>m.started&&!m.pageErrors.length)&&summary.chooser.threeOrMainBeforeChoice===0&&summary.chooser.remembered.style==='toon';
writeFileSync(`${out}/verify-style-network.json`,JSON.stringify(summary,null,1));
console.log(JSON.stringify({ok:summary.ok,violations:total,modes:Object.fromEntries(Object.entries(summary.modes).map(([k,m])=>[k,{started:m.started,seconds:m.seconds,requests:m.requests,violations:m.violations.length,pageErrors:m.pageErrors,failed:m.failed.slice(0,8),counts:m.counts,chunks:m.info?.chunks&&{loaded:m.info.chunks.loaded,ids:m.info.chunks.ids.length,veg:m.info.chunks.vegetation?.loaded},landscapeErrors:m.info?.errors,shaderErrors:m.info?.shaderErrors?.length}])),chooser:summary.chooser},null,1));
process.exit(summary.ok?0:1);
