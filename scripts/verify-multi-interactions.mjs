// 흡연장 같이 피우기 '상호작용이 상대에게 안 보이거나 안 되는 문제' 재현·회귀 점검(2026-11-10).
// 로컬 서버(MULTI_PORT 기본 8794)와 vite(PORT 기본 5204)를 이 스크립트가 띄운다. 등산 쪽은 scripts/verify-multi-act-hiking.mjs.
// 상대 화면에서 보이는지는 '몸 모양'으로 잰다(고치기 전·뒤 같은 잣대): 골반 높이(앉기), 상체 앞 숙임(난간), 왼손 옆 캔(캔커피), 한 모금(왼손이 입 가까이), 담배 상태(불씨).
// 경우: a 누르기(링크 A·서버 카드 B·나중에 온 휴대폰 C가 난간·벤치·자판기 표시를 실제로 눌러 자기 몸이 바뀌는지)
//       b1 A(링크)가 하는 것을 B(서버 카드)가 봄, b2 B가 하는 것을 A가 봄, b3 중간에 들어온 C가 A의 지금 상태를 봄, b4 A 소켓이 끊겼다 다시 붙은 뒤에도 B가 봄,
//       b5 서버 없는 내 컴퓨터 모드(같은 브라우저 두 탭)
//   node scripts/verify-multi-interactions.mjs [경우…]  → artifacts/multi-interactions-2026-11-10/smoking-<LABEL>.json. 실패가 있으면 종료 코드 1.
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {startServer} from '../server/multi-server.mjs';

const dir='artifacts/multi-interactions-2026-11-10';mkdirSync(dir,{recursive:true});
const only=process.argv.slice(2),label=process.env.LABEL||'run';
const multiPort=Number(process.env.MULTI_PORT??8794),port=Number(process.env.PORT??5204);
const {createServer}=await import('vite');
const vite=await createServer({server:{port,host:'127.0.0.1',strictPort:true},logLevel:'warn'});await vite.listen();
const pageUrl=`http://127.0.0.1:${port}`,wsUrl=`ws://127.0.0.1:${multiPort}`;
const srv=startServer({PORT:String(multiPort),HOST:'127.0.0.1',DATA_DIR:`${dir}/data`},{quiet:true});await srv.ready;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const out={at:new Date().toISOString(),label,cases:[],errors:[]};let fail=false;

