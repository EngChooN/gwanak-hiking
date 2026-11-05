// 노면 재질 경계(노면↔지형 가장자리, 노면↔노면 전환) 블렌딩 확인 캡처. headless Chrome 1440×900, 1인칭, 맑음.
// 사용: BASE_URL=http://127.0.0.1:5176 [TAG=after] [ONLY=ridge-4973-1500,...] node scripts/capture-surface-blend.mjs
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';import {mkdirSync,writeFileSync} from 'node:fs';
import {route} from '../src/route.js';import {initialState,SAVE_KEY} from '../src/movement.js';
const base=process.env.BASE_URL??'http://127.0.0.1:5176',tag=process.env.TAG??'after',dir=`artifacts/surface-blend/${tag}`,only=process.env.ONLY?.split(',');mkdirSync(dir,{recursive:true});
// [id, 경로 거리 s, 시각, 설명]
const sites=[
 ['ridge-4973-1500',route.length-120,'15:00','정상 근처 암릉 노면 가장자리(지적 지점, 낮)'],
 ['ridge-4973-2030',route.length-120,'20:30','정상 근처 암릉 노면 가장자리(지적 지점, 밤·헤드랜턴)'],
 ['soil-to-rock-1998',1992,'15:00','2구간 흙길→돌길 전환'],
 ['rock-edge-2100',2100,'15:00','2구간 숲속 돌길 가장자리'],
 ['rock-to-ridge-4795',4789,'15:00','6구간 돌길→암릉 전환'],
];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});const rows=[];
try{for(const [id,s,time,label] of sites){if(only&&!only.includes(id))continue;
 const ctx=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1}),errors=[];
 await ctx.addInitScript(({seed,key})=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');localStorage.setItem(key,JSON.stringify(seed));},{seed:{...initialState(),s,view:'first',paused:true},key:SAVE_KEY});
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const t0=Date.now();await page.goto(`${base}/?outfit=2&time=${time}&weather=clear&quality=balanced`);
 await page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready&&!window.hiking.rendering().compiling,null,{timeout:240000});
 await page.waitForTimeout(6000); // 하늘·조명 수렴
 const rendering=await page.evaluate(()=>hiking.rendering());
 // 노면 중심·좌우 0.5m에서 보이는 가장 위 면(노면/지형)과 보행 높이 차. 지형이 노면을 뚫으면 커진다.
 const ground=await page.evaluate(()=>hiking.groundCheck().map(p=>+p.error.toFixed(4)));if(!ground.every(e=>e<.03))errors.push(`보이는 면과 보행 높이 차 3cm 초과: ${ground}`);
 if(rendering.shaderErrors?.length)errors.push(JSON.stringify(rendering.shaderErrors));
 await (await waitChunks(page)).screenshot({path:`${dir}/${id}.png`});
 rows.push({id,s,time,label,loadMs:Date.now()-t0,ground,errors});console.log(id,Math.round((Date.now()-t0)/1000)+'s',ground,errors.length?errors:'ok');await ctx.close();}
}finally{await browser.close();writeFileSync(`${dir}/results.json`,JSON.stringify(rows,null,2));}
if(rows.some(r=>r.errors.length))process.exitCode=1;
