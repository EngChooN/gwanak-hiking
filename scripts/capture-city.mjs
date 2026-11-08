// 서울 도심 원경 쌍안경 전후 캡처(headless Chrome 1440×900, 맑음, 화질 높음, 정상 연주대).
// 사용: BASE_URL=http://127.0.0.1:5201 TAG=before node scripts/capture-city.mjs  (ONLY=63-day,lotte-night 처럼 일부만, NOPERF=1 은 fps 측정 생략)
// 자리마다 bearing(도)으로 시선 방위를 고정하고, 쌍안경 8배를 켠 뒤 세로 시선(pitch, 도)을 마우스로 맞춘다.
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const dir='artifacts/v2/city';mkdirSync(dir,{recursive:true});
// MOBILE=1: 아이폰 13 세로(390×844, 배율 3)·화질 낮음으로 가벼운 단계를 확인한다.
const mobile=process.env.MOBILE==='1',viewport=mobile?{width:390,height:844}:{width:1440,height:900},quality=mobile?'low':'high';
const base=process.env.BASE_URL??'http://127.0.0.1:5201',tag=process.env.TAG??'after',only=process.env.ONLY?.split(','),perf=process.env.NOPERF!=='1';
// [id, 방위, 내려보는 각(도), 쌍안경]
const views=[
 ['63',345.6,-3.2,true],
 ['tower',10.2,-1.0,true],
 ['lotte',58.5,-1.2,true],
 ['hangang',2,-4.3,true],
 ['wide',10,-3,false],
];
const times=[['day','12:00'],['dusk','17:25'],['night','19:40']];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});const rows=[];
try{for(const [vid,bearing,pitch,bino] of views)for(const [tid,clock] of times){const id=`${mobile?'mobile-':''}${vid}-${tid}`;if(only&&!only.includes(id))continue;if(mobile&&!['63','wide'].includes(vid))continue;
 const context=await browser.newContext({viewport,deviceScaleFactor:mobile?3:1,isMobile:mobile,hasTouch:mobile});
 await context.addInitScript(()=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${base}/hiking/?start=summit&time=${clock}&weather=clear&quality=${quality}`);
 await page.waitForFunction(()=>window.hiking?.started&&hiking.landscape().ready&&hiking.landscape().natureReady&&!hiking.rendering().compiling,null,{timeout:300000});
 const closeDialogs=()=>page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
 await page.waitForTimeout(1500);await closeDialogs();
 if(await page.evaluate(()=>hiking.snapshot().paused))await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'pause'}})));
 if(bino){await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'binoculars'}})));await page.waitForTimeout(1500);}
 // 시선: 드래그 한 번으로 배율(도/px)을 재고 두 번씩 맞춘다. 방위는 -cameraHeading(도).
 const pitchNow=()=>page.evaluate(()=>hiking.orientation().pitch*180/Math.PI);
 const bearingNow=()=>page.evaluate(()=>((-hiking.orientation().cameraHeading*180/Math.PI)%360+360)%360);
 const wrapDeg=a=>((a+540)%360)-180;
 const cx=viewport.width/2,cy=viewport.height/2;
 const drag=async(dx,dy)=>{await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx+dx,cy+dy,{steps:12});await page.mouse.up();await page.waitForTimeout(300);};
 {const b0=await bearingNow();await drag(60,0);const k=wrapDeg((await bearingNow())-b0)/60;if(Math.abs(k)>1e-6)for(let i=0;i<6;i++)await drag(Math.max(-1200,Math.min(1200,wrapDeg(bearing-(await bearingNow()))/k)),0);}
 {const p0=await pitchNow();await drag(0,40);const k=((await pitchNow())-p0)/40;if(Math.abs(k)>1e-6)for(let i=0;i<2;i++)await drag(0,Math.max(-800,Math.min(800,(pitch-(await pitchNow()))/k)));}
 // 쌍안경 이름표(N)는 건물을 가리므로 끈다.
 if(bino&&await page.evaluate(()=>hiking.interaction?.().tagsOn)){await page.keyboard.press('n');await page.waitForTimeout(300);}
 await page.waitForTimeout(6000);await closeDialogs();
 let performance=null;
 if(perf){await page.evaluate(()=>window.__hikingPerformance?.reset());await page.waitForTimeout(8000);performance=await page.evaluate(()=>{const r=window.__hikingPerformance?.report();return r&&{fps:r.fps,p95:r.p95??r.frameP95??null};});}
 await (await waitChunks(page)).screenshot({path:`${dir}/${tag}-${id}.png`});
 const info=await page.evaluate(()=>{const m=hiking.metrics()??{};return {bearingActual:((-hiking.orientation().cameraHeading*180/Math.PI)%360+360)%360,pitch:hiking.orientation().pitch*180/Math.PI,zoom:hiking.gadgetView().cameraZoom,cityGrid:hiking.landscape().cityGrid,city:hiking.landscape().cityDetail??null,night:hiking.rendering().environment?.night,time:hiking.rendering().environment?.time,shaderErrors:hiking.rendering().shaderErrors,drawCalls:m.drawCalls,triangles:m.triangles};});
 const row={id,bearing,clock,bino,errors,performance,...info};rows.push(row);
 console.log(id,JSON.stringify({fps:performance?.fps?.toFixed?.(1),errors:errors.length,shader:info.shaderErrors?.length,tri:info.triangles,calls:info.drawCalls,zoom:info.zoom,pitch:info.pitch?.toFixed(2)}));
 writeFileSync(`${dir}/results-${tag}${only?'-'+only.join('-'):''}.json`,JSON.stringify(rows,null,2));await context.close();
}}finally{await browser.close();}
