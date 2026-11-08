// 함께 걷기 HUD 입구 캡처·검사. 사용: BASE_URL=http://127.0.0.1:5311 node scripts/capture-multi-entry.mjs
//  - 가짜 'hiking:multi-status' 이벤트를 쏴서 상태 6가지(연결 중·연결됨·다시 연결 중·끊김·방 꽉 참·내 컴퓨터 모드)를
//    휴대폰 세로 390×844·가로 844×390·PC 1920×1080에서 찍는다. 참가 카드(입력·참가 중·키보드)도 찍는다.
//  - 검사: 칩이(참가 카드는 수첩 시트처럼 HUD 위에 뜨는 창이라 겹침 검사에서 뺀다) 진행 카드·태그·탭·도장·시점 칩과 겹치는지, 화면 밖, 44px 미만 버튼, 콘솔 오류.
//  - 가짜 이벤트라 실제 연결은 만들지 않는다(참가 버튼은 카드 장면에서 누르지 않는다).
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const dir=process.env.OUT??'artifacts/multi-entry-2026-11-08';mkdirSync(dir,{recursive:true});
const base=process.env.BASE_URL??'http://127.0.0.1:5311';
const DEVICES={port:{viewport:{width:390,height:844},touch:true},land:{viewport:{width:844,height:390},touch:true},pc:{viewport:{width:1920,height:1080},touch:false}};
const STATES={
 connecting:{state:'connecting',room:'관악산-1',count:0,transport:'server'},
 online:{state:'online',room:'관악산-1',count:3,transport:'server'},
 reconnecting:{state:'reconnecting',room:'관악산-1',count:0,transport:'server'},
 offline:{state:'offline',room:'관악산-1',count:0,transport:'server'},
 full:{state:'full',room:'관악산-1',count:20,transport:'server'},
 local:{state:'online',room:'관악산-1',count:2,transport:'local'},
};
const TIME=process.env.TIME??'14:20';
const only=(process.env.ONLY??'').split(',').filter(Boolean);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const audit=()=>{
 const vis=e=>{if(!e)return false;const s=getComputedStyle(e);if(s.display==='none'||s.visibility==='hidden')return false;const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};
 const rect=(e,n)=>{const r=e.getBoundingClientRect();return {n,x:r.left,y:r.top,w:r.width,h:r.height,round:false};};
 const mine=[...document.querySelectorAll('.me-chip')].filter(vis).map(e=>rect(e,e.className.split(' ')[0]));
 const others=[];
 for(const [sel,n,round] of [['#app .nb-card','card'],['#app .nb-tab','tab'],['#app .nb-tags>*','tag'],['#auto','stamp',1],['#app .nb-chip','chip',1],['#app .nb-ctx','ctx'],['#app .nb-view','view'],['.multi-toast.on','toast'],['.source-line','credit']])
  document.querySelectorAll(sel).forEach((e,i)=>{if(vis(e))others.push({...rect(e,`${n}${i?'#'+i:''}`),round:!!round});});
 const over=[];
 for(const a of mine)for(const b of others){
  const hit=b.round?(()=>{const cx=b.x+b.w/2,cy=b.y+b.h/2,r=Math.min(b.w,b.h)/2,nx=Math.max(a.x,Math.min(cx,a.x+a.w)),ny=Math.max(a.y,Math.min(cy,a.y+a.h));return Math.hypot(cx-nx,cy-ny)<r-.5;})()
   :a.x<b.x+b.w-.5&&b.x<a.x+a.w-.5&&a.y<b.y+b.h-.5&&b.y<a.y+a.h-.5;
  if(hit)over.push(`${a.n}×${b.n}`);}
 const W=innerWidth,H=innerHeight,out=mine.filter(i=>i.x<-.5||i.y<-.5||i.x+i.w>W+.5||i.y+i.h>H+.5).map(i=>i.n);
 const small=[...document.querySelectorAll('.me-chip,.sp-wrap:not([hidden]) button,.sp-wrap:not([hidden]) input,.me-entry')].filter(vis).map(e=>({e,r:e.getBoundingClientRect()})).filter(({r})=>r.height<43.5||r.width<43.5).map(({e,r})=>`${e.className||e.tagName} ${Math.round(r.width)}×${Math.round(r.height)}`);
 return {over,out,small};
};
const report=[];
for(const [dev,o] of Object.entries(DEVICES)){
 if(only.length&&!only.includes(dev))continue;
 const ctx=await browser.newContext({viewport:o.viewport,deviceScaleFactor:o.touch?2:1,isMobile:o.touch,hasTouch:o.touch});
 await ctx.addInitScript(()=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');localStorage.setItem('gwanak-stick-used','1');});
 const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${base}/hiking/?start=demo&time=${TIME}&weather=clear&quality=low`);
 await page.waitForFunction(()=>window.hiking?.started&&document.querySelector('.me-entry'),null,{timeout:300000});await page.waitForTimeout(2000);
 await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));await page.mouse.move(2,2);
 const shot=async(name,extra={})=>{await waitChunks(page);const file=`${dir}/${dev}-${name}.png`;await page.screenshot({path:file});const a=await page.evaluate(audit);report.push({dev,name,file,errors:[...errors],...a,...extra});console.log(dev,name,JSON.stringify({over:a.over,out:a.out,small:a.small,errors:errors.length}));};
 // 상태 6가지(가짜 이벤트)
 for(const [name,detail] of Object.entries(STATES)){
  await page.evaluate(d=>window.dispatchEvent(new CustomEvent('hiking:multi-status',{detail:d})),detail);await page.waitForTimeout(500);
  await shot(`state-${name}`);
 }
 // 카드: 아직 참가 안 한 모습(설정 시트의 버튼 → 카드)
 await page.evaluate(()=>{window.dispatchEvent(new CustomEvent('hiking:multi-leave'));}); // 연결 쪽에는 나갈 방이 없어 아무 일도 없다
 await page.reload();await page.waitForFunction(()=>window.hiking?.started&&document.querySelector('.me-entry'),null,{timeout:300000});await page.waitForTimeout(1500);
 await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
 await page.evaluate(()=>document.querySelector('.nb-tab[data-tab=settings]').click());await page.waitForTimeout(400);
 await shot('sheet-settings-entry');
 // 11-08부터 버튼은 서버 고르기 창(server-pick.js)을 연다(방 이름 칸 없음)
 await page.evaluate(()=>document.querySelector('.me-entry').click());await page.waitForSelector('.sp-wrap:not([hidden]) .sp-card');await page.waitForTimeout(400);
 await shot('card-join');
 await page.fill('.sp-wrap:not([hidden]) input','산타는곰돌이');await page.focus('.sp-wrap:not([hidden]) input');await page.waitForTimeout(300);
 await shot('card-join-typed');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:multi-status',{detail:{state:'online',room:'관악산-1',count:3,transport:'server'}})));await page.waitForTimeout(300);
 await page.evaluate(()=>document.querySelector('.sp-wrap:not([hidden]) .sp-x')?.click());await page.waitForTimeout(200);
 await page.evaluate(()=>document.querySelector('.me-chip').click());await page.waitForTimeout(400);
 await shot('card-joined');
 await ctx.close();
}
await browser.close();
writeFileSync(`${dir}/audit.json`,JSON.stringify(report,null,1));
const bad=report.filter(r=>r.over.length||r.out.length||r.small.length||r.errors.length);
console.log(bad.length?`문제 ${bad.length}건`:'검사 통과');
