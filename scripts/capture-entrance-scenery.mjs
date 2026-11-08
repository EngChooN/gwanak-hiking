import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {route} from '../src/route.js';
import {initialState,SAVE_KEY} from '../src/movement.js';
const dir='artifacts/entrance-scenery';mkdirSync(dir,{recursive:true});
const specs=[['entrance',0,'first','&entrancePhoto'],['lake',720,'first',''],['valley',1600,'first',''],['junction',1070,'first',''],['stairs',4050,'first',''],['ridge',4540,'first',''],['summit',4930,'first',''],['third',4050,'third','']];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});const rows=[];
try{for(const [id,m,view,query]of specs){if(process.env.ONLY&&!process.env.ONLY.split(',').includes(id))continue;
 const seg=route.segments.find(s=>s.b.referenceMetres>=m)??route.segments.at(-1),s=seg.start;
 const context=await browser.newContext({viewport:id==='entrance'?{width:1000,height:950}:{width:1280,height:900},deviceScaleFactor:1});await context.addInitScript(({key,state})=>{localStorage.setItem(key,JSON.stringify(state));localStorage.setItem('gwanak-sound-enabled','false');},{key:SAVE_KEY,state:{...initialState(),s,view,paused:true}});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('오류',id,e.message);});
 console.log('준비',id);const timer=setInterval(async()=>{try{console.log(id,await page.evaluate(()=>({ready:window.hiking?.landscape().ready,natureReady:window.hiking?.landscape().natureReady,errors:window.hiking?.landscape().errors})));}catch{}},45000);
 await page.goto(`http://127.0.0.1:5176/hiking/?quality=${process.env.QUALITY??'high'}${query}`);await page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready&&hiking.landscape().natureReady&&!hiking.rendering().compiling,null,{timeout:240000});clearInterval(timer);await page.waitForTimeout(4000);await page.evaluate(()=>__hikingPerformance.reset());await page.waitForTimeout(6000);
 const data=await page.evaluate(()=>({performance:__hikingPerformance.report(),entrance:hiking.landscape().entrance,sections:hiking.landscape().sectionScenery,rendering:hiking.rendering()}));await page.addStyleTag({content:'#app{visibility:hidden}'});await (await waitChunks(page)).screenshot({path:`${dir}/${id}.png`});if(['valley','stairs','ridge','summit','third'].includes(id)){await page.keyboard.press('Space');await page.keyboard.down('w');await page.waitForTimeout(2000);await page.evaluate(()=>__hikingPerformance.reset());await page.waitForTimeout(6000);data.walk=await page.evaluate(()=>({performance:__hikingPerformance.report(),state:hiking.snapshot()}));await page.keyboard.up('w');}
 rows.push({id,m,s,view,quality:process.env.QUALITY??'high',errors,...data});writeFileSync(`${dir}/results${process.env.ONLY?'-'+process.env.ONLY:''}.json`,JSON.stringify(rows,null,2));console.log(id,JSON.stringify({fps:data.performance.fps,walk:data.walk?.performance.fps,errors,shaderErrors:data.rendering.shaderErrors}));await context.close();
}}finally{await browser.close();}
