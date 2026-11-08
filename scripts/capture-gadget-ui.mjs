// 쌍안경·휴대폰 화면 캡처: 1인칭 쌍안경, 1인칭 휴대폰(일반·셀카·세로·격자), 3인칭 휴대폰.
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {route} from '../src/route.js';
import {initialState,SAVE_KEY} from '../src/movement.js';
const base=process.env.BASE_URL??'http://127.0.0.1:5175',folder='artifacts/gadget-ui-2026-11-04',s=route.length*.3;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const rows=[];
try{
 const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
 await context.addInitScript(({state,key})=>{localStorage.setItem(key,JSON.stringify(state));localStorage.setItem('gwanak-sound-enabled','false');},{state:{...initialState(),s,view:'first'},key:SAVE_KEY});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/hiking/?quality=balanced&time=11:00&weather=clear`);
 await page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready&&!hiking.rendering().compiling,null,{timeout:240000});
 const cmd=(id,value)=>page.evaluate(([id,value])=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id,value}})),[id,value]);
 const shot=async(name,wait=1500)=>{await page.waitForTimeout(wait);await (await waitChunks(page)).screenshot({path:`${folder}/${name}.png`});const m=await page.evaluate(()=>({mode:document.getElementById('gadget-ui').dataset.mode,gadget:hiking.gadgetView().gadget,view:hiking.gadgetView().view,hudHidden:document.getElementById('app').classList.contains('gadget-hud-hidden')}));rows.push({name,...m,errors:[...errors]});console.log(name,JSON.stringify(m));};
 await page.waitForTimeout(3000);
 await cmd('binoculars');await shot('1-binoculars-first');
 await cmd('binoculars');await cmd('phone');await shot('2-phone-first');
 await page.click('[data-act=grid]');await cmd('phone-zoom',2);await shot('3-phone-first-grid-2x',600);
 await page.click('[data-act=grid]');await page.click('.phone-top [data-act=orient]');await shot('4-phone-first-portrait',600);
 await page.click('.phone-top [data-act=orient]');await cmd('phone-zoom',1);await cmd('selfie');await shot('5-phone-selfie',2500);
 await page.click('.phone-shutter');await page.waitForTimeout(120);await (await waitChunks(page)).screenshot({path:`${folder}/6-phone-shutter-flash.png`});await page.waitForTimeout(800);await shot('7-phone-after-shot',300);
 await cmd('selfie');await cmd('view');await shot('8-phone-third',2000);
 await context.close();
}finally{await browser.close();}
await writeFile(`${folder}/capture.json`,JSON.stringify(rows,null,2));
