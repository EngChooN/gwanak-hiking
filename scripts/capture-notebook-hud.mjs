// 등산 수첩 HUD 캡처·검사. 사용: BASE_URL=http://127.0.0.1:5311 node scripts/capture-notebook-hud.mjs
//  - 844×390(휴대폰 가로)·390×844(휴대폰 세로)·1440×900(PC) × 낮(14:20)·밤(21:40)을 artifacts/ui-concepts/impl/에 남긴다.
//  - SCENES로 펼침 화면(배낭·쉬기·설정·도움말·지도·안내판 앞 등)을 더 찍는다.
//  - 검사: HUD 요소 사이 겹침(도장·칩은 원 기준), 화면 밖, 44px 미만 버튼, 콘솔 오류.
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const dir=process.env.OUT??'artifacts/ui-concepts/impl';mkdirSync(dir,{recursive:true});
const base=process.env.BASE_URL??'http://127.0.0.1:5311';
const DEVICES={land:{viewport:{width:844,height:390},touch:true},port:{viewport:{width:390,height:844},touch:true},pc:{viewport:{width:1440,height:900},touch:false}};
const TIMES={day:'14:20',night:'21:40',dusk:'17:30'};
const only=(process.env.ONLY??'').split(',').filter(Boolean);
const SCENES=(process.env.SCENES??'idle').split(',');
const times=(process.env.TIMES??'day,night').split(',');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const report=[];
// 겹침·크기 검사(페이지 안에서)
const audit=()=>{
 const vis=e=>{if(!e)return false;const s=getComputedStyle(e);if(s.display==='none'||s.visibility==='hidden')return false;const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};
 const box=(e,name,round=false)=>{const r=e.getBoundingClientRect();return {name,round,x:r.left,y:r.top,w:r.width,h:r.height,cx:r.left+r.width/2,cy:r.top+r.height/2,r:Math.min(r.width,r.height)/2};};
 const items=[];const add=(sel,name,round)=>document.querySelectorAll(sel).forEach((e,i)=>{if(vis(e))items.push(box(e,`${name}${i?'#'+i:''}`,round));});
 const sheetOpen=document.body.classList.contains('nb-sheet-open');
 add('#app .nb-card','card');add('#app .nb-tab','tab');add('#app .nb-tags>*','tag');add('#auto','stamp',true);add('#app .nb-chip','chip',true);add('#app .nb-ctx','ctx');add('.source-line','credit');add('.hud-restore','restore');
 if(sheetOpen)for(const i of [...items])if(i.name.startsWith('card'))items.splice(items.indexOf(i),1);
 const over=[];
 for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){const a=items[i],b=items[j];
  let hit;
  if(a.round&&b.round)hit=Math.hypot(a.cx-b.cx,a.cy-b.cy)<a.r+b.r-0.5;
  else if(a.round||b.round){const c=a.round?a:b,q=a.round?b:a,nx=Math.max(q.x,Math.min(c.cx,q.x+q.w)),ny=Math.max(q.y,Math.min(c.cy,q.y+q.h));hit=Math.hypot(c.cx-nx,c.cy-ny)<c.r-0.5;}
  else hit=a.x<b.x+b.w-0.5&&b.x<a.x+a.w-0.5&&a.y<b.y+b.h-0.5&&b.y<a.y+a.h-0.5;
  if(hit)over.push(`${a.name}×${b.name}`);}
 // 펼친 시트·대화창 안 버튼이 출처 줄·HUD 칩·도장 밑에 깔리지 않는지(위에 그려진 요소가 버튼을 덮는지 가운데 점으로 본다).
 for(const e of document.querySelectorAll('.nb-sheet:not([hidden]) button,dialog[open] button')){if(!vis(e))continue;const r=e.getBoundingClientRect();
  for(const [px,py] of [[r.left+r.width/2,r.top+r.height/2],[r.left+4,r.bottom-4],[r.right-4,r.bottom-4]]){const top=document.elementFromPoint(px,py);if(top&&top!==e&&!e.contains(top)&&!top.contains(e)&&!top.closest('dialog[open],.nb-sheet')){over.push(`${e.id||e.textContent.trim().slice(0,6)}⊂${top.id||top.className||top.tagName}`);break;}}}
 const W=innerWidth,H=innerHeight,out=items.filter(i=>i.x<-0.5||i.y<-0.5||i.x+i.w>W+0.5||i.y+i.h>H+0.5).map(i=>i.name);
 const small=[...document.querySelectorAll('#app button,.hud-restore,.nb-sheet button,dialog[open] button')].filter(vis).map(e=>({e,r:e.getBoundingClientRect()})).filter(({r})=>r.width<43.5||r.height<43.5).map(({e,r})=>`${e.id||e.className||e.textContent.trim().slice(0,8)} ${Math.round(r.width)}×${Math.round(r.height)}`);
 const clipped=[...document.querySelectorAll('#app .nb-card,#app .nb-tag,#auto,#app .nb-chip,#app .nb-tab,#app .nb-ctx')].filter(vis).filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.id||e.className);
 return {over,out,small,clipped,count:items.length};
};
async function scene(page,name){
 const click=s=>page.evaluate(sel=>document.querySelector(sel)?.click(),s);
 if(name==='backpack'||name==='rest'||name==='settings')await click(`.nb-tab[data-tab=${name}]`);
 if(name==='jump'){await click('.nb-tab[data-tab=settings]');await page.waitForTimeout(300);await click('#section-jump .sj-toggle');}
 if(name==='help')await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keydown',{code:'Slash',key:'/'})));
 if(name==='map')await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyM',key:'m'})));
 if(name==='book')await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyJ',key:'j'})));
 if(name==='sit')await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyC',key:'c'})));
 if(name==='auto')await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyR',key:'r'})));
 if(name==='sign'||name==='cairn'){
  // 상호작용 줄을 직접 흘려 넣어 도장·상황 꼬리표 모양을 본다(게임 로직은 그대로).
  const rows=name==='sign'?[{key:'F',label:'안내판 읽기',sub:'관악산 안내도',state:'ready'}]:[{key:'F',label:'스탬프 찍기 · 돌탑 공터',sub:'돌을 하나씩 올려 쌓은 탑',state:'ready'},{key:'2',label:'돌 올리기',sub:'실제 산에서는 돌을 옮기지 마세요',state:'ready'}];
  await page.evaluate(r=>{window.__nbHold=setInterval(()=>window.dispatchEvent(new CustomEvent('hiking:interact-view',{detail:{rows:r,where:'world'}})),50);},rows);
 }
 if(name==='hidden')await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:hud-toggle')));
 await page.waitForTimeout(name==='sit'?1600:700);
}
for(const [dev,o] of Object.entries(DEVICES)){
 if(only.length&&!only.includes(dev))continue;
 for(const t of times)for(const sc of SCENES){
  const ctx=await browser.newContext({viewport:o.viewport,deviceScaleFactor:o.touch?2:1,isMobile:o.touch,hasTouch:o.touch});
  await ctx.addInitScript(()=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');localStorage.setItem('gwanak-stick-used','1');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`${base}/hiking/?start=${process.env.START??'demo'}&time=${TIMES[t]}&weather=clear&quality=${process.env.QUALITY??'low'}`);
  await page.waitForFunction(()=>window.hiking?.started,null,{timeout:300000});await page.waitForTimeout(2500);
  await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
  await page.mouse.move(2,2);
  await scene(page,sc);
  await waitChunks(page);
  const file=`${dir}/${dev}-${t}${sc==='idle'?'':'-'+sc}.png`;
  await page.screenshot({path:file});
  const a=await page.evaluate(audit);
  const row={dev,time:t,scene:sc,file,errors,...a};report.push(row);
  console.log(dev,t,sc,JSON.stringify({over:a.over,out:a.out,small:a.small,clipped:a.clipped,errors}));
  await ctx.close();
 }
}
await browser.close();
writeFileSync(`${dir}/audit${process.env.TAG?'-'+process.env.TAG:''}.json`,JSON.stringify(report,null,1));
