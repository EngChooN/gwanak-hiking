// 등산 함께 걷기: 내 상호작용(앉기·차·쌍안경·휴대폰·셀카·스트레칭·인사·즐길거리·헥헥·초콜릿)이 상대 화면에 보이는지 두 브라우저로 확인(2026-11-10).
// 로컬 서버(MULTI_PORT 기본 8795)와 vite(PORT 기본 5205)를 이 스크립트가 띄운다.
//  ① A·B가 같은 방(서버) → A가 상호작용을 하나씩 → B 화면의 A(roster act·drawnAct, 원격 모델 상태)를 읽음
//  ② A가 쌍안경을 든 채 C가 나중에 들어옴 → C 화면에 보임  ③ A 소켓 끊김 → resume 뒤 B 화면에 계속 보임
//  ④ CAPTURE=1이면 PC 1920×1080·휴대폰 390×844에서 A가 상호작용하는 모습을 A·B 화면 나란히 캡처
//   LABEL=before|after node scripts/verify-multi-act-hiking.mjs → artifacts/multi-interactions-2026-11-10/hiking-<라벨>.json
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {startServer} from '../server/multi-server.mjs';

const dir='artifacts/multi-interactions-2026-11-10';mkdirSync(dir,{recursive:true});
const label=process.env.LABEL||'run',CAPTURE=process.env.CAPTURE==='1';
const multiPort=Number(process.env.MULTI_PORT??8795),port=Number(process.env.PORT??5205);
const {createServer}=await import('vite');
const vite=await createServer({server:{port,host:'127.0.0.1',strictPort:true},logLevel:'warn'});await vite.listen();
const pageUrl=`http://127.0.0.1:${port}`,wsUrl=`ws://127.0.0.1:${multiPort}`;
const srv=startServer({PORT:String(multiPort),HOST:'127.0.0.1',DATA_DIR:`${dir}/data-hiking`},{quiet:true});await srv.ready;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const out={at:new Date().toISOString(),label,steps:[],errors:[],cases:{}};let fail=false;
function harness(){window.__socks=[];const W=window.WebSocket;window.WebSocket=class extends W{constructor(...a){super(...a);window.__socks.push(this);}};
 window.__drop=()=>{for(const s of window.__socks)if(s.readyState<2&&!/[?&]token=/.test(s.url))s.close();};}
