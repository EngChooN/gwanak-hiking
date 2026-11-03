import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import {route} from '../src/route.js';
import {initialState,SAVE_KEY} from '../src/movement.js';
const label=process.env.LABEL??'before',rows=[],inspect=process.env.INSPECT==='1',suffix=inspect?'-inspection':'';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{for(const [id,s,bearing] of [['north',route.length-.02,0],['northeast',route.length-.02,59],['west',route.segments[310].start,285]]){
if(process.env.CAPTURE_VIEW&&id!==process.env.CAPTURE_VIEW)continue;
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
await context.addInitScript(({state,key})=>{localStorage.setItem(key,JSON.stringify(state));localStorage.setItem('gwanak-sound-enabled','false');},{state:{...initialState(),s,view:'first',paused:true},key:SAVE_KEY});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
if(inspect)await page.route('**/src/main.js*',async r=>{const response=await r.fetch();let body=await response.text();assert.match(body,/camGoal\.set\(x,\s*eye,\s*z\)/);body=body.replace(/camGoal\.set\(x,\s*eye,\s*z\)/,'camGoal.set(x+35,eye+3,z-35)');await r.fulfill({response,body});});
await page.goto(`http://127.0.0.1:5176/?quality=high&bearing=${bearing}&fov=55`);
await page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready&&hiking.landscape().natureReady&&!hiking.rendering().compiling,null,{timeout:240000});
await page.waitForTimeout(8000);await page.evaluate(()=>window.__hikingPerformance.reset());await page.waitForTimeout(10000);
const metrics=await page.evaluate(()=>({performance:__hikingPerformance.report(),landscape:hiking.landscape(),rendering:hiking.rendering()}));
await page.screenshot({path:`artifacts/scenery-seoul-${label}${suffix}-${id}.png`});
if(label==='after'&&id==='north'){await page.keyboard.press('l');await page.waitForTimeout(500);metrics.labels=await page.evaluate(()=>hiking.landscape().cityLabels);await page.keyboard.press('l');}
if(label==='after'){assert.ok(metrics.performance.fps>=45,`${id}: ${metrics.performance.fps}fps`);assert.equal(metrics.landscape.cityLabels,false);if(id==='north')assert.equal(metrics.labels,true);assert.deepEqual(metrics.rendering.shaderErrors,[]);}
rows.push({id,s,bearing,inspect,errors,...metrics});writeFileSync(`artifacts/scenery-seoul-${label}${suffix}.json`,JSON.stringify(rows,null,2));console.log(label,id,metrics.performance.fps,errors);await context.close();
}}finally{await browser.close();}
if(rows.some(r=>r.errors.length||r.landscape.errors.length))process.exitCode=1;
