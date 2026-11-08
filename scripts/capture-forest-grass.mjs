// 숲·풀 풍성함 전후 비교: 같은 지점(숲·길가·능선)과 화질 낮음 숲을 같은 조건으로 찍는다.
// BASE_URL로 수정 전 보존 사본 서버와 현재 작업 트리 서버를 각각 가리킨다.
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {route} from '../src/route.js';
import {initialState,SAVE_KEY} from '../src/movement.js';
const label=process.env.LABEL??'before',base=process.env.BASE_URL??'http://127.0.0.1:5176';
const folder=`artifacts/forest-grass-2026-11-04`;await mkdir(folder,{recursive:true});
const spots=[
 ['forest',route.length*.32,'first','high'],
 ['roadside',route.length*.12,'third','high'],
 ['stairs',route.segments[310].start,'first','high'],
 ['ridge',4700,'first','high'],
 ['forest-low',route.length*.32,'first','low'],
];
const browser=await chromium.launch({channel:'chrome',headless:process.env.HEADED!=='1',args:['--enable-webgl','--ignore-gpu-blocklist']});
const rows=[];
try{
 for(const [id,s,view,quality] of spots){
  if(process.env.ONLY&&!process.env.ONLY.split(',').includes(id))continue;
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
  // 시각을 낮 11시로 고정해 실시간 시각·날씨에 따라 전후 밝기가 달라지지 않게 한다.
  await context.addInitScript(({state,key})=>{localStorage.setItem(key,JSON.stringify(state));localStorage.setItem('gwanak-sound-enabled','false');},{state:{...initialState(),s,view,paused:true},key:SAVE_KEY});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/hiking/?quality=${quality}&time=11:00&weather=clear`);
  await page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready&&hiking.landscape().natureReady&&!hiking.rendering().compiling,null,{timeout:240000});
  await page.waitForTimeout(12000);
  await page.evaluate(()=>window.__hikingPerformance?.reset());await page.waitForTimeout(6000);
  const result=await page.evaluate(()=>{const m=hiking.metrics(),p=window.__hikingPerformance?.report();return {fps:p?.fps,maxTriangles:p?.maxTriangles,drawCalls:p?.drawCalls,categories:p?.categories,breakdown:p?.breakdown,scenery:m.landscape?.scenery,forestMix:m.landscape?.forestMix,natureVisibleChunks:m.landscape?.natureVisibleChunks,budgetHidden:m.landscape?.natureBudgetHidden,levelUse:m.landscape?.natureLevelUse,nearTrees:m.landscape?.nearTrees,shaderErrors:hiking.rendering().shaderErrors,adaptive:hiking.adaptive?.()};});
  // 가운데 일시정지 표시는 풍경을 가리므로 캡처 때만 숨긴다.
  await page.addStyleTag({content:'#pause-overlay{display:none!important}'});
  await (await waitChunks(page)).screenshot({path:`${folder}/${label}-${id}.png`});
  rows.push({id,s,view,quality,errors,...result});console.log(label,id,result.fps?.toFixed?.(1),result.maxTriangles,Math.round(result.drawCalls??0),JSON.stringify(result.nearTrees??null),result.shaderErrors?.length?result.shaderErrors:'',errors.length?errors:'');
  await context.close();
 }
}finally{await browser.close();}
await writeFile(`${folder}/${label}.json`,JSON.stringify(rows,null,2));
