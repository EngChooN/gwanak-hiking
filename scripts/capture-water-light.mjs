// 계곡 물·빛 전후 캡처(headless Chrome 1440×900, 화질 높음). MOBILE=1 이면 아이폰 13 세로·화질 낮음.
// 사용: BASE_URL=http://127.0.0.1:5195 TAG=before node scripts/capture-water-light.mjs  (ONLY=water-1096,light-day 로 일부만)
// 자리마다 코스 위 s(경로 3D 거리)·옆 이동(lateral)·진행 방향 기준 yaw(도, +는 왼쪽)·시각·날씨를 정해 찍는다. 물은 water/, 빛은 light/ 에 저장한다.
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const mobile=process.env.MOBILE==='1',viewport=mobile?{width:390,height:844}:{width:1440,height:900};
const base=process.env.BASE_URL??'http://127.0.0.1:5195',tag=process.env.TAG??'after',only=process.env.ONLY?.split(',');
const quality=mobile?'low':'high';
// [id, 폴더, s, lateral, yaw(도, 진행 방향 기준 +왼쪽), 시각, 날씨, 휠, 내려보는 각(도, 음수=아래)]
const specs=[
 ['water-1096','water',1096,-3,80,'11:00','clear',0,-24],
 ['water-1096-dusk','water',1096,-3,80,'16:50','clear',0,-24],
 ['water-1500','water',1500,-3,80,'11:00','clear',0,-24],
 ['water-1500-low','water',1500,-3,75,'11:00','clear',0,-38],
 ['water-1500-rain','water',1500,-3,80,'11:00','rain',0,-24],
 ['water-2000','water',2000,-3,80,'11:00','clear',0,-24],
 ['light-day','light',1300,0,0,'11:00','clear',0,0],
 ['light-back','light',1300,0,180,'11:00','clear',0,0],
 ['light-sun','light',1300,0,'sun','11:00','clear',0,0],
 ['light-sun-golden','light',1300,0,'sun','16:30','clear',0,0],
 ['light-morning','light',1300,0,0,'08:00','clear',0,0],
 ['light-golden','light',1300,0,0,'16:30','clear',0,0],
 ['light-overcast','light',1300,0,0,'11:00','overcast',0,0],
 ['light-ground','light',1700,0,0,'11:00','clear',0,-30],
 ['light-ridge','light',3600,0,0,'11:00','clear',0,0],
].filter(s=>!mobile||['water-1096','light-day','light-back'].includes(s[0]));
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});const rows=[];
const ready=page=>page.waitForFunction(()=>window.hiking?.started&&hiking.landscape().natureReady&&!hiking.rendering().compiling,null,{timeout:300000});
const q=(clock,weather)=>`time=${clock}&weather=${weather}&outfit=1&quality=${quality}${tag==='before'?'&fx=off':''}`;
async function open(save,clock,weather){
 const context=await browser.newContext({viewport,deviceScaleFactor:mobile?3:1,isMobile:mobile,hasTouch:mobile});
 await context.addInitScript(save=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');if(save)localStorage.setItem('gwanak-hiking:v1',save);},save);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${base}/?${[save?'':'start=demo',q(clock,weather)].filter(Boolean).join('&')}`);await ready(page);return {context,page,errors};
}
const probe=await open(null,'11:00','clear');
const plan=await probe.page.evaluate(async specs=>{const {initialState}=await import('/src/movement.js');const out={};
 for(const [id,,s,lateral] of specs)out[id]=JSON.stringify({...initialState({start:'demo'}),s,lateral,zone:'route'});return out;},specs);
await probe.context.close();
try{for(const [id,folder,s,lateral,yaw,clock,weather,wheel,pitch] of specs){if(only&&!only.includes(id))continue;
 mkdirSync(`artifacts/v2/${folder}`,{recursive:true});
 const {context,page,errors}=await open(plan[id],clock,weather);
 const closeDialogs=()=>page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));await closeDialogs();
 if(await page.evaluate(()=>hiking.snapshot().paused))await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'pause'}})));
 const cx=viewport.width/2,cy=viewport.height/2;
 // 실제 클릭은 일시정지를 건드리고, 놓으면 시선이 앞으로 돌아오므로(faceForward) 포인터 이벤트를 눌린 채로 보낸다. 드래그 1px = 0.004rad.
 let yawDeg=yaw;if(yaw==='sun')yawDeg=await page.evaluate(()=>{const s=window.__lightFx.LIGHT_FX.fxSun.value,want=Math.atan2(-s.x,-s.z),h=hiking.orientation().cameraHeading;let d=want-h;d=Math.atan2(Math.sin(d),Math.cos(d));return d*180/Math.PI;});
 if(yawDeg||pitch)await page.evaluate(([cx,cy,dx,dy])=>{Element.prototype.setPointerCapture=()=>{};const el=document.getElementById('world'),ev=(type,x,y=cy)=>el.dispatchEvent(new PointerEvent(type,{pointerId:7,pointerType:'mouse',clientX:x,clientY:y,button:0,buttons:1,bubbles:true}));
  ev('pointerdown',cx);for(let i=1;i<=20;i++)ev('pointermove',cx+dx*i/20,cy+dy*i/20);},[cx,cy,-yawDeg*Math.PI/180/.004,(-.04-pitch*Math.PI/180)/.003]);
 if(wheel)await page.mouse.wheel(0,wheel);
 await page.waitForTimeout(5000);await closeDialogs();await page.waitForTimeout(300);
 let performance=null;
 if(process.env.NOPERF!=='1'){await page.evaluate(()=>window.__hikingPerformance?.reset());await page.waitForTimeout(6000);performance=await page.evaluate(()=>{const r=window.__hikingPerformance?.report();return r&&{fps:r.fps??r.averageFps,p95:r.frameMs?.p95??r.p95};});}
 await page.screenshot({path:`artifacts/v2/${folder}/${tag}-${mobile?'mobile-':''}${id}.png`});
 const info=await page.evaluate(()=>{const m=hiking.metrics()??{};return {position:hiking.position(),shaderErrors:hiking.rendering().shaderErrors,triangles:m.triangles,drawCalls:m.drawCalls};});
 if(errors.length)console.log(errors.slice(0,3));const row={id,errors,performance,...info};rows.push(row);console.log(id,JSON.stringify({fps:performance?.fps,errors:errors.length,shader:info.shaderErrors?.length,tri:info.triangles,calls:info.drawCalls}));
 writeFileSync(`artifacts/v2/results-water-light-${tag}${mobile?'-mobile':''}.json`,JSON.stringify(rows,null,2));await context.close();
}}finally{await browser.close();}