function harness(){
 window.__socks=[];const W=window.WebSocket;window.WebSocket=class extends W{constructor(...a){super(...a);window.__socks.push(this);}};
 window.__drop=()=>{for(const s of window.__socks)if(s.readyState<2&&!/[?&]token=/.test(s.url))s.close();};
 // 몸 모양 재기: root = 아바타 뿌리. 골반 높이·상체 숙임(m)·왼손 옆 캔·왼손-입 거리
 window.__body=root=>{
  if(!root)return null;const V=root.position.constructor,B=n=>root.getObjectByName('mixamorig'+n);
  const hips=B('Hips'),sp=B('Spine2'),hand=B('LeftHand'),head=B('Head');if(!hips||!sp)return null;
  root.updateMatrixWorld(true);const w=o=>o.getWorldPosition(new V());
  const model=hips.parent?.parent??root,q=model.getWorldQuaternion(new root.quaternion.constructor()),F=new V(0,0,1).applyQuaternion(q);F.y=0;F.normalize();
  const h=w(hips),s=w(sp),lean=s.clone().sub(h).dot(F);
  let can=false;const hp=hand?w(hand):null;
  if(hp)root.parent?.traverse(o=>{if(o.name==='캔커피'&&o.visible&&w(o).distanceTo(hp)<.25)can=true;});
  return {hipsY:+h.y.toFixed(3),lean:+lean.toFixed(3),can,handHead:hp&&head?+hp.distanceTo(w(head)).toFixed(3):null};
 };
}
const ctxs=[];
async function open(name,{via='link',touch=false,fresh=false,server=true,ctx=null}={}){
 if(!ctx){ctx=await browser.newContext({viewport:touch?{width:390,height:844}:{width:1100,height:700},deviceScaleFactor:1,hasTouch:touch,isMobile:touch});ctxs.push(ctx);
  await ctx.addInitScript(([nick,fresh])=>{if(sessionStorage.getItem('__i'))return;sessionStorage.setItem('__i','1');localStorage.setItem('gwanak-sound-enabled','false');
   if(!fresh)localStorage.setItem('online-smoking',JSON.stringify({nickname:nick,seenIntro:true,muted:true,quitDate:'2026-11-01'}));},[name,fresh]);
  await ctx.addInitScript(harness);}
 const p=await ctx.newPage();p.nm=name;p.touch=touch;
 p.on('pageerror',e=>out.errors.push(`${name}: ${e.message}`));
 p.on('console',m=>{if(m.type()==='error'&&!/WebSocket|favicon|ERR_CONNECTION|Failed to load/.test(m.text()))out.errors.push(`${name}: ${m.text()}`);});
 const srvQ=server?`&server=${encodeURIComponent(wsUrl)}`:'';
 const qs=via==='card'?`serverpick=on${srvQ}&time=day`:`multi=${encodeURIComponent(server?'옥상-1':'시험옥상')}${srvQ}&name=${encodeURIComponent(name)}&time=day`;
 await p.goto(`${pageUrl}/smoking/?${qs}`);await p.waitForFunction(()=>!!window.lounge,null,{timeout:180000});
 if(via==='card'){await p.waitForSelector('.sp-wrap:not([hidden]) .sp-row',{timeout:60000});await p.fill('.sp-wrap:not([hidden]) input',name);await p.click('.sp-wrap:not([hidden]) .sp-row:not([disabled])');}
 if(await p.$('.lg-modal:not([hidden]) [data-a=enter]'))await p.click('.lg-modal:not([hidden]) [data-a=enter]');
 await p.waitForFunction(()=>window.lounge.multi.state==='online',null,{timeout:60000,polling:200});
 return p;
}
async function closeAll(){for(const c of ctxs.splice(0))await c.close().catch(()=>{});}
const myId=p=>p.evaluate(()=>window.lounge.multi.id);
const self=p=>p.evaluate(()=>({...window.__body(window.lounge.player.root),pose:window.lounge.spots.pose,smoke:window.lounge.smoker.status().state,lit:window.lounge.smoker.status().lit,can:window.lounge.spots.status().can}));
// viewer 화면에서 target(id)의 몸
const seen=(p,id)=>p.evaluate(id=>{const a=window.lounge.multi.avatarOf(id),r=window.lounge.multi.status().people.find(x=>x.id===id);
 return {drawn:!!a,body:a?window.__body(a.root):null,smoke:r?.smoke??null,lit:r?.lit??null,act:r?.act??null};},id);
