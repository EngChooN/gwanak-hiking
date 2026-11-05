import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {initialState,SAVE_KEY} from '../src/movement.js';
const dir='artifacts/rest-integration';mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const errors=[],checks=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 await context.addInitScript(({state,key})=>{if(!sessionStorage.getItem('rest-seed')){localStorage.setItem(key,JSON.stringify(state));sessionStorage.setItem('rest-seed','1');}localStorage.setItem('gwanak-sound-enabled','false');},{state:{...initialState(),s:1800,stamina:15,paused:false},key:SAVE_KEY});
 await context.route('**/@vite/client',r=>r.fulfill({body:`export const createHotContext=()=>({accept(){},dispose(){},prune(){},on(){},invalidate(){},data:{}});export const updateStyle=(id,css)=>{let e=document.getElementById(id);if(!e){e=document.createElement('style');e.id=id;document.head.append(e);}e.textContent=css;};export const removeStyle=id=>document.getElementById(id)?.remove();export const injectQuery=url=>url;export class ErrorOverlay extends HTMLElement {}`,contentType:'application/javascript'}));
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5177/?quality=balanced');
 const ready=()=>page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().natureReady&&!hiking.rendering().compiling,null,{timeout:240000});
 await ready();console.log('앱 준비');
 const snapshot=()=>page.evaluate(()=>({state:hiking.snapshot(),interaction:__hiker.interaction,eye:__hiker.eyeHeight,camera:hiking.orientation().camera,ground:hiking.coordinates().y}));
 if((await snapshot()).state.paused)await page.keyboard.press('Space');
 // 실제 키 입력: 앉기 완료 전 차 시작은 거절한다.
 await page.keyboard.press('c');await page.keyboard.press('t');assert.equal((await snapshot()).state.pose,'sit');
 await page.waitForTimeout(350);const half=await snapshot();assert.ok(half.eye>.85&&half.eye<1.6);await page.waitForTimeout(700);
 const seated=await snapshot();assert.equal(seated.eye,.85);assert.ok(Math.abs(seated.camera[1]-seated.ground-.85)<.015);checks.push('C 0.8초 전환·중간 눈높이·T 조기 시작 방지');
 await page.locator('[data-rest="tea"]').click();await page.waitForTimeout(1000);const tea=await snapshot();assert.equal(tea.state.pose,'tea');assert.ok(tea.interaction.drink>0);
 await page.keyboard.press('Space');const paused=await snapshot();await page.waitForTimeout(500);assert.equal((await snapshot()).state.teaRemaining,paused.state.teaRemaining);assert.equal((await snapshot()).interaction.teaProgress,paused.interaction.teaProgress);checks.push('차 버튼 1회 시작·일시정지 동기화');
 await page.reload();await ready();const restored=await snapshot();assert.equal(restored.state.pose,'tea');assert.equal(restored.eye,.85);assert.ok(Math.abs(restored.state.teaRemaining-paused.state.teaRemaining)<.01);assert.ok(restored.interaction.drink>0);checks.push('차 중 저장 복원·앉은 높이·컵 진행 유지');
 await page.keyboard.press('Space');await page.waitForTimeout(2400);assert.equal((await snapshot()).state.pose,'sit');assert.ok((await snapshot()).state.stamina>85);checks.push('차 완료 후 앉기·회복');
 await (await waitChunks(page)).screenshot({path:`${dir}/first-seated.png`});
 await page.locator('[data-rest="sit"]').click();await page.waitForTimeout(1000);assert.equal((await snapshot()).eye,1.6);
 await page.keyboard.press('v');await page.keyboard.press('c');await page.waitForTimeout(1000);await page.keyboard.press('t');await page.waitForTimeout(1250);
 await (await waitChunks(page)).screenshot({path:`${dir}/third-tea.png`});const third=await snapshot();assert.equal(third.state.pose,'tea');assert.ok(third.interaction.drink>.9);checks.push('버튼으로 일어나기·3인칭 실제 T 컵 동작');
 await page.keyboard.down('w');await page.waitForTimeout(1000);await page.keyboard.up('w');assert.equal((await snapshot()).state.pose,'stand');assert.equal((await snapshot()).state.teaRemaining,0);assert.equal((await snapshot()).eye,1.6);checks.push('이동으로 차 취소·일어나기');
 await page.evaluate(()=>__hikingPerformance.reset());await page.waitForTimeout(5000);const performance=await page.evaluate(()=>__hikingPerformance.report());assert.ok(performance.fps>=40);
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);const bounds=await page.locator('#rest-controls').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390&&bounds.y>=0&&bounds.y+bounds.height<=844);checks.push('모바일 휴식 패널 화면 내 배치');
 assert.deepEqual(errors,[]);writeFileSync(`${dir}/results.json`,JSON.stringify({checks,errors,performance,half,seated,tea,restored,third},null,2));console.log(JSON.stringify({checks,errors,fps:performance.fps}));
}finally{await browser.close();}
