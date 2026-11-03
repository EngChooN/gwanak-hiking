// 실제 게임 화면에서 앉기·차 마시기 확인(3인칭·1인칭). 저장 상태를 '앉음'으로 넣고 T(차 마시기)를 보낸 뒤 시점별로 찍는다.
import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {route} from '../src/route.js';
import {initialState,SAVE_KEY} from '../src/movement.js';
const base=process.env.BASE_URL??'http://127.0.0.1:5175',folder='artifacts/sit-tea-2026-11-04',s=route.length*.12,rows=[];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
 for(const view of ['third','first']){
  const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1});
  await context.addInitScript(({state,key})=>{localStorage.setItem(key,JSON.stringify(state));localStorage.setItem('gwanak-sound-enabled','false');},{state:{...initialState(),s,view,pose:'sit',paused:true},key:SAVE_KEY});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/?quality=balanced&time=11:00&weather=clear`);
  await page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready&&!hiking.rendering().compiling,null,{timeout:240000});
  await page.addStyleTag({content:'#pause-overlay{display:none!important}'});
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'pause'}})));await page.waitForTimeout(4000);
  await page.screenshot({path:`${folder}/game-${view}-sit.png`});
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'tea'}})));
  for(const [at,id] of [[400,'reach'],[1650,'drink']]){await page.waitForTimeout(at-(id==='drink'?400:0));const r=await page.evaluate(()=>({pose:hiking.snapshot().pose,tea:window.__hiker.interaction.tea?.step,cup:window.__hiker.interaction.cup.handDistance,held:window.__hiker.interaction.cup.held,viewPitch:window.__hiker.viewPitch}));await page.screenshot({path:`${folder}/game-${view}-tea-${id}.png`});rows.push({view,id,...r,errors});console.log(view,id,JSON.stringify(r),errors.slice(0,2));}
  await context.close();
 }
}finally{await browser.close();}
await writeFile(`${folder}/game.json`,JSON.stringify(rows,null,2));
