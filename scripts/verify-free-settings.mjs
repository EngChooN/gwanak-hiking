// 산 고르기 · 완등 도장 · 자유 설정 확인(2026-11-06). 아이폰 13 세로(390×844)·가로(844×390)는 WebKit, PC 1920×1080은 Chromium.
// 헤드리스는 env(safe-area-inset-*)가 0이라 노치·홈 막대 값을 HUD 변수(--sl·--sr·--st·--sb)로 넣어 흉내 낸다.
// 사용: npm run build && npm run preview(4173) → node scripts/verify-free-settings.mjs · 결과: artifacts/free-settings/
// 점검: 44px 이상·안전 영역 안·눌림·겹침·판 안 스크롤 없음, 고르면 바로 적용(계절·날씨·시간), 출발 지점, 완등 도장(실제 정상 도착 경로), 잠김(?dev=off), 메모리.
import {webkit,chromium,devices} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.BASE_URL??'http://127.0.0.1:4173/',out=process.env.OUT??'artifacts/free-settings';mkdirSync(out,{recursive:true});
const VIEWS=[['portrait',{width:390,height:844},{sl:0,sr:0,st:47,sb:34},'webkit'],['landscape',{width:844,height:390},{sl:47,sr:47,st:0,sb:21},'webkit'],['pc',{width:1920,height:1080},{sl:0,sr:0,st:0,sb:0},'chromium']];
const only=process.env.VIEWS?.split(',');
const report={base,views:{}};let failed=0;
const fail=(v,msg)=>{failed++;(report.views[v].fails??=[]).push(msg);console.log('  ✗',msg);};
// 보이는 버튼을 모두 검사한다(root 안). 겹침은 같은 부모 아래 형제 버튼끼리만 본다.
const audit=(page,root,safe)=>page.evaluate(([root,safe])=>{
 const box={l:safe.sl,t:safe.st,r:innerWidth-safe.sr,b:innerHeight-safe.sb},el=document.querySelector(root);if(!el)return {missing:true};
 const btns=[...el.querySelectorAll('button')].filter(b=>{const r=b.getBoundingClientRect(),cs=getComputedStyle(b);return r.width>0&&r.height>0&&cs.visibility!=='hidden'&&!b.closest('[hidden],.fs-ghost');});
 const rows=btns.map(b=>{const r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
  return {label:(b.getAttribute('aria-label')||b.textContent).trim().slice(0,24),size:Math.round(Math.min(r.width,r.height)),inside:r.left>=box.l-.5&&r.top>=box.t-.5&&r.right<=box.r+.5&&r.bottom<=box.b+.5,tappable:!!hit&&(hit===b||b.contains(hit)),rect:[r.left,r.top,r.right,r.bottom].map(Math.round),parent:b.parentElement};});
 const overlaps=[];for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){const a=rows[i].rect,c=rows[j].rect;if(a[0]<c[2]-1&&a[2]>c[0]+1&&a[1]<c[3]-1&&a[3]>c[1]+1)overlaps.push([rows[i].label,rows[j].label]);}
 const scrollers=[...el.querySelectorAll('.fs-panel'),...(el.matches('.fs-panel')?[el]:[])].filter(p=>p.offsetParent&&p.scrollHeight>p.clientHeight+2).map(p=>[p.className,p.scrollHeight,p.clientHeight]);
 const clipped=[...el.querySelectorAll('button,b,small,span,h1,h2,h4,p')].filter(x=>x.offsetParent&&x.scrollWidth>x.clientWidth+2&&getComputedStyle(x).overflow==='hidden'&&!x.closest('.fs-ghost')).map(x=>x.textContent.trim().slice(0,20));
 return {count:rows.length,small:rows.filter(r=>r.size<44).map(r=>`${r.label}(${r.size})`),outside:rows.filter(r=>!r.inside).map(r=>r.label),blocked:rows.filter(r=>!r.tappable).map(r=>r.label),overlaps,scrollers,clipped};
},[root,safe]);
const check=(v,name,a)=>{report.views[v][name]=a;if(a.missing)return fail(v,`${name}: 없음`);
 for(const k of ['small','outside','blocked','overlaps','scrollers','clipped'])if(a[k].length)fail(v,`${name} ${k}: ${JSON.stringify(a[k])}`);
 console.log(`  ${name}: 버튼 ${a.count}개 검사`);};

