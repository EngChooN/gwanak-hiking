// 들르기 흐름 확인: 입구 광장에서 자동걷기를 켜고, 근처(6m) 들르기 제안(hiking:trail-offer)이 오면 에어건을 눌러
// 걸어가기(go) → 돌기(turn) → 동작(act) → 돌아오기(back) → 자동걷기 다시 켜짐을 기록한다. 개발 서버(5310)를 먼저 띄운다.
//   node scripts/verify-trail-dropin.mjs
import {chromium} from '@playwright/test';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const ctx=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:2});
await ctx.addInitScript(()=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');});
const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,300));});
await page.goto('http://127.0.0.1:5310/hiking/?start=entrance&time=11:00&weather=clear');
await page.waitForFunction(()=>window.hiking?.started&&window.hiking.landscape().natureReady,null,{timeout:300000});
await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
const r=await page.evaluate(async()=>{const log=[],T=window.hiking.trail;let played=null;
 window.addEventListener('hiking:trail-offer',e=>{log.push(['offer',e.detail.id,e.detail.act,+(performance.now()/1000).toFixed(1)]);if(!played&&e.detail.act==='airgun'){played=e.detail;window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'trail-play',value:{act:e.detail.act,id:e.detail.id}}}));}});
 window.addEventListener('hiking:trail',e=>log.push(['trail',e.detail.type,e.detail.act??e.detail.name??'',+(performance.now()/1000).toFixed(1)]));
 window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'auto'}}));
 const stages=[];let last=null;const t0=performance.now();let before=null;
 while(performance.now()-t0<70000){await new Promise(r=>setTimeout(r,200));const st=T.status(),snap=window.hiking.snapshot();const k=`${st.active?.stage??'-'}|${st.acts.active?.name??'-'}|auto:${snap.auto}`;if(k!==last){stages.push([k,+((performance.now()-t0)/1000).toFixed(1),window.hiking.position()]);last=k;}
  if(st.active&&!before)before=window.hiking.position();
  if(played&&!st.active&&!st.acts.active&&snap.auto&&stages.length>4)break;}
 await new Promise(r=>setTimeout(r,3000));
 return {log,stages:stages.map(([k,t,p])=>[k,t,p.zone,+(p.x??0).toFixed(1),+(p.z??0).toFixed(1)]),after:window.hiking.position(),auto:window.hiking.snapshot().auto,before};});
console.log(JSON.stringify(r,null,1));console.log('errors',errors.slice(0,5));
await page.screenshot({path:'/tmp/trailprobe/after-dropin.png'});
await browser.close();
