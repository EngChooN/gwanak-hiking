// 낮·노을·밤·흐림 같은 지점 캡처. 사용: node scripts/capture-mood.mjs <before|after> [quality]
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {route} from '../src/route.js';
import {initialState,SAVE_KEY} from '../src/movement.js';
import {REFERENCE_LOOKS} from '../src/mood-config.js';
const tag=process.argv[2]??'after',quality=process.argv[3]??'high',base=process.env.BASE_URL??'http://127.0.0.1:5175',folder='artifacts/mood-2026-11-04';
const s=route.length*Number(process.env.SPOT??.3),rows=[];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
 for(const look of REFERENCE_LOOKS){
  const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
  await context.addInitScript(({state,key})=>{localStorage.setItem(key,JSON.stringify(state));localStorage.setItem('gwanak-sound-enabled','false');localStorage.setItem('gwanak-hud-hidden','1');},{state:{...initialState(),s,view:'third',paused:true},key:SAVE_KEY});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/?quality=${quality}&time=${look.time}&weather=${look.weather}`);
  await page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready&&!hiking.rendering().compiling,null,{timeout:240000});
  await page.addStyleTag({content:'#pause-overlay{display:none!important}'});
  await page.waitForTimeout(6000);
  const info=await page.evaluate(()=>{const r=hiking.rendering();return {exposure:r.environment?.exposure,night:r.environment?.night,sun:r.sunElevation};});
  await (await waitChunks(page)).screenshot({path:`${folder}/${tag}-${look.id}.png`});rows.push({look:look.id,...info,errors});console.log(look.id,JSON.stringify(info),errors.slice(0,2));
  await context.close();
 }
}finally{await browser.close();}
await writeFile(`${folder}/${tag}.json`,JSON.stringify(rows,null,2));
