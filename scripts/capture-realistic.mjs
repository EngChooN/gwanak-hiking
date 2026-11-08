import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {route,sample} from '../src/route.js';
import {initialState,SAVE_KEY} from '../src/movement.js';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const results={environment:'이 Mac headless Chrome, 1440×900, deviceScaleFactor 1. 실기기 모바일 검증 아님.',captures:[],errors:[]};
try{for(const [id,label,s,bearing] of [['entrance','입구',1,null],['ridge','능선 중간',route.segments[310].start,null],['summit-north','정상 북쪽 · 서울·한강',route.length-.02,0],['summit-east','정상 동쪽 · 롯데월드타워',route.length-.02,59]]){
 const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});await context.addInitScript(({seed,key})=>localStorage.setItem(key,JSON.stringify(seed)),{seed:{...initialState(),s,view:'first',paused:true},key:SAVE_KEY});
 const page=await context.newPage();page.on('pageerror',e=>results.errors.push(e.message));await page.goto('http://127.0.0.1:5175/hiking/'+(bearing===null?'':`?bearing=${bearing}`));await page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready,{timeout:120000});await page.waitForTimeout(8500);
 const data=await page.evaluate(()=>({metrics:hiking.metrics(),rendering:hiking.rendering(),coordinates:hiking.coordinates(),orientation:hiking.orientation(),ground:hiking.groundCheck()}));assert.equal(data.rendering.shaderErrors.length,0);assert.ok(data.ground.every(g=>g.error<=.3),JSON.stringify(data.ground));assert.equal(data.metrics.landscape.errors.length,0);assert.ok(data.metrics.footContact.every(c=>c.error<=.3));assert.ok(data.metrics.fps>=30,`${id} FPS ${data.metrics.fps}`);
 await (await waitChunks(page)).screenshot({path:`artifacts/realistic-${id}.png`});results.captures.push({id,label,s,bearing,...data});console.log(id,data.metrics.fps,data.metrics.landscape);await context.close();}
 assert.equal(results.errors.length,0);results.status='통과';
}catch(e){results.status='실패';results.errors.push(e.stack);process.exitCode=1;}finally{writeFileSync('artifacts/realistic-verification.json',JSON.stringify(results,null,2));await browser.close();}
