// 정상 자유 이동 구역 걸림 진단. 개발 서버(vite)를 띄운 뒤:
//   node scripts/probe-summit-walk.mjs [http://127.0.0.1:5191] [출력 폴더] [접미사(before|after)]
// 1) 정상 원 안 1m 격자 각 칸에서 8방향 1m 걸음을 summitMove 규칙으로 시험해 막힌 이유(시설·높이 급변·경사·바위·길 옆 한도)를 센다.
// 2) "걸을 만한 칸"(지형 경사 30° 이하) 중 막힌 걸음 비율을 고치기 전과 후로 견준다.
// 3) 실제 이동(advance)으로 정상 원 안 걸을 만한 칸(시설 밖, 300곳·방향은 고정 난수)에서 똑바로 8초 걸어, 0.5초 넘게 0.1m/s 아래로 멈춘 비율을 잰다.
// 4) 디버그 지도(PNG): 칸 색 = 막힌 걸음 비율, 바위 충돌 상자(worldBounds+0.2m) = 빨간 테두리, 시설 막기 원 = 파란 원.
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const [base='http://127.0.0.1:5191',out='artifacts/summit-walk-2026-11-06',suffix='after']=process.argv.slice(2);
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const page=await (await browser.newContext({viewport:{width:1100,height:1100},deviceScaleFactor:1})).newPage();
page.on('pageerror',e=>console.error('pageerror',e.message));
await page.goto(`${base}/hiking/?outfit=1&start=summit&time=12:00&weather=clear`);
await page.waitForFunction(()=>!!window.hiking?.ready,null,{timeout:180000});
await page.evaluate(()=>window.hiking.ready());
await page.waitForFunction(()=>window.hiking.started===true,null,{timeout:300000});
await page.evaluate(()=>window.hiking.chunks.ready());
const result=await page.evaluate(async()=>{
 const S=await import('/src/summit.js'),M=await import('/src/movement.js'),R=await import('/src/route.js');
 const W=window.__walkingGround,G=W.summit,sites=G.sites(),L=window.__landscape;W.refreshObstacles();
 const {SUMMIT_CENTER:C,SUMMIT_RADIUS:RAD}=S,cell=1,n=Math.ceil(RAD*2/cell)+1,x0=C.x-RAD,z0=C.z-RAD;
 const dirs=[[1,0],[-1,0],[0,1],[0,-1],[.7071,.7071],[.7071,-.7071],[-.7071,.7071],[-.7071,-.7071]];
 const h=(x,z)=>G.height(x,z);
 // 막힘 여부는 게임과 같은 summitMove로 정하고, 막혔으면 이유를 순서대로 가린다(원 밖 → 시설 → 경사·높이 급변 → 바위 → 그 밖=길 옆 한도).
 const why=(a,q)=>{
  if(S.summitMove(G,sites,a,q,M.lateralLimit))return null;
  if(!S.insideSummit(q.x,q.z))return 'outside';
  const fac=S.facilityBlocks(sites,a,q);if(fac)return 'facility:'+fac;
  if(!S.summitStepOk(h,a,q))return 'slope';
  const r=S.projectToRoute(q.x,q.z),ribbon=Math.abs(r.lateral)<=R.sample(r.s).width/2+.3;
  if(!ribbon&&!S.summitStepOk(h,a,q,{rockBlocked:W.rockBlocked}))return 'rock';
  return 'lateral';
 };
 const terrainSlope=(x,z)=>{const d=.5,gx=(h(x+d,z)-h(x-d,z))/(2*d),gz=(h(x,z+d)-h(x,z-d))/(2*d);return Math.atan(Math.hypot(gx,gz))*180/Math.PI;};
 const cells=[],reasons={};let walkable=0,moves=0,blocked=0;
 for(let j=0;j<n;j++)for(let i=0;i<n;i++){
  const a={x:x0+i*cell,z:z0+j*cell};if(!S.insideSummit(a.x,a.z,1.5))continue;
  const slope=terrainSlope(a.x,a.z),flat=slope<=30;let b=0;const cr=[];
  for(const [dx,dz] of dirs){const q={x:a.x+dx,z:a.z+dz},w=why(a,q);if(w){b++;cr.push(w);}if(flat&&w!=='outside'){moves++;if(w){blocked++;reasons[w.split(':')[0]]=(reasons[w.split(':')[0]]??0)+1;}}}
  if(flat)walkable++;
  cells.push({i,j,x:a.x,z:a.z,slope:+slope.toFixed(1),flat,blocked:b,reasons:[...new Set(cr)]});
 }
 // 바위 충돌 상자: 정상 원 안에 걸치는 것
 const rocks=L.contactCandidates(C.x,C.z,RAD+10,Infinity).filter(r=>r.kind==='rock'&&r.worldBounds&&r.worldBounds.max[1]-r.worldBounds.min[1]>=.35).map(r=>({id:r.id,x:r.x,z:r.z,radius:r.radius,visible:r.visible,nearDetail:r.nearDetail,min:r.worldBounds.min,max:r.worldBounds.max,ground:h(r.x,r.z)}));
 // 실제 이동: 걸을 만한 칸 쌍을 골라 8초 동안 똑바로 걷고(뛰기 X), 1초 넘게 전진 못하면 걸림.
 const insideFacility=c=>sites.some(t=>S.SUMMIT_BLOCKERS[t.id]!==undefined&&Math.hypot(c.x-t.x,c.z-t.z)<(t.supportRadius??0)+S.SUMMIT_BLOCKERS[t.id]+S.SUMMIT_BODY+.5);
 const flatCells=cells.filter(c=>c.flat&&!insideFacility(c));const trials=[];let seed=7;const rand=()=>(seed=(seed*16807)%2147483647)/2147483647;
 for(let t=0;t<300&&flatCells.length;t++){
  const A=flatCells[Math.floor(rand()*flatCells.length)],ang=rand()*Math.PI*2;
  const st={...M.initialState({start:'summit'}),zone:'summit',plaza:null,summitArrived:true,summit:{x:A.x,z:A.z,heading:ang}};
  let stuck=0,maxStuck=0,travelled=0,stuckAt=null;
  for(let k=0;k<160;k++){const px=st.summit.x,pz=st.summit.z;M.advance(st,{forward:1,yaw:0},.05,()=>{},W);if(st.zone!=='summit')break;const d=Math.hypot(st.summit.x-px,st.summit.z-pz);travelled+=d;
   if(d<.005){stuck+=.05;maxStuck=Math.max(maxStuck,stuck);if(stuck>=.5&&!stuckAt){const p={x:st.summit.x,z:st.summit.z};stuckAt={x:+p.x.toFixed(2),z:+p.z.toFixed(2),why:why(p,{x:p.x-Math.sin(ang)*.5,z:p.z-Math.cos(ang)*.5})};}}else stuck=0;
   // 원 가장자리·가파른 비탈 앞에서 멈춘 건 정상 동작이라 걸림으로 세지 않는다.
   if(!S.insideSummit(st.summit.x-Math.sin(ang)*1.2,st.summit.z-Math.cos(ang)*1.2,.5)||terrainSlope(st.summit.x-Math.sin(ang)*1.2,st.summit.z-Math.cos(ang)*1.2)>30)break;
  }
  trials.push({x:A.x,z:A.z,ang,travelled:+travelled.toFixed(2),stuck:maxStuck>=.5,stuckAt});
 }
 const map=S.summitWalkMap(G,M.lateralLimit,{cell:1.5});
 return {center:C,radius:RAD,cell,n,x0,z0,cells,rocks,sites:sites.map(s=>({id:s.id,x:s.x,z:s.z,r:(s.supportRadius??0)+(S.SUMMIT_BLOCKERS[s.id]??-99)+S.SUMMIT_BODY,supportRadius:s.supportRadius})),
  summary:{walkableCells:walkable,flatMoves:moves,blockedFlatMoves:blocked,blockedRatio:+(blocked/moves).toFixed(4),reasons,
   walkStuckWhy:trials.filter(t=>t.stuck).reduce((o,t)=>{const k=(t.stuckAt?.why??'?').split(':')[0];o[k]=(o[k]??0)+1;return o;},{}),
   walkTrials:trials.length,walkStuck:trials.filter(t=>t.stuck).length,walkStuckRatio:+(trials.filter(t=>t.stuck).length/Math.max(1,trials.length)).toFixed(4),
   reachable:map.walkable,reachableFree:map.free,rocksInZone:rocks.length},trials};
});
writeFileSync(`${out}/summit-walk-${suffix}.json`,JSON.stringify(result,null,1));
console.log(JSON.stringify(result.summary,null,1));
// 디버그 지도를 캔버스로 그린다.
const png=await page.evaluate(r=>{
 const px=10,size=r.n*px,cv=document.createElement('canvas');cv.width=size;cv.height=size;const g=cv.getContext('2d');
 g.fillStyle='#222';g.fillRect(0,0,size,size);
 const X=x=>(x-r.x0)/r.cell*px,Z=z=>(z-r.z0)/r.cell*px;
 for(const c of r.cells){const t=c.blocked/8;g.fillStyle=!c.flat?'#555':`rgb(${Math.round(60+195*t)},${Math.round(200-160*t)},70)`;g.fillRect(X(c.x)-px/2,Z(c.z)-px/2,px,px);}
 g.lineWidth=1.5;for(const k of r.rocks){g.strokeStyle='#ff3030';g.strokeRect(X(k.min[0]-.2),Z(k.min[2]-.2),(k.max[0]-k.min[0]+.4)/r.cell*px,(k.max[2]-k.min[2]+.4)/r.cell*px);}
 g.strokeStyle='#40a0ff';for(const s of r.sites){if(s.r<0)continue;g.beginPath();g.arc(X(s.x),Z(s.z),s.r/r.cell*px,0,Math.PI*2);g.stroke();}
 g.strokeStyle='#fff';g.beginPath();g.arc(X(r.center.x),Z(r.center.z),r.radius/r.cell*px,0,Math.PI*2);g.stroke();
 for(const t of r.trials){g.fillStyle=t.stuck?'#ffff00':'#00ffff';g.fillRect(X(t.x)-2,Z(t.z)-2,4,4);}
 g.fillStyle='#fff';g.font='14px sans-serif';g.fillText(`막힌 걸음 ${(r.summary.blockedRatio*100).toFixed(1)}% · 실제 걷기 걸림 ${r.summary.walkStuck}/${r.summary.walkTrials}`,8,18);
 g.fillText('초록→빨강: 막힌 방향 비율 · 회색: 30° 넘는 비탈 · 빨간 상자: 바위 범위(+0.2m) · 파란 원: 시설',8,size-8);
 return cv.toDataURL('image/png');
},result);
writeFileSync(`${out}/summit-walk-${suffix}.png`,Buffer.from(png.split(',')[1],'base64'));
await browser.close();