// 서 있을 때 기준(골반 높이·숙임)
let base=null;
function judgeBody(c,step,want,got,{need=['pose']}={}){
 const b=got.body,r={step,want,got,ok:true,why:[]};
 if(!got.drawn||!b){r.ok=false;r.why.push('안 그려짐');}
 else{
  if(need.includes('pose')){
   if(want.pose==='sit'&&!(b.hipsY>base.hipsY+.12)){r.ok=false;r.why.push(`앉음 안 보임(골반 ${b.hipsY} / 서기 ${base.hipsY})`);}
   // 난간: 상체 앞 숙임이 서 있을 때보다 커야 하고, A 자기 화면의 숙임과 비슷해야 한다
   if(want.pose==='lean'&&!(b.lean>base.lean+.015&&(want.lean==null||Math.abs(b.lean-want.lean)<.012))){r.ok=false;r.why.push(`기댐 안 보임(숙임 ${b.lean} / A 화면 ${want.lean} / 서기 ${base.lean})`);}
   if(want.pose==='stand'&&(b.hipsY>base.hipsY+.12||b.lean>base.lean+.015)){r.ok=false;r.why.push('서 있어야 함');}
  }
  if(need.includes('can')&&!!want.can!==b.can){r.ok=false;r.why.push(want.can?'캔 안 보임':'캔이 남아 있음');}
  if(need.includes('smoke')&&want.lit&&!got.lit){r.ok=false;r.why.push(`담배 불 안 보임(${got.smoke})`);}
 }
 c.samples.push(r);if(!r.ok)c.ok=false;
 console.log(`  ${r.ok?'○':'✕'} ${step}${r.why.length?' — '+r.why.join(', '):''}`);
}
// 할 일(콘솔 API: 화면 단추 누르기와 같은 함수). 자리에 다다를 때까지 기다린다.
async function doAct(p,what){
 await p.evaluate(w=>{const L=window.lounge,S=L.spots;
  if(w==='lean'){const b=L.rooftop.bounds;S.stand();L.teleport(.6,b.minZ+.9,0);S.go('rail');}
  if(w==='sit')S.go('bench',0);
  if(w==='stand'){S.stand();}
  if(w==='coffee')S.coffee();
  if(w==='sip')S.sip();
  if(w==='dropCan')S.dropCan();
  if(w==='smoke'){L.smoker.start();}
  if(w==='light'){L.smoker.light();}
  if(w==='smokeOff'){L.smoker.dispose?.();}
 },what);
 const until={lean:"window.lounge.spots.pose==='lean'",sit:"window.lounge.spots.pose==='sit'",stand:"window.lounge.spots.pose==='stand'",coffee:"window.lounge.spots.status().can.held",sip:'true',dropCan:'!window.lounge.spots.status().can.held',smoke:'true',light:"window.lounge.smoker.status().lit",smokeOff:'true'}[what];
 await p.waitForFunction(until,null,{timeout:25000,polling:200});
 await sleep(what==='sit'||what==='lean'?900:400);
}
const wantOf=s=>({pose:s.pose,can:s.can.held,lit:s.lit,lean:s.lean,hipsY:s.hipsY});

