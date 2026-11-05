// 밤 조명 캡처·성능 측정. dev 서버 필요: PORT=5190 node scripts/capture-night-lighting.mjs [시나리오 id ...]
// 균형 화질(quality=balanced). 시나리오마다 새 브라우저 문맥으로 fps·드로우콜·광원 수를 기록한다.
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';import {mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
import {route} from '../src/route.js';import {initialState,SAVE_KEY} from '../src/movement.js';
const port=process.env.PORT??5190,dir='artifacts/night-lighting';mkdirSync(dir,{recursive:true});
const L=route.length;
const seedRoute=(s,view)=>({...initialState(),s,view,paused:true});
const SCENES=[
 {id:'plaza-night',label:'밤 광장 3인칭',query:'?start=entrance&outfit=4&time=20:30',view:'third',plaza:true},
 {id:'lake-night',label:'밤 호수공원 길',s:740,query:'?outfit=2&time=20:30',view:'first',walk:true},
 {id:'ridge-night',label:'밤 능선 헤드랜턴 1인칭',s:L-120,query:'?outfit=2&time=20:30',view:'first',walk:true},
 {id:'ridge-night-third',label:'밤 능선 헤드랜턴 3인칭(캡 모자)',s:L-120,query:'?outfit=2&time=20:30',view:'third',walk:true,turn:1400},
 {id:'plaza-day',label:'낮 광장(가로등 꺼짐)',query:'?start=entrance&outfit=4&time=13:00',view:'third',plaza:true},
 {id:'lake-day',label:'낮 호수공원 길(가로등 꺼짐)',s:740,query:'?outfit=2&time=13:00',view:'first',walk:true},
 {id:'ridge-crowd0',label:'밤 능선 1인칭 (기준)',s:L-120,query:'?outfit=2&time=20:30',view:'first',walk:true,measure:true},
 {id:'ridge-crowd50',label:'밤 능선 가짜 등산객 50',s:L-120,query:'?outfit=2&time=20:30&crowd=50',view:'first',walk:true,measure:true},
 {id:'ridge-crowd100',label:'밤 능선 가짜 등산객 100',s:L-120,query:'?outfit=2&time=20:30&crowd=100',view:'first',walk:true,measure:true,shot:true},
 {id:'plaza-night-fps',label:'밤 광장 3인칭 fps',query:'?start=entrance&outfit=4&time=20:30',view:'third',plaza:true,measure:true},
 {id:'plaza-day-fps',label:'낮 광장 3인칭 fps',query:'?start=entrance&outfit=4&time=13:00',view:'third',plaza:true,measure:true},
];
const want=process.argv.slice(2),list=want.length?SCENES.filter(s=>want.includes(s.id)):SCENES;
const file=`${dir}/night-lighting.json`,out=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{for(const sc of list){
 const ctx=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1}),errors=[];
 await ctx.addInitScript(({seed,key})=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');if(seed)localStorage.setItem(key,JSON.stringify(seed));},{seed:sc.plaza?null:seedRoute(sc.s,sc.view),key:SAVE_KEY});
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`http://127.0.0.1:${port}/${sc.query}&weather=clear&quality=balanced`);
 await page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready&&window.hiking?.landscape().natureReady,null,{timeout:120000}).catch(async e=>{console.log('로딩 실패',sc.id,errors.slice(0,5),await page.evaluate(()=>JSON.stringify([hiking.loading().phase,hiking.loading().error,window.__hikingMetrics?.rendering?.shaderErrors?.[0]?.slice(0,600)])).catch(String));throw e;});await page.waitForTimeout(2500);
 if(sc.plaza){await page.keyboard.press('v').catch(()=>{});}
 const view=await page.evaluate(()=>hiking.snapshot().view);if(view!==sc.view)await page.keyboard.press('v');
 await page.keyboard.press('Space');await page.waitForTimeout(300);
 if(sc.turn){await page.keyboard.down('e');await page.waitForTimeout(sc.turn);await page.keyboard.up('e');}
 if(sc.measure){await page.keyboard.down('w');}
 await page.waitForTimeout(sc.measure?5000:3500);
 const fps=[];if(sc.measure){for(let i=0;i<3;i++){await page.waitForTimeout(4200);fps.push(await page.evaluate(()=>hiking.metrics().fps));}}
 const info=await page.evaluate(()=>({night:hiking.night(),m:{drawCalls:hiking.metrics().drawCalls,triangles:hiking.metrics().triangles,quality:hiking.metrics().quality,adaptive:hiking.metrics().adaptiveQuality,compileCount:hiking.metrics().rendering?.compileCount,shaderErrors:hiking.metrics().rendering?.shaderErrors?.length??0,ao:hiking.metrics().rendering?.ao}}));
 if(!sc.measure||sc.shot)await (await waitChunks(page)).screenshot({path:`${dir}/${sc.id}.png`});
 out[sc.id]={label:sc.label,fps,...info,errors};console.log(sc.id,JSON.stringify({fps,dc:info.m.drawCalls,lights:info.night.realLights,lamp:info.night.lampAmount.toFixed(2),head:info.night.headlamp.on,drawn:info.night.othersDrawn,errors:errors.length,shader:info.m.shaderErrors,adaptive:info.m.adaptive}));
 await ctx.close();
}}finally{writeFileSync(file,JSON.stringify(out,null,2));await browser.close();}
