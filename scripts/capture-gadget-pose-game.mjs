// 실제 게임 화면에서 쌍안경·휴대폰 자세 확인. 3인칭 쌍안경·휴대폰 일반 촬영, 1인칭 셀카(산개발 셀카 카메라)를 찍는다.
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {route} from '../src/route.js';
import {initialState,SAVE_KEY} from '../src/movement.js';
const base=process.env.BASE_URL??'http://127.0.0.1:5175',folder='artifacts/gadget-pose-2026-11-04',s=route.length*.12,rows=[];
const cases=[{id:'game-third-binoculars',view:'third',cmds:['binoculars']},{id:'game-third-phone',view:'third',cmds:['phone']},{id:'game-first-selfie',view:'first',cmds:['phone','selfie']},{id:'game-first-phone',view:'first',cmds:['phone']}];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
 for(const c of cases){
  const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1});
  await context.addInitScript(({state,key})=>{localStorage.setItem(key,JSON.stringify(state));localStorage.setItem('gwanak-sound-enabled','false');},{state:{...initialState(),s,view:c.view,paused:true},key:SAVE_KEY});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/hiking/?quality=balanced&time=11:00&weather=clear`);
  await page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready&&!hiking.rendering().compiling,null,{timeout:240000});
  await page.addStyleTag({content:'#pause-overlay{display:none!important}'});
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'pause'}})));await page.waitForTimeout(1500);
  for(const id of c.cmds){await page.evaluate(id=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id}})),id);await page.waitForTimeout(300);}
  await page.waitForTimeout(2500);
  const r=await page.evaluate(()=>({gadget:window.__hiker.interaction.gadget,view:hiking.gadgetView?.(),lens:(({position,direction,lens})=>({position:position.toArray(),direction:direction.toArray(),lens}))(window.__hiker.phoneCamera())}));
  await (await waitChunks(page)).screenshot({path:`${folder}/${c.id}.png`});rows.push({...c,...r,errors});console.log(c.id,JSON.stringify(r.gadget),r.view?.avatarVisible,errors.slice(0,2));
  await context.close();
 }
}finally{await browser.close();}
await writeFile(`${folder}/game.json`,JSON.stringify(rows,null,2));
