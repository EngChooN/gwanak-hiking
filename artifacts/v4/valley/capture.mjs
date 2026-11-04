// 계곡·정상 비교용 캡처(읽기 전용). BASE_URL 기본은 배포본. 결과: artifacts/compare-valley-summit/shots
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {initialState} from '../../../src/movement.js';
const tag=process.argv[2]??'after',dir='artifacts/v4/valley/shots';mkdirSync(dir,{recursive:true});
const base=process.argv[3]??'http://127.0.0.1:5411',only=process.env.ONLY?.split(',');
const desk={width:1280,height:800};
const valley=[['v1100-left',1100,-1,80,-20],['v1500-left',1500,-1,80,-20],['v1500-up',1500,0,0,-4],['v2000-left',2000,-1,80,-20]];
const summit=[];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});const rows=[];
const ready=p=>p.waitForFunction(()=>window.hiking?.started&&hiking.landscape().ready&&hiking.landscape().natureReady&&!hiking.rendering().compiling,null,{timeout:300000});
async function open(query,state){const context=await browser.newContext({viewport:desk,deviceScaleFactor:1});
 await context.addInitScript(st=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');if(st)localStorage.setItem('gwanak-hiking:v1',st);},state);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`${base}/?${query}&quality=high`);await ready(page);await page.waitForTimeout(1500);await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));return {context,page,errors};}
const wrapDeg=a=>((a+540)%360)-180;
try{
 const want=valley.filter(v=>!only||only.includes(v[0]));
 if(want.length){const plan={};for(const [id,s,l] of want)plan[id]=JSON.stringify({...initialState({start:'demo'}),s,lateral:l,zone:'route'});
  for(const [id,s,l,yaw,pitch] of want){const {context,page,errors}=await open('time=11:00&weather=clear&outfit=1',plan[id]);
   const cx=desk.width/2,cy=desk.height/2;
   await page.evaluate(([cx,cy,dx,dy])=>{Element.prototype.setPointerCapture=()=>{};const el=document.getElementById('world'),ev=(t,x,y=cy)=>el.dispatchEvent(new PointerEvent(t,{pointerId:7,pointerType:'mouse',clientX:x,clientY:y,button:0,buttons:1,bubbles:true}));ev('pointerdown',cx);for(let i=1;i<=20;i++)ev('pointermove',cx+dx*i/20,cy+dy*i/20);},[cx,cy,-yaw*Math.PI/180/.004,(-.04-pitch*Math.PI/180)/.003]);
   await page.waitForTimeout(4000);await page.screenshot({path:`${dir}/${tag}-${id}.png`});
   const info=await page.evaluate(()=>({pos:hiking.position(),o:hiking.orientation()}));rows.push({id,s,errors,...info});await context.close();console.log(id);}}
 for(const [id,bearing,pitch] of summit){if(only&&!only.includes(id))continue;
  const {context,page,errors}=await open('start=summit&time=11:00&weather=clear',null);
  if(await page.evaluate(()=>hiking.snapshot().paused))await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'pause'}})));
  const cx=desk.width/2,cy=desk.height/2;
  const pitchNow=()=>page.evaluate(()=>hiking.orientation().pitch*180/Math.PI),bearingNow=()=>page.evaluate(()=>((-hiking.orientation().cameraHeading*180/Math.PI)%360+360)%360);
  const drag=async(dx,dy)=>{await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx+dx,cy+dy,{steps:12});await page.mouse.up();await page.waitForTimeout(300);};
  {const b0=await bearingNow();await drag(60,0);const k=wrapDeg((await bearingNow())-b0)/60;if(Math.abs(k)>1e-6)for(let i=0;i<6;i++)await drag(Math.max(-1200,Math.min(1200,wrapDeg(bearing-(await bearingNow()))/k)),0);}
  {const p0=await pitchNow();await drag(0,40);const k=((await pitchNow())-p0)/40;if(Math.abs(k)>1e-6)for(let i=0;i<4;i++)await drag(0,Math.max(-800,Math.min(800,(pitch-(await pitchNow()))/k)));}
  await page.waitForTimeout(4000);await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
  await page.screenshot({path:`${dir}/${tag}-${id}.png`});
  const info=await page.evaluate(()=>({bearing:((-hiking.orientation().cameraHeading*180/Math.PI)%360+360)%360,pitch:hiking.orientation().pitch*180/Math.PI,pos:hiking.position(),fov:hiking.rendering().fov}));rows.push({id,errors,...info});await context.close();console.log(id,JSON.stringify(info));}
}finally{await browser.close();writeFileSync(`${dir}/${tag}-results.json`,JSON.stringify(rows,null,2));}
