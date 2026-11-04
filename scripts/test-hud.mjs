// HUD 전 기능 노출·일시정지 제거·떠다니는 조이스틱 확인(실제 브라우저).
// 사용: BASE_URL=http://127.0.0.1:5301 node scripts/test-hud.mjs   (ONLY=desktop,phone-portrait,phone-landscape)
// 데스크톱 1440×900(마우스·키보드), 아이폰 13 세로·가로(터치 에뮬레이션, CDP 터치 이벤트로 조이스틱을 끌어 걷는다).
import {chromium,devices} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const dir='artifacts/v2/hud';mkdirSync(dir,{recursive:true});
const base=process.env.BASE_URL??'http://127.0.0.1:5301',only=process.env.ONLY?.split(',');
const cases=[['desktop',{width:1440,height:900},false],['phone-portrait',{width:390,height:844},true],['phone-landscape',{width:844,height:390},true]];
const BUTTONS=['auto','sit','binoculars','phone','view','headlamp','face-forward','stamps','stretch','map-toggle','sound-toggle','hud-hide','help-toggle','quality'];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const all={};let fail=0;
for(const [name,viewport,touch] of cases){
 if(only&&!only.includes(name))continue;
 const ctx=await browser.newContext(touch?{...devices['iPhone 13'],viewport,screen:viewport,isMobile:true,hasTouch:true}:{viewport});
 await ctx.addInitScript(()=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');});
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const r={checks:[],errors};const check=(label,ok,detail)=>{r.checks.push({label,ok:!!ok,detail});if(!ok){fail++;console.log(`  ✖ ${name}: ${label}`,detail??'');}};
 await page.goto(`${base}/?start=plaza&time=12:00&weather=clear&quality=low`);
 await page.waitForFunction(()=>window.hiking?.started,null,{timeout:300000});await page.waitForTimeout(2500);
 await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
 const snap=()=>page.evaluate(()=>{const s=hiking.snapshot();return {zone:s.zone,s:s.s,lateral:s.lateral,auto:s.auto,pose:s.pose,view:s.view,gadget:s.gadget,running:s.running,teaReady:s.teaReady,heading:hiking.orientation().cameraHeading,pos:hiking.position(),paused:s.paused,plaza:s.plaza};});
 const sel=id=>id==='quality'?'#quality':`#${id}`;
 const rect=s=>page.evaluate(s=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};},s);
 const tap=async s=>{const b=await rect(s);if(!b||!b.w)throw new Error('버튼이 안 보임 '+s);const x=b.x+b.w/2,y=b.y+b.h/2;if(touch)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);await page.waitForTimeout(350);};
 // 1) 일시정지 흔적이 없는가
 check('일시정지 버튼·화면 없음',await page.evaluate(()=>!document.getElementById('pause')&&!document.getElementById('pause-overlay')&&!/일시정지|계속하기/.test(document.body.innerText)));
 // 2) 모든 기능 버튼이 보이고 서로 겹치지 않는가
 const layout=()=>page.evaluate(({ids,touch})=>{
  const items=[...ids.map(i=>i==='quality'?'#quality':'#'+i),'#section-jump .sj-toggle',...(touch?['#run']:[])];
  const out=[];const vw=innerWidth,vh=innerHeight;
  for(const s of items){const e=document.querySelector(s);if(!e){out.push({s,missing:true});continue;}const b=e.getBoundingClientRect(),cs=getComputedStyle(e);
   const hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
   out.push({s,x:b.x,y:b.y,w:b.width,h:b.height,shown:cs.display!=='none'&&cs.visibility!=='hidden'&&b.width>0&&b.height>0,inside:b.left>=-.5&&b.top>=-.5&&b.right<=vw+.5&&b.bottom<=vh+.5,top:hit===e||e.contains(hit)});}
  const vis=out.filter(o=>o.shown),overlaps=[];
  for(let i=0;i<vis.length;i++)for(let j=i+1;j<vis.length;j++){const a=vis[i],b=vis[j];if(a.x<b.x+b.w-1&&a.x+a.w>b.x+1&&a.y<b.y+b.h-1&&a.y+a.h>b.y+1)overlaps.push([a.s,b.s]);}
  return {out,overlaps};},{ids:BUTTONS,touch});
 const L=await layout();r.layout=L;
 check('안 보이는 버튼 0개',L.out.every(o=>!o.missing&&o.shown&&o.inside&&o.top),L.out.filter(o=>o.missing||!o.shown||!o.inside||!o.top));
 check('버튼끼리 겹침 0',L.overlaps.length===0,L.overlaps);
 check('버튼 크기 36px 이상',L.out.every(o=>o.w>=36&&o.h>=30),L.out.filter(o=>o.w<36||o.h<30).map(o=>[o.s,o.w,o.h]));
 await page.screenshot({path:`${dir}/after-${name}.png`});
 // 3) 각 버튼 누르기
 let st;
 await tap('#auto');st=await snap();check('자동 걷기 켜짐',st.auto===true);await tap('#auto');st=await snap();check('자동 걷기 꺼짐',st.auto===false);
 await tap('#sit');st=await snap();check('앉기',st.pose==='sit'||st.pose==='tea');await page.waitForTimeout(1200);
 const L2=await layout();const tea=await page.evaluate(()=>{const e=document.getElementById('tea'),b=e.getBoundingClientRect();return {hidden:e.hidden,x:b.x,y:b.y,w:b.width,h:b.height,disabled:e.disabled};});
 check('앉으면 차 버튼이 보임',!tea.hidden&&tea.w>=36&&tea.x>=0&&tea.y>=0&&tea.x+tea.w<=viewport.width&&tea.y+tea.h<=viewport.height,tea);
 const teaOverlap=await page.evaluate(()=>{const t=document.getElementById('tea').getBoundingClientRect();return [...document.querySelectorAll('#app nav button,#section-jump .sj-toggle,header button')].filter(b=>b.id!=='tea'&&b.offsetParent!==null).filter(b=>{const c=b.getBoundingClientRect();return t.left<c.right-1&&t.right>c.left+1&&t.top<c.bottom-1&&t.bottom>c.top+1;}).map(b=>b.id||b.className);});
 check('차 버튼이 다른 버튼과 겹치지 않음',teaOverlap.length===0,teaOverlap);
 await page.screenshot({path:`${dir}/after-${name}-seated.png`});
 if(!tea.disabled){await tap('#tea');st=await snap();check('차 마시기',st.pose==='tea',st.pose);}
 await tap('#sit');st=await snap();check('일어나기',st.pose==='stand',st.pose);
 await page.waitForTimeout(600);
 // 쌍안경·휴대폰: 켜기 → 기구 화면의 닫기 → 꺼짐
 for(const g of ['binoculars','phone']){
  await tap('#'+g);st=await snap();check(`${g} 켜짐`,st.gadget===g,st.gadget);await page.waitForTimeout(500);
  if(g==='phone')await page.screenshot({path:`${dir}/after-${name}-phone-gadget.png`});
  const railShown=await page.evaluate(g=>{const e=document.getElementById(g),b=e.getBoundingClientRect(),cs=getComputedStyle(e);return cs.visibility!=='hidden'&&b.width>0;},g);
  if(railShown){await tap('#'+g);}else{const closeBtn=await page.$('#gadget-ui [data-act=close]');if(closeBtn&&await closeBtn.isVisible()){const b=await closeBtn.boundingBox();if(touch)await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);else await page.mouse.click(b.x+b.width/2,b.y+b.height/2);await page.waitForTimeout(350);}else await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'gadget-off'}})));r.checks.push({label:`${g}: HUD가 숨겨지는 화면에서 닫는 방법`,ok:true,detail:closeBtn?'기구 화면 닫기 버튼':'gadget-off 명령'});}
  st=await snap();check(`${g} 꺼짐`,st.gadget==='none'||!st.gadget,st.gadget);await page.waitForTimeout(300);
 }
 await tap('#view');st=await snap();check('시점 3인칭',st.view==='third');await tap('#view');st=await snap();check('시점 1인칭',st.view==='first');
 await tap('#headlamp');const hl1=await page.evaluate(()=>document.getElementById('headlamp').getAttribute('aria-pressed'));await tap('#headlamp');const hl2=await page.evaluate(()=>document.getElementById('headlamp').getAttribute('aria-pressed'));check('헤드랜턴 켜고 끄기',hl1!==hl2,[hl1,hl2]);
 await tap('#face-forward');check('정면 보기 누름(오류 없음)',errors.length===0,errors);
 await tap('#stamps');const book1=await page.evaluate(()=>!document.querySelector('.ix-book').hidden);check('수첩 열림',book1);
 await page.screenshot({path:`${dir}/after-${name}-book.png`});
 const closeBook=async()=>{if(await page.evaluate(()=>!document.querySelector('.ix-book').hidden)){await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'panel-close'}})));await page.waitForTimeout(300);}};
 if(touch){const cb=await page.$('.ix-book [data-a=close]');if(cb){const b=await cb.boundingBox();await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);}}else await tap('#stamps');await page.waitForTimeout(300);let book2=await page.evaluate(()=>!document.querySelector('.ix-book').hidden);check('수첩 닫힘(데스크톱은 J 버튼, 터치는 수첩의 닫기 버튼)',!book2);await closeBook();
 await tap('#stretch');const stretch=await page.evaluate(()=>{const a=document.querySelector('.ix-action');return !!a&&!a.hidden;});check('스트레칭 시작',stretch);
 await page.waitForTimeout(300);
 await tap('#map-toggle');check('지도 열림',await page.evaluate(()=>document.getElementById('map').open));await page.screenshot({path:`${dir}/after-${name}-map.png`});
 if(touch){await page.touchscreen.tap(...await page.evaluate(()=>{const b=document.querySelector('#map [data-close]').getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2];}));}else await page.keyboard.press('Escape');
 await page.waitForTimeout(300);check('지도 닫힘',await page.evaluate(()=>!document.getElementById('map').open));
 await tap('#help-toggle');check('조작 안내 열림',await page.evaluate(()=>document.getElementById('help').open));
 check('조작 안내에 일시정지 설명 없음',await page.evaluate(()=>!/일시정지|계속하기/.test(document.getElementById('help').innerText)));
 await page.keyboard.press('Escape');await page.waitForTimeout(300);check('조작 안내가 ESC로 닫힘',await page.evaluate(()=>!document.getElementById('help').open));
 await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
 const snd0=await page.evaluate(()=>document.getElementById('sound-toggle').getAttribute('aria-pressed'));await tap('#sound-toggle');const snd1=await page.evaluate(()=>document.getElementById('sound-toggle').getAttribute('aria-pressed'));check('소리 켜기/끄기',snd0!==snd1,[snd0,snd1]);
 const q0=await page.evaluate(()=>document.getElementById('quality').textContent);await tap('#quality');const q1=await page.evaluate(()=>document.getElementById('quality').textContent);check('화질 바꾸기',q0!==q1,[q0,q1]);
 await tap('#hud-hide');check('HUD 가려짐',await page.evaluate(()=>document.getElementById('app').classList.contains('hud-hidden')));
 await page.screenshot({path:`${dir}/after-${name}-hud-hidden.png`});
 if(touch){await tap('.hud-restore');}else await page.keyboard.press('h');
 await page.waitForTimeout(300);check('HUD 다시 보임',await page.evaluate(()=>!document.getElementById('app').classList.contains('hud-hidden')));
 // 구간 이동 목록: 열었을 때 다른 버튼과 겹치지 않음
 await tap('#section-jump .sj-toggle');
 const sj=await page.evaluate(()=>{const l=document.querySelector('#section-jump .sj-list').getBoundingClientRect();const hits=[...document.querySelectorAll('#app nav button,header button,#quality')].filter(b=>b.offsetParent!==null).filter(b=>{const c=b.getBoundingClientRect();return l.left<c.right&&l.right>c.left&&l.top<c.bottom&&l.bottom>c.top;}).map(b=>b.id);return {open:!document.querySelector('#section-jump .sj-list').hidden,hits,right:l.right,bottom:l.bottom};});
 check('구간 이동 목록 열림·다른 버튼과 안 겹침',sj.open&&sj.hits.length===0,sj);await page.screenshot({path:`${dir}/after-${name}-section-jump.png`});
 await tap('#section-jump .sj-toggle');
 // 달리기(손가락)
 if(touch){await page.evaluate(()=>{window.__held=false;new MutationObserver(()=>{if(document.getElementById('run').classList.contains('held'))window.__held=true;}).observe(document.getElementById('run'),{attributes:true,attributeFilter:['class']});});await tap('#run');check('달리기 버튼이 눌림 반응',await page.evaluate(()=>window.__held));}
 // 4) 키보드: Space는 일시정지가 아님, ESC는 닫기만
 if(!touch){
  const p0=await snap();await page.keyboard.press('Space');await page.waitForTimeout(200);check('Space는 아무 일도 안 함(일시정지 없음)',!(await page.evaluate(()=>document.getElementById('status').textContent.includes('일시정지'))));
  await page.keyboard.press('Escape');await page.waitForTimeout(200);st=await snap();check('ESC만으로는 아무 일도 안 일어남',st.auto===p0.auto&&st.pose===p0.pose);
  await page.keyboard.press('b');await page.waitForTimeout(400);st=await snap();check('B 쌍안경',st.gadget==='binoculars');await page.keyboard.press('Escape');await page.waitForTimeout(300);st=await snap();check('ESC로 쌍안경 닫힘',st.gadget==='none'||!st.gadget);
  await page.keyboard.press('p');await page.waitForTimeout(400);st=await snap();check('P 휴대폰',st.gadget==='phone');await page.keyboard.press('Escape');await page.waitForTimeout(300);st=await snap();check('ESC로 휴대폰 닫힘',st.gadget==='none'||!st.gadget);
  await page.keyboard.press('m');await page.waitForTimeout(300);const mo=await page.evaluate(()=>document.getElementById('map').open);await page.keyboard.press('Escape');await page.waitForTimeout(300);check('M 지도 열고 ESC로 닫기',mo&&await page.evaluate(()=>!document.getElementById('map').open));
  await page.keyboard.press('t');
 }
 // 5) 손가락 조이스틱
 if(touch){
  const cdp=await ctx.newCDPSession(page);const tt=(type,x,y,id=1)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id}]});
  const targets=await page.evaluate(()=>hiking.jumpTargets());r.jumpTargets=targets;
  const target=targets.find(t=>t==='acacia')??targets.find(t=>!/plaza|gate|summit|yeonju/.test(t));
  await page.evaluate(id=>hiking.jumpTo(id),target);await page.waitForTimeout(1500);await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
  r.walkStart=target;
  const W=viewport.width,H=viewport.height;
  const joy=()=>page.evaluate(()=>{const e=document.getElementById('joystick'),b=e.getBoundingClientRect();return {on:e.classList.contains('on'),cx:b.x+b.width/2,cy:b.y+b.height/2,opacity:+getComputedStyle(e).opacity,kx:(()=>{const k=e.firstElementChild.getBoundingClientRect();return [k.x+k.width/2,k.y+k.height/2];})()};});
  // A. 왼쪽 절반 아무 곳이나 → 그 자리에 생김 (+ 해제하면 사라짐)
  for(const [px,py] of [[W*.12,H*.55],[W*.4,H*.3],[W*.3,H*.75]]){await tt('touchStart',px,py);await page.waitForTimeout(150);const j=await joy();check(`조이스틱이 누른 자리(${Math.round(px)},${Math.round(py)})에 생김`,j.on&&Math.abs(j.cx-Math.max(68,px))<2.5&&Math.abs(j.cy-Math.max(68,Math.min(H-68,py)))<2.5,j);await tt('touchEnd');await page.waitForTimeout(150);check('손을 떼면 조이스틱이 사라짐',!(await joy()).on);}
  // B. 오른쪽 절반은 시점 드래그(조이스틱이 안 생기고 걷지 않음)
  {const s0=await snap();await tt('touchStart',W*.7,H*.55);await tt('touchMove',W*.7+8,H*.55);await tt('touchMove',W*.7+60,H*.55);await page.waitForTimeout(250);const j=await joy();await tt('touchEnd');await page.waitForTimeout(500);const s1=await snap();
   check('오른쪽 절반 드래그는 시점만 돌림',!j.on&&Math.abs(s1.heading-s0.heading)>.02&&Math.abs(s1.s-s0.s)<.05,{on:j.on,dHeading:s1.heading-s0.heading,dS:s1.s-s0.s});}
  // C. 왼쪽 드래그는 시점을 돌리지 않음 + 데드존
  {const s0=await snap();await tt('touchStart',W*.25,H*.6);await tt('touchMove',W*.25+5,H*.6-6);await page.waitForTimeout(1200);const s1=await snap();await tt('touchEnd');await page.waitForTimeout(300);
   check('데드존 안(8px)은 걷지 않음',Math.abs(s1.s-s0.s)<.05&&Math.abs(s1.lateral-s0.lateral)<.05,{dS:s1.s-s0.s,dLat:s1.lateral-s0.lateral});
   await tt('touchStart',W*.25,H*.6);await tt('touchMove',W*.25+30,H*.6-60);await page.waitForTimeout(600);const s2=await snap();await tt('touchEnd');await page.waitForTimeout(300);
   check('왼쪽 드래그로 시점이 안 돌아감',Math.abs(s2.heading-s0.heading)<.02,s2.heading-s0.heading);}
  // D. 8방향: 오른쪽·사선·뒤
  const dirTest=async(label,dx,dy,pred)=>{await page.evaluate(id=>hiking.jumpTo(id),target);await page.waitForTimeout(900);await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));const s0=await snap();const px=W*.25,py=H*.6;await tt('touchStart',px,py);await tt('touchMove',px+dx*.4,py+dy*.4);await tt('touchMove',px+dx,py+dy);await page.waitForTimeout(1600);const s1=await snap();await tt('touchEnd');await page.waitForTimeout(300);const d={dS:+(s1.s-s0.s).toFixed(2),dLat:+(s1.lateral-s0.lateral).toFixed(2)};check(label,pred(d),d);};
  await dirTest('앞으로(0°): 곧게 앞으로',0,-60,d=>d.dS>.8&&Math.abs(d.dLat)<.05);
  await dirTest('앞 20° 비껴 밀어도 곧게(직진 보정)',22,-60,d=>d.dS>.8&&Math.abs(d.dLat)<.05);
  await dirTest('앞 −24° 비껴 밀어도 곧게(직진 보정)',-26,-58,d=>d.dS>.8&&Math.abs(d.dLat)<.05);
  await dirTest('앞오른쪽 45° 사선 이동',42,-42,d=>d.dS>.4&&d.dLat>.4);
  await dirTest('오른쪽 90° 옆걸음',60,0,d=>Math.abs(d.dS)<.15&&d.dLat>.8);
  await dirTest('왼쪽 90° 옆걸음',-60,0,d=>Math.abs(d.dS)<.15&&d.dLat<-.8);
  await dirTest('뒤로(180°) 뒷걸음',0,60,d=>d.dS<-.4&&Math.abs(d.dLat)<.05);
  // E. 기준점이 손가락을 따라옴(반지름 밖으로 끌어도)
  {const px=W*.2,py=H*.5;await tt('touchStart',px,py);await tt('touchMove',px+20,py-40);await tt('touchMove',px+40,py-220);await page.waitForTimeout(250);const j=await joy();const dist=Math.hypot(j.kx[0]-(px+40),j.kx[1]-(py-220));const base=Math.hypot(j.cx-(px+40),j.cy-(py-220));
   check('멀리 끌어도 조이스틱 기준점이 따라와 손가락이 고리 안에 있음',base<=58&&dist<=2,{base,knobToFinger:dist});
   await page.screenshot({path:`${dir}/after-${name}-joystick.png`});await tt('touchEnd');await page.waitForTimeout(300);}
  // F. 직진 걷기 30m
  {await page.evaluate(id=>hiking.jumpTo(id),target);await page.waitForTimeout(1200);await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
   const s0=await snap();const px=W*.2,py=H*.62;const t0=Date.now();await tt('touchStart',px,py);let k=0;const lat=[];let sN=s0,wob=[[16,-62],[-18,-60],[10,-64],[-12,-60]];
   while(sN.s-s0.s<30&&Date.now()-t0<150000){await tt('touchMove',px+wob[k%4][0],py+wob[k%4][1]);k++;await page.waitForTimeout(500);sN=await snap();lat.push(+(sN.lateral-s0.lateral).toFixed(3));}
   await tt('touchEnd');const secs=(Date.now()-t0)/1000;const dS=sN.s-s0.s,maxLat=Math.max(...lat.map(Math.abs));
   r.walk30={start:target,dS:+dS.toFixed(2),seconds:+secs.toFixed(1),maxLateralDrift:maxLat,samples:lat.length};
   check('직진 30m 걷기(손가락이 좌우로 ±18° 흔들려도)',dS>=30&&maxLat<.1,r.walk30);
   await page.waitForTimeout(400);}
 }
 check('콘솔 오류 0건',errors.length===0,errors);
 all[name]=r;writeFileSync(`${dir}/results-${name}.json`,JSON.stringify(r,null,1));
 console.log(name,r.checks.filter(c=>!c.ok).length?'실패 있음':'모두 통과',`(${r.checks.length}개 확인)`,r.walk30??'');
 await ctx.close();
}
await browser.close();
console.log(fail?`실패 ${fail}건`:'전체 통과');process.exit(fail?1:0);
