// 동동이 계단·바위 걷기 캡처(코스 위 자리를 저장 상태로 심어 시작). node scripts/capture-dongdong-stairs.mjs [기본 주소] [출력 폴더]
import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';
const base=process.argv[2]??'http://127.0.0.1:5311',out=process.argv[3]??'artifacts/dongdong/game';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const errors=[],report={};
// 계단은 한 칸에 한 발: 실제로 디딘 순간(hiking:step, landing)의 수평 간격과 디딤판 높이 턱 간격을 잰다. 흙길·바위는 발소리 빈도를 잰다.
for(const [name,s] of [['08-계단',3120],['09-나무계단',3800],['10-바위',2100],['11-흙길',4530]]){
 const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1});
 const probe=await context.newPage();await probe.goto(`${base}/?style=toon&startMode=manual`,{waitUntil:'domcontentloaded'});
 const save=await probe.evaluate(async s=>{const {initialState}=await import('/src/movement.js');return JSON.stringify({...initialState({start:'demo'}),s,lateral:0,zone:'route',view:'third'});},s);await probe.close();
 await context.addInitScript(save=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');localStorage.setItem('gwanak-hiking:v1',save);},save);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,200));});
 await page.goto(`${base}/?${new URLSearchParams({style:'toon',time:'11:00',weather:'clear',quality:'2'})}`);
 for(let i=0;;i++){try{await page.waitForFunction(()=>window.hiking?.started&&window.hiking.landscape().natureReady&&!window.hiking.rendering().compiling,null,{timeout:300000});break;}catch(e){if(i>=3||!/destroyed|navigation/.test(e.message))throw e;await page.waitForLoadState('load');}}
 await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(x=>x.close()));
 const cmd=id=>page.evaluate(id=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id}})),id);
 if(await page.evaluate(()=>window.hiking.snapshot().paused))await cmd('pause');
 if(await page.evaluate(()=>window.hiking.snapshot().view)==='first')await cmd('view');
 await page.waitForTimeout(2500);await cmd('auto');
 // 옆에서 보도록 카메라를 돌린다
 await page.mouse.move(640,400);await page.mouse.down();for(let i=1;i<=20;i++)await page.mouse.move(640+250*i/20,400);await page.mouse.up();
 await page.evaluate(()=>{window.__steps=[];window.addEventListener('hiking:step',e=>window.__steps.push({...e.detail,t:performance.now()}));window.__audio0=window.hiking.audio();});
 const errs=[];for(let k=0;k<3;k++){await page.waitForTimeout(1200);await page.screenshot({path:`${out}/${name}-${k}.png`});
  errs.push(await page.evaluate(()=>{const c=window.hiking.snapshot();return {clip:window.__hiker.pose?.name,stairs:window.__hiker.pose?.stairs,speed:+(c.speed??0).toFixed(2)};}));}
 // 연속 프레임(0.1초 간격) 6장
 for(let k=0;k<6;k++){await page.waitForTimeout(100);await page.screenshot({path:`${out}/${name}-burst${k}.png`,clip:{x:340,y:180,width:600,height:460}});}
 const r=await page.evaluate(()=>{const st=window.__steps,land=st.filter(d=>d.landing),a=window.hiking.audio(),a0=window.__audio0,sec=(st.at(-1)?.t-st[0]?.t)/1000||1;
  const gaps=land.slice(1).map((d,i)=>Math.hypot(d.position[0]-land[i].position[0],d.position[2]-land[i].position[2]));gaps.sort((x,y)=>x-y);
  return {steps:st.length,landings:land.length,material:st.at(-1)?.material,landingGapMedian:gaps.length?+gaps[gaps.length>>1].toFixed(3):null,landingGapMin:gaps.length?+gaps[0].toFixed(3):null,landingGapMax:gaps.length?+gaps.at(-1).toFixed(3):null,
   soundsPerSec:+((a.received-a0.received-(a.dropped.thinned-a0.dropped.thinned))/sec).toFixed(2),eventsPerSec:+(st.length/sec).toFixed(2)};});
 // 디딤판 길이: 지금 자리 앞뒤 1.5m 노면 높이 턱 간격
 r.treads=await page.evaluate(()=>{const h=window.__hiker.scene,fx=-Math.sin(h.rotation.y),fz=-Math.cos(h.rotation.y),g=(x,z)=>window.__walkingGround.height(x,z,false);
  const edges=[];let prev=g(h.position.x-fx*1.5,h.position.z-fz*1.5);for(let t=-1.5+.01;t<=1.5;t+=.01){const v=g(h.position.x+fx*t,h.position.z+fz*t);if(Math.abs(v-prev)>.008)edges.push(+t.toFixed(2));prev=v;}
  const gaps=edges.slice(1).map((e,i)=>+(e-edges[i]).toFixed(2));return {edges:edges.length,gaps};});
 report[name]={...r,frames:errs};console.log(name,JSON.stringify(report[name]));
 await context.close();
}
console.log('errors',JSON.stringify(errors));
import('node:fs').then(fs=>fs.writeFileSync(`${out}/stairs-report.json`,JSON.stringify({report,errors},null,1)));
await browser.close();
