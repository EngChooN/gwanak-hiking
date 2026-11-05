// 3차 풍경 개선 전후 캡처(headless Chrome, 맑음). 계곡 물 위 풀, 정상 쌍안경 밤 시야(북북동·롯데), 쌍안경 별 모양.
// 사용: BASE_URL=http://127.0.0.1:5221 TAG=before node scripts/capture-v3-scenery.mjs  (ONLY=valley-1096,stars-bino8 처럼 일부만)
// 결과: artifacts/v3/scenery/{tag}-{id}.png, artifacts/v3/scenery/results-{tag}.json(오류·셰이더 오류·fps·시선)
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const dir='artifacts/v3/scenery';mkdirSync(dir,{recursive:true});
const base=process.env.BASE_URL??'http://127.0.0.1:5221',tag=process.env.TAG??'after',only=process.env.ONLY?.split(','),perf=process.env.NOPERF!=='1';
const desk={width:1440,height:900},phone={width:390,height:844};
// 계곡: [id, s, lateral, yaw(도, 진행 방향 기준 +왼쪽), pitch(도)] — v2 물 촬영과 같은 자리(water-1096·water-1500)와 조금 넓게 본 자리.
const valley=[
 ['valley-1096',1096,-3,80,-24],['valley-1096-wide',1096,-1,70,-12],
 ['valley-1500',1500,-3,80,-24],['valley-1500-wide',1500,-1,70,-12],
];
// 정상: [id, 방위(도), pitch(도), 쌍안경 배율(0=맨눈), 시각, 화면]
const summit=[
 ['summit-nne-night',22.5,-1.5,8,'19:40',desk],
 ['summit-nne-night-wide',22.5,-4,0,'19:40',desk],
 ['summit-lotte-night',58.5,-1.2,8,'19:40',desk],
 ['summit-lotte-night-low',58.5,-3.5,8,'19:40',desk],
 ['summit-lamp-south',140,-12,0,'19:40',desk],
 ['stars-bino8',200,38,8,'21:30',desk],
 ['stars-bino4',200,38,4,'21:30',desk],
 ['stars-bino10',200,38,10,'21:30',desk],
 ['stars-eye',200,38,0,'21:30',desk],
 ['stars-bino8-phone',200,38,8,'21:30',phone],
];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});const rows=[];
const ready=page=>page.waitForFunction(()=>window.hiking?.started&&hiking.landscape().ready&&hiking.landscape().natureReady&&!hiking.rendering().compiling,null,{timeout:300000});
const save=(id,result)=>{rows.push(result);console.log(id,JSON.stringify({fps:result.performance?.fps,errors:result.errors.length,shader:result.shaderErrors?.length}));writeFileSync(`${dir}/results-${tag}${only?'-'+only.join('-'):''}.json`,JSON.stringify(rows,null,2));};
async function open(viewport,query,state){
 const mobile=viewport===phone,context=await browser.newContext({viewport,deviceScaleFactor:mobile?3:1,isMobile:mobile,hasTouch:mobile});
 await context.addInitScript(state=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');if(state)localStorage.setItem('gwanak-hiking:v1',state);},state);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${base}/?${query}&quality=${mobile?'low':'high'}`);await ready(page);
 await page.waitForTimeout(1200);await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
 return {context,page,errors};
}
async function measure(page){
 let performance=null;
 if(perf){await page.evaluate(()=>window.__hikingPerformance?.reset());await page.waitForTimeout(6000);performance=await page.evaluate(()=>{const r=window.__hikingPerformance?.report();return r&&{fps:r.fps??r.averageFps??null,p95:r.frameMs?.p95??r.p95??null};});}
 return performance;
}
try{
 // 계곡: 저장 상태로 코스 위 s에 선다(v2 capture-water-light.mjs와 같은 방식).
 const wantValley=valley.filter(v=>!only||only.includes(v[0]));
 if(wantValley.length){
  const probe=await open(desk,'start=demo&time=11:00&weather=clear',null);
  const plan=await probe.page.evaluate(async specs=>{const {initialState}=await import('/src/movement.js');const out={};for(const [id,s,lateral] of specs)out[id]=JSON.stringify({...initialState({start:'demo'}),s,lateral,zone:'route'});return out;},wantValley);
  await probe.context.close();
  for(const [id,,,yaw,pitch] of wantValley){
   const {context,page,errors}=await open(desk,'time=11:00&weather=clear&outfit=1',plan[id]);
   const cx=desk.width/2,cy=desk.height/2;
   await page.evaluate(([cx,cy,dx,dy])=>{Element.prototype.setPointerCapture=()=>{};const el=document.getElementById('world'),ev=(type,x,y=cy)=>el.dispatchEvent(new PointerEvent(type,{pointerId:7,pointerType:'mouse',clientX:x,clientY:y,button:0,buttons:1,bubbles:true}));
    ev('pointerdown',cx);for(let i=1;i<=20;i++)ev('pointermove',cx+dx*i/20,cy+dy*i/20);},[cx,cy,-yaw*Math.PI/180/.004,(-.04-pitch*Math.PI/180)/.003]);
   await page.waitForTimeout(5000);
   const performance=await measure(page);
   await (await waitChunks(page)).screenshot({path:`${dir}/${tag}-${id}.png`});
   const info=await page.evaluate(()=>({position:hiking.position(),shaderErrors:hiking.rendering().shaderErrors}));
   save(id,{id,errors,performance,...info});await context.close();
  }
 }
 for(const [id,bearing,pitch,zoom,clock,viewport] of summit){if(only&&!only.includes(id))continue;
  const {context,page,errors}=await open(viewport,`start=summit&time=${clock}&weather=clear`,null);
  if(await page.evaluate(()=>hiking.snapshot().paused))await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'pause'}})));
  const cmd=id=>page.evaluate(id=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id}})),id);
  if(zoom){await cmd('binoculars');await page.waitForTimeout(1200);for(let i=0;i<8&&await page.evaluate(()=>hiking.gadgetView().binoculars.zoom)!==zoom;i++){await cmd(zoom>await page.evaluate(()=>hiking.gadgetView().binoculars.zoom)?'zoom-in':'zoom-out');await page.waitForTimeout(150);}await page.waitForTimeout(1200);}
  // 시선: 드래그 한 번으로 배율(도/px)을 재고 몇 번 맞춘다(v2 capture-city.mjs와 같은 방식). 방위는 -cameraHeading(도).
  const pitchNow=()=>page.evaluate(()=>hiking.orientation().pitch*180/Math.PI);
  const bearingNow=()=>page.evaluate(()=>((-hiking.orientation().cameraHeading*180/Math.PI)%360+360)%360);
  const wrapDeg=a=>((a+540)%360)-180,cx=viewport.width/2,cy=viewport.height/2;
  const drag=async(dx,dy)=>{await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx+dx,cy+dy,{steps:12});await page.mouse.up();await page.waitForTimeout(300);};
  {const b0=await bearingNow();await drag(60,0);const k=wrapDeg((await bearingNow())-b0)/60;if(Math.abs(k)>1e-6)for(let i=0;i<6;i++)await drag(Math.max(-1200,Math.min(1200,wrapDeg(bearing-(await bearingNow()))/k)),0);}
  {const p0=await pitchNow();await drag(0,40);const k=((await pitchNow())-p0)/40;if(Math.abs(k)>1e-6)for(let i=0;i<4;i++)await drag(0,Math.max(-800,Math.min(800,(pitch-(await pitchNow()))/k)));}
  if(zoom&&await page.evaluate(()=>hiking.interaction?.().tagsOn)){await page.keyboard.press('n');await page.waitForTimeout(300);}
  await page.waitForTimeout(5000);await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
  const performance=await measure(page);
  await (await waitChunks(page)).screenshot({path:`${dir}/${tag}-${id}.png`});
  const info=await page.evaluate(()=>({bearing:((-hiking.orientation().cameraHeading*180/Math.PI)%360+360)%360,pitch:hiking.orientation().pitch*180/Math.PI,zoom:hiking.gadgetView().cameraZoom,camera:hiking.gadgetView().camera,night:hiking.rendering().environment?.night,stars:hiking.rendering().environment?.stars,shaderErrors:hiking.rendering().shaderErrors}));
  save(id,{id,clock,viewport,errors,performance,...info});await context.close();
 }
}finally{await browser.close();}
