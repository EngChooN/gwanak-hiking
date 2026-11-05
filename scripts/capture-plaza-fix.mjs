// 입구 광장 화면 결함 수정 전후 비교(headless Chrome 1440×900, 16:14 흐림, 3인칭).
// 사용: BASE_URL=http://127.0.0.1:5176 TAG=before node scripts/capture-plaza-fix.mjs  (ONLY=plaza-third,gate-third 로 일부만, FPS=1 이면 fps도 잼)
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const tag=process.env.TAG??'after',dir=`artifacts/plaza-fix/${tag}`;mkdirSync(dir,{recursive:true});
const base=process.env.BASE_URL??'http://127.0.0.1:5176',quality=process.env.QUALITY??'balanced',only=process.env.ONLY?.split(','),measure=process.env.FPS==='1';
const env='time=16:14&weather=overcast&outfit=1';
// [id, 주소, 3인칭?, 출발 후 동작]
const specs=[
 ['plaza-third',`start=entrance&${env}`,true],
 ['plaza-first',`start=entrance&${env}`,false],
 ['gate-third',`start=gate&${env}`,true],
 ['gate-first',`start=gate&${env}`,false],
 ['plaza-stand-close',`start=entrance&${env}`,true,'close'],
];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});const rows=[];
try{for(const [id,query,third,action] of specs){if(only&&!only.includes(id))continue;
 const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
 await context.addInitScript(()=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const t0=Date.now();await page.goto(`${base}/?quality=${quality}&${query}`);
 const progress=setInterval(async()=>{try{console.log(id,JSON.stringify(await page.evaluate(()=>hiking.loading?.())));}catch{}},30000);
 await page.waitForFunction(()=>window.hiking?.started&&!hiking.rendering().compiling,null,{timeout:240000});clearInterval(progress);
 const loadMs=Date.now()-t0,readiness=await page.evaluate(()=>hiking.readiness());
 // 로딩이 걷힌 직후 첫 화면(덜 그려진 곳 확인용).
 await (await waitChunks(page)).screenshot({path:`${dir}/${id}-0s.png`});
 if(third){await page.keyboard.press('v');}
 if(action==='close')await page.mouse.wheel(0,-1200);
 await page.waitForTimeout(3500);
 await (await waitChunks(page)).screenshot({path:`${dir}/${id}.png`});
 const row={id,query,loadMs,readiness,errors,landscape:await page.evaluate(()=>{const l=hiking.landscape();return {entrance:l.entrance,plazaReady:l.plazaReady??null};})};
 if(measure){await page.evaluate(()=>__hikingPerformance.reset());await page.waitForTimeout(6000);row.standFps=(await page.evaluate(()=>__hikingPerformance.report())).fps;
  await page.keyboard.down('w');await page.waitForTimeout(1500);await page.evaluate(()=>__hikingPerformance.reset());await page.waitForTimeout(5000);row.walkFps=(await page.evaluate(()=>__hikingPerformance.report())).fps;await page.keyboard.up('w');}
 rows.push(row);console.log(id,JSON.stringify({loadMs,errors:errors.length,standFps:row.standFps,walkFps:row.walkFps}));
 writeFileSync(`${dir}/results${only?'-'+only.join('-'):''}.json`,JSON.stringify(rows,null,2));await context.close();
}}finally{await browser.close();}
