import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {initialState,SAVE_KEY} from '../src/movement.js';
import {route} from '../src/route.js';
const base=process.env.BASE_URL??'http://127.0.0.1:5186',folder='artifacts/performance-after4';
await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:process.env.HEADED!=='1',args:['--enable-webgl','--ignore-gpu-blocklist']});
const result={errors:[],view:'연주대 부근 북쪽 원경 · 높음 · 세로화각55도',date:new Date().toISOString()};
try{
 const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
 await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
 await context.addInitScript(({state,key})=>{localStorage.setItem(key,JSON.stringify(state));localStorage.setItem('gwanak-sound-enabled','false');},{state:{...initialState(),s:route.length-5,view:'first',paused:true},key:SAVE_KEY});
 const page=await context.newPage();page.on('pageerror',e=>result.errors.push(e.message));
 await page.goto(`${base}/hiking/?quality=high&bearing=0&fov=55`);
 await page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready&&window.hiking?.landscape().natureReady&&!window.hiking.rendering().compiling,null,{timeout:240000});
 await page.waitForTimeout(2000);result.metrics=await page.evaluate(()=>window.__hikingMetrics??hiking.landscape());
 await (await waitChunks(page)).screenshot({path:`${folder}/city-high-north.png`});
}finally{await browser.close();await writeFile(`${folder}/city-high-north.json`,JSON.stringify(result,null,2));}
if(result.errors.length)process.exitCode=1;
