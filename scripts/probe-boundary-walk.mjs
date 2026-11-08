// 이동 구역 경계(광장↔등산로·길↔길 밖·등산로↔정상) 통과 시뮬레이션. 개발 서버(vite)를 띄운 뒤:
//   node scripts/probe-boundary-walk.mjs [http://127.0.0.1:5191] [출력 폴더] [접미사(before|after)]
// 실제 지형(청크)을 불러 놓고 게임과 같은 advance()·walkingGround로, 경계 앞에서 여러 방향으로 똑바로 걸어 들어간다.
// 걷는 방향은 화면(월드) 기준으로 고정한다(코스에서는 yaw = 방향 − 길 방향, 광장·정상에서는 heading = 방향). main.js의 처리와 같다.
// 판정: 25초(정상 바위 비탈은 느려서 60초) 안에 경계 너머 목표(예: 길 가장자리 + 2m)에 닿으면 통과.
// 막아야 할 곳(기준선 검사): 출발점→목표점 직선 위에 지형 경사(0.2m 중앙차분) 45° 넘음·바위·일주문 기둥/바리케이드·정상 시설·정상 원 밖이 있으면 "막아야 함"으로 따로 센다.
// 이어 붙임: 한 프레임 화면 위치(main.js worldPosition과 같은 규칙)의 높이 변화·수평 이동을 기록해 구역이 바뀔 때 튀는지 본다.
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const [base='http://127.0.0.1:5191',out='artifacts/boundary-walk-2026-11-06',suffix='after']=process.argv.slice(2);
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const page=await (await browser.newContext({viewport:{width:800,height:600},deviceScaleFactor:1})).newPage();
page.on('pageerror',e=>console.error('pageerror',e.message));
await page.goto(`${base}/hiking/?outfit=1&start=gate&time=12:00&weather=clear`);
await page.waitForFunction(()=>!!window.hiking?.ready,null,{timeout:180000});
await page.evaluate(()=>window.hiking.ready());
await page.waitForFunction(()=>window.hiking.started===true,null,{timeout:300000});
// 구역마다 그 자리로 옮겨 청크를 받은 뒤 시험한다.
const SITES=[
 {jump:'gate',kinds:['gate','approach','edge'],edgeS:[8,20,35,50]},
 {jump:'plaza-1',kinds:['edge'],offsets:[-40,-25,-10,5,20,35]},
 {jump:'acacia',kinds:['edge'],offsets:[-40,-25,-10,5,20,35]},
 {jump:'shelter-4',kinds:['edge'],offsets:[-40,-25,-10,5,20,35]},
 {jump:'yeonju-spring',kinds:['edge'],offsets:[-40,-25,-10,5,20,35]},
 {jump:'pass-3',kinds:['edge'],offsets:[-40,-25,-10,5,20,35]},
 {jump:'summit',kinds:['summit']},
];
const all=[];
for(const site of SITES){
 const ok=await page.evaluate(id=>window.hiking.jumpTo(id),site.jump);
 if(!ok){console.error('jump 실패',site.jump);continue;}
 await page.waitForTimeout(300);
 await page.evaluate(()=>window.hiking.chunks.ready());
 const cases=await page.evaluate(async site=>{
  const R=await import('/src/route.js'),M=await import('/src/movement.js'),P=await import('/src/plaza.js'),S=await import('/src/summit.js');
  const W=window.__walkingGround,G=W.summit,sites=G.sites();W.refreshObstacles();
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),rad=Math.PI/180,DT=1/60;
  const world=st=>st.zone==='plaza'?[st.plaza.x,W.height(st.plaza.x,st.plaza.z,false),st.plaza.z]:st.zone==='summit'?[st.summit.x,G.height(st.summit.x,st.summit.z),st.summit.z]:M.positionAt(st.s,st.lateral,W);
  const baseHeading=st=>st.zone==='plaza'?st.plaza.heading:st.zone==='summit'?st.summit.heading:R.sample(st.s).heading;
  const headingOf=(dx,dz)=>Math.atan2(-dx,-dz);
  // 코스 좌표계(positionAt과 같은 법선): 앞 방향·법선.
  const frame=s=>{const a=R.sample(s-2),b=R.sample(s+2),len=Math.hypot(b.x-a.x,b.z-a.z)||1,p=R.sample(s);return s<0?{fx:p.nz,fz:-p.nx,nx:p.nx,nz:p.nz}:{fx:(b.x-a.x)/len,fz:(b.z-a.z)/len,nx:-(b.z-a.z)/len,nz:(b.x-a.x)/len};};
  const rot=(x,z,deg)=>{const c=Math.cos(deg*rad),s=Math.sin(deg*rad);return {x:x*c-z*s,z:x*s+z*c};};
  // 기준선 검사: 직선 위 0.25m마다 지형 경사(0.2m 중앙차분 기울기 크기)·바위·문·시설·정상 원.
  const terrain=(x,z)=>W.height(x,z,true),SLOPE45=1;
  function lineVerdict(x0,z0,x1,z1,{ribbon=null,summit=false,plaza=false}={}){
   const L=Math.hypot(x1-x0,z1-z0),n=Math.max(1,Math.ceil(L/.25));let prev={x:x0,z:z0};
   // i=0: 출발점 자체가 급경사면 막아야 함.
   for(let i=0;i<=n;i++){const t=i/n,x=x0+(x1-x0)*t,z=z0+(z1-z0)*t;
    if(R.blockedByGate(x,z,.25))return 'gate';
    if(summit&&!S.insideSummit(x,z))return 'summit-edge';
    if(summit&&S.facilityBlocks(sites,prev,{x,z}))return 'facility';
    const onRibbon=ribbon?ribbon(x,z):false;
    if(!onRibbon){const d=.2,gx=(terrain(x+d,z)-terrain(x-d,z))/(2*d),gz=(terrain(x,z+d)-terrain(x,z-d))/(2*d);if(Number.isFinite(gx+gz)&&Math.hypot(gx,gz)>SLOPE45)return 'steep';
     if(W.rockBlocked(x,z,terrain(x,z)))return 'rock';}
    prev={x,z};}
   return null;
  }
  const routeRibbon=(x,z)=>{const r=S.projectToRoute(x,z);return Math.abs(r.lateral)<=R.sample(r.s).width/2;};
  function run(c){
   const st=M.initialState({start:'gate'});
   if(!M.setPlayerPosition(st,c.start,W))return {...c,invalid:true};
   const start=world(st),H=c.heading,T=c.seconds??25;let maxDy=0,maxDh=0,zoneJump=0,zoneJumpH=0,still=0,maxStill=0;const zones=[st.zone];
   for(let i=0;i<T/DT;i++){
    let yaw=0;if(st.zone==='plaza')st.plaza.heading=H;else if(st.zone==='summit')st.summit.heading=H;else yaw=wrap(H-baseHeading(st));
    const a=world(st),zb=st.zone,v=M.advance(st,{forward:1,side:0,yaw},DT,()=>{},W),b=world(st);
    const dy=Math.abs(b[1]-a[1]),dh=Math.hypot(b[0]-a[0],b[2]-a[2]);maxDy=Math.max(maxDy,dy);maxDh=Math.max(maxDh,dh);
    if(st.zone!==zb){zones.push(st.zone);zoneJump=Math.max(zoneJump,dy);zoneJumpH=Math.max(zoneJumpH,dh);}
    still=v<.1?still+DT:0;maxStill=Math.max(maxStill,still);
    if(c.goal(st,b))return {...c,pass:true,t:+(i*DT).toFixed(2),zones,maxDy,maxDh,zoneJump,zoneJumpH,maxStill,end:{zone:st.zone,s:st.s,lateral:st.lateral,x:b[0],z:b[2]}};
   }
   const b=world(st);return {...c,pass:false,zones,maxDy,maxDh,zoneJump,zoneJumpH,maxStill,moved:Math.hypot(b[0]-start[0],b[2]-start[2]),end:{zone:st.zone,s:st.s,lateral:st.lateral,x:b[0],z:b[2]}};
  }
  const cases=[];
  // 길 ↔ 길 밖: 길 가운데에서 옆(±40° 비스듬히 포함)으로 나가 가장자리 + 2m, 길 밖 3.5m에서 길 안으로 들어오기.
  const edgeAt=s=>{const p=R.sample(s),half=p.width/2,f=frame(s),[cx,,cz]=M.positionAt(s,0);
   for(const side of [-1,1])for(const ang of [0,40,-40]){
    const out=rot(f.nx*side,f.nz*side,ang),gx=cx+f.nx*side*(half+2.2),gz=cz+f.nz*side*(half+2.2);
    const dist=(half+2.2)/Math.cos(ang*rad),ex=cx+out.x*dist,ez=cz+out.z*dist;
    cases.push({kind:'edge-out',s,side,ang,start:{zone:'route',s,lateral:0},heading:headingOf(out.x,out.z),block:lineVerdict(cx,cz,ex,ez,{ribbon:routeRibbon}),goal:st=>st.zone==='route'&&st.lateral*side>=half+2});
    const l0=side*(half+3.5),[sx,,sz]=M.positionAt(s,l0),inn=rot(-f.nx*side,-f.nz*side,ang),d2=(3.5+.5)/Math.cos(ang*rad);
    cases.push({kind:'edge-in',s,side,ang,start:{zone:'route',s,lateral:l0},heading:headingOf(inn.x,inn.z),block:lineVerdict(sx,sz,sx+inn.x*d2,sz+inn.z*d2,{ribbon:routeRibbon}),goal:st=>st.zone==='route'&&st.lateral*side<=half-.3});
   }};
  if(site.offsets){const cp=R.checkpoints.find(c=>c.id===site.jump);for(const o of site.offsets)edgeAt(cp.s+o);}
  if(site.edgeS)for(const s of site.edgeS)edgeAt(s);
  if(site.kinds.includes('gate')){
   // 광장 → 일주문 통로 → 등산로, 등산로 → 광장.
   for(const gx of [P.GATE_CENTER_X-1,P.GATE_CENTER_X,P.GATE_CENTER_X+1])for(const gz of [3,6])for(const ang of [0,20,-20]){
    const q=P.fromGate(gx,gz),t=P.fromGate(gx,gz-1),d=rot(t.x-q.x,t.z-q.z,ang),e=P.fromGate(gx+Math.tan(ang*rad)*0,gz-12);
    const end={x:q.x+d.x*(gz+5),z:q.z+d.z*(gz+5)};
    cases.push({kind:'plaza-to-route',gx,gz,ang,start:{zone:'plaza',x:q.x,z:q.z,heading:0},heading:headingOf(d.x,d.z),block:lineVerdict(q.x,q.z,end.x,end.z),goal:st=>st.zone==='route'&&st.s>=P.GATE_S+3});
   }
   for(const l of [-1,0,1])for(const ang of [0,20,-20]){const s=P.GATE_S+4,f=frame(s),d=rot(-f.fx,-f.fz,ang),[x,,z]=M.positionAt(s,l),end={x:x+d.x*7,z:z+d.z*7};
    cases.push({kind:'route-to-plaza',l,ang,start:{zone:'route',s,lateral:l},heading:headingOf(d.x,d.z),block:lineVerdict(x,z,end.x,end.z),goal:st=>st.zone==='plaza'&&P.toGate(st.plaza.x,st.plaza.z).gz>=2});}
  }
  if(site.kinds.includes('approach')){
   // 일주문~GPX 시작(포장 진입로, 폭 12m) 옆으로 걷기와, 진입로 → GPX 코스로 넘어가기.
   for(const s of [-20,-12,-6])for(const side of [-1,1])for(const ang of [0,40,-40]){const f=frame(s),d=rot(f.nx*side,f.nz*side,ang),[x,,z]=M.positionAt(s,0),dist=3.6/Math.cos(ang*rad);
    cases.push({kind:'approach-side',s,side,ang,start:{zone:'route',s,lateral:0},heading:headingOf(d.x,d.z),block:lineVerdict(x,z,x+d.x*dist,z+d.z*dist),goal:st=>st.zone==='route'&&st.lateral*side>=3.5});}
   for(const l of [-1.5,0,1.5])for(const ang of [0,25,-25]){const s=-5,f=frame(s),d=rot(f.fx,f.fz,ang),[x,,z]=M.positionAt(s,l);
    cases.push({kind:'approach-to-gpx',l,ang,start:{zone:'route',s,lateral:l},heading:headingOf(d.x,d.z),block:lineVerdict(x,z,x+d.x*10,z+d.z*10,{ribbon:routeRibbon}),goal:st=>st.zone==='route'&&st.s>=4});}
  }
  if(site.kinds.includes('summit')){
   // 등산로 → 정상 구역(입구 s = 길 끝 40m 앞)과 정상 → 등산로. 길 위·길 밖 여러 옆 자리에서 ±30°.
   const E=S.SUMMIT_ENTER_S;
   for(const l of [-6,-3,0,3,6])for(const ang of [0,30,-30]){
    {const s=E-8,f=frame(s),d=rot(f.fx,f.fz,ang),[x,,z]=M.positionAt(s,l);
     cases.push({kind:'route-to-summit',seconds:60,l,ang,start:{zone:'route',s,lateral:l},heading:headingOf(d.x,d.z),block:lineVerdict(x,z,x+d.x*13,z+d.z*13,{ribbon:routeRibbon,summit:false}),goal:st=>st.zone==='summit'&&Math.hypot(st.summit.x-x,st.summit.z-z)>=12});}
    {const s=E+8,f=frame(s),d=rot(-f.fx,-f.fz,ang),[x,,z]=M.positionAt(s,l);
     cases.push({kind:'summit-to-route',seconds:60,l,ang,start:{zone:'summit',x,z,heading:0},heading:headingOf(d.x,d.z),block:lineVerdict(x,z,x+d.x*13,z+d.z*13,{ribbon:routeRibbon,summit:true}),goal:st=>st.s<=E-4});}
   }
  }
  return cases.map(run).map(({goal,...r})=>r);
 },site);
 // goal 함수는 직렬화되지 않으므로 page.evaluate 안에서 run까지 끝낸다.
 all.push(...cases);
 const shouldPass=cases.filter(c=>!c.invalid&&!c.block);
 console.log(site.jump,`시험 ${cases.length} · 통과해야 함 ${shouldPass.length} 중 통과 ${shouldPass.filter(c=>c.pass).length}`);
}
await browser.close();
const summary={};
for(const c of all){const k=c.kind,e=summary[k]??={cases:0,invalid:0,shouldPass:0,passed:0,shouldBlock:0,blockedPassed:0,maxZoneJump:0,maxDy:0,blockReasons:{}};
 e.cases++;if(c.invalid){e.invalid++;continue;}
 if(c.block){e.shouldBlock++;e.blockReasons[c.block]=(e.blockReasons[c.block]??0)+1;if(c.pass)e.blockedPassed++;}
 else{e.shouldPass++;if(c.pass)e.passed++;}
 e.maxZoneJump=Math.max(e.maxZoneJump,c.zoneJump??0);e.maxZoneJumpH=Math.max(e.maxZoneJumpH??0,c.zoneJumpH??0);e.maxDy=Math.max(e.maxDy,c.maxDy??0);}
const total={shouldPass:0,passed:0};for(const e of Object.values(summary)){total.shouldPass+=e.shouldPass;total.passed+=e.passed;e.rate=e.shouldPass?+(e.passed/e.shouldPass*100).toFixed(1):null;}
total.rate=+(total.passed/total.shouldPass*100).toFixed(1);
writeFileSync(`${out}/boundary-${suffix}.json`,JSON.stringify({base,summary,total,cases:all},null,1));
console.table(Object.fromEntries(Object.entries(summary).map(([k,e])=>[k,{통과해야함:e.shouldPass,통과:e.passed,'통과율%':e.rate,막아야함:e.shouldBlock,'막아야함중통과':e.blockedPassed,무효:e.invalid,'구역전환높이튐m':+e.maxZoneJump.toFixed(3),'구역전환수평튐m':+(e.maxZoneJumpH??0).toFixed(3)}])));
console.log('전체',total);
