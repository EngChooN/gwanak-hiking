// 정상 지점별 캡처: 정상석 앞, 응진전 앞, 레이더 앞에서 방위별로 본다(읽기 전용).
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {initialState} from '../../../src/movement.js';
import {route} from '../../../src/route.js';
const dir='artifacts/v4/recheck/shots';mkdirSync(dir,{recursive:true});
const base=process.env.BASE_URL??'http://127.0.0.1:5413',url=`${base}/?quality=high&time=11:00&weather=clear`;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const ready=p=>p.waitForFunction(()=>window.hiking?.started&&hiking.landscape().ready&&!hiking.rendering().compiling,null,{timeout:300000});
async function open(state,extra=''){const c=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1});
 await c.addInitScript(({st})=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');if(st)localStorage.setItem('gwanak-hiking:v1',st);},{st:state&&JSON.stringify(state)});
 const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(url+extra);await ready(p);await p.waitForTimeout(1500);
 await p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));return {c,p,errors};}
const first=await open(null,'&start=summit');
const info=await first.p.evaluate(()=>{const m=hiking.summitMap();return {sites:m.sites.map(s=>({id:s.id,x:s.x,z:s.z,yaw:s.yaw,r:s.supportRadius})),end:m.end,center:m.center,radius:m.radius,cell:m.cell,x0:m.x0,z0:m.z0,n:m.n};});
writeFileSync(`${dir}/summit-info.json`,JSON.stringify(info,null,2));console.log(JSON.stringify(info.sites),JSON.stringify(info.end),JSON.stringify(info.center));await first.c.close();
const saved=(x,z,bearing)=>({...initialState({start:'summit'}),zone:'summit',summit:{x,z,heading:-bearing*Math.PI/180},plaza:null,s:route.length-10,lateral:0,paused:true});
const site=id=>info.sites.find(s=>s.id===id),marker=site('marker');
const mp={x:marker.x+Math.sin(marker.yaw)*3,z:marker.z+Math.cos(marker.yaw)*3};
const shots=[['end-radar',info.end.x,info.end.z,199],['end-radar-up',info.end.x,info.end.z,199],['mk-b210',mp.x,mp.z,210],['end-b250',info.end.x,info.end.z,250]];
const out=[];
for(const [id,x,z,b] of shots){const {c,p,errors}=await open(saved(x,z,b));await p.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'pause'}})).valueOf());await p.waitForTimeout(500);
 await p.screenshot({path:`${dir}/${id}.png`});const r=await p.evaluate(()=>({snap:hiking.snapshot().zone,sum:hiking.snapshot().summit,paused:hiking.snapshot().paused,bearing:((-hiking.orientation().cameraHeading*180/Math.PI)%360+360)%360}));out.push({id,x,z,b,errors,...r});console.log(id,JSON.stringify(r));await c.close();}
writeFileSync(`${dir}/results3.json`,JSON.stringify(out,null,2));await browser.close();
