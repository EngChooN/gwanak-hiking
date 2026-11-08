// 즐길거리 HUD 버튼(2026-11-07부터 들르기·기구 버튼은 대상 위 칩 #trail-chip)을 휴대폰 세로(390×844)·가로(844×390)·PC(1920×1080)에서 실제로 눌러 본다(2026-11-06, verify-mobile-buttons.mjs 방식).
//  ① 입구 광장: 🍫 먹기(5→4, ⚡ 칩, 겹쳐 먹기 막힘) → 에어건 옆 '💨 신발 털기'(깨끗한 신발 칸) → 자동걷기 들르기 버튼(고양이 등) → 자동걷기 복귀
//  ② 산스장: 역기(연타 10번 → 산스장 득근 도장)·거꾸리·허리돌리기·철봉
//  ③ 벤치(1,552m): '벤치에 앉기' → 스테미너가 땅에 앉을 때의 1.5배로 참 → '일어나기'
// 버튼마다 안전 영역 안·손가락 크기(휴대폰 44px)·다른 것에 가리지 않음을 보고, 말풍선 층(HUD 위·알림 아래)도 확인한다.
// 사용: 개발 서버(npx vite --port 5310) → node scripts/verify-trail-buttons.mjs  · 결과: artifacts/trail-hud/
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.BASE_URL??'http://127.0.0.1:5310/',out=process.env.OUT??'artifacts/trail-hud';mkdirSync(out,{recursive:true});
const only=process.argv[2];
const VIEWS=[['portrait',{width:390,height:844},{sl:0,sr:0,st:47,sb:34},true],['landscape',{width:844,height:390},{sl:47,sr:47,st:0,sb:21},true],['pc',{width:1920,height:1080},{sl:0,sr:0,st:0,sb:0},false]].filter(v=>!only||v[0]===only);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const report={};let failed=0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

