// 카툰 도심 성능: 정상에서 서울 쪽(방위 345.6°)을 볼 때 fps·프레임 시간·그리기 호출·삼각형을 잰다.
// 장면: 밤 1배, 밤 쌍안경 8배, 노을 1배. 기기: PC 높음(1440×810) / 모바일 화질 0(390×844, DPR 3, 터치).
// 사용: 개발 서버(npx vite --host 127.0.0.1 --port 5310)를 띄운 뒤 node scripts/measure-toon-city.mjs --tag before
// --only pc-night,mobile-night: 일부 조합만.
// --uncapped 1: 화면 주기(60Hz) 상한을 풀어 GPU 여유까지 fps로 비교한다.
// 결과: artifacts/cartoon-compare/city/perf-<tag>.json
import {chromium} from '@playwright/test';
import {writeFileSync,mkdirSync} from 'node:fs';
import {waitChunks} from './lib/chunk-wait.mjs';

const argv=process.argv.slice(2),opt={};
for(let i=0;i<argv.length;i++)if(argv[i].startsWith('--')){opt[argv[i].slice(2)]=argv[i+1];i++;}
const base=opt.base??'http://127.0.0.1:5310',tag=opt.tag??'now',seconds=Number(opt.seconds??6);
const devices={
 pc:{viewport:{width:1440,height:810},deviceScaleFactor:1,quality:'high'},
 mobile:{viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,quality:'low'},
};
const scenes=[
 {name:'night',time:'20:30'},
 {name:'night-bino',time:'20:30',bino:true},
 {name:'dusk',time:'17:40'},
];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal',...(opt.uncapped?['--disable-gpu-vsync','--disable-frame-rate-limit']:[])]});
const out={tag,seconds,uncapped:!!opt.uncapped,results:{}};
try{
 for(const [device,d] of Object.entries(devices))for(const scene of scenes){
  if(opt.only&&!opt.only.split(',').includes(`${device}-${scene.name}`))continue;
  const {quality,...ctx}=d,context=await browser.newContext(ctx);
  await context.addInitScript(()=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,200));});
  await page.goto(`${base}/hiking/?${new URLSearchParams({style:'toon',outfit:'1',start:'summit',bearing:'345.6',time:scene.time,weather:'clear',quality})}`);
  // 시작 화면이 한 번 다시 불러올 수 있어(저장 상태 정리) 준비될 때까지 몇 번 다시 기다린다.
  for(let i=0;;i++){try{await page.waitForFunction(()=>window.hiking?.started&&window.hiking.landscape().natureReady&&!window.hiking.rendering().compiling,null,{timeout:300000});break;}catch(e){if(i>=3||!/destroyed|navigation/.test(e.message))throw e;await page.waitForLoadState('load');}}
  await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(x=>x.close()));
  if(await page.evaluate(()=>window.hiking.snapshot().paused))await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'pause'}})));
  if(scene.bino)await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'binoculars'}})));
  await waitChunks(page);await page.waitForTimeout(3000);
  await page.evaluate(()=>window.__hikingPerformance.reset());
  await page.waitForTimeout(seconds*1000);
  const r=await page.evaluate(()=>{const r=window.__hikingPerformance.report();return {fps:r.fps,p95Ms:r.p95Ms,p99Ms:r.p99Ms,over50ms:r.over50ms,frames:r.frames,renderCpuMs:r.cpuMs.render,drawCalls:r.drawCalls,triangles:r.triangles,city:window.hiking.rendering().toon?.city??null};});
  out.results[`${device}-${scene.name}`]={...r,errors};
  console.log(device,scene.name,`fps ${r.fps.toFixed(1)} p95 ${r.p95Ms.toFixed(1)}ms 렌더CPU ${r.renderCpuMs.toFixed(2)}ms 호출 ${Math.round(r.drawCalls)} 삼각형 ${Math.round(r.triangles)} 오류 ${errors.length}`);
  await context.close();
 }
}finally{await browser.close();}
mkdirSync('artifacts/cartoon-compare/city',{recursive:true});
writeFileSync(`artifacts/cartoon-compare/city/perf-${tag}${opt.uncapped?'-uncapped':''}.json`,JSON.stringify(out,null,1));
