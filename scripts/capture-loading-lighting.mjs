// 로딩 화면·조명 보정 캡처(headless Chrome 1440×900). BASE_URL, TAG(before|after), ONLY=쉼표 목록, MOBILE=1
// 사용: BASE_URL=http://127.0.0.1:5195 TAG=after node scripts/capture-loading-lighting.mjs
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const tag=process.env.TAG??'after',dir=`artifacts/loading-lighting/${tag}`;mkdirSync(dir,{recursive:true});
const base=process.env.BASE_URL??'http://127.0.0.1:5195',only=process.env.ONLY?.split(','),fps=process.env.FPS==='1';
const L='start=entrance&outfit=1&quality=balanced';
const specs=[
 ['entrance-first',`${L}&time=15:00&weather=clear`,false],
 ['entrance-third',`${L}&time=15:00&weather=clear`,true],
 ['clear-15',`${L}&time=15:00&weather=clear`,true],
 ['overcast-15',`${L}&time=15:00&weather=overcast`,true],
 ['rain-15',`${L}&time=15:00&weather=rain`,true],
 ['sunset-18',`${L}&time=18:00&weather=clear`,true],
 ['sunset-1710',`${L}&time=17:10&weather=clear`,true],
 ['overcast-1614',`${L}&time=16:14&weather=overcast`,true],
];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});const rows=[];
try{for(const [id,query,third] of specs){if(only&&!only.includes(id))continue;
 const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
 await context.addInitScript(()=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const t0=Date.now();await page.goto(`${base}/hiking/?${query}`);
 if(id==='entrance-first'){await page.waitForTimeout(12000);await (await waitChunks(page)).screenshot({path:`${dir}/loading-progress.png`});globalThis.row0=await page.evaluate(()=>({loading:hiking.loading?.(),text:document.querySelector('#loading-screen .ls-percent')?.textContent,label:document.querySelector('#loading-screen .ls-label')?.textContent}));}
 await page.waitForFunction(()=>window.hiking?.started&&!hiking.rendering().compiling,null,{timeout:240000});
 const loadMs=Date.now()-t0;
 if(id==='entrance-first'){await (await waitChunks(page)).screenshot({path:`${dir}/loading-done-0s.png`});}
 if(third)await page.keyboard.press('v');
 await page.waitForTimeout(3500);await (await waitChunks(page)).screenshot({path:`${dir}/${id}.png`});
 const row={id,query,loadMs,errors,rendering:await page.evaluate(()=>hiking.rendering()),zone:await page.evaluate(()=>hiking.snapshot().zone),overlay:await page.evaluate(()=>!!document.getElementById('loading-screen'))};
 if(fps){await page.evaluate(()=>__hikingPerformance.reset());await page.waitForTimeout(6000);row.fps=(await page.evaluate(()=>__hikingPerformance.report())).fps;}
 rows.push(row);console.log(id,JSON.stringify({loadMs,errors:errors.length,fps:row.fps,exposure:row.rendering.exposure}));
 writeFileSync(`${dir}/results${only?'-'+only.join('-'):''}.json`,JSON.stringify(rows,null,2));await context.close();
}}finally{await browser.close();}
