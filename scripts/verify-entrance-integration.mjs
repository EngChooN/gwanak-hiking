// 입구 통합 검증: 입구 출발(1·3인칭) 캡처·시작 방향, 산 안 4시점 1인칭과 3인칭 보행 fps.
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {route} from '../src/route.js';
import {initialState,SAVE_KEY} from '../src/movement.js';
const dir='artifacts/entrance-integration';mkdirSync(dir,{recursive:true});
const quality=process.env.QUALITY??'balanced',base=process.env.BASE_URL??'http://127.0.0.1:5176';
const at=m=>(route.segments.find(s=>s.b.referenceMetres>=m)??route.segments.at(-1)).start;
const specs=[
 {id:'entrance-first',state:{...initialState({entrance:true}),view:'first'},walk:false},
 {id:'entrance-third',state:{...initialState({entrance:true}),view:'third'},walk:false},
 {id:'valley',state:{...initialState(),s:at(1600),view:'first'},walk:true},
 {id:'stairs',state:{...initialState(),s:at(4050),view:'first'},walk:true},
 {id:'ridge',state:{...initialState(),s:at(4540),view:'first'},walk:true},
 {id:'summit',state:{...initialState(),s:at(4930),view:'first'},walk:true},
 {id:'third',state:{...initialState(),s:at(4050),view:'third'},walk:true},
];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});const rows=[];
try{for(const spec of specs){if(process.env.ONLY&&!process.env.ONLY.split(',').includes(spec.id))continue;
 const context=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1});
 await context.addInitScript(({key,state})=>{localStorage.setItem(key,JSON.stringify(state));localStorage.setItem('gwanak-sound-enabled','false');},{key:SAVE_KEY,state:{...spec.state,paused:true}});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 console.log('준비',spec.id);
 await page.goto(`${base}/?quality=${quality}${process.env.EXTRA??""}`);
 await page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready&&hiking.landscape().natureReady&&!hiking.rendering().compiling,null,{timeout:300000});
 await page.waitForTimeout(Number(process.env.WARM??4000));await page.evaluate(()=>__hikingPerformance.reset());await page.waitForTimeout(6000);
 const idle=await page.evaluate(()=>__hikingPerformance.report());
 const camera=await page.evaluate(()=>{const s=hiking.snapshot();return {s:s.s,lateral:s.lateral,view:s.view};});
 await page.addStyleTag({content:'#app{visibility:hidden}'});await (await waitChunks(page)).screenshot({path:`${dir}/${spec.id}${process.env.SUFFIX??""}.png`});
 let walk=null;
 if(spec.walk){await page.evaluate(()=>hiking.snapshot().paused)&&await page.keyboard.press('Space');await page.keyboard.down('w');await page.waitForTimeout(1500);await page.evaluate(()=>__hikingPerformance.reset());await page.waitForTimeout(8000);walk=await page.evaluate(()=>__hikingPerformance.report());await page.keyboard.up('w');}
 const row={id:spec.id,quality,camera,idleFps:idle.fps,walkFps:walk?.fps??null,errors};rows.push(row);console.log(JSON.stringify(row));
 writeFileSync(`${dir}/results-${quality}${process.env.SUFFIX??""}.json`,JSON.stringify(rows,null,2));await context.close();
}}finally{await browser.close();}
