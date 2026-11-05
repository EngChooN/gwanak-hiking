// 3인칭으로 일주문 아래·광장 출발점에서 사방을 둘러본 캡처(떠 있는 조각 찾기용).
// 사용: BASE_URL=http://127.0.0.1:5176 TAG=before node scripts/look-around-plaza.mjs
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';
const base=process.env.BASE_URL??'http://127.0.0.1:5176',tag=process.env.TAG??'before',dir=`artifacts/plaza-fix/${tag}/around`;mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{for(const start of (process.env.STARTS??'gate,entrance').split(',')){
 const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
 await context.addInitScript(()=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');});
 const page=await context.newPage();await page.goto(`${base}/?quality=balanced&start=${start}&outfit=1&time=16:14&weather=overcast`);
 await page.waitForFunction(()=>window.hiking?.started,null,{timeout:240000});await page.keyboard.press('v');await page.waitForTimeout(2500);
 for(let i=0;i<4;i++){
  await (await waitChunks(page)).screenshot({path:`${dir}/${start}-${i*90}.png`});
  await page.mouse.move(720,450);await page.mouse.down();await page.mouse.move(720+Number(process.env.DRAG??300),450,{steps:12});await page.mouse.up();await page.waitForTimeout(1500);
  console.log(start,i,JSON.stringify(await page.evaluate(()=>hiking.orientation().cameraHeading)));
 }
 await context.close();
}}finally{await browser.close();}
