import {chromium} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {initialState,SAVE_KEY} from '../src/movement.js';
const b=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});const errors=[],rows=[];
try{
 const c=await b.newContext({viewport:{width:1440,height:900}});
 await c.addInitScript(({key,state})=>{localStorage.setItem(key,JSON.stringify(state));localStorage.setItem('gwanak-sound-enabled','false');},{key:SAVE_KEY,state:{...initialState(),s:1800,view:'third',paused:false}});
 await c.route('**/@vite/client',r=>r.fulfill({body:`export const createHotContext=()=>({accept(){},dispose(){},prune(){},on(){},invalidate(){},data:{}});export const updateStyle=(id,css)=>{let e=document.getElementById(id);if(!e){e=document.createElement('style');e.id=id;document.head.append(e);}e.textContent=css;};export const removeStyle=id=>document.getElementById(id)?.remove();export const injectQuery=url=>url;export class ErrorOverlay extends HTMLElement {}`,contentType:'application/javascript'}));
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:5178/?quality=balanced');await p.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().natureReady&&!hiking.rendering().compiling,null,{timeout:240000});console.log('산길 준비');
 if((await p.evaluate(()=>hiking.snapshot())).paused)await p.keyboard.press('Space');
 const read=()=>p.evaluate(()=>({arms:__hiker.interaction.arms,poles:__hiker.interaction.poles,state:hiking.snapshot(),heading:__hiker.scene.rotation.y}));
 rows.push({id:'stand',...await read()});
 for(const [id,keys]of [['walk',['w']],['left',['a']],['right',['d']],['back',['s']]]){
  for(const k of keys)await p.keyboard.down(k);await p.waitForTimeout(500);
  for(let i=0;i<12;i++){rows.push({id,...await read()});await p.waitForTimeout(80);}
  if(id==='left')await p.screenshot({path:'artifacts/arms/app-left.png'});
  for(const k of keys)await p.keyboard.up(k);await p.waitForTimeout(200);
 }
 for(const r of rows)for(const a of r.arms){const sign=a.side==='Left'?-1:1;assert.ok(a.elbow[0]*sign>0&&a.wrist[0]*sign>0,`${r.id}: 몸통을 가로지르는 팔`);assert.ok(a.elbow[1]<a.shoulder[1]-.08,`${r.id}: 어깨 높이 팔꿈치`);for(const pole of r.poles){assert.ok(pole.error<.002);assert.ok(pole.gripError<.002);}}
 await p.evaluate(()=>__hikingPerformance.reset());await p.waitForTimeout(5000);const performance=await p.evaluate(()=>__hikingPerformance.report());assert.ok(performance.fps>=40);assert.deepEqual(errors,[]);
 writeFileSync('artifacts/arms/app.json',JSON.stringify({rows,errors,performance},null,2));console.log('산길 검증',rows.length,'표본',performance.fps,'fps');
}finally{await b.close();}
