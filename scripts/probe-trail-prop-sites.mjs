// 즐길거리 소품 자리 검사(2026-11-07 산풍경). 개발 서버(vite)를 띄운 뒤:
//   node scripts/probe-trail-prop-sites.mjs [http://127.0.0.1:5341] [출력 폴더] [id,id,...]
// 실제 지형(청크)·숲을 불러 놓고 자리마다 잰다.
//  - 바닥: 화면 지형(window.__surface)으로 벤치 다리 4점 높이 차(slope), 받침돌 높이(가장 높은 다리 − 가장 낮은 다리), 가운데 땅과 좌석 높이 차.
//  - 숲·바위: 검사할 자리를 TRAIL_PROPS에서 뺀 판(interaction-data.js를 가로채 줄을 지움)을 열어, 그 자리를 비우기 전 숲을 센다.
//    비워지는 것(나무 = 비우기 반경 + 3m, 바위·덤불 = + 1m, load-landscape natureClearSites와 같은 규칙)과 비우기 밖인데 몸체가 소품에 닿는 것을 나눈다.
//  - 시설: 다른 시설(정상·구간·상호작용·즐길거리 자리) 가운데까지 거리, 계단 측벽 발·나무계단 난간까지 거리, 물줄기·호수까지 거리.
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {TRAIL_PROPS} from '../src/interaction-data.js';
const [base='http://127.0.0.1:5341',out='artifacts/trail-prop-sites-2026-11-07',only]=process.argv.slice(2);
mkdirSync(out,{recursive:true});
const NEW=only?only.split(','):['bench-640','bench-880','bench-1863','bench-2600','bench-2830','bench-3224','bench-3440','bench-3875'];
const specs=TRAIL_PROPS.filter(p=>NEW.includes(p.id));
// 한 번 열 때 숲 반경(약 1km) 안에 드는 자리끼리 묶는다
const groups=[];for(const s of [...specs].sort((a,b)=>a.m-b.m)){const g=groups.at(-1);if(g&&s.m-g[0].m<450)g.push(s);else groups.push([s]);}
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const results=[];
// 이어하기 저장 틀(initialState demo)은 한 번 열어 읽는다
let template;{const ctx=await browser.newContext({viewport:{width:640,height:400}});const page=await ctx.newPage();await page.goto(`${base}/hiking/?start=entrance&quality=low`);
 template=await page.evaluate(async()=>{const {initialState}=await import('/src/movement.js');return initialState({start:'demo'});});await ctx.close();}