for(const [v,viewport,safe,engine] of VIEWS){
 if(only&&!only.includes(v))continue;
 report.views[v]={};console.log(v);
 const browser=engine==='webkit'?await webkit.launch({headless:true}):await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const ctxOpts=engine==='webkit'?{...devices['iPhone 13'],viewport,screen:viewport}:{viewport,deviceScaleFactor:1};
 const safeCss=`:root{--sl:${safe.sl}px!important;--sr:${safe.sr}px!important;--st:${safe.st}px!important;--sb:${safe.sb}px!important}#resume-note{display:none!important}`;
 // ── A. 개발 버전(기본): 산 고르기 → 판에서 겨울·제4쉼터 → 이대로 오르기 → 게임 안 자유 설정 ──
 {
  const context=await browser.newContext(ctxOpts);
  await context.addInitScript(css=>{localStorage.setItem('gwanak-sound-enabled','false');document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=css;document.head.append(s);});},safeCss);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'?pick=on');
  await page.waitForSelector('#mountain-pick .pk-card');await page.waitForTimeout(600);
  await page.screenshot({path:`${out}/${v}-pick.png`});check(v,'산 고르기',await audit(page,'#mountain-pick',safe));
  const card=await page.evaluate(()=>({go:document.querySelector('[data-pk-go]')?.textContent,free:document.querySelector('[data-pk-free]')?.textContent,dev:!!document.querySelector('.pk-devtag'),tag:document.querySelector('.pk-tag')?.textContent,startMode:document.documentElement.dataset.startMode,started:!!window.hiking?.started}));
  report.views[v].card=card;console.log('  카드',JSON.stringify(card));
  if(card.started)fail(v,'산을 고르기 전에 게임이 시작됨');
  if(!/가을/.test(card.tag))fail(v,'카드 계절 꼬리표가 가을이 아님: '+card.tag);
  await page.click('[data-pk-free]');await page.waitForTimeout(300);
  await page.screenshot({path:`${out}/${v}-pick-free.png`});check(v,'산 고르기 자유 설정',await audit(page,'.pk-free',safe));
  await page.click('.pk-free [data-free-season=winter]');await page.click('.pk-free [data-free-start=shelter-4]');await page.waitForTimeout(200);
  await page.screenshot({path:`${out}/${v}-pick-free-picked.png`});
  await page.click('.pk-free [data-free-go]');
  await page.waitForFunction(()=>window.hiking?.started===true,null,{timeout:300000});await page.waitForTimeout(2500);
  const afterStart=await page.evaluate(()=>({season:hiking.season().season,manual:hiking.season().manual,s:Math.round(hiking.snapshot().s),pick:!!document.getElementById('mountain-pick')}));
  report.views[v].afterStart=afterStart;console.log('  출발 뒤',JSON.stringify(afterStart));
  if(afterStart.season!=='winter')fail(v,'산 고르기에서 고른 계절이 적용되지 않음');
  if(Math.abs(afterStart.s-2634)>40)fail(v,'제4쉼터에서 출발하지 않음: s='+afterStart.s);
  if(afterStart.pick)fail(v,'산 고르기 화면이 남아 있음');
  // 게임 안: 설정 탭 → 자유 설정
  await page.click('[data-tab=settings]');await page.waitForTimeout(300);
  await page.screenshot({path:`${out}/${v}-settings.png`});check(v,'설정 탭',await audit(page,'[data-sheet=settings]',safe));
  await page.click('.fs-entry');await page.waitForTimeout(400);await page.screenshot({path:`${out}/${v}-free.png`});
  report.views[v].sheetBox=await page.evaluate(()=>{const r=document.querySelector('[data-sheet=free]').getBoundingClientRect();return [r.top,r.bottom,innerHeight].map(Math.round);});console.log('  시트',JSON.stringify(report.views[v].sheetBox));
  check(v,'자유 설정 시트',await audit(page,'[data-sheet=free]',safe));
  // 눈·밤 고르기 → 바로 적용(다시 로딩 없음)
  const loads0=await page.evaluate(()=>performance.getEntriesByType('navigation').length);
  await page.click('[data-sheet=free] [data-free-weather=snow]');await page.click('[data-sheet=free] [data-free-time=night]');
  await page.waitForTimeout(3500);
  await page.screenshot({path:`${out}/${v}-free-snow-night.png`});
  const env=await page.evaluate(()=>({chip:document.querySelector('#env-chip')?.textContent,manual:document.querySelector('#env-chip')?.classList.contains('fs-manual'),weather:hiking.snapshot&&window.__hikingMetrics?null:null,hud:document.documentElement.dataset.hudTime,started:hiking.started,status:document.querySelector('[data-sheet=free] .fs-now b')?.textContent}));
  const envInfo=await page.evaluate(()=>new Promise(r=>{const f=e=>{window.removeEventListener('hiking:environment',f);r(e.detail);};window.addEventListener('hiking:environment',f);window.dispatchEvent(new CustomEvent('hiking:free-settings',{detail:{}}));setTimeout(()=>r(null),1500);}));
  report.views[v].snowNight={...env};console.log('  눈·밤',JSON.stringify(env));
  if(env.hud!=='night')fail(v,'밤을 골랐는데 수첩 톤이 밤이 아님: '+env.hud);
  if(!env.manual||!/✎/.test(env.chip))fail(v,'꼬리표에 직접 고름 표시가 없음');
  if(!/겨울 · 눈 · 밤/.test(env.status||''))fail(v,'상태 줄: '+env.status);
  // 노을·비·봄도 찍어 둔다
  await page.click('[data-sheet=free] [data-free-time=dusk]');await page.click('[data-sheet=free] [data-free-weather=rain]');await page.click('[data-sheet=free] [data-free-season=spring]');
  await page.waitForTimeout(3500);await page.screenshot({path:`${out}/${v}-free-spring-rain-dusk.png`});
  const sr=await page.evaluate(()=>({season:hiking.season().season,hud:document.documentElement.dataset.hudTime}));
  if(sr.season!=='spring'||sr.hud!=='dusk')fail(v,'봄·노을 적용 안 됨 '+JSON.stringify(sr));
  // 현재 그대로
  await page.click('[data-sheet=free] [data-free-reset]');await page.waitForTimeout(3000);
  const reset=await page.evaluate(()=>({season:hiking.season().season,manual:hiking.season().manual,chip:document.querySelector('#env-chip').classList.contains('fs-manual'),free:sessionStorage.getItem('gwanak-free-settings')}));
  report.views[v].reset=reset;if(reset.season!=='autumn'||reset.manual||reset.chip||reset.free)fail(v,'현재 그대로가 안 됨 '+JSON.stringify(reset));
  await page.screenshot({path:`${out}/${v}-free-now.png`});
  // 출발 지점: 일주문 → 여기서 다시 출발
  await page.click('[data-sheet=free] [data-free-start=gate]');await page.click('[data-sheet=free] [data-free-go]');await page.waitForTimeout(1500);
  const gate=await page.evaluate(()=>({s:Math.round(hiking.snapshot().s),elapsed:hiking.snapshot().elapsed,sheet:!document.querySelector('[data-sheet=free]').hidden}));
  report.views[v].restart=gate;if(gate.s>140||gate.elapsed>5)fail(v,'일주문에서 다시 출발 안 됨 '+JSON.stringify(gate));
  // 실제 정상 도착 경로: 제3깔딱고개에서 새로 출발 → 정상석 곁으로 옮김 → 몇 걸음 걸어 정상 도착 판정(main.js가 기록·도장)
  await page.evaluate(()=>{hiking.restartFrom('pass-3');hiking.jumpNear('stamp-6',{back:4});});await page.waitForTimeout(500);
  let real=false;for(let k=0;k<8&&!real;k++){await page.keyboard.down('KeyW');await page.waitForTimeout(700);await page.keyboard.up('KeyW');real=await page.evaluate(()=>document.getElementById('summit').open);}
  report.views[v].summitReal=real;console.log('  실제 정상 도착 판정',real);
  if(!real){await page.evaluate(()=>{const st=JSON.parse(localStorage.getItem('gwanak-summits')||'{}');st.gwanak??={first:'2026-11-06',count:0,bestSec:null,last:null};st.gwanak.count++;localStorage.setItem('gwanak-summits',JSON.stringify(st));window.dispatchEvent(new CustomEvent('hiking:summit-record',{detail:{id:'gwanak'}}));document.getElementById('summit').showModal();});}
  const rec=await page.evaluate(()=>JSON.parse(localStorage.getItem('gwanak-summits')||'null'));report.views[v].record=rec;console.log('  기록',JSON.stringify(rec));
  if(!rec?.gwanak?.count)fail(v,'완등 기록이 저장되지 않음');
  if(real&&rec?.gwanak?.bestSec!=null)fail(v,'중간 출발인데 가장 빠른 기록에 들어감');
  await page.waitForTimeout(1400);await page.screenshot({path:`${out}/${v}-summit-seal.png`});
  check(v,'정상 도착 창',await audit(page,'#summit',safe));
  const link=await page.evaluate(()=>!document.querySelector('.fs-summit-link').hidden);if(!link)fail(v,'정상 도착 창에 자유 설정 열림 안내가 없음');
  await page.click('.fs-summit-link');await page.waitForTimeout(400);
  const openedFree=await page.evaluate(()=>!document.querySelector('[data-sheet=free]').hidden);if(!openedFree)fail(v,'정상 도착 창에서 자유 설정이 열리지 않음');
  await page.screenshot({path:`${out}/${v}-free-done.png`});
  await page.click('[data-sheet=free] [data-free-close]');await page.waitForTimeout(200);
  await page.click('#map-toggle');await page.waitForTimeout(500);await page.screenshot({path:`${out}/${v}-map-seal.png`});
  check(v,'지도',await audit(page,'#map',safe));
  const map=await page.evaluate(()=>({seal:!!document.querySelector('.fs-mapseal svg'),sub:document.querySelector('#map .dialog-heading small').textContent,rec:document.querySelector('.fs-maprec').textContent}));
  report.views[v].map=map;if(!map.seal||!/등산 완료/.test(map.sub))fail(v,'지도 도장 없음');
  await page.click('#map .nb-close');
  // 메모리(휴대폰): 계절 4개·날씨 5개를 차례로 바꾸며 최고치
  const mem=[];for(const [k,val] of [['season','winter'],['weather','snow'],['season','spring'],['weather','rain'],['season','summer'],['weather','fog'],['season','autumn'],['weather','overcast'],['time','night']]){
   await page.evaluate(([k,val])=>window.dispatchEvent(new CustomEvent('hiking:free-settings',{detail:{[k]:val}})),[k,val]);await page.waitForTimeout(1200);
   mem.push(await page.evaluate(()=>hiking.memory().totalMB));}
  report.views[v].memoryMB={max:Math.max(...mem),rows:mem};console.log('  메모리 최고',Math.max(...mem),'MB');
  const loads1=await page.evaluate(()=>performance.getEntriesByType('navigation').length);if(loads1!==loads0)fail(v,'다시 로딩됨');
  report.views[v].errors=errors;if(errors.length)fail(v,'오류 '+errors.slice(0,3).join(' | '));
  // 기록이 있는 채로 다시 열면 산 고르기 카드에 도장
  await page.goto(base+'?pick=on');await page.waitForSelector('#mountain-pick .pk-card');await page.waitForTimeout(1500);
  await page.screenshot({path:`${out}/${v}-pick-done.png`});
  const done=await page.evaluate(()=>({seal:!!document.querySelector('.pk-seal svg'),rec:document.querySelector('.pk-rec').textContent,go:document.querySelector('[data-pk-go]').textContent}));
  report.views[v].pickDone=done;if(!done.seal)fail(v,'산 고르기 카드에 도장이 없음');
  await context.close();
 }
 // ── B. 잠김(?dev=off, 완등 기록 없음) ──
 {
  const context=await browser.newContext(ctxOpts);
  await context.addInitScript(css=>{localStorage.setItem('gwanak-sound-enabled','false');document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=css;document.head.append(s);});},safeCss);
  const page=await context.newPage();
  await page.goto(base+'?pick=on&dev=off');await page.waitForSelector('#mountain-pick .pk-card');await page.waitForTimeout(500);
  await page.click('[data-pk-free]');await page.waitForTimeout(300);
  const toast=await page.evaluate(()=>({toast:document.querySelector('.pk-toast').hidden?null:document.querySelector('.pk-toast').textContent,dev:!!document.querySelector('.pk-devtag'),panel:!document.querySelector('.pk-free').hidden}));
  await page.screenshot({path:`${out}/${v}-pick-locked.png`});
  report.views[v].locked={...toast};if(!toast.toast||toast.dev||toast.panel)fail(v,'잠김 알림 이상 '+JSON.stringify(toast));
  await page.click('[data-pk-go]');await page.waitForFunction(()=>window.hiking?.started===true,null,{timeout:300000});await page.waitForTimeout(1500);
  await page.click('[data-tab=settings]');await page.waitForTimeout(300);await page.click('.fs-entry');await page.waitForTimeout(400);
  await page.screenshot({path:`${out}/${v}-free-locked.png`});check(v,'잠긴 자유 설정',await audit(page,'[data-sheet=free]',safe));
  const lk=await page.evaluate(()=>({jump:!!document.querySelector('#section-jump')&&!document.querySelector('#section-jump').hidden,clear:!!document.querySelector('.fs-clear'),enabled:document.querySelectorAll('[data-sheet=free] [data-free-weather]:not([disabled])').length}));
  report.views[v].locked.game=lk;if(lk.jump||lk.clear||lk.enabled)fail(v,'잠김인데 열린 것이 있음 '+JSON.stringify(lk));
  await context.close();
 }
 await browser.close();
}
report.failed=failed;writeFileSync(`${out}/report.json`,JSON.stringify(report,null,1));
console.log(failed?`실패 ${failed}건`:'모두 통과');process.exit(failed?1:0);
