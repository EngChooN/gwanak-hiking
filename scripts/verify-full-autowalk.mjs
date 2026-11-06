// 입구~정상 자동걷기 한 번 이어 걷기(2026-11-06): 실제로는 150분이라, 페이지 시계(requestAnimationFrame·performance.now)를 SPEED배로 돌린다.
// main.js는 한 프레임을 0.1초까지만 움직이므로 걷기·즐길거리 규칙은 그대로이고, 화면 갱신만 빨라진다.
// 소리 켜짐(사용자 입력 1번)으로 걸으며 페이지 오류·즐길거리 효과음 오류·들르기 제안·라디오·정상 도착을 기록한다.
// 사용: 개발 서버(5310) 또는 preview → BASE_URL=… node scripts/verify-full-autowalk.mjs · 결과: artifacts/trail-sound/full-autowalk.json
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.BASE_URL??'http://127.0.0.1:5310/',out='artifacts/trail-sound',SPEED=Number(process.env.SPEED??6),LIMIT=Number(process.env.LIMIT_MIN??80);mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const ctx=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:2});
await ctx.addInitScript(k=>{localStorage.clear();localStorage.setItem('gwanak-hiking:sound:v1','true');
 const t0=performance.now(),now=performance.now.bind(performance);performance.now=()=>t0+(now()-t0)*k;
 const raf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>raf(t=>cb(t0+(t-t0)*k));},SPEED);
const page=await ctx.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/favicon|404/.test(m.text()))errors.push(m.text().slice(0,300));});
await page.goto(base+'?start=entrance&time=11:00&weather=clear&season=summer');
await page.waitForFunction(()=>window.hiking?.started&&window.hiking.trail&&window.hiking.landscape().natureReady,null,{timeout:300000});
await page.evaluate(()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());const seen=window.__walk={offers:[],bubbles:new Set()};
 addEventListener('hiking:trail-offer',e=>seen.offers.push(e.detail.id));addEventListener('hiking:trail-say',e=>seen.bubbles.add(e.detail.text));});
await page.tap('#auto');
const t0=Date.now(),samples=[];let last=null,stuck=0,radioMax=0;
while(Date.now()-t0<LIMIT*60000){
 await page.waitForTimeout(5000);
 const r=await page.evaluate(()=>{const s=window.hiking.snapshot(),t=window.hiking.trailSound();return {s:+s.s.toFixed(1),zone:s.zone,auto:s.auto,summit:!!s.summitReached||s.zone==='summit',radio:t.radio,played:t.played,errors:t.errors,mem:window.hiking.memory?.().totalMB??null};});
 radioMax=Math.max(radioMax,r.radio);samples.push({...r,real:Math.round((Date.now()-t0)/1000)});
 if(samples.length%12===0)console.log(JSON.stringify(samples.at(-1)));
 if(last!==null&&Math.abs(r.s-last)<.2){if(++stuck>=6){console.log('멈춤?',r);if(!r.auto)await page.tap('#auto');stuck=0;}}else stuck=0;last=r.s;
 if(r.summit||r.zone==='summit')break;
}
const end=await page.evaluate(()=>({snap:window.hiking.snapshot(),sound:window.hiking.trailSound(),offers:window.__walk.offers,bubbles:[...window.__walk.bubbles]}));
await page.screenshot({path:`${out}/full-autowalk-end.png`});
await browser.close();
const res={speed:SPEED,realMinutes:+((Date.now()-t0)/60000).toFixed(1),endS:end.snap.s,zone:end.snap.zone,reachedSummit:end.snap.zone==='summit',offers:end.offers,bubbles:end.bubbles,radioMax,soundPlayed:end.sound.played,soundByName:end.sound.byName,soundErrors:end.sound.errors,errors,samples};
writeFileSync(`${out}/full-autowalk.json`,JSON.stringify(res,null,1));
console.log(JSON.stringify({...res,samples:undefined}));
process.exit(res.reachedSummit&&!errors.length&&!end.sound.errors.length?0:1);