for(const group of groups){
 const s0=(group[0].m+group.at(-1).m)/2,ids=group.map(g=>g.id);
 const ctx=await browser.newContext({viewport:{width:800,height:500}});
 // 검사 자리 줄을 지운 자료로 바꿔 준다(그 자리 숲을 비우기 전 모습)
 await ctx.route(u=>u.pathname==='/src/interaction-data.js'&&!u.search,async route=>{const r=await route.fetch(),text=await r.text();
  await route.fulfill({response:r,body:text.split('\n').filter(l=>!ids.some(id=>l.includes(`{id:'${id}'`))).join('\n')});});
 // 출발 자리: 이어하기 저장(진행 s)으로 그 구간에서 연다(capture-trail-props.mjs와 같은 방식)
 const save=JSON.stringify({...template,s:s0,lateral:0,zone:'route',view:'third'});
 await ctx.addInitScript(save=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');localStorage.setItem('gwanak-hiking:v1',save);},save);
 const page=await ctx.newPage();page.on('pageerror',e=>console.error('pageerror',e.message));
 await page.goto(`${base}/hiking/?time=11:00&weather=clear&season=summer&quality=low`);
 await page.waitForFunction(()=>window.hiking?.started&&window.hiking.landscape().natureReady,null,{timeout:300000});
 await page.evaluate(()=>window.hiking.chunks.ready());await page.waitForTimeout(1500);
 const at=await page.evaluate(()=>window.hiking.snapshot().s);console.error('group',ids.join(','),'start s',Math.round(at));
 const got=await page.evaluate(async specs=>{
  const L=window.__landscape,S=L.status,H=window.__surface;
  const {resolveTrailSite,TRAIL_FOOTPRINT,STAIR_SIDE_CLEAR}=await import('/src/trail-sites.js');
  const {routeMeasure}=await import('/assets/realistic/interaction-sites.js');
  const {waterClearance}=await import('/assets/realistic/water-clearance.js');
  const {RAILING}=await import('/assets/realistic/deck-railing.js');
  const measure=routeMeasure(L.route),water=waterClearance(L.route),present=S.trailProps.sites;
  const others=[...(S.summitFacilities?.sites??[]),...(S.sectionScenery?.sites??[]),...S.interactionProps.sites,...present];
  // 숲 인스턴스(비우기 전): natureKind가 붙은 LOD의 첫 단계 InstancedMesh
  let root=window.__hiker.scene;while(root.parent)root=root.parent;root.updateMatrixWorld(true);
  const M=new root.matrixWorld.constructor(),P=new (window.__hiker.scene.position.constructor)(),Q=window.__hiker.scene.quaternion.clone(),Sc=P.clone();
  const nature=[];root.traverse(o=>{const kind=o.userData?.natureKind;if(!kind||!o.levels?.length)return;
   o.levels[0].object.traverse(m=>{if(!m.isInstancedMesh)return;m.geometry.boundingSphere||m.geometry.computeBoundingSphere();const r0=m.geometry.boundingSphere.radius;
    for(let i=0;i<m.count;i++){m.getMatrixAt(i,M);M.premultiply(m.matrixWorld);M.decompose(P,Q,Sc);nature.push({kind,x:P.x,z:P.z,r:r0*Math.max(Math.abs(Sc.x),Math.abs(Sc.z)),h:r0*Math.abs(Sc.y)});}});});
  const out=[];
  for(const spec of specs){
   const s=resolveTrailSite(spec,{measure,height:H,avoid:[...(S.summitFacilities?.sites??[]),...(S.sectionScenery?.sites??[]),...S.interactionProps.sites,...present],water});
   if(!s){out.push({id:spec.id,placed:false});continue;}
   const foot=TRAIL_FOOTPRINT[s.kind],c=Math.cos(s.yaw),sn=Math.sin(s.yaw);
   const legs=foot.ring.map(([lx,lz])=>({x:s.x+lx*c+lz*sn,z:s.z-lx*sn+lz*c})),ly=legs.map(p=>H(p.x,p.z));
   const centre=H(s.x,s.z),walk=window.__walkingGround?.height?.(s.x,s.z,false);
   // 숲: 비워지는 것(load-landscape: 나무 margin 3, 나머지 1)과 비우기 밖에서 몸체가 소품(반경 .9) 1m 안에 닿는 것
   const near=nature.map(n=>({...n,d:Math.hypot(n.x-s.x,n.z-s.z)})).filter(n=>n.d<12);
   const cleared=near.filter(n=>n.d<=s.clearRadius+(n.kind==='tree'?3:1)),kept=near.filter(n=>!cleared.includes(n));
   const touching=kept.filter(n=>n.d-n.r<.9+1).map(n=>({kind:n.kind,d:+n.d.toFixed(2),r:+n.r.toFixed(2),h:+n.h.toFixed(2)}));
   const nearestKind={};for(const n of nature){const d=Math.hypot(n.x-s.x,n.z-s.z)-n.r;if(!(nearestKind[n.kind]<=d))nearestKind[n.kind]=+d.toFixed(2);}
   const byKind=a=>a.reduce((o,n)=>(o[n.kind]=(o[n.kind]??0)+1,o),{});
   const bigCleared=cleared.filter(n=>n.kind==='rock').map(n=>+n.r.toFixed(2)).sort((a,b)=>b-a).slice(0,3);
   // 시설
   const fac=others.filter(o=>o.id!==s.id).map(o=>({id:o.id,d:Math.hypot(o.x-s.x,o.z-s.z)})).sort((a,b)=>a.d-b.d)[0];
   const nr=measure.nearest(s.x,s.z),np=measure.at(nr.m),edge=nr.d-np.width/2;
   // 계단: 가장 가까운 계단 구간 노면 가장자리까지(측벽 발은 가장자리에서 최대 0.6m), 나무계단 난간은 가장자리 + RAILING.offset
   let stairEdge=Infinity,railEdge=Infinity;for(let q=Math.max(0,nr.m-30);q<=nr.m+30;q+=.5){const a=measure.at(q);if(a.material!=='stairs'&&a.material!=='deck_stairs')continue;
    const e=Math.min(...legs.map(p=>Math.hypot(p.x-a.x,p.z-a.z)))-a.width/2;stairEdge=Math.min(stairEdge,e);if(a.material==='deck_stairs')railEdge=Math.min(railEdge,e-RAILING.offset);}
   out.push({id:s.id,placed:true,m:s.routeMetres,side:s.side,x:+s.x.toFixed(2),z:+s.z.toFixed(2),yaw:+s.yaw.toFixed(3),material:np.material,
    edge:+edge.toFixed(2),slope:+s.slope.toFixed(3),seatBase:+s.y.toFixed(3),legs:ly.map(v=>+v.toFixed(3)),footingMax:+(s.y-Math.min(...ly)).toFixed(3),buriedLeg:+(Math.max(...ly)-s.y).toFixed(3),
    centreGap:+(s.y-centre).toFixed(3),walkGap:Number.isFinite(walk)?+(walk-centre).toFixed(3):null,
    water:+Math.min(water.streamDistance(s.x,s.z),water.pondDistance(s.x,s.z)).toFixed(1),
    nearestFacility:fac&&{id:fac.id,d:+fac.d.toFixed(1)},stairEdge:Number.isFinite(stairEdge)?+stairEdge.toFixed(2):null,railEdge:Number.isFinite(railEdge)?+railEdge.toFixed(2):null,
    natureLoaded:nature.length,nearestBody:nearestKind,natureCleared:byKind(cleared),bigRocksCleared:bigCleared,natureTouching:touching,stairClearRule:STAIR_SIDE_CLEAR});
  }
  return out;},group);
 for(const r of got){results.push(r);console.log(JSON.stringify(r));}
 await ctx.close();
}
await browser.close();
writeFileSync(`${out}/sites.json`,JSON.stringify(results,null,1));
