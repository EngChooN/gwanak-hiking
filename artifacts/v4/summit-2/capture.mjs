// 4차 후속(정상 사면 흰 무늬·응진전 등 줄) 수정 전·후 캡처. 재대조 판정표와 같은 길 끝 자리·방위에서 찍는다.
// 사용: node artifacts/v4/summit-2/capture.mjs <before|after> [기준 주소]
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {initialState} from '../../../src/movement.js';
import {route} from '../../../src/route.js';
const tag=process.argv[2]??'after',base=process.argv[3]??'http://127.0.0.1:5414';
const dir='artifacts/v4/summit-2/shots';mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const ready=p=>p.waitForFunction(()=>window.hiking?.started&&hiking.landscape().ready&&!hiking.rendering().compiling,null,{timeout:300000});
async function open(state,time='11:00',extra=''){const c=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1});
 await c.addInitScript(({st})=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');if(st)localStorage.setItem('gwanak-hiking:v1',st);},{st:state&&JSON.stringify(state)});
 const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(`${base}/?quality=high&time=${time}&weather=clear${extra}`);await ready(p);await p.waitForTimeout(1500);
 await p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));return {c,p,errors};}
const first=await open(null,'11:00','&start=summit');
const info=await first.p.evaluate(()=>{const m=hiking.summitMap();return {sites:m.sites.map(s=>({id:s.id,x:s.x,z:s.z,yaw:s.yaw,r:s.supportRadius})),end:m.end};});await first.c.close();
const saved=(x,z,bearing)=>({...initialState({start:'summit'}),zone:'summit',summit:{x,z,heading:-bearing*Math.PI/180},plaza:null,s:route.length-10,lateral:0});
const eu=info.sites.find(s=>s.id==='eungjinjeon'),toward=(fx,fz,tx,tz)=>(-Math.atan2(-(tx-fx),-(tz-fz)))*180/Math.PI;
const shots=[['end-b300',info.end.x,info.end.z,300],['end-b345.6',info.end.x,info.end.z,345.6],['end-b58.5',info.end.x,info.end.z,58.5],['dusk-end-b300',info.end.x,info.end.z,300,'18:10']];
{const fx=Math.sin(eu.yaw),fz=Math.cos(eu.yaw),x=eu.x+fx*11+fz*4,z=eu.z+fz*11-fx*4;shots.push(['eungjinjeon-face',x,z,toward(x,z,eu.x,eu.z)]);}
const out=[];
for(const [id,x,z,b,time] of shots){const {c,p,errors}=await open(saved(x,z,b),time);await p.waitForTimeout(800);
 await p.screenshot({path:`${dir}/${tag}-${id}.png`});
 const r=await p.evaluate(()=>({bearing:((-hiking.orientation().cameraHeading*180/Math.PI)%360+360)%360,fps:window.__hikingMetrics?.fps??null}));
 out.push({id,x,z,b,time:time??'11:00',errors,...r});console.log(tag,id,JSON.stringify(r),errors.length?errors:'');await c.close();}
writeFileSync(`${dir}/${tag}-results.json`,JSON.stringify({info,shots:out},null,2));await browser.close();
