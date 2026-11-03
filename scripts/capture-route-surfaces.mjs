import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {route,isStairs,durationBetween,SPEED_CALIBRATION,STAIR_SECONDS,NONSTAIR_BASE_SECONDS,speedFor} from '../src/route.js';
import {SURFACE_SECTIONS} from '../src/route-surfaces.js';
import {initialState,SAVE_KEY} from '../src/movement.js';
import {contactEdgeMetric} from './contact-edge-metric.mjs';
const base=process.env.BASE_URL??'http://127.0.0.1:5176',folder='artifacts/route-surfaces';
const segment=route.segments.filter(s=>isStairs(s.material)&&s.slope>=.20&&s.slope<=.25&&s.length>1).sort((a,b)=>Math.abs(a.slope-.225)-Math.abs(b.slope-.225))[0];
if(!segment)throw new Error('20~25% 실제 계단 구간 없음: 화면 검증 위치를 다시 선정해야 함');
await mkdir(folder,{recursive:true});
const result={date:new Date().toISOString(),minutes:durationBetween(0,route.length)/60,calibration:SPEED_CALIBRATION,stairSeconds:STAIR_SECONDS,nonstairBaseSeconds:NONSTAIR_BASE_SECONDS,sections:SURFACE_SECTIONS.map(row=>({...row,seconds:route.segments.filter(s=>s.a.section===row.id).reduce((sum,s)=>sum+s.length/speedFor(s.slope,s.material),0)})),capture:{s:segment.start+Math.min(.5,segment.length/2),grade:segment.slope,material:segment.material},errors:[],screens:[]};
const browser=await chromium.launch({channel:'chrome',headless:process.env.HEADED!=='1',args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
 for(const site of [{name:'stairs',s:result.capture.s},{name:'summit',s:5030}])for(const view of ['first','third']){
  const captureKey=`${site.name}-${view}`;
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
  await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
  await context.addInitScript(({key,state})=>{localStorage.setItem(key,JSON.stringify(state));localStorage.setItem('gwanak-sound-enabled','false');},{key:SAVE_KEY,state:{...initialState(),s:site.s,view,paused:true}});
  const page=await context.newPage();page.on('pageerror',e=>result.errors.push(e.message));
  await page.goto(`${base}/?quality=balanced`);await page.waitForFunction(()=>window.hiking?.landscape().ready&&window.hiking?.landscape().natureReady&&!window.hiking.rendering().compiling,null,{timeout:240000});
  await page.waitForTimeout(2000);
  const contact=await page.evaluate(()=>({ground:hiking.groundCheck(),feet:window.__hikingMetrics?.footContact,state:hiking.snapshot(),rendering:hiking.rendering(),contactProbes:hiking.contactProbes()}));
  if(contact.rendering.shaderErrors.length)result.errors.push(`${view}: ${JSON.stringify(contact.rendering.shaderErrors)}`);
  result.contacts??={};result.contacts[site.name==='stairs'?view:captureKey]=contact;
  if(!contact.ground.every(p=>Number.isFinite(p.error)&&p.error<.03))result.errors.push(`${view}: 디딤판과 가시 지형 높이 불일치`);
  if(!contact.feet?.length||!contact.feet.every(p=>Number.isFinite(p.error)&&p.error<.03))result.errors.push(`${view}: 발 접지 오차 3cm 초과 또는 측정 누락`);
  contact.lowerLeftProbe=await page.evaluate(()=>hiking.contactPixelProbe(460,680));
  contact.rockGrounding=await page.evaluate(()=>hiking.stairRockGrounding());
  const rocks=contact.rockGrounding.visibleRendered;
  if(rocks.missing||rocks.max>.05)result.errors.push(`${view}: 바위 바닥과 렌더 지형 높이 차이 5cm 초과 또는 측정 누락`);
  const allStairs=contact.rockGrounding.allStairSections;
  if(!allStairs.count||allStairs.missing||allStairs.max>.05)result.errors.push(`${view}: 전체 계단 구간 바위 바닥의 최종 지형 높이 검증 미달`);
  const path=`${folder}/${captureKey}.png`;const on=(await page.screenshot({path})).toString('base64');result.screens.push(path);
  await page.evaluate(()=>hiking.contactOcclusion(false));await page.waitForTimeout(500);
  const before=`${folder}/${captureKey}-contact-off.png`;const off=(await page.screenshot({path:before})).toString('base64');result.screens.push(before);
  contact.routeEdgeBand=await contactEdgeMetric(page,off,on);
  await context.close();
 }
}finally{await browser.close();await writeFile(`${folder}/results.json`,JSON.stringify(result,null,2));}
console.log(JSON.stringify(result,null,2));
if(result.errors.length||result.minutes<135||result.minutes>165)process.exitCode=1;
