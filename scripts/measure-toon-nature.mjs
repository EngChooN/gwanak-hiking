// 카툰 자연물 성능(카툰 2차, 산풍경): 낮 숲길·계곡·능선·정상에서 fps·프레임 시간·그리기 호출·삼각형을 잰다.
// 기기: PC 높음(1440×810) / 모바일 화질 0(390×844, DPR 3, 터치).
// 사용: 개발 서버를 띄운 뒤 node scripts/measure-toon-nature.mjs --base http://127.0.0.1:5320 --tag after
// --only pc-forest,mobile-valley: 일부 조합만. --uncapped 1: 60Hz 상한을 풀어 GPU 여유까지 fps로 비교한다.
// 결과: artifacts/cartoon-compare/nature/perf-<tag>.json
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
 {name:'entrance',s:300},
 {name:'forest',s:1300},
 {name:'valley',s:1500,lateral:-3},
 {name:'ridge',s:4950},
 {name:'summit',start:'summit'},
];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal',...(opt.uncapped?['--disable-gpu-vsync','--disable-frame-rate-limit']:[])]});
const out={tag,seconds,uncapped:!!opt.uncapped,results:{}};
try{
 for(const [device,d] of Object.entries(devices))for(const scene of scenes)for(let attempt=1;attempt<=3;attempt++){
  if(opt.only&&!opt.only.split(',').includes(`${device}-${scene.name}`))break;
  // 개발 서버가 다른 파일 수정으로 페이지를 다시 불러오면 측정이 깨진다 → 그 장면만 다시 잰다(최대 3번).
  const {quality,...ctx}=d,context=await browser.newContext(ctx);
  try{
  // 코스 위 자리는 저장 상태를 심어 그 지점에서 시작한다(cartoon-compare.mjs와 같은 방식).
  let save=null;
  if(scene.s!==undefined){const probe=await context.newPage();await probe.goto(`${base}/?style=toon&startMode=manual`,{waitUntil:'domcontentloaded'});
   save=await probe.evaluate(async ({s,lateral})=>{const {initialState}=await import('/src/movement.js');return JSON.stringify({...initialState({start:'demo'}),s,lateral:lateral??0,zone:'route'});},scene);await probe.close();}
  await context.addInitScript(save=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');if(save)localStorage.setItem('gwanak-hiking:v1',save);},save);
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||/THREE\.WebGLProgram/.test(m.text()))errors.push(m.text().slice(0,200));});
  const q=new URLSearchParams({style:'toon',outfit:'1',time:'11:00',weather:'clear',quality});
  if(scene.start)q.set('start',scene.start);
  await page.goto(`${base}/?${q}`);
  for(let i=0;;i++){try{await page.waitForFunction(()=>window.hiking?.started&&window.hiking.landscape().natureReady&&!window.hiking.rendering().compiling,null,{timeout:300000});break;}catch(e){if(i>=3||!/destroyed|navigation/.test(e.message))throw e;await page.waitForLoadState('load');}}
  await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(x=>x.close()));
  if(await page.evaluate(()=>window.hiking.snapshot().paused))await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'pause'}})));
  await waitChunks(page);await page.waitForTimeout(3000);
  await page.evaluate(()=>window.__hikingPerformance.reset());
  await page.waitForTimeout(seconds*1000);
  const r=await page.evaluate(()=>{const r=window.__hikingPerformance.report();return {fps:r.fps,p95Ms:r.p95Ms,p99Ms:r.p99Ms,over50ms:r.over50ms,frames:r.frames,renderCpuMs:r.cpuMs.render,drawCalls:r.drawCalls,triangles:r.triangles};});
  out.results[`${device}-${scene.name}`]={...r,errors};
  if(!r.frames)throw new Error('프레임 0(측정 중 다시 불러옴)');
  console.log(device,scene.name,`fps ${r.fps.toFixed(1)} p95 ${r.p95Ms.toFixed(1)}ms 렌더CPU ${r.renderCpuMs.toFixed(2)}ms 호출 ${Math.round(r.drawCalls)} 삼각형 ${Math.round(r.triangles)} 오류 ${errors.length}`);
  await context.close();break;
  }catch(e){await context.close().catch(()=>{});console.log(device,scene.name,`다시 잼(${attempt}/3): ${e.message.split('\n')[0].slice(0,120)}`);}
 }
}finally{await browser.close();}
mkdirSync('artifacts/cartoon-compare/nature',{recursive:true});
writeFileSync(`artifacts/cartoon-compare/nature/perf-${tag}${opt.uncapped?'-uncapped':''}.json`,JSON.stringify(out,null,1));
