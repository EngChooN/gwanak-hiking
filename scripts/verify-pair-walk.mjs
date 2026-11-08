// 같이 등산하기(동행) 두 브라우저 확인(2026-11-08 기획서 A).
// 로컬 함께 걷기 서버(MULTI_PORT, 기본 8791)와 vite(PORT, 기본 5201)를 이 스크립트가 띄우고, 서로 다른 브라우저 컨텍스트 2개(A 산타는곰·B 바위다람쥐)로 붙는다.
//  ① 이름표 누르기 → 고르기 카드, 👥 목록
//  ② 거절 → "○○님이 지금은 어렵대요", 60초 재제안 막기(화면·서버 둘 다)
//  ③ 30초 만료(저절로 거절)
//  ④ 제안 → 수락 → 동행 칩, 겹친 자리에서 밀어내기, 자동 걷기 나란히(두 몸 거리 0.8m 이상·길 밖으로 안 감·서버 순간이동 거부 0)
//  ⑤ 동행 끝내기  ⑥ 끊김: 다시 이어 붙기(resume) · 60초 유예 뒤 해제
// 캡처: 세로 390×844·가로 844×390·PC 1920×1080에서 제안 카드·기다리는 중 칩·동행 칩·목록·고르기 카드, 동행 칩 낮·노을·밤.
//   node scripts/verify-pair-walk.mjs   → artifacts/pair-walk-2026-11-08/ (캡처·report.json). 실패가 있으면 종료 코드 1. 4분쯤 걸림(30초·60초 규칙을 실제 시간으로 기다림).
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {startServer} from '../server/multi-server.mjs';
import {route,sample,isStairs} from '../src/route.js';
// 좌우 시험 자리: 40m 동안 길 폭 1.8m 이상·계단 아님(앞뒤 시험은 출발 자리 ?start=demo의 계단 구간)
const WIDE_S=(()=>{for(let s=600;s<route.length-300;s+=5){let ok=true;for(let t=s;t<=s+40;t++){const p=sample(t);if(!(p.width>=1.8)||isStairs(p.material)){ok=false;break;}}if(ok)return s;}return null;})();

const dir='artifacts/pair-walk-2026-11-08',multiPort=Number(process.env.MULTI_PORT??8791),room='동행시험';mkdirSync(dir,{recursive:true});
let vite=null,pageUrl=process.env.PAGE_URL;
if(!pageUrl){const {createServer}=await import('vite');const port=Number(process.env.PORT??5201);vite=await createServer({server:{port,host:'127.0.0.1',strictPort:true,hmr:false},logLevel:'warn'});await vite.listen();pageUrl=`http://127.0.0.1:${port}`;}
const srv=startServer({PORT:String(multiPort),HOST:'127.0.0.1',DATA_DIR:`${dir}/data`},{quiet:true});await srv.ready;
const wsUrl=`ws://127.0.0.1:${multiPort}`;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const out={at:new Date().toISOString(),pageUrl,wsUrl,room,steps:[],errors:[],result:{},samples:[]},log=(k,v={})=>{out.steps.push({k,...v,t:Date.now()});console.log(k,JSON.stringify(v).slice(0,300));};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let fail=false;
const check=(name,ok,detail={})=>{out.result[name]={ok:!!ok,...detail};log(`${ok?'통과':'실패'} ${name}`,detail);if(!ok)fail=true;return ok;};

