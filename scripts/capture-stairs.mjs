// 계단 전후 캡처(headless Chrome 1440×900, 낮 11시 맑음, 화질 높음).
// 사용: BASE_URL=http://127.0.0.1:5198 TAG=before node scripts/capture-stairs.mjs  (ONLY=summit,end-3271 로 일부만)
// 자리마다 코스 위 s(경로 3D 거리)에서 시작해 3인칭으로 바꾸고, 진행 방향 기준 yaw(도)만큼 시점을 돌린다.
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const dir='artifacts/v2/stairs';mkdirSync(dir,{recursive:true});
const base=process.env.BASE_URL??'http://127.0.0.1:5198',tag=process.env.TAG??'after',only=process.env.ONLY?.split(',');
const env='time=11:00&weather=clear&outfit=1&quality=high';
// [id, s, lateral, 진행 방향 기준 yaw(도, +는 왼쪽), 휠]
const specs=[
 ['summit-approach',4992,0,0,0],
 ['summit-back',5062,0,180,0],
 ['summit-side',5030,1.2,80,300],
 ['end-3271',3262,0,0,0],
 ['end-3271-side',3266,1.3,75,300],
 ['stone-3150',3150,1.2,80,300],
 ['deck-4000',4000,1.2,-80,300],
 ['deck-4480',4470,0,0,0],
 ['stone-4600',4600,1.2,80,300],
];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});const rows=[];
const ready=page=>page.waitForFunction(()=>window.hiking?.started&&hiking.landscape().natureReady&&!hiking.rendering().compiling,null,{timeout:300000});
async function open(save){
 const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
 await context.addInitScript(save=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');if(save)localStorage.setItem('gwanak-hiking:v1',save);},save);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${base}/?${[save?'':'start=demo',env].filter(Boolean).join('&')}`);await ready(page);return {context,page,errors};
}
const probe=await open(null);
const plan=await probe.page.evaluate(async specs=>{const {initialState}=await import('/src/movement.js');const out={};
 for(const [id,s,lateral] of specs)out[id]=JSON.stringify({...initialState({start:'demo'}),s,lateral,zone:'route'});return out;},specs);
// 실제 지형 검사: 전 계단(최종 2m 청크 높이)과, 지금 올라온 청크 기준 걷는 지형(walking-ground) 두 가지로 잰다.
const fullCheck=await probe.page.evaluate(()=>{const t=performance.now(),r=window.__landscape.stairBaseCheck?.();if(!r)return null;const {worstGap,worstPoke,...rest}=r;return {...rest,worstGap,worstPoke,ms:Math.round(performance.now()-t),counts:hiking.landscape().stairBase};});
console.log('stairBaseCheck',JSON.stringify(fullCheck));
await probe.context.close();
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
try{for(const [id,s,lateral,yaw,wheel] of specs){if(only&&!only.includes(id))continue;
 const {context,page,errors}=await open(plan[id]);
 await page.keyboard.press('v');await page.waitForTimeout(2500);
 const closeDialogs=()=>page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));await closeDialogs();
 if(await page.evaluate(()=>hiking.snapshot().paused))await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'pause'}})));
 const dragBy=async px=>{await page.mouse.move(720,450);await page.mouse.down();await page.mouse.move(720+px,450,{steps:16});await page.mouse.up();await page.waitForTimeout(400);};
 const heading=()=>page.evaluate(()=>hiking.orientation().cameraHeading);
 const want=wrap((await page.evaluate(()=>hiking.orientation().routeHeading))+yaw*Math.PI/180);
 if(yaw){const h0=await heading();await dragBy(100);const k=wrap((await heading())-h0)/100;if(Math.abs(k)>1e-5)for(let i=0;i<2;i++)await dragBy(Math.max(-900,Math.min(900,wrap(want-(await heading()))/k)));}
 if(wheel)await page.mouse.wheel(0,wheel);
 await page.waitForTimeout(5000);await closeDialogs();await page.waitForTimeout(300);
 await page.screenshot({path:`${dir}/${tag}-${id}.png`});
 const row={id,s,errors,shaderErrors:await page.evaluate(()=>hiking.rendering().shaderErrors),position:await page.evaluate(()=>hiking.position()),loadedCheck:await page.evaluate(async()=>{const L=window.__landscape;if(!L.stairBaseCheck)return null;const {stairGapReport}=await import('/assets/realistic/stair-base.js');const W=window.__walkingGround,p=hiking.position();
  // 지금 올라온 2m 청크 안(카메라 60m 안)의 단만, 걷는 지형(walking-ground, 노면 밖) 높이로 잰다.
  const near=L.stairBaseLayout().map(b=>{const ids=b.steps.map((s,i)=>Math.hypot(s.a.x-p.x,s.a.z-p.z)<60?i:-1).filter(i=>i>=0);if(!ids.length)return null;const i0=ids[0],i1=ids.at(-1);
   return {...b,steps:b.steps.slice(i0,i1+1),points:b.points.slice(i0,i1+2),feet:b.feet.slice(i0,i1+2),ends:b.ends.filter(e=>Math.hypot(e.point.x-p.x,e.point.z-p.z)<60)};}).filter(Boolean);
  const {worstGap,worstPoke,...r}=stairGapReport(near,(x,z)=>W.height(x,z,true),(x,z)=>W.height(x,z,false));return {...r,worstGap};})};
 rows.push(row);console.log(id,JSON.stringify({errors:row.errors.length,shader:row.shaderErrors,loaded:row.loadedCheck&&{steps:row.loadedCheck.steps,maxGap:row.loadedCheck.maxGap,maxPoke:row.loadedCheck.maxPoke,missing:row.loadedCheck.missing}}));
 rows.fullCheck=fullCheck;writeFileSync(`${dir}/results-${tag}${only?'-'+only.join('-'):''}.json`,JSON.stringify({fullCheck,rows},null,2));await context.close();
}}finally{await browser.close();}
