// 릴스 촬영 값 점검(연공간, 2026-11-11): scripts/promo/shots.json을 녹화 스크립트와 같은 순서로 실행하고
// 장면마다 대표 프레임을 찍어 동동이 화면 상자(가운데 3분의 2 안·자막 띠 위)를 잰다. 게임 코드는 건드리지 않는다.
//   node scripts/promo/check-shots.mjs [장면키…]   예) node scripts/promo/check-shots.mjs 0 5a 7
// 개발 서버: BASE_URL(기본 http://127.0.0.1:5181). 같이 피우기(7)는 로컬 멀티 서버를 이 스크립트가 띄운다(포트 shots.json multi.port).
// 결과: artifacts/reels-smoking-2026-11-11/shots/<키>.png, report.json
import {chromium} from '@playwright/test';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';

const SH=JSON.parse(readFileSync(process.env.SHOTS??new URL('./shots.json',import.meta.url),'utf8'));
const base=process.env.BASE_URL??'http://127.0.0.1:5181',dir='artifacts/reels-smoking-2026-11-11/shots';mkdirSync(dir,{recursive:true});
const want=process.argv.slice(2),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const shots=SH.shots.filter(s=>!want.length||want.includes(s.key));
let srv=null;
if(shots.some(s=>s.multi)){const {startServer}=await import('../../server/multi-server.mjs');srv=startServer({PORT:String(SH.multi.port),HOST:'127.0.0.1',DATA_DIR:`${dir}/multi-data`},{quiet:true});await srv.ready;}
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const report={at:new Date().toISOString(),viewport:SH.viewport,safe:SH.safe,shots:{}};

// 내 동동이 화면 상자(css px): 뼈 위치 + 머리 공(Head 뼈 위 0.2m, 반지름 0.32m)을 투영한다. 소품·그림자는 뺀다.
const measure=()=>{const L=window.lounge,T=L.ctx.THREE,c=L.ctx.camera,v=new T.Vector3(),pts=[];
 L.player.root.traverse(o=>{if(o.isBone)pts.push(o.getWorldPosition(new T.Vector3()));});
 const head=L.player.headTop(new T.Vector3());const right=new T.Vector3().setFromMatrixColumn(c.matrixWorld,0);
 const hc=head.clone().setY(head.y-.3);for(const [dx,dy] of [[.32,0],[-.32,0],[0,.12]])pts.push(hc.clone().addScaledVector(right,dx).setY(hc.y+dy+(dy?0.2:0)));
 pts.push(new T.Vector3(L.player.x,0,L.player.z));
 let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
 for(const p of pts){v.copy(p).project(c);const sx=(v.x*.5+.5)*innerWidth,sy=(-v.y*.5+.5)*innerHeight;x0=Math.min(x0,sx);x1=Math.max(x1,sx);y0=Math.min(y0,sy);y1=Math.max(y1,sy);}
 return {box:[x0,y0,x1,y1].map(n=>+n.toFixed(1)),status:L.status()};};

async function openPage(ctx,shot,query){
 const p=await ctx.newPage();
 p.on('pageerror',e=>(report.shots[shot.key].errors??=[]).push(e.message));
 await p.goto(`${base}${SH.path}?${query}`.replace('{WS}',encodeURIComponent(`ws://127.0.0.1:${SH.multi.port}`)));
 await p.waitForFunction(()=>window.lounge,null,{timeout:90000});
 await p.evaluate(SH.prelude);
 return p;
}
// 시점표(actions)를 녹화와 똑같이 노드 쪽 시계로 실행한다. who: 'main'(찍는 화면)·'friend'(같이 피우기 상대)
async function run(pages,actions,until,onTick){
 const t0=Date.now(),todo=[...actions].sort((a,b)=>a.at-b.at);
 while(true){const t=Date.now()-t0;
  while(todo.length&&todo[0].at<=t){const a=todo.shift();await pages[a.who??'main'].evaluate(a.js).catch(e=>console.log('  동작 실패',a.at,e.message));}
  await onTick?.(t);if(t>=until)break;await sleep(20);}
}

for(const shot of shots){
 report.shots[shot.key]={scene:shot.scene,name:shot.name};
 // 같이 피우기 상대는 따로 된 브라우저 컨텍스트(창)로 연다. 같은 컨텍스트의 두 번째 탭은 그리기가 멈춰 걷기(goTo)가 안 된다.
 const vp=SH.viewport,newCtx=async()=>{const c=await browser.newContext({viewport:{width:vp.width,height:vp.height},deviceScaleFactor:vp.deviceScaleFactor,isMobile:vp.isMobile,hasTouch:vp.hasTouch});
  await c.addInitScript(([k,v])=>{if(sessionStorage.getItem('promo-init'))return;sessionStorage.setItem('promo-init','1');localStorage.clear();localStorage.setItem(k,JSON.stringify(v));},[SH.storageKey,{...SH.profile,...(shot.profile??{})}]);return c;};
 const ctx=await newCtx(),pages={main:await openPage(ctx,shot,shot.query)};
 let ctx2=null;if(shot.multi){ctx2=await newCtx();pages.friend=await openPage(ctx2,shot,shot.multi.friendQuery);}
 if(shot.multi)await pages.main.waitForFunction(()=>window.lounge.multi.people().some(p=>p.avatar),null,{timeout:30000});
 await sleep(shot.settleMs??0);
 for(const [who,js] of Object.entries(shot.prep??{}))await pages[who].evaluate(js);
 await sleep(shot.prepWaitMs??0);
 const checks=[...shot.checkAt],out=[];
 await run(pages,shot.actions,Math.max(...shot.clip.map(([a,l])=>a+l)),async t=>{
  if(checks.length&&t>=checks[0]){const at=checks.shift(),m=await pages.main.evaluate(measure);
   const path=`${dir}/${shot.key}-${at}.png`;await pages.main.screenshot({path});out.push({at,...m,path});}});
 const S=SH.safe,r=report.shots[shot.key];r.frames=out.map(f=>{const [x0,y0,x1,y1]=f.box;
  return {at:f.at,box:f.box,path:f.path,center:x0>=S.centerX[0]&&x1<=S.centerX[1]&&y0>=S.centerY[0]&&y1<=S.centerY[1],aboveCaption:y1<=S.captionTop,player:f.status.player,smoke:f.status.smoke?.state,time:f.status.time};});
 r.smokeLog=await pages.main.evaluate(()=>window.P?.log??[]);
 console.log(shot.key,JSON.stringify(r.frames.map(f=>({at:f.at,box:f.box,center:f.center,aboveCaption:f.aboveCaption,smoke:f.smoke}))),r.errors?.length?'오류 '+r.errors.slice(0,3).join(' / '):'');
 console.log('  흡연 상태',r.smokeLog.map(e=>e.t+':'+e.state).join(' '));
 await ctx.close();await ctx2?.close();
}
writeFileSync(`${dir}/report.json`,JSON.stringify(report,null,1));
await browser.close();srv?.close?.();process.exit(0);
