import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {initialState,SAVE_KEY} from '../src/movement.js';
import {route,sample} from '../src/route.js';
import {headingDelta} from '../src/hiker-facing.js';
const dir='artifacts/facing';mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const rows=[],errors=[];
try{
 const rock=route.segments.find(p=>p.material==='ridge'&&p.length>8);
 for(const [area,s] of [['flat',1800],['slope',3900],['rock',rock.start+2]]){
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  await context.addInitScript(({key,state})=>{localStorage.setItem(key,JSON.stringify(state));localStorage.setItem('gwanak-sound-enabled','false');},{key:SAVE_KEY,state:{...initialState(),s,view:'third',paused:false}});
  await context.route('**/@vite/client',r=>r.fulfill({contentType:'application/javascript',body:`export const createHotContext=()=>({accept(){},dispose(){},prune(){},on(){},invalidate(){},data:{}});export const updateStyle=(id,css)=>{let e=document.getElementById(id);if(!e){e=document.createElement('style');e.id=id;document.head.append(e);}e.textContent=css;};export const removeStyle=id=>document.getElementById(id)?.remove();export const injectQuery=url=>url;export class ErrorOverlay extends HTMLElement {}`}));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5178/hiking/?quality=balanced');await page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().natureReady&&!hiking.rendering().compiling,null,{timeout:240000});console.log('준비',area,s,sample(s).slope);
  await page.evaluate(()=>{const base=__hiker.ground;__hiker.ground=args=>{const result=base(args);window.__facingContacts=result;return result;};});
  if((await page.evaluate(()=>hiking.snapshot())).paused)await page.keyboard.press('Space');
  // 정상 조작으로 가까운 3인칭 시점 선택.
  await page.locator('#world').hover();await page.mouse.wheel(0,-220);await page.waitForTimeout(300);
  const specs=area==='flat'?[['forward',['w']],['back',['s']],['left',['a']],['right',['d']],['forward-left',['w','a']],['forward-right',['w','d']],['back-left',['s','a']],['back-right',['s','d']]]:[['up',['w']],['down',['s']],['left',['a']],['right',['d']]];
  const read=()=>page.evaluate(async()=>{const {Vector3}=await import('/node_modules/.vite/deps/three.js');const h=__hiker,pos=h.scene.position;
   return {state:hiking.snapshot(),position:pos.toArray(),heading:h.scene.rotation.y,orientation:hiking.orientation(),contacts:window.__facingContacts,legs:h.legs.map(l=>{const a=l.foot.getWorldPosition(new Vector3()),b=l.toe.getWorldPosition(new Vector3());return {side:l.side,direction:[b.x-a.x,b.z-a.z],length:a.distanceTo(b)};}),pose:h.pose};
  });
  for(const [id,keys] of specs){
   const before=await read();for(const k of keys)await page.keyboard.down(k);await page.waitForTimeout(800);const start=await read();await page.waitForTimeout(400);const moving=await read();
   const dx=moving.position[0]-start.position[0],dz=moving.position[2]-start.position[2];assert.ok(Math.hypot(dx,dz)>.01,`${area}/${id}: 실제 이동 없음`);
   const target=Math.atan2(-dx,-dz),error=Math.abs(headingDelta(moving.heading,target));assert.ok(error<.12,`${area}/${id}: 몸 방향 오차 ${error}`);
   const feet=moving.legs.map(l=>{const [x,z]=l.direction;return (-Math.sin(moving.heading)*x-Math.cos(moving.heading)*z)/Math.hypot(x,z);});const footAxes=moving.legs.map(l=>{const [x,z]=l.direction;return {forward:(-Math.sin(moving.heading)*x-Math.cos(moving.heading)*z)/l.length,lateral:(Math.cos(moving.heading)*x-Math.sin(moving.heading)*z)/l.length};});
   rows.push({area,id,footAxes,feet,moving});
   assert.ok(footAxes.every(a=>Math.abs(a.lateral)<.4&&a.forward>-.3),`${area}/${id}: 발 축 ${JSON.stringify(footAxes)}`);
   if(area==='flat'&&['left','right'].includes(id))await (await waitChunks(page)).screenshot({path:`${dir}/${id}.png`});
   for(const k of keys)await page.keyboard.up(k);const released=await read();await page.waitForTimeout(300);const stopped=await read();assert.ok(Math.abs(headingDelta(released.heading,stopped.heading))<.03,`${area}/${id}: 정지 방향 변함`);
   const cameraYaw=Math.atan2(moving.orientation.camera[0]-moving.position[0],moving.orientation.camera[2]-moving.position[2]);
   const beforeYaw=Math.atan2(before.orientation.camera[0]-before.position[0],before.orientation.camera[2]-before.position[2]);assert.ok(Math.abs(headingDelta(cameraYaw,beforeYaw))<.03,`${area}/${id}: 카메라 방향 변함`);
   assert.ok(moving.contacts.every(c=>c.penetration<.012&&(!c.planted||c.error<.012)),`${area}/${id}: 발 접지 오차`);
   const row={area,id,error,feet,footAxes,cameraTurn:headingDelta(cameraYaw,beforeYaw),before,start,moving,stopped};rows[rows.length-1]=row;console.log(area,id,'오차',error.toFixed(4),'발 정렬',feet.map(x=>x.toFixed(3)));
  }
  await context.close();
 }
 assert.deepEqual(errors,[]);
}finally{writeFileSync(`${dir}/results.json`,JSON.stringify({rows,errors},null,2));await browser.close();}