for(const [name,viewport,safe,mobile] of VIEWS){
 const ctx=await browser.newContext({viewport,deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile});
 // 자리 옮기기: 페이지가 닫힐 때 자기 위치를 저장하므로, 옮길 저장값은 sessionStorage로 넘겨 새 문서의 스크립트보다 먼저 쓴다.
 await ctx.addInitScript(()=>{if(!sessionStorage.getItem('vt-keep')){localStorage.clear();sessionStorage.setItem('vt-keep','1');}localStorage.setItem('gwanak-sound-enabled','false');
  const v=sessionStorage.getItem('vt-save');if(v){localStorage.setItem('gwanak-hiking:v1',v);sessionStorage.removeItem('vt-save');}});
 const page=await ctx.newPage(),errors=[],log=[],checks=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/favicon|404/.test(m.text()))errors.push(m.text().slice(0,300));});
 const ok=(what,pass,info='')=>{checks.push({what,pass:!!pass,info});console.log(name,pass?'✓':'✗',what,info);};
 const load=async(url)=>{await page.goto(url);await page.waitForFunction(()=>window.hiking?.started&&window.hiking.trail&&window.hiking.landscape().natureReady,null,{timeout:300000});
  await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
  await page.addStyleTag({content:`:root{--sl:${safe.sl}px!important;--sr:${safe.sr}px!important;--st:${safe.st}px!important;--sb:${safe.sb}px!important}#resume-note{display:none!important}`});await sleep(1200);};
 // 버튼 검사 + 실제 탭
 const tapSel=async(sel,what)=>{await page.waitForSelector(sel,{state:'visible',timeout:15000});
  const r=await page.evaluate(([sel,safe])=>{const el=document.querySelector(sel),b=el.getBoundingClientRect(),hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);
   return {rect:[b.left,b.top,b.width,b.height].map(Math.round),inside:b.left>=safe.sl-.5&&b.top>=safe.st-.5&&b.right<=innerWidth-safe.sr+.5&&b.bottom<=innerHeight-safe.sb+.5,tappable:!!hit&&(hit===el||el.contains(hit)),hitBy:hit&&!(hit===el||el.contains(hit))?`${hit.tagName}#${hit.id}.${hit.getAttribute('class')??''} < ${hit.parentElement?.id||hit.parentElement?.getAttribute('class')||''}`:null,size:Math.round(Math.min(b.width,b.height)),disabled:!!el.disabled};},[sel,safe]);
  const pass=r.inside&&r.tappable&&(!mobile||r.size>=44)&&!r.disabled;ok(`${what} 버튼 보임·눌림`,pass,JSON.stringify(r));
  if(mobile)await page.tap(sel);else await page.click(sel);return r;};
 const trail=()=>page.evaluate(()=>window.hiking.trail.status());
 const waitIdle=async(ms=30000)=>{const t0=Date.now();while(Date.now()-t0<ms){const s=await trail();if(!s.active&&!s.acts.active)return true;await sleep(250);}return false;};
 const shot=async n=>page.screenshot({path:`${out}/${name}-${n}.png`});

 // ── ① 입구 광장
 await load(`${base}?start=entrance&time=11:00&weather=clear&season=summer`);
 // 자리 좌표(코스 거리)와 광장 에어건 앞 저장값을 만든다.
 const saves=await page.evaluate(async()=>{const {sample}=await import('/src/route.js');const T=window.hiking.trail;const st=window.hiking.snapshot();
  const near=(p,back)=>{let best={d:1e9,s:0};for(let q=Math.max(0,p.m-80);q<=p.m+80;q+=.25){const r=sample(q),d=Math.hypot(r.x-p.x,r.z-p.z);if(d<best.d)best={d,s:q};}
   const r=sample(best.s),A=sample(best.s-2),B=sample(best.s+2),L=Math.hypot(B.x-A.x,B.z-A.z),nx=-(B.z-A.z)/L,nz=(B.x-A.x)/L,lat=(p.x-r.x)*nx+(p.z-r.z)*nz;return {...st,auto:false,pose:'stand',zone:'route',plaza:null,summit:null,s:best.s,lateral:Math.sign(lat)*Math.max(0,Math.abs(lat)-back),view:'third',stamina:3};};
  const gym=T.props.find(p=>p.kind==='gym'),bench=T.props.find(p=>p.kind==='bench'&&Math.abs(p.routeMetres-1552)<30),air=T.props.find(p=>p.kind==='airgun');
  return {gym:near({...gym,m:gym.routeMetres},3.2),bench:near({...bench,m:bench.routeMetres},3),air:{x:air.x,z:air.z},sites:T.status().sites};});
 // 🍫 먹기
 const c0=await page.evaluate(()=>({n:window.hiking.snapshot().chocolates,chip:document.querySelector('#choco-count').textContent}));
 await tapSel('#choco','🍫 먹기');await sleep(700);
 const c1=await page.evaluate(()=>({n:window.hiking.snapshot().chocolates,left:window.hiking.snapshot().chocoLeft,chip:document.querySelector('#choco-count').textContent,boost:document.querySelector('#choco-boost').hidden?null:document.querySelector('#choco-boost').textContent,disabled:document.querySelector('#choco').disabled,inCard:(()=>{const c=document.querySelector('.nb-card').getBoundingClientRect(),b=document.querySelector('#choco-boost').getBoundingClientRect();return b.right<=c.right+1&&b.left>=c.left-1;})(),acts:window.hiking.trail.status().acts}));
 ok('초콜릿 5→4개·⚡ 칩·버튼 막힘',c0.n===5&&c1.n===4&&/4\/5/.test(c1.chip)&&/⚡ 빨라짐 0:(2\d|30)/.test(c1.boost??'')&&c1.disabled&&c1.inCard,JSON.stringify({c0,c1:{...c1,acts:undefined}}));
 if(mobile)await page.tap('#choco',{force:true}).catch(()=>{});else await page.click('#choco',{force:true}).catch(()=>{});await sleep(300);
 ok('효과 중 다시 눌러도 안 줄어듦',await page.evaluate(()=>window.hiking.snapshot().chocolates)===4);
 await shot('1-choco');
 // 말풍선 층: HUD(z 6) 위, 알림(z 32) 아래
 const z=await page.evaluate(()=>{const zi=s=>+getComputedStyle(document.querySelector(s)).zIndex;return {bubble:zi('#trail-bubble'),hud:zi('.nb-card'),bar:zi('#trail-bar'),alert:zi('#interaction-ui')};});
 ok('말풍선 층 HUD < 말풍선 < 알림',z.hud<z.bubble&&z.bar<z.bubble&&z.bubble<z.alert,JSON.stringify(z));
 // 자동걷기 들르기: 걷기 도장을 누르고 들르기 버튼이 뜨면 누른다
 await tapSel('#auto','걷기(자동)');
 let offer=null;try{await page.waitForSelector('#trail-chip[data-mode=offer] .tc-offer',{timeout:60000});offer=await page.evaluate(()=>{const b=document.querySelector('.tc-offer');return {act:b.dataset.act,id:b.dataset.id,label:b.textContent};});}catch{}
 ok('자동걷기 중 들르기 버튼(4초)',!!offer,JSON.stringify(offer));
 if(offer){await shot('5-offer');await tapSel('.tc-offer','들르기');
  const played=await page.waitForFunction(()=>window.hiking.trail.status().active,null,{timeout:5000}).then(()=>true).catch(()=>false);
  const t0=Date.now();let back=false;while(Date.now()-t0<40000){const s=await page.evaluate(()=>({a:window.hiking.trail.status().active,auto:window.hiking.snapshot().auto}));if(!s.a&&s.auto){back=true;break;}await sleep(300);}
  ok('들르기 → 동작 → 자동걷기 복귀',played&&back);
  // 4초 뒤 사라짐 확인: 다음 제안이 오면 누르지 않고 기다린다
  const next=await page.waitForSelector('#trail-chip[data-mode=offer]',{timeout:40000}).then(()=>true).catch(()=>false);
  if(next){await sleep(4600);ok('누르지 않으면 4초 뒤 사라짐',await page.evaluate(()=>document.querySelector('#trail-chip').dataset.mode!=='offer'));}}
 await page.evaluate(()=>{if(window.hiking.snapshot().auto)window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'auto'}}));});
 // 에어건 옆(광장 자유 이동): 저장값으로 옮겨 다시 연다
 await page.evaluate(a=>{const st=window.hiking.snapshot();const p={...st,auto:false,zone:'plaza',plaza:{x:a.x+2.6,z:a.z+2.6,heading:Math.atan2(2.6,2.6)},view:'third'};sessionStorage.setItem('vt-save',JSON.stringify(p));},saves.air);
 await load(`${base}?time=11:00&weather=clear&season=summer`);
 await page.waitForSelector('#trail-chip[data-mode=near] [data-act=airgun]',{timeout:15000}).catch(()=>{});
 await shot('2-airgun-near');
 await tapSel('#trail-chip [data-act=airgun]','💨 신발 털기');
 await page.waitForFunction(()=>window.__trailLastSay?.text?.includes('모자'),null,{timeout:15000}).catch(()=>{});
 const bub=await page.evaluate(()=>{const b=document.querySelector('#trail-bubble'),r=b.getBoundingClientRect();return {on:b.classList.contains('on'),text:b.textContent,inside:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight};});
 ok('말풍선 화면 안',bub.on&&bub.inside,JSON.stringify(bub));await shot('3-airgun-bubble');
 await waitIdle();
 const shoes=await page.evaluate(()=>window.hiking.interaction().progress.fun?.shoes);ok("수첩 '깨끗한 신발' 칸",!!shoes);
 // 수첩에 보이는지
 await tapSel('#stamps','수첩');await sleep(600);
 const book=await page.evaluate(()=>[...document.querySelectorAll('.ix-fun-slot')].map(e=>({got:e.classList.contains('got'),t:e.textContent})));
 ok('수첩 즐길거리 칸 2개, 신발 찍힘',book.length===2&&book.find(b=>/신발/.test(b.t))?.got,JSON.stringify(book));await shot('4-book');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'stamps-toggle'}})));await sleep(400);

 // ── ② 산스장
 await page.evaluate(s=>sessionStorage.setItem('vt-save',JSON.stringify(s)),saves.gym);
 await load(`${base}?time=11:00&weather=clear&season=summer`);
 const gymBar=await page.waitForSelector('#trail-chip[data-mode=near] [data-act=gym-lift]',{timeout:20000}).then(()=>true).catch(()=>false);
 ok('산스장 가까이: 가장 가까운 기구 칩 하나(2026-11-07)',gymBar&&await page.evaluate(()=>document.querySelectorAll('#trail-chip [data-act]').length)===1,JSON.stringify(await page.evaluate(()=>({pos:window.hiking.position(),view:document.querySelector('#trail-bar').dataset.mode}))));
 await shot('6-gym-near');
 if(gymBar){
  await tapSel('#trail-chip [data-act=gym-lift]','🏋 역기');
  await page.waitForSelector('#trail-bar[data-mode=lift] .tb-lift',{timeout:20000});await sleep(900);
  for(let i=0;i<10;i++){if(mobile)await page.tap('.tb-lift');else await page.click('.tb-lift');await sleep(160);if(i===4)await shot('7-lift');}
  const reps=await page.evaluate(()=>window.hiking.trail.status().acts.active?.reps);
  await page.waitForFunction(()=>window.hiking.interaction().progress.fun?.gym,null,{timeout:8000}).catch(()=>{});
  ok("역기 연타 10번 → '산스장 득근' 도장",reps===10&&await page.evaluate(()=>!!window.hiking.interaction().progress.fun?.gym),`reps ${reps}`);
  await shot('8-lift-done');await waitIdle();
  for(const [act,label] of [['gym-hang','🙃 거꾸리'],['gym-twist','🌀 허리돌리기'],['gym-bar','🤸 철봉']]){
   // 칩은 가장 가까운 기구 하나만 뜬다(2026-11-07). 나머지 기구는 칩과 같은 명령으로 바로 시작한다.
   await page.evaluate(([act,id])=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'trail-play',value:{act,id,manual:true}}})),[act,await page.evaluate(()=>window.hiking.trail.status().sites.find(s=>s.kind==='gym').id)]);
   const started=await page.waitForFunction(a=>window.hiking.trail.status().acts.active?.name===a,act,{timeout:15000}).then(()=>true).catch(()=>false);
   if(act==='gym-hang'){await sleep(2600);await shot('9-hang');}
   ok(`${label} 동작`,started&&await waitIdle(30000));}
 }

 // ── ③ 벤치
 await page.evaluate(s=>sessionStorage.setItem('vt-save',JSON.stringify(s)),saves.bench);
 await load(`${base}?time=11:00&weather=clear&season=summer`);
 const benchBar=await page.waitForSelector('#trail-chip[data-mode=near] [data-act=bench-sit]',{timeout:20000}).then(()=>true).catch(()=>false);
 ok('벤치 6m 안 앉기 버튼',benchBar);
 // 스테미너: 헤드리스는 프레임이 느려(한 프레임 0.1초 상한) 벽시계로 재면 낮게 나온다. 같은 조건에서 서 있을 때(초당 8)와 비율로 본다.
 const rateOf=async ms=>{const a=await page.evaluate(()=>window.hiking.snapshot().stamina);await sleep(ms);return (await page.evaluate(()=>window.hiking.snapshot().stamina)-a)/(ms/1000);};
 const idleRate=benchBar?await rateOf(1500):0;
 if(benchBar){await tapSel('#trail-chip [data-act=bench-sit]','🪑 벤치에 앉기');
  await page.waitForFunction(()=>window.hiking.trail.status().acts.active?.state==='hold',null,{timeout:20000}).catch(()=>{});
  const rate=await rateOf(1500),ratio=rate/idleRate;ok('벤치 스테미너 = 서 있을 때의 22.5/8≈2.8배(땅에 앉기 15의 1.5배)',ratio>2.5&&ratio<3.1,`서 있음 ${idleRate.toFixed(1)} · 벤치 ${rate.toFixed(1)} · ${ratio.toFixed(2)}배`);
  await shot('10-bench');
  await tapSel('#trail-bar[data-mode=stand-up] [data-stop]','🧍 일어나기');ok('일어나서 길로 돌아옴',await waitIdle(20000));}

 // ⑥ 쥐: 검수용으로 쥐를 내고 '🦶 발끝 당기기'를 누른다
 const cr=await page.evaluate(()=>window.hiking.trail.exhaust?.('cramp'));
 if(cr!==undefined){await page.waitForSelector('#trail-bar[data-mode=cramp] [data-cramp]',{timeout:5000}).catch(()=>{});await shot('11-cramp');
  const tag=await page.evaluate(()=>{const t=document.querySelector('.nb-cramp');return t&&!t.hidden?t.textContent:null;});ok("스테미너 칸 '쥐 0:0n'",/쥐 0:0\d/.test(tag??''),tag??'');
  await tapSel('#trail-bar [data-cramp]','🦶 발끝 당기기');
  const t0=Date.now();await page.waitForFunction(()=>window.hiking.trail.exhaustion?.().phase!=='cramp',null,{timeout:4000}).catch(()=>{});ok('발끝 당기기 → 1초 남짓에 풀림',Date.now()-t0<2000,`${Date.now()-t0}ms`);}
 const failedHere=checks.filter(c=>!c.pass).length+errors.length;if(failedHere)failed++;
 report[name]={checks,errors};console.log(name,'실패',checks.filter(c=>!c.pass).map(c=>c.what),'오류',errors.slice(0,5));
 await ctx.close();
}
await browser.close();
writeFileSync(`${out}/report${only?'-'+only:''}.json`,JSON.stringify(report,null,1));
process.exit(failed?1:0);