function recorder(){
 window.__wsIn=[];window.__notes=[];window.__pairState=null;
 const W=window.WebSocket;window.WebSocket=class extends W{constructor(...a){super(...a);this.addEventListener('message',e=>{try{const m=JSON.parse(e.data);if(typeof m.t==='string'&&m.t.startsWith('pair:'))window.__wsIn.push(m);}catch{}});}};
 addEventListener('hiking:pair-note',e=>window.__notes.push({...e.detail,at:Date.now()}));
 addEventListener('hiking:pair-state',e=>{window.__pairState=e.detail;});
 addEventListener('hiking:state',e=>{window.__off=e.detail?.offTrail;});
}
async function open(name){
 const ctx=await browser.newContext({viewport:{width:1280,height:760},deviceScaleFactor:1});
 await ctx.addInitScript(()=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');});
 await ctx.addInitScript(recorder);
 const p=await ctx.newPage();p.label=name;p.ctx=ctx;
 p.on('pageerror',e=>out.errors.push(`${name}: ${e.message}`));
 p.on('console',m=>{if(m.type()==='error'&&!/WebSocket connection|favicon|ERR_CONNECTION/.test(m.text()))out.errors.push(`${name}: ${m.text()}`);});
 await p.goto(`${pageUrl}/hiking/?multi=${encodeURIComponent(room)}&name=${encodeURIComponent(name)}&server=${encodeURIComponent(wsUrl)}&start=demo&time=13:00&weather=clear&quality=balanced`);
 await p.waitForFunction(()=>window.hiking?.started&&window.hiking?.multi?.()?.status==='online',null,{timeout:180000});
 return p;
}
const diag=p=>p.evaluate(()=>({pwBtn:!!document.querySelector('.pw-btn'),pwBtnHidden:document.querySelector('.pw-btn')?.hidden,pick:document.querySelector('.pw-pick')?.hidden,offer:document.querySelector('.pw-offer')?.hidden,chip:document.querySelector('.pw-chip')?.hidden,notes:window.__notes?.slice(-4),pairState:window.__pairState,pair:hiking.multi()?.pair,status:hiking.multi()?.status,top:(()=>{const t=document.querySelector('.multi-tag[data-kind=name] .multi-tag-name');if(!t)return null;const r=t.getBoundingClientRect();const e=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return e?`${e.tagName}.${e.className}`:null;})()}));
const waitFor=(p,fn,arg,ms=15000)=>p.waitForFunction(fn,arg,{timeout:ms,polling:100}).catch(async e=>{try{log(`진단 ${p.label}`,await diag(p));}catch{}throw e;});
const shot=async(p,name)=>{await p.screenshot({path:`${dir}/${name}.png`});out.steps.push({k:'캡처',name});};
const VIEWS=[['세로',390,844],['가로',844,390],['PC',1920,1080]];
async function shots3(p,name){for(const [label,w,h] of VIEWS){await p.setViewportSize({width:w,height:h});await sleep(500);await shot(p,`${name}-${label}-${w}x${h}`);}await p.setViewportSize({width:1280,height:760});await sleep(200);}
const id=p=>p.evaluate(()=>hiking.multi().id);
const notes=p=>p.evaluate(()=>window.__notes);
const pairOf=p=>p.evaluate(()=>hiking.multi().pair);
const pos=p=>p.evaluate(()=>({...hiking.position(),off:!!window.__off}));
const fire=(p,type,detail)=>p.evaluate(([t,d])=>dispatchEvent(new CustomEvent(t,d===undefined?undefined:{detail:d})),[type,detail]);
const lastNote=async(p,code)=>(await notes(p)).filter(n=>!code||n.code===code).at(-1)??null;

const A=await open('산타는곰'),B=await open('바위다람쥐');
try{
 await waitFor(A,()=>hiking.multi().roster.length>=1,null,30000);await waitFor(B,()=>hiking.multi().roster.length>=1,null,30000);
 const idA=await id(A),idB=await id(B);log('접속',{idA,idB});
 // 둘 다 같은 자리(545m 구간)에서 시작한다. ①을 위해 B를 4m 앞에 둔다.
 const pa=await pos(A);log('A 자리',pa);
 // A는 3인칭(1인칭에서는 오르막 4m 앞 이름표가 화면 위로 벗어날 수 있음), B는 1인칭 그대로.
 await A.click('#view');
 await B.evaluate(s=>hiking.multiApi.teleport({zone:'route',s,lateral:0}),pa.s+5);await sleep(1500);

 // ── ① 이름표 → 고르기 카드, 👥 목록
 await waitFor(A,()=>[...document.querySelectorAll('.multi-tag[data-kind=name]')].some(t=>t.style.display!=='none'&&t.textContent.includes('바위다람쥐')&&(r=>r.top>0&&r.bottom<innerHeight)(t.getBoundingClientRect())),null,15000).catch(async e=>{log('이름표 진단',await A.evaluate(()=>({roster:hiking.multi().roster,tags:[...document.querySelectorAll('.multi-tag')].map(t=>({kind:t.dataset.kind,display:t.style.display,text:t.textContent,tr:t.style.transform})),me:hiking.position(),pair:hiking.multi().pair})));log('B 자리',await pos(B));throw e;});
 const tagBox=await A.evaluate(()=>{const t=[...document.querySelectorAll('.multi-tag[data-kind=name]')].find(t=>t.style.display!=='none'&&t.textContent.includes('바위다람쥐'));const r=t.querySelector('.multi-tag-name').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};});
 await A.mouse.click(tagBox.x,tagBox.y);
 await waitFor(A,()=>!document.querySelector('.pw-pick').hidden);
 check('이름표를 누르면 고르기 카드',await A.evaluate(()=>document.querySelector('.pw-pick').textContent.includes('바위다람쥐')&&document.querySelector('.pw-pick .pw-yes').textContent.includes('같이 등산하기')),{tagBox});
 await shots3(A,'01-고르기카드');
 await A.click('.pw-pick .pw-no');
 await A.click('.pw-btn');await waitFor(A,()=>!document.querySelector('.pw-sheet').hidden&&document.querySelector('.pw-list').textContent.includes('바위다람쥐'));
 check('👥 함께 있는 사람 목록',true,{목록:await A.evaluate(()=>document.querySelector('.pw-list').innerText)});
 await shots3(A,'02-함께있는사람목록');
 await A.click('.pw-x');

 // ── ② 거절 → 재제안 막기
 const t0=Date.now();
 await fire(A,'hiking:pair-offer',{to:idB});
 await waitFor(B,()=>!document.querySelector('.pw-offer').hidden);
 await waitFor(A,()=>!document.querySelector('.pw-chip').hidden&&document.querySelector('.pw-chip').dataset.kind==='wait');
 check('제안 카드 문구',await B.evaluate(()=>document.querySelector('.pw-offer').textContent.includes('산타는곰님이 같이 등산하자고 해요')));
 await B.click('.pw-offer .pw-decline');
 await waitFor(A,()=>window.__notes.some(n=>n.code==='declined'));
 const dn=await lastNote(A,'declined');
 check('거절 → 제안한 사람에게 알림',dn?.text==='바위다람쥐님이 지금은 어렵대요'&&await A.evaluate(()=>document.querySelector('.pw-chip').hidden),{note:dn});
 await fire(A,'hiking:pair-offer',{to:idB});await sleep(300);
 const blk=await lastNote(A,'no');
 await A.evaluate(to=>hiking.multiApi.send({t:'pair:offer',to}),idB);await sleep(500);
 const srvNo=(await A.evaluate(()=>window.__wsIn)).filter(m=>m.t==='pair:no').at(-1);
 check('60초 재제안 막기(화면·서버)',blk?.reason==='blocked'&&srvNo?.reason==='blocked'&&!(await B.evaluate(()=>window.__pairState?.phase==='incoming')),{화면:blk,서버:srvNo});

 // ── ③ 30초 만료: B → A, A는 답하지 않음
 await fire(B,'hiking:pair-offer',{to:idA});const tOffer=Date.now();
 await waitFor(A,()=>!document.querySelector('.pw-offer').hidden);
 await waitFor(B,()=>!document.querySelector('.pw-chip').hidden);
 await shots3(B,'03-기다리는중칩');
 await shots3(A,'04-제안카드');
 await waitFor(B,()=>window.__notes.some(n=>n.code==='declined'&&n.reason==='timeout'),null,40000);
 const waited=(Date.now()-tOffer)/1000;
 check('30초 만료(저절로 거절)',waited>=27&&waited<=34&&await A.evaluate(()=>document.querySelector('.pw-offer').hidden),{초:waited.toFixed(1),B알림:await lastNote(B,'declined')});

 // ── ④ 수락 → 동행, 밀어내기, 나란히
 const rest=60500-(Date.now()-t0);if(rest>0){log('A→B 재제안 금지가 풀릴 때까지 기다림',{ms:rest});await sleep(rest);}
 // 겹친 자리: B를 A와 같은 자리로
 const pa2=await pos(A);await B.evaluate(p=>hiking.multiApi.teleport({zone:'route',s:p.s,lateral:p.lateral}),pa2);await sleep(1200);
 const before=Math.hypot((await pos(A)).x-(await pos(B)).x,(await pos(A)).z-(await pos(B)).z);
 await fire(A,'hiking:pair-offer',{to:idB});
 await waitFor(B,()=>!document.querySelector('.pw-offer').hidden);
 await B.click('.pw-offer .pw-accept');
 await waitFor(A,()=>window.__pairState?.phase==='paired');await waitFor(B,()=>window.__pairState?.phase==='paired');
 check('수락 → 둘 다 동행 칩',await A.evaluate(()=>document.querySelector('.pw-chip').textContent.includes('바위다람쥐님과 동행 중'))&&await B.evaluate(()=>document.querySelector('.pw-chip').textContent.includes('산타는곰님과 동행 중')),{
  A칩:await A.evaluate(()=>document.querySelector('.pw-chip').innerText),B칩:await B.evaluate(()=>document.querySelector('.pw-chip').innerText)});
 await sleep(3000);
 const [sa,sb]=await Promise.all([pos(A),pos(B)]),pushed=Math.hypot(sa.x-sb.x,sa.z-sb.z);
 check('겹친 자리에서 부드럽게 밀어냄',before<.3&&pushed>=.8,{전:before.toFixed(3),후:pushed.toFixed(3)});
 // 자동 걷기 측정: ms 동안 0.2초마다 두 사람 실제 자리(각자 화면의 내 자리)를 잰다. 처음 1.5초(자리 잡기)는 뺀다.
 async function measure(label,ms){
  const s0=(await pos(A)).s;await fire(A,'hiking:command',{id:'auto'});await fire(B,'hiking:command',{id:'auto'});
  const t1=Date.now();let minD=Infinity,maxD=0,offTrail=0,modes={},n=0;
  while(Date.now()-t1<ms){
   const [a,b,ga]=await Promise.all([pos(A),pos(B),A.evaluate(()=>hiking.multi().pair.guide)]);
   const d=Math.hypot(a.x-b.x,a.z-b.z),el=Date.now()-t1;out.samples.push({label,el,d:+d.toFixed(3),aS:+a.s.toFixed(2),bS:+b.s.toFixed(2),aL:+a.lateral.toFixed(2),bL:+b.lateral.toFixed(2),mode:ga?.mode,pace:ga?.pace&&+ga.pace.toFixed(2)});
   if(el>1500){minD=Math.min(minD,d);maxD=Math.max(maxD,d);if(a.off||b.off)offTrail++;modes[ga?.mode??'없음']=(modes[ga?.mode??'없음']??0)+1;n++;}
   await sleep(200);
  }
  await fire(A,'hiking:command',{id:'auto'});await fire(B,'hiking:command',{id:'auto'});
  return {minD,maxD,offTrail,modes,n,moved:(await pos(A)).s-s0};
 }
 const rejectedBefore=srv.rooms.stats.teleportRejected;
 const file=await measure('앞뒤',14000);
 check('좁은 길·계단 앞뒤 한 줄: 두 몸 0.8m 이상, 멈추지 않고 걸음',file.minD>=.8&&file.moved>3&&(file.modes.file??0)>=file.n*.8,{최소:file.minD.toFixed(3),최대:file.maxD.toFixed(3),모드:file.modes,A가걸은거리:file.moved.toFixed(1)});
 // 넓은 길로 옮겨(둘 다 같은 자리) 좌우 나란히
 log('넓은 길 시험 자리',{s:WIDE_S,width:sample(WIDE_S).width,material:sample(WIDE_S).material});
 await A.evaluate(s=>hiking.multiApi.teleport({zone:'route',s,lateral:0}),WIDE_S);await B.evaluate(s=>hiking.multiApi.teleport({zone:'route',s,lateral:0}),WIDE_S-.3);
 await sleep(2500);
 const rejectedMid=srv.rooms.stats.teleportRejected;
 const side=await measure('좌우',20000);
 check('넓은 길 좌우 나란히: 두 몸 0.8m 이상 유지',side.minD>=.8&&side.moved>10&&(side.modes.side??0)>=side.n*.8,{최소:side.minD.toFixed(3),최대:side.maxD.toFixed(3),모드:side.modes,A가걸은거리:side.moved.toFixed(1)});
 check('길 밖으로 안 밀림',file.offTrail+side.offTrail===0,{길밖표본:file.offTrail+side.offTrail});
 check('서버 순간이동 거부 없음(밀어내기·자리 옮기기 중)',srv.rooms.stats.teleportRejected===rejectedBefore&&srv.rooms.stats.teleportRejected===rejectedMid,{거부:srv.rooms.stats.teleportRejected-rejectedBefore});
 // 캡처용으로 다시 걷게 두고 찍는다
 await fire(A,'hiking:command',{id:'auto'});await fire(B,'hiking:command',{id:'auto'});await sleep(3000);
 await waitChunks(A);await shot(A,'05-나란히-3인칭-A화면');
 await waitChunks(B);await shot(B,'06-나란히-1인칭-B화면');
 await shots3(B,'07-동행칩');
 for(const [tone,preset] of [['낮','day'],['노을','dusk'],['밤','night']]){await fire(B,'hiking:free-settings',{time:preset});await sleep(1500);await B.setViewportSize({width:844,height:390});await sleep(400);await shot(B,`08-동행칩-${tone}-가로`);}
 await B.setViewportSize({width:1280,height:760});await fire(B,'hiking:free-settings',{time:'day'});
 await fire(A,'hiking:command',{id:'auto'});await fire(B,'hiking:command',{id:'auto'});

 // ── ⑤ 끝내기
 await A.click('.pw-chip .pw-chip-act');
 await waitFor(B,()=>window.__pairState?.phase==='idle');
 check('동행 끝내기 → 둘 다 풀림',await A.evaluate(()=>window.__pairState.phase==='idle'&&document.querySelector('.pw-chip').hidden)&&(await lastNote(B,'off'))?.text==='산타는곰님이 동행을 마쳤어요',{A알림:await lastNote(A,'off'),B알림:await lastNote(B,'off')});

 // ── ⑥ 끊김: 다시 이어 붙기 → 60초 유예 뒤 해제
 await sleep(Math.max(0,10500-(Date.now()-(await A.evaluate(()=>hiking.multi().pair.lastOfferAt)))));
 await fire(A,'hiking:pair-offer',{to:idB});await waitFor(B,()=>!document.querySelector('.pw-offer').hidden);await B.click('.pw-offer .pw-accept');
 await waitFor(A,()=>window.__pairState?.phase==='paired');
 await A.evaluate(()=>hiking.multiApi.transport.drop());
 await waitFor(B,()=>window.__notes.some(n=>n.code==='wait'),null,10000).catch(()=>{});
 const sawWait=!!(await lastNote(B,'wait'));
 await waitFor(B,()=>window.__notes.some(n=>n.code==='back'),null,20000).catch(()=>{});
 await waitFor(A,()=>hiking.multi().status==='online',null,20000);
 const pA=await pairOf(A),pB=await pairOf(B);
 check('끊김 → resume으로 다시 이어 붙음',sawWait&&pA.phase==='paired'&&pB.phase==='paired'&&!pB.away&&pA.partner===idB,{B알림:(await notes(B)).slice(-3).map(n=>n.text),A:pA.phase,B:{phase:pB.phase,away:pB.away}});
 await shot(B,'09-연결기다리는중-전');
 await A.evaluate(()=>hiking.multiApi.transport.close());
 await waitFor(B,()=>window.__pairState?.away===true,null,10000);
 await waitChunks(B);await shot(B,'09-연결기다리는중');
 const tGone=Date.now();
 await waitFor(B,()=>window.__notes.some(n=>n.code==='off'&&n.reason==='gone'),null,75000);
 const gone=(Date.now()-tGone)/1000;
 check('끊긴 채 60초 지나면 해제',gone>=55&&gone<=66&&(await pairOf(B)).phase==='idle',{초:gone.toFixed(1),알림:await lastNote(B,'off')});
}catch(e){check('진행 오류',false,{message:e.message,stack:e.stack?.split('\n').slice(0,4).join(' | ')});}
out.server=srv.rooms.info();
check('페이지 오류 없음',out.errors.length===0,{errors:out.errors.slice(0,8)});
writeFileSync(`${dir}/report.json`,JSON.stringify(out,null,1));
console.log(fail?'\n실패가 있습니다':'\n모두 통과',Object.entries(out.result).map(([k,v])=>`${v.ok?'✔':'✘'} ${k}`).join('\n'));
await browser.close();await srv.close();await vite?.close();
process.exit(fail?1:0);
