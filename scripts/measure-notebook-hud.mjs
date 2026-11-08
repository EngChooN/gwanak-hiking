// 등산 수첩 HUD 성능: 같은 장면에서 HUD 보이기/숨기기(H)를 번갈아 fps·프레임 시간·레이아웃·스타일 재계산 횟수를 잰다.
// 장면: 자동 걷기 중(진행 카드·도장·스테미너가 매 프레임 바뀌는 상태) × 낮·밤.
// 기기: PC 높음(1440×900, DPR 1) / 휴대폰 가로·세로 화질 낮음(DPR 3, 터치).
// 사용: 개발 서버(npx vite --host 127.0.0.1 --port 5311)를 띄운 뒤 node scripts/measure-notebook-hud.mjs [--uncapped 1] [--seconds 8]
// 결과: artifacts/ui-concepts/impl/perf[-uncapped].json
import {chromium} from '@playwright/test';
import {writeFileSync,mkdirSync} from 'node:fs';
import {waitChunks} from './lib/chunk-wait.mjs';

const argv=process.argv.slice(2),opt={};
for(let i=0;i<argv.length;i++)if(argv[i].startsWith('--')){opt[argv[i].slice(2)]=argv[i+1];i++;}
const base=opt.base??'http://127.0.0.1:5311',seconds=Number(opt.seconds??8);
const devices={
 pc:{viewport:{width:1440,height:900},deviceScaleFactor:1,quality:'high'},
 land:{viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true,quality:'low'},
 port:{viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,quality:'low'},
};
const scenes=[{name:'day',time:'14:20'},{name:'night',time:'21:40'}];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal',...(opt.uncapped?['--disable-gpu-vsync','--disable-frame-rate-limit']:[])]});
const out={seconds,uncapped:!!opt.uncapped,results:{}};
try{
 for(const [device,d] of Object.entries(devices))for(const scene of scenes){
  if(opt.only&&!opt.only.split(',').includes(`${device}-${scene.name}`))continue;
  const {quality,...ctx}=d,context=await browser.newContext(ctx);
  await context.addInitScript(()=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');localStorage.setItem('gwanak-stick-used','1');});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,200));});
  await page.goto(`${base}/hiking/?${new URLSearchParams({start:'demo',time:scene.time,weather:'clear',quality})}`);
  await page.waitForFunction(()=>window.hiking?.started&&!window.hiking.rendering().compiling,null,{timeout:300000});
  await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(x=>x.close()));
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'auto'}})));
  await waitChunks(page);await page.waitForTimeout(3000);
  const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
  const metric=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
  const runs={};
  // 보이기 → 숨기기 → 보이기 순서로 재서 걷는 위치 차이를 평균에서 상쇄한다.
  for(const [i,hud] of ['shown','hidden','shown2'].entries()){
   const wantHidden=hud==='hidden';
   if((await page.evaluate(()=>document.getElementById('app').classList.contains('hud-hidden')))!==wantHidden)await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:hud-toggle')));
   await page.waitForTimeout(1200);
   const m0=await metric();await page.evaluate(()=>window.__hikingPerformance.reset());
   await page.waitForTimeout(seconds*1000);
   const m1=await metric();
   const r=await page.evaluate(()=>{const r=window.__hikingPerformance.report();return {fps:r.fps,p95Ms:r.p95Ms,p99Ms:r.p99Ms,over50ms:r.over50ms,frames:r.frames};});
   r.layoutsPerSec=(m1.LayoutCount-m0.LayoutCount)/seconds;r.styleRecalcsPerSec=(m1.RecalcStyleCount-m0.RecalcStyleCount)/seconds;
   r.layoutMsPerSec=(m1.LayoutDuration-m0.LayoutDuration)*1000/seconds;r.styleMsPerSec=(m1.RecalcStyleDuration-m0.RecalcStyleDuration)*1000/seconds;
   runs[hud]=r;
   console.log(device,scene.name,hud,`fps ${r.fps.toFixed(1)} p95 ${r.p95Ms.toFixed(1)}ms 50ms초과 ${r.over50ms} 레이아웃 ${r.layoutsPerSec.toFixed(1)}/s(${r.layoutMsPerSec.toFixed(2)}ms/s) 스타일 ${r.styleRecalcsPerSec.toFixed(1)}/s(${r.styleMsPerSec.toFixed(2)}ms/s)`);
  }
  out.results[`${device}-${scene.name}`]={...runs,errors};
  if(errors.length)console.log('  오류',errors);
  await context.close();
 }
}finally{await browser.close();}
mkdirSync('artifacts/ui-concepts/impl',{recursive:true});
writeFileSync(`artifacts/ui-concepts/impl/perf${opt.uncapped?'-uncapped':''}.json`,JSON.stringify(out,null,1));