const ctxs=[];
async function open(name,{viewport={width:1100,height:700},mobile=false,room='행동방'}={}){
 const ctx=await browser.newContext({viewport,deviceScaleFactor:1,hasTouch:mobile,isMobile:mobile});ctxs.push(ctx);
 await ctx.addInitScript(()=>{localStorage.setItem('gwanak-sound-enabled','false');});await ctx.addInitScript(harness);
 const p=await ctx.newPage();p.label=name;
 p.on('pageerror',e=>out.errors.push(`${name}: ${e.message}`));
 p.on('console',m=>{if(m.type()==='error'&&!/WebSocket|favicon|ERR_CONNECTION/.test(m.text()))out.errors.push(`${name}: ${m.text()}`);});
 await p.goto(`${pageUrl}/hiking/?multi=${encodeURIComponent(room)}&server=${encodeURIComponent(wsUrl)}&name=${encodeURIComponent(name)}&start=entrance&time=13:00&weather=clear&quality=low`);
 await p.waitForFunction(()=>window.hiking?.started,null,{timeout:240000});
 await p.waitForFunction(()=>window.hiking.multi?.()?.status==='online',null,{timeout:60000,polling:200});
 return p;
}
const cmd=(p,id,value)=>p.evaluate(([id,value])=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id,value}})),[id,value]);
// B 화면에서 본 A: 받은 act·그린 상태(drawnAct, 고치기 전에는 없음)·원격 모델의 실제 상태(앉음·찻잔·기구)
async function seen(B,aid){
 return B.evaluate(id=>{const api=window.hiking.multiApi,r=api?.roster.get(id),info=window.hiking.multi().roster.find(x=>x.id===id);if(!r)return {missing:true};
  const h=r.entry?.hiker,i=h?.interaction;
  return {act:info?.act??null,drawnAct:info?.drawnAct??null,model:!!r.entry,
   body:h?{pose:i?.pose??null,sit:+(i?.sitLinear??0).toFixed(2),teaStep:i?.tea?.step??null,cupHeld:!!i?.cup?.held,gadget:i?.gadget?.gadget??null,gadgetW:+(i?.gadget?.weight??0).toFixed(2),selfie:+(i?.gadget?.selfie??0).toFixed(2),
    trailAct:r.entry.acts?.active?.name??null}:null};},aid);
}
async function myId(p){return p.evaluate(()=>window.hiking.multi().id);}
async function step(name,A,B,aid,fn,check,wait=2500){
 await fn();await sleep(wait);const v=await seen(B,aid);const ok=check(v);if(!ok)fail=true;
 out.steps.push({name,ok,seen:v});console.log(`${ok?'○':'✕'} ${name}`,JSON.stringify(v));return v;
}
try{
 const A=await open('하늘'),B=await open('바다');await sleep(3000);
 const aid=await myId(A);
 await cmd(B,'view');
 const has=v=>v.model&&v.body;
 await step('서 있음(기준)',A,B,aid,async()=>{},v=>has(v)&&v.body.sit<.1);
 await step('앉기',A,B,aid,()=>cmd(A,'sit'),v=>has(v)&&v.body.sit>.5,3500);
 await step('차 마시기',A,B,aid,()=>cmd(A,'tea'),v=>has(v)&&(v.body.teaStep!==null||v.body.cupHeld||v.act?.p==='tea'),1500);
 await sleep(3500);await cmd(A,'sit');await sleep(2500);
 await step('쌍안경',A,B,aid,()=>cmd(A,'binoculars'),v=>has(v)&&v.body.gadget==='binoculars'&&v.body.gadgetW>.5,3000);
 await cmd(A,'gadget-off');await sleep(1500);
 await step('휴대폰 카메라',A,B,aid,()=>cmd(A,'phone'),v=>has(v)&&v.body.gadget==='phone'&&v.body.gadgetW>.5,3000);
 await step('셀카',A,B,aid,()=>cmd(A,'selfie'),v=>has(v)&&v.body.selfie>.5,3000);
 await cmd(A,'gadget-off');await sleep(1500);
 await step('스트레칭',A,B,aid,()=>cmd(A,'stretch'),v=>has(v)&&v.act?.x==='stretch',1500);
 await sleep(4500);
 await step('손 흔들기(g)',A,B,aid,()=>A.evaluate(()=>window.hiking.multiApi.doGesture('wave')),v=>has(v),800);
 const gest=await B.evaluate(id=>window.hiking.multi().roster.find(x=>x.id===id)?.gesture,aid);out.wave=gest;console.log('  손 흔들기 B 화면 gesture',gest);if(gest!=='wave')fail=true;
 await sleep(3000);
 await step('초콜릿',A,B,aid,()=>cmd(A,'chocolate'),v=>has(v)&&v.body.trailAct==='choco',600);
 await sleep(2500);
 await step('헥헥',A,B,aid,()=>A.evaluate(()=>window.hiking.trail.exhaust('pant')),v=>has(v)&&v.body.trailAct==='pant',700);
 await sleep(3000);
 const air=await A.evaluate(()=>window.hiking.trail.status().sites.find(s=>s.kind==='airgun')?.id??null);out.airgun=air;
 if(air){
  // C는 다른 방에서 미리 로딩해 두었다가 A가 에어건을 하는 중에 같은 방으로 들어온다(로딩이 동작 4.8초보다 길어서)
  const C=await open('구름',{room:'대기방'});
  await cmd(A,'trail-play',{act:'airgun',id:air,manual:true});
  await A.waitForFunction(()=>window.hiking.trail.status().acts.active?.name==='airgun',null,{timeout:30000}).catch(()=>{});
  await step('먼지털이기(에어건)',A,B,aid,async()=>{},v=>has(v)&&v.body.trailAct==='airgun',400);
  // 나중에 들어온 C도 지금 동작을 본다
  await C.evaluate(()=>dispatchEvent(new CustomEvent('hiking:multi-join',{detail:{room:'행동방',name:'구름'}})));
  await C.waitForFunction(()=>window.hiking.multi?.()?.room&&window.hiking.multi().room!=='대기방'&&window.hiking.multi().status==='online',null,{timeout:20000,polling:100});await sleep(1200);
  const cv=await seen(C,aid);const ok=!!cv.model&&cv.body?.trailAct==='airgun';if(!ok)fail=true;
  out.steps.push({name:'에어건 중 C 나중 입장',ok,seen:cv});console.log(`${ok?'○':'✕'} 에어건 중 C 나중 입장`,JSON.stringify(cv));
  await A.waitForFunction(()=>!window.hiking.trail.status().active,null,{timeout:40000}).catch(()=>{});
  await C.close();
 }
 // 쌍안경 든 채 소켓 끊김 → resume
 await cmd(A,'binoculars');await sleep(2500);
 await A.evaluate(()=>window.__drop());await sleep(600);
 await A.waitForFunction(()=>window.hiking.multi?.()?.status==='online',null,{timeout:30000,polling:200});
 await step('쌍안경 든 채 다시 접속',A,B,aid,async()=>{},v=>has(v)&&v.body.gadget==='binoculars',3500);
 await cmd(A,'gadget-off');
 // 나중 입장: A가 앉은 채 D가 들어옴
 await cmd(A,'sit');await sleep(2500);
 const D=await open('별');await sleep(3000);
 const dv=await seen(D,aid);const dok=!!dv.model&&dv.body?.sit>.5;if(!dok)fail=true;
 out.steps.push({name:'앉은 채 D 나중 입장',ok:dok,seen:dv});console.log(`${dok?'○':'✕'} 앉은 채 D 나중 입장`,JSON.stringify(dv));
}catch(e){fail=true;out.error=String(e.stack||e).slice(0,800);console.log('오류',out.error);}
writeFileSync(`${dir}/hiking-${label}.json`,JSON.stringify(out,null,1));
for(const c of ctxs)await c.close().catch(()=>{});
if(out.errors.length)console.log('페이지 오류',out.errors.slice(0,8));
console.log(fail?'실패 있음':'모두 통과');
await browser.close();await srv.close();await vite.close();process.exit(fail?1:0);
