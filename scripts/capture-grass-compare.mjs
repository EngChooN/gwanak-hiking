// 최적화 전후 풀 비교 캡처(피드백 7번 후속): 광장·숲길·정상을 같은 자리·시각·화질로 찍고 그 프레임의 하층 식생 삼각형을 남긴다.
// 사용: LABEL=before node scripts/capture-grass-compare.mjs  (개발 서버 BASE_URL, 기본 http://127.0.0.1:5176)
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const label=process.env.LABEL??'after',base=process.env.BASE_URL??'http://127.0.0.1:5176';
const folder=process.env.OUT??'artifacts/performance-opt-after-2026-11-06/grass-compare';await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const results={label,date:new Date().toISOString(),base,viewport:'1440×900',spots:[],errors:[]};
try{
 const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
 await context.addInitScript(()=>localStorage.setItem('gwanak-sound-enabled','false'));
 const page=await context.newPage();page.on('pageerror',e=>results.errors.push(e.message));
 await page.goto(`${base}/?outfit=1&start=entrance&time=12:00&weather=clear&quality=high`);
 await page.waitForFunction(()=>window.hiking?.started&&window.hiking.landscape().ready&&window.hiking.landscape().natureReady,null,{timeout:300000});
 const settle=async()=>{
  await page.evaluate(()=>window.hiking.chunks.ready());
  await page.waitForFunction(()=>{const s=window.hiking.chunks.status();return s.pending===0&&(!s.vegetation||s.vegetation.pending===0)&&!window.hiking.rendering().compiling;},null,{timeout:120000});
  await page.waitForTimeout(4000);
 };
 const targets=await page.evaluate(()=>window.hiking.jumpTargets());
 const forest=targets.filter(id=>!['plaza','gate','summit'].includes(id))[Math.floor((targets.length-3)/2)];
 for(const [name,id] of [['plaza','plaza'],['forest',forest],['summit','summit']]){
  if(!(await page.evaluate(id=>window.hiking.jumpTo(id),id)))throw new Error('이동 실패 '+id);
  await settle();
  await page.evaluate(()=>window.__hikingPerformance.reset());await page.waitForTimeout(1500);
  const metrics=await page.evaluate(()=>{const r=window.__hikingPerformance.report();return {frames:r.frames,triangles:r.triangles,drawCalls:r.drawCalls,undergrowth:r.categories['하층 식생']??null,orientation:window.hiking.orientation().camera};});
  await page.screenshot({path:`${folder}/${label}-${name}.png`});
  results.spots.push({name,target:id,...metrics});
 }
}finally{await browser.close();}
await writeFile(`${folder}/${label}.json`,JSON.stringify(results,null,1));
console.log(JSON.stringify(results.spots.map(s=>({name:s.name,target:s.target,triangles:Math.round(s.triangles),undergrowth:Math.round(s.undergrowth?.triangles??0)})))) ;
if(results.errors.length)console.error(results.errors);