const CASES={
 // (a) 누르기: 링크 A·서버 카드 B·나중에 온 휴대폰 C. 대상 쪽으로 카메라를 돌리고 표시를 진짜로 누른다(PC 클릭·휴대폰 탭)
 async a(c){
  const A=await open('대표'),B=await open('손님B',{via:'card',fresh:true});await sleep(3000);const C=await open('손님C',{touch:true,fresh:true});await sleep(2000);
  for(const p of [A,B,C])for(const k of ['rail','bench','vending']){
   await p.evaluate(k=>{const L=window.lounge;L.spots.stand();L.spots.dropCan();const sp=L.rooftop.spots,pl=L.player,b=L.rooftop.bounds;
    if(k==='rail')L.teleport(pl.x,b.minZ+2.2,0);const t=k==='vending'?sp.vending:k==='bench'?sp.benches[0].seat??sp.benches[0]:{x:pl.x,z:b.minZ};
    L.setCam({yaw:Math.atan2(-(t.x-pl.x),-(t.z-pl.z)),pitch:.35});},k);
   await sleep(900);
   const sel=`.sp-mark[data-k="${k}:0"]`;let how='눌림';
   try{if(p.touch)await p.tap(sel,{timeout:4000});else await p.click(sel,{timeout:4000});}catch(e){how='못 누름: '+e.message.split('\n')[0].slice(0,100);}
   const ok=await p.waitForFunction(k=>{const s=window.lounge.spots.status();return k==='rail'?s.pose==='lean':k==='bench'?s.pose==='sit':s.can.held||s.can.dropping;},k,{timeout:20000,polling:200}).then(()=>true,()=>false);
   const r={step:`${p.nm} ${k}`,how,ok};c.samples.push(r);if(!ok)c.ok=false;console.log(`  ${ok?'○':'✕'} ${p.nm} ${k} (${how})`);
  }
 },
 // b1 A(링크)가 하고 B(서버 카드)가 봄 / b2 그 반대
 async b1(c){await watch(c,await open('대표'),await open('손님B',{via:'card',fresh:true}));},
 async b2(c){const A=await open('대표'),B=await open('손님B',{via:'card',fresh:true});await watch(c,B,A);},
 // b3 A가 난간에 기대 캔을 들고 담배를 피우는 중에 C가 들어옴 / A가 벤치에 앉은 중에 D가 들어옴
 async b3(c){const A=await open('대표');await doAct(A,'coffee');await doAct(A,'smoke');await doAct(A,'light');await doAct(A,'lean');await sleep(1500);
  const C=await open('나중C',{via:'card',fresh:true});await sleep(4000);const ida=await myId(A);
  judgeBody(c,'나중 입장 C: 난간·캔·담배',wantOf(await self(A)),await seen(C,ida),{need:['pose','can','smoke']});
  await doAct(A,'sit');await sleep(500);const D=await open('나중D',{touch:true,fresh:true});await sleep(4000);
  judgeBody(c,'나중 입장 D(휴대폰): 벤치',wantOf(await self(A)),await seen(D,ida),{need:['pose','can']});},
 // b4 A가 앉아 캔을 든 채 소켓이 끊겼다 다시 붙음 → B(그대로)와 새로 온 C가 봄
 async b4(c){const A=await open('대표'),B=await open('손님B');await sleep(2500);await doAct(A,'coffee');await doAct(A,'sit');await sleep(1500);const ida=await myId(A);
  judgeBody(c,'끊기 전',wantOf(await self(A)),await seen(B,ida),{need:['pose','can']});
  await A.evaluate(()=>window.__drop());await sleep(600);await A.waitForFunction(()=>window.lounge.multi.state==='online',null,{timeout:30000});await sleep(3500);
  const same=(await myId(A))===ida;c.sameId=same;
  judgeBody(c,'다시 붙은 뒤 B',wantOf(await self(A)),await seen(B,await myId(A)),{need:['pose','can']});
  const C=await open('나중C');await sleep(4000);
  judgeBody(c,'다시 붙은 뒤 새로 온 C',wantOf(await self(A)),await seen(C,await myId(A)),{need:['pose','can']});},
 // c 한 사람이 쓰는 자리: A가 벤치 가운데에 앉은 뒤 B도 같은 벤치 → 옆자리, A가 난간에 기댄 바로 그 자리에서 B도 난간 → 옆 지점(겹치지 않음)
 async c(c){const A=await open('대표'),B=await open('손님B',{via:'card',fresh:true});await sleep(2500);
  const pos=p=>p.evaluate(()=>({x:window.lounge.player.x,z:window.lounge.player.z,pose:window.lounge.spots.pose}));
  // NO_OCCUPY=1: 다른 사람 자리를 안 보던 고치기 전 동작을 흉내(비교 기록용)
  if(process.env.NO_OCCUPY)for(const p of [A,B])await p.evaluate(()=>{window.lounge.multi.occupied=()=>false;});
  await doAct(A,'sit');await sleep(1500);await doAct(B,'sit');await sleep(800);
  let a=await pos(A),b=await pos(B),d=Math.hypot(a.x-b.x,a.z-b.z),ok=a.pose==='sit'&&b.pose==='sit'&&d>.35;
  c.samples.push({step:'같은 벤치',a,b,d,ok});if(!ok)c.ok=false;console.log(`  ${ok?'○':'✕'} 같은 벤치: 둘 다 앉음·간격 ${d.toFixed(2)}m`);
  await doAct(A,'stand');await doAct(B,'stand');await doAct(A,'lean');await sleep(1200);
  const ax=(await pos(A)).x; // B를 A 바로 뒤에 세우고 난간을 누른다 → 가장 가까운 지점은 A 자리
  await B.evaluate(x=>{const L=window.lounge;L.spots.stand();L.teleport(x,L.rooftop.bounds.minZ+.9,0);L.spots.go('rail');},ax);
  await B.waitForFunction("window.lounge.spots.pose==='lean'",null,{timeout:20000}).catch(()=>{});await sleep(1000);
  a=await pos(A);b=await pos(B);d=Math.hypot(a.x-b.x,a.z-b.z);ok=a.pose==='lean'&&b.pose==='lean'&&d>.35;
  c.samples.push({step:'같은 난간 지점',a,b,d,ok});if(!ok)c.ok=false;console.log(`  ${ok?'○':'✕'} 같은 난간 지점: 둘 다 기댐·간격 ${d.toFixed(2)}m`);},
 // b5 서버 없이 같은 브라우저 두 탭
 async b5(c){const A=await open('하늘',{server:false});const B=await open('바다',{server:false,ctx:ctxs[0]});await sleep(3000);await watch(c,A,B,{short:true});}
};
// actor가 하나씩 하고 viewer가 본다
async function watch(c,actor,viewer,{short=false}={}){
 await sleep(3000);const id=await myId(actor);
 const st=await seen(viewer,id);judgeBody(c,`${actor.nm} 서 있음 → ${viewer.nm}`,{pose:'stand'},st);
 for(const [w,need] of [['lean',['pose']],['stand',['pose']],['sit',['pose']],['stand',['pose']],['coffee',['can']],['smoke',[]],['light',['smoke']],...(short?[]:[['lean',['pose','can']],['dropCan',['can']],['stand',['pose']]])]){
  await doAct(actor,w);await sleep(1600);
  judgeBody(c,`${actor.nm} ${w} → ${viewer.nm}`,wantOf(await self(actor)),await seen(viewer,id),{need});
 }
 // 한 모금: 받는 쪽 왼손이 입 가까이 오는지
 await doAct(actor,'coffee');await sleep(3000);
 const far=(await seen(viewer,id)).body?.handHead;await doAct(actor,'sip');let near=Infinity;
 for(let i=0;i<10;i++){await sleep(150);const b=(await seen(viewer,id)).body;if(b?.handHead!=null)near=Math.min(near,b.handHead);}
 const ok=far!=null&&near<far-.05;c.samples.push({step:'한 모금',far,near,ok});if(!ok)c.ok=false;console.log(`  ${ok?'○':'✕'} ${actor.nm} 한 모금 → ${viewer.nm} (손-머리 ${far} → ${near})`);
}

base=null;
const order=only.length?only:Object.keys(CASES);
for(const k of order){
 const c={case:k,ok:true,samples:[]};out.cases.push(c);console.log(`[흡연장] 경우 ${k}`);const t0=Date.now();
 try{
  if(!base){const P=await open('기준');base=await self(P);await closeAll();console.log('  서 있을 때 기준',JSON.stringify(base));out.base=base;}
  await CASES[k](c);
 }catch(e){c.ok=false;c.error=String(e.message).slice(0,400);console.log('  오류',c.error);}
 c.seconds=Math.round((Date.now()-t0)/1000);if(!c.ok)fail=true;
 await closeAll();writeFileSync(`${dir}/smoking-${label}.json`,JSON.stringify(out,null,1));
}
out.summary=out.cases.map(c=>`${c.case}: ${c.ok?'통과':'실패'} (${c.samples.filter(s=>s.ok).length}/${c.samples.length})`);
writeFileSync(`${dir}/smoking-${label}.json`,JSON.stringify(out,null,1));
console.log(out.summary.join('\n'));if(out.errors.length)console.log('페이지 오류',out.errors.slice(0,10));
await browser.close();await srv.close();await vite.close();
process.exit(fail?1:0);
