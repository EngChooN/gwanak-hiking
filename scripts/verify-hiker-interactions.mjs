import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {initialState,SAVE_KEY} from '../src/movement.js';
const dir='artifacts/hiker-interactions';mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
console.log('브라우저 실행 완료');
const rows=[],errors=[];
try{
 let context,page;
 const openAt=async s=>{
  if(context)await context.close();context=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1});
  await context.addInitScript(({key,state})=>{localStorage.setItem(key,JSON.stringify(state));localStorage.setItem('gwanak-sound-enabled','false');},{key:SAVE_KEY,state:{...initialState(),s,view:'third',paused:true}});
  // 검증 탭에서 CSS 적용은 유지하고 개발 서버 자동 새로고침만 끈다.
  await context.route('**/@vite/client',r=>r.fulfill({body:`export const createHotContext=()=>({accept(){},dispose(){},prune(){},on(){},invalidate(){},data:{}});export const updateStyle=(id,css)=>{let e=document.getElementById(id);if(!e){e=document.createElement('style');e.id=id;document.head.append(e);}e.textContent=css;};export const removeStyle=id=>document.getElementById(id)?.remove();export const injectQuery=url=>url;export class ErrorOverlay extends HTMLElement {}`,contentType:'application/javascript'}));
  page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.log('페이지 오류',e.message);});
  await page.goto('http://127.0.0.1:5175/?quality=balanced');await page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready&&hiking.landscape().natureReady&&!hiking.rendering().compiling,null,{timeout:240000});
 };
 const diagnostic=setInterval(async()=>{try{console.log('준비 상태',await page?.evaluate(()=>({ready:window.hiking?.landscape().ready,nature:window.hiking?.landscape().natureReady,compiling:window.hiking?.rendering().compiling})));}catch{}},30000);diagnostic.unref();
 const selected=process.env.ONLY?.split(',');if(selected)rows.push(...JSON.parse(readFileSync(`${dir}/results.json`)).rows.filter(r=>!selected.includes(r.id)));
 let loadedS=null;
 for(const spec of [{id:'walk',s:1800,pose:'stand'},{id:'run',s:1800,pose:'stand',running:true},{id:'sit',s:1800,pose:'sit'},{id:'tea',s:1800,pose:'tea'},{id:'slope-walk',s:3900,pose:'stand'},{id:'slope-sit',s:3900,pose:'sit'}]){
  if(selected&&!selected.includes(spec.id))continue;
  console.log('장면 준비',spec.id);
  if(loadedS!==spec.s){await openAt(spec.s);loadedS=spec.s;}
  const data=await page.evaluate(async spec=>{
   const {sample,strideFor}=await import('/src/route.js');const h=__hiker,q=sample(spec.s),surf=__surface;
   h.__interactionBase??={update:h.update.bind(h),ground:h.ground.bind(h)};const originalUpdate=h.__interactionBase.update,originalGround=h.__interactionBase.ground;let phase=0,elapsed=0;
   h.update=args=>{const dt=args.dt??1/60;elapsed+=dt;phase+=dt*(spec.running?2.7:1.7);
    originalUpdate({...args,clip:spec.pose==='stand'?(q.slope>.15?'Climb':'Walk'):'Idle',stepPhase:spec.pose==='stand'?args.distance:phase,pose:spec.pose==='tea'&&elapsed<1?'sit':spec.pose,running:!!spec.running,speed:spec.running?1.92:1.2,dt,teaProgress:spec.pose==='tea'?Math.min(.5,Math.max(0,(elapsed-1)/3)):undefined});};
   h.ground=args=>originalGround({...args,moving:spec.pose==='stand',phase});
   return {slope:q.slope};
  },spec);
  if(spec.pose==='stand'){if(await page.evaluate(()=>hiking.snapshot().paused))await page.keyboard.press('Space');if(spec.running)await page.keyboard.down('Shift');await page.keyboard.down('w');}
  if(spec.pose!=='stand')await page.evaluate(()=>{if(hiking.snapshot().pose==='stand')window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'sit'}}));});
  await page.waitForTimeout(2800);
  await page.evaluate(()=>__hikingPerformance.reset());await page.waitForTimeout(5000);
  const metrics=await page.evaluate(()=>({performance:__hikingPerformance.report(),interaction:__hiker.interaction,eyeHeight:__hiker.eyeHeight,state:hiking.snapshot()}));
  await page.keyboard.up('w');await page.keyboard.up('Shift');
  await (await waitChunks(page)).screenshot({path:`${dir}/${spec.id}.png`});rows.push({...spec,...data,...metrics});console.log(spec.id,metrics.performance.fps,JSON.stringify(metrics.interaction));
 }
 writeFileSync(`${dir}/results.json`,JSON.stringify({rows,errors},null,2));
 for(const row of rows){assert.ok(Math.abs(row.state.s-row.s)<50,`${row.id}: 촬영 위치 불일치`);assert.ok(row.performance.fps>=40,`${row.id}: 40fps 미달`);for(const p of row.interaction.poles){assert.ok(p.error<.002,`${row.id}: 팁 지면 오차 ${p.error}`);assert.ok(p.gripError<.002);}if(row.pose!=='stand')assert.equal(row.eyeHeight,.85);}
 clearInterval(diagnostic);
 writeFileSync(`${dir}/results.json`,JSON.stringify({rows,errors},null,2));assert.equal(errors.length,0);
}finally{await browser.close();process.exitCode=errors.length?1:0;}
