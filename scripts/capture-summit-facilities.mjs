// 실행 허용 후: BASE_URL=http://127.0.0.1:5176 node scripts/capture-summit-facilities.mjs
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {route} from '../src/route.js';
import {initialState,SAVE_KEY} from '../src/movement.js';
import {facilityAnchors} from '../assets/realistic/summit-config.js';
const base=process.env.BASE_URL??'http://127.0.0.1:5176';
const folder='artifacts/summit-facilities';await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const results={errors:[],screens:[],status:'추정 위치·치수'};
const junction=facilityAnchors(route.points).junction;
const junctionSegment=route.segments.reduce((best,seg)=>Math.hypot(seg.a.x-junction.x,seg.a.z-junction.z)<Math.hypot(best.a.x-junction.x,best.a.z-junction.z)?seg:best);
try{
 for(const [name,s,bearing]of [['summit',route.length-.1,300],['junction',junctionSegment.start,90]]){
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
  await context.addInitScript(({key,state})=>{localStorage.setItem(key,JSON.stringify(state));localStorage.setItem('gwanak-sound-enabled','false');},{key:SAVE_KEY,state:{...initialState(),s,view:'first',paused:true}});
  const page=await context.newPage();page.on('pageerror',e=>results.errors.push(e.message));
  await page.goto(`${base}/?quality=balanced&bearing=${bearing}`);
  await page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready&&window.hiking?.landscape().natureReady&&!window.hiking.rendering().compiling,null,{timeout:240000});
  await page.waitForTimeout(2000);
  results[name]=await page.evaluate(()=>({facilities:window.hiking.landscape().summitFacilities,forest:window.hiking.landscape().forestMix,camera:window.hiking.orientation(),coordinates:window.hiking.coordinates()}));
  results[name].bearing=bearing;results[name].s=s;
  const path=`${folder}/${name}.png`;await (await waitChunks(page)).screenshot({path});results.screens.push(path);await context.close();
 }
}finally{await browser.close();await writeFile(`${folder}/results.json`,JSON.stringify(results,null,2));}
if(results.errors.length)throw new Error(results.errors.join('\n'));
