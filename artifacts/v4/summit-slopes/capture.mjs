// 정상 주변 사면(숲·화강암 노두) 수정 전·후 캡처. 산리서치 비교표 S3와 같은 자리(길 끝)·방위에서 찍는다.
// 사용: node artifacts/v4/summit-slopes/capture.mjs <before|after> [기준 주소]
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {initialState} from '../../../src/movement.js';
import {route} from '../../../src/route.js';
const tag=process.argv[2]??'after',base=process.argv[3]??'http://127.0.0.1:5412';
const dir='artifacts/v4/summit-slopes/shots';mkdirSync(dir,{recursive:true});
const url=`${base}/?quality=high&time=11:00&weather=clear`;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const ready=p=>p.waitForFunction(()=>window.hiking?.started&&hiking.landscape().ready&&!hiking.rendering().compiling,null,{timeout:300000});
async function open(state){const c=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1});
 await c.addInitScript(({st})=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');if(st)localStorage.setItem('gwanak-hiking:v1',st);},{st:state&&JSON.stringify(state)});
 const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(url);await ready(p);await p.waitForTimeout(1500);
 await p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));return {c,p,errors};}
const end={x:1557.5703327634624,z:2535.5960865837123};
const saved=(x,z,bearing)=>({...initialState({start:'summit'}),zone:'summit',summit:{x,z,heading:-bearing*Math.PI/180},plaza:null,s:route.length-10,lateral:0});
// 비교표 S3: end-b345.6(서울 도심·한강), end-b58.5(롯데타워). 서울 쪽 시야 확인용 10.2°, 사면 확인용 300°·150°를 더한다.
const shots=[['end-b345.6',345.6],['end-b58.5',58.5],['end-b10.2',10.2],['end-b300',300],['end-b150',150]];
const only=process.env.ONLY?.split(',');const out=[];
for(const [id,b] of shots.filter(([id])=>!only||only.includes(id))){const {c,p,errors}=await open(saved(end.x,end.z,b));await p.waitForTimeout(500);
 await p.screenshot({path:`${dir}/${tag}-${id}.png`});
 const r=await p.evaluate(()=>({bearing:((-hiking.orientation().cameraHeading*180/Math.PI)%360+360)%360,fps:window.__hikingMetrics?.fps??null}));
 out.push({id,b,errors,...r});console.log(tag,id,JSON.stringify(r),errors.length?errors:'');await c.close();}
writeFileSync(`${dir}/${tag}-results.json`,JSON.stringify(out,null,2));await browser.close();
