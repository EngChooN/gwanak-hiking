// 3인칭 등산객 캡처 3장: 평지 걷기·계단 오르기·근접 (dev 서버 필요, PORT)
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {route} from '../src/route.js';
import {initialState,SAVE_KEY} from '../src/movement.js';
const port=process.env.PORT??5175;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const out={captures:[],errors:[]};
try{for(const [id,label,s,wheel] of [['flat-walk','평지 걷기',route.length*.2,0],['stairs-climb','계단 오르기',route.length*.89,0],['closeup','근접',route.length*.2,-1200]]){
 const ctx=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
 await ctx.addInitScript(({seed,key})=>localStorage.setItem(key,JSON.stringify(seed)),{seed:{...initialState(),s,view:'third',paused:true},key:SAVE_KEY});
 const page=await ctx.newPage();page.on('pageerror',e=>out.errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/`);await page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready&&window.hiking?.landscape().natureReady,null,{timeout:180000});await page.waitForTimeout(15000);
 await page.keyboard.press('Space');await page.keyboard.down('w');await page.waitForTimeout(1500);
 if(wheel){await page.mouse.move(720,450);await page.mouse.wheel(0,wheel);await page.waitForTimeout(600);}
 const m=await page.evaluate(()=>({fps:hiking.metrics().fps,dist:hiking.snapshot().distance,contact:hiking.metrics().footContact}));
 await (await waitChunks(page)).screenshot({path:`artifacts/hiker-third-${id}.png`});out.captures.push({id,label,s,...m});console.log(id,m.fps,m.dist);await ctx.close();}
 assert.equal(out.errors.length,0);
}finally{writeFileSync('artifacts/hiker-third-captures.json',JSON.stringify(out,null,2));await browser.close();}
