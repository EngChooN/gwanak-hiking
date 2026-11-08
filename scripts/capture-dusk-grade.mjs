// 해질녘 색감 전후 캡처(headless Chrome 1440×900, 맑음, 화질 높음). 사용: BASE_URL=... TAG=before|after node scripts/capture-dusk-grade.mjs (ONLY=forest-dusk,... 일부만)
// 숲은 코스 위 s=1300 지점, 정상은 start=summit. 쌍안경 도심은 63빌딩(방위 345.6°) 방향. 낮·밤은 변경 없음 확인용.
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';import {mkdirSync,writeFileSync} from 'node:fs';
const dir='artifacts/v3';mkdirSync(dir,{recursive:true});
const base=process.env.BASE_URL??'http://127.0.0.1:5195',tag=process.env.TAG??'after',only=process.env.ONLY?.split(',');
// [id, 시작, 시각, 쌍안경]
const specs=[['forest-dusk','forest','17:10',false],['summit-dusk','summit','17:10',false],['city-dusk','summit','17:10',true],
 ['forest-golden','forest','16:30',false],['forest-day','forest','11:00',false],['summit-day','summit','11:00',false],['forest-night','forest','20:30',false],['summit-night','summit','20:30',false]];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});const rows=[];
try{for(const [id,where,clock,bino] of specs){if(only&&!only.includes(id))continue;
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 let save=null;
 await context.addInitScript(s=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');if(s)localStorage.setItem('gwanak-hiking:v1',s);},null);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const start=where==='summit'?'start=summit':'start=demo';
 await page.goto(`${base}/hiking/?${start}&time=${clock}&weather=clear&outfit=1&quality=high`);
 await page.waitForFunction(()=>window.hiking?.started&&hiking.landscape().natureReady&&!hiking.rendering().compiling,null,{timeout:300000});
 const closeDialogs=()=>page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
 await page.waitForTimeout(1500);await closeDialogs();
 if(where==='forest'){await page.evaluate(async()=>{const {initialState}=await import('/src/movement.js');const st={...initialState({start:'demo'}),s:1300,lateral:0,zone:'route'};localStorage.setItem('gwanak-hiking:v1',JSON.stringify(st));});await page.reload();await page.waitForFunction(()=>window.hiking?.started&&hiking.landscape().natureReady&&!hiking.rendering().compiling,null,{timeout:300000});await closeDialogs();}
 if(await page.evaluate(()=>hiking.snapshot().paused))await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'pause'}})));
 if(bino){await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'binoculars'}})));await page.waitForTimeout(1500);
  const pitchNow=()=>page.evaluate(()=>hiking.orientation().pitch*180/Math.PI),bearingNow=()=>page.evaluate(()=>((-hiking.orientation().cameraHeading*180/Math.PI)%360+360)%360);
  const wrapDeg=a=>((a+540)%360)-180,cx=720,cy=450;
  const drag=async(dx,dy)=>{await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx+dx,cy+dy,{steps:12});await page.mouse.up();await page.waitForTimeout(300);};
  {const b0=await bearingNow();await drag(60,0);const k=wrapDeg((await bearingNow())-b0)/60;if(Math.abs(k)>1e-6)for(let i=0;i<6;i++)await drag(Math.max(-1200,Math.min(1200,wrapDeg(345.6-(await bearingNow()))/k)),0);}
  {const p0=await pitchNow();await drag(0,40);const k=((await pitchNow())-p0)/40;if(Math.abs(k)>1e-6)for(let i=0;i<2;i++)await drag(0,Math.max(-800,Math.min(800,(-3.2-(await pitchNow()))/k)));}
  if(await page.evaluate(()=>hiking.interaction?.().tagsOn)){await page.keyboard.press('n');await page.waitForTimeout(300);}
 }
 await page.waitForTimeout(6000);await closeDialogs();
 await (await waitChunks(page)).screenshot({path:`${dir}/${tag}-${id}.png`});
 const info=await page.evaluate(()=>({shaderErrors:hiking.rendering().shaderErrors,elevation:hiking.rendering().environment?.light?.elevation,night:hiking.rendering().environment?.night}));
 rows.push({id,clock,errors,...info});console.log(id,JSON.stringify({errors:errors.length,shader:info.shaderErrors?.length,elev:info.elevation?.toFixed?.(1)}));
 writeFileSync(`${dir}/results-${tag}.json`,JSON.stringify(rows,null,2));await context.close();
}}finally{await browser.close();}
