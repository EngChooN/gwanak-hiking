// 정상 건축물(응진전·레이더 돔·철탑) 수정 전·후 캡처. 산리서치 비교표와 같은 자리·방위에서 찍는다.
// 사용: node artifacts/v4/summit-buildings/capture.mjs <before|after> [기준 주소]
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {initialState} from '../../../src/movement.js';
import {route} from '../../../src/route.js';
const tag=process.argv[2]??'after',base=process.argv[3]??'http://127.0.0.1:5410';
const dir='artifacts/v4/summit-buildings/shots';mkdirSync(dir,{recursive:true});
const url=`${base}/?quality=high&time=11:00&weather=clear`;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const ready=p=>p.waitForFunction(()=>window.hiking?.started&&hiking.landscape().ready&&!hiking.rendering().compiling,null,{timeout:300000});
async function open(state,extra=''){const c=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1});
 await c.addInitScript(({st})=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');if(st)localStorage.setItem('gwanak-hiking:v1',st);},{st:state&&JSON.stringify(state)});
 const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(url+extra);await ready(p);await p.waitForTimeout(1500);
 await p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));return {c,p,errors};}
const first=await open(null,'&start=summit');
const info=await first.p.evaluate(()=>{const m=hiking.summitMap();return {sites:m.sites.map(s=>({id:s.id,x:s.x,z:s.z,yaw:s.yaw,r:s.supportRadius})),end:m.end};});
const counts=await first.p.evaluate(()=>hiking.landscape().summitFacilities?.counts);await first.c.close();
const saved=(x,z,bearing)=>({...initialState({start:'summit'}),zone:'summit',summit:{x,z,heading:-bearing*Math.PI/180},plaza:null,s:route.length-10,lateral:0});
const site=id=>info.sites.find(s=>s.id===id),marker=site('marker'),eu=site('eungjinjeon');
const toward=(fx,fz,tx,tz)=>(-Math.atan2(-(tx-fx),-(tz-fz)))*180/Math.PI;
const mp={x:marker.x+Math.sin(marker.yaw)*3,z:marker.z+Math.cos(marker.yaw)*3};
const shots=[];
// 비교표 S1: 길 끝에서 응진전 쪽(eungjinjeon-front), 길 끝 방위 300°(end-b300)
{const dx=info.end.x-eu.x,dz=info.end.z-eu.z,n=Math.hypot(dx,dz)||1,d=eu.r+5,x=eu.x+dx/n*d,z=eu.z+dz/n*d;shots.push(['eungjinjeon-front',x,z,toward(x,z,eu.x,eu.z)]);}
shots.push(['end-b300',info.end.x,info.end.z,300]);
// P1처럼 응진전 정면(등 줄·난간 쪽) 비스듬히: 정면 방향 11m, 옆으로 4m
{const fx=Math.sin(eu.yaw),fz=Math.cos(eu.yaw),x=eu.x+fx*11+fz*4,z=eu.z+fz*11-fx*4;shots.push(['eungjinjeon-face',x,z,toward(x,z,eu.x,eu.z)]);}
// 비교표 S2: 정상석 앞에서 210°(mk-b210), 길 끝에서 199°(end-radar)
shots.push(['mk-b210',mp.x,mp.z,210],['end-radar',info.end.x,info.end.z,199]);
const out=[];
for(const [id,x,z,b] of shots){const {c,p,errors}=await open(saved(x,z,b));await p.waitForTimeout(500);
 await p.screenshot({path:`${dir}/${tag}-${id}.png`});
 const r=await p.evaluate(()=>({sum:hiking.snapshot().summit,bearing:((-hiking.orientation().cameraHeading*180/Math.PI)%360+360)%360,fps:window.__hikingMetrics?.fps??null}));
 out.push({id,x,z,b,errors,...r});console.log(tag,id,JSON.stringify(r),errors.length?errors:'');await c.close();}
writeFileSync(`${dir}/${tag}-results.json`,JSON.stringify({info,counts,shots:out},null,2));await browser.close();
