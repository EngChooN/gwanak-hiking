import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SOUND_BANKS} from '../src/footstep-audio.js';
const base=process.env.BASE_URL||'http://127.0.0.1:4173';
const result={status:'실행 중',capturedAt:new Date().toISOString(),buildHash:createHash('sha256').update(readFileSync('dist/index.html')).digest('hex'),environment:'Mac headless Chrome의 AudioContext·출력 Analyser 실측. 실제 스피커·이어폰 귀 검수 아님.',checks:[],console:[],errors:[]};
let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1366,height:768}});
 page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.text().startsWith('[발소리]'))result.console.push(m.text());});
 await page.goto(base+'/?audioDebug=1');await page.waitForFunction(()=>!!window.hiking);const snapshot=()=>page.evaluate(()=>window.hiking.audio());
 let a=await snapshot();assert.equal(a.context,'입력 대기');assert.equal(a.logs.length,0);result.checks.push('첫 사용자 입력 전 AudioContext 미생성·무음');
 await page.keyboard.press('r');await page.waitForFunction(()=>window.hiking.audio().decoded===35);a=await snapshot();assert.equal(a.context,'running');assert.deepEqual(a.errors,[]);
 await page.waitForFunction(()=>window.hiking.audio().peak>.0001,{},{timeout:4000});result.signal=await snapshot();result.checks.push('첫 R 입력으로 AudioContext 시작·35개 디코딩·실제 출력 파형 확인');
 await page.waitForFunction(()=>window.hiking.audio().logs.length>=12,{},{timeout:20000});result.walk=await snapshot();const walkState=await page.evaluate(()=>window.hiking.snapshot());
 assert.equal(result.walk.logs.length,walkState.steps);assert.equal(result.walk.dropped.loading,0);assert.ok(result.walk.logs.every(r=>r.material==='stairs'));assert.equal(new Set(result.walk.logs.map(r=>r.variant)).size,6);
 const intervals=result.walk.logs.slice(1).map((r,i)=>r.eventElapsed-result.walk.logs[i].eventElapsed),actualIntervals=result.walk.logs.slice(1).map((r,i)=>r.contextTime-result.walk.logs[i].contextTime);
 assert.ok(intervals.every(v=>Math.abs(v-1/1.2)<.001));assert.ok(Math.abs(actualIntervals.reduce((a,b)=>a+b)/actualIntervals.length-1/1.2)<.05);result.intervals={event:intervals,audioContext:actualIntervals};
 await page.screenshot({path:'artifacts/audio-stairs.png'});result.checks.push('실제 계단 자동 걷기: 12걸음=12회·6개 변형 사용·약 0.833초 간격');
 await page.keyboard.press('Space');await page.waitForTimeout(150);a=await snapshot();assert.equal(a.active,0);await page.waitForTimeout(900);assert.equal((await snapshot()).logs.length,a.logs.length);result.checks.push('일시정지 시 현재 소리 중단·추가 발소리 없음');
 await page.keyboard.press('Space');await page.keyboard.press('v');await page.keyboard.press('r');await page.waitForFunction(n=>window.hiking.audio().logs.length>n,a.logs.length);const third=(await snapshot()).logs.at(-1);assert.equal(third.view,'third');assert.ok(Math.abs(third.mixDb-third.variationDb-(-2))<.001);await page.keyboard.press('r');result.third=third;result.checks.push('3인칭 걸음 재생·-3dB 거리감 (급경사 +1dB와 별도 합산)');
 await page.locator('#sound-toggle').click();a=await snapshot();assert.equal(a.enabled,false);await page.keyboard.press('r');const steps=await page.evaluate(()=>window.hiking.snapshot().steps);await page.waitForFunction(n=>window.hiking.snapshot().steps>=n+2,steps);assert.equal((await snapshot()).logs.length,a.logs.length);await page.keyboard.press('r');result.checks.push('소리 끄기: 이동이 계속돼도 재생 없음');
 await page.reload();await page.waitForFunction(()=>!!window.hiking);assert.equal((await snapshot()).enabled,false);assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'),'false');
 await page.keyboard.press('Space');await page.locator('#sound-toggle').click();await page.waitForFunction(()=>window.hiking.audio().decoded===35&&window.hiking.audio().context==='running');result.checks.push('소리 토글 저장·이어하기 복구·다시 켜면 사용자 입력으로 시작');
 // GPX에는 deck_stairs가 없어, 동일 공개 걸음 이벤트의 재질 입력으로 통나무 은행을 검사한다.
 result.logStairs=[];
 for(let i=1;i<=14;i++){
  await page.evaluate(i=>window.dispatchEvent(new CustomEvent('hiking:step',{detail:{step:1000+i,material:'deck_stairs',slope:.3,elapsed:i/1.2,distance:i*.349857,position:[0,0,0]}})),i);
  const log=(await snapshot()).logs.at(-1);assert.equal(log.material,'deck_stairs');result.logStairs.push(log);await page.waitForTimeout(833);
 }
 assert.equal(new Set(result.logStairs.map(r=>r.variant)).size,7);result.checks.push('통나무/데크 계단 입력 하네스: 7개 변형·약 0.83초마다 재생');
 result.transitions=[];
 for(const [i,material]of ['soil','rock','deck','ridge','stairs','deck_stairs'].entries()){
  const previous=(await snapshot()).logs.length;
  await page.evaluate(({i,material})=>window.dispatchEvent(new CustomEvent('hiking:step',{detail:{step:2000+i,material,slope:0,elapsed:20+i,distance:20+i,position:[0,0,0]}})),{i,material});
  const logs=(await snapshot()).logs;assert.equal(logs.length,previous+1);const log=logs.at(-1);assert.equal(log.material,material);assert.ok(SOUND_BANKS[material].includes(log.file));result.transitions.push(log);await page.waitForTimeout(90);
 }
 result.checks.push('6재질 입력 직후 해당 걸음부터 은행 변경·원본 OGG/FLAC 실제 디코딩');
 const full=[...result.walk.logs,...result.logStairs];
 for(const logs of [result.walk.logs,result.logStairs])for(let i=0;i<logs.length;i++){assert.ok(!logs.slice(Math.max(0,i-2),i).some(r=>r.file===logs[i].file));assert.ok(logs[i].rate>=.96&&logs[i].rate<=1.04);assert.ok(logs[i].variationDb>=-1.5&&logs[i].variationDb<=1.5);assert.equal(logs[i].pan,logs[i].step%2?-.08:.08);}
 assert.equal(new Set(full.map(r=>r.file)).size,13);result.checks.push('계단 13개 전부 사용·직전 2개 제외·피치 ±4%·음량 ±1.5dB·팬 ±8%');
 await page.keyboard.press('r');await page.waitForTimeout(200);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.waitForTimeout(150);assert.equal((await snapshot()).active,0);assert.equal((await page.evaluate(()=>window.hiking.snapshot())).paused,true);result.checks.push('화면 이탈 시 현재 소리 중단');
 await page.setViewportSize({width:360,height:800});const layout=await page.evaluate(()=>{const selectors=['.brand','.route-title','#sound-toggle','#help-toggle'];const rects=selectors.map(s=>{const r=document.querySelector(s).getBoundingClientRect();return {s,x:r.x,y:r.y,w:r.width,h:r.height};});const overlaps=[];for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],b=rects[j];if(a.x<b.x+b.w-.5&&a.x+a.w>b.x+.5)overlaps.push([a.s,b.s]);}return {rects,overlaps,clips:rects.filter(r=>r.x<0||r.x+r.w>innerWidth+.5)};});assert.deepEqual(layout.overlaps,[]);assert.deepEqual(layout.clips,[]);result.layout=layout;result.checks.push('360px 헤더: 소리 토글·안내·제목 겹침/잘림 없음');
 assert.equal(result.errors.length,0);result.status='통과';
}catch(error){result.status='미완료';result.errors.push(error.stack);process.exitCode=1;}finally{writeFileSync('artifacts/audio-verification.json',JSON.stringify(result,null,2));await browser?.close();}
console.log(JSON.stringify({status:result.status,checks:result.checks,errors:result.errors},null,2));
