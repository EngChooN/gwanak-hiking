// 로딩이 걷힌 직후 준비 상태·덜 그려진 곳 점검. 사용: BASE_URL=... node scripts/measure-loading-ready.mjs
import {chromium} from '@playwright/test';import {writeFileSync} from 'node:fs';
const base=process.env.BASE_URL??'http://127.0.0.1:5195';
const b=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const ctx=await b.newContext({viewport:{width:1440,height:900}});await ctx.addInitScript(()=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');});
const p=await ctx.newPage(),errors=[];p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});p.on('pageerror',e=>errors.push(e.message));
await p.addInitScript(()=>{window.__ev=[];addEventListener('hiking:loading',e=>{const d=e.detail;window.__ev.push([Math.round(performance.now()),d.stage,+d.progress.toFixed(3)]);});});
const t0=Date.now();await p.goto(`${base}/hiking/?start=entrance&outfit=1&quality=balanced&time=15:00&weather=clear`);
await p.waitForFunction(()=>hiking.started,null,{timeout:240000});const loadMs=Date.now()-t0;
const first=await p.evaluate(()=>({readiness:hiking.readiness(),loading:hiking.loading(),overlay:!!document.getElementById('loading-screen'),elapsed:hiking.snapshot().elapsed,landscape:hiking.landscape().plazaReady??null,entrance:hiking.landscape().entrance?.counts?.length??null,ev:window.__ev.filter((e,i,a)=>i===0||e[1]!==a[i-1][1]||i===a.length-1)}));
const mono=first.ev.every((e,i,a)=>i===0||e[2]>=a[i-1][2]);
writeFileSync('artifacts/loading-lighting/after/loading-ready.json',JSON.stringify({loadMs,errors,monotonic:mono,...first},null,2));console.log(JSON.stringify({loadMs,mono,errors,r:first.readiness,ev:first.ev,overlay:first.overlay,elapsed:first.elapsed},null,1));await b.close();
