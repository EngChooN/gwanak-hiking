// 같이 등산하기 — 나란히 걷기·겹치지 않기 계산(순수 모듈: three.js·DOM 없음). multi-client.js가 매 프레임 부르고, 움직임은 main.js가 준 local.nudge·advance 입력으로만 한다.
// 좌표: 코스(zone 'route')는 길 앞뒤 s·옆 lateral(+ = 오르막 방향 오른쪽). 광장·정상은 x·z 자유 이동이라 밀어내기만 한다.
// 규칙(기획서 A): 동행 중 8m 안 = 나란히 모드. 길 폭 1.6m 이상·계단 아님 → 좌우(중심선 ±0.5m, 왼쪽은 ID가 작은 사람),
//  아니면 앞뒤 한 줄(1.5m, 앞선 사람이 앞). 두 몸이 0.8m 안이면 부드럽게 밀어냄(최대 0.8m/s → 0.1초에 8cm, 서버 순간이동 검사에 안 걸림).
//  자동 걷기: 앞선 쪽이 느린 쪽에 맞추고, 8m 넘게 앞서면 천천히, 15m 넘으면 '기다리는 중'(멈추지는 않음).
import {PAIR} from './multi-protocol.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const PAIR_WALK=Object.freeze({
 margin:.3,        // 길 가장자리에서 몸 중심까지 남길 거리(반지름 0.35에 가깝게, 길 밖으로 안 나가게)
 driftSpeed:.5,    // 직접 걷는 동안 좌우 자리로 옮겨 가는 속도(m/s)
 pushMax:.8,       // 밀어내기 최대 속도(m/s)
 pushGain:2.5,     // 밀어내기 세기(겹친 거리 1m당 m/s)
 rest:.85,         // 밀어낸 뒤 멈추는 거리(0.8m 기준보다 조금 넓게: 다가가는 속도가 0이 되는 점이 0.8에 딱 붙지 않게)
 searchBack:15     // 상대 자리를 길 위로 찾을 때 내 s 앞뒤 범위(m, 8m 안만 쓰므로 넉넉히)
});
// 길 폭·노면으로 자리 방식 정하기
export const pairMode=({width,stairs})=>stairs||!(width>=PAIR.narrow)?'file':'side';
// 내가 왼쪽(-1)인지 오른쪽(+1)인지: ID 순서(작은 쪽이 왼쪽). 두 사람이 같은 답을 얻는다.
export const sideOf=(myId,partnerId)=>String(myId)<String(partnerId)?-1:1;
// 좌우 자리의 옆 위치: 중심선에서 gap/2, 길 가장자리 margin 안으로 줄인다.
export function sideLateral(side,width,{gap=PAIR.gap,margin=PAIR_WALK.margin}={}){return side*Math.min(gap/2,Math.max(0,width/2-margin));}
// 앞뒤 줄에서 내가 앞인지. dir = 걷는 방향(+1 오르막·-1 내리막). 거의 같으면 ID가 작은 사람이 앞.
export function isLeader({meS,partnerS,dir=1,myId,partnerId}){const d=(meS-partnerS)*dir;return Math.abs(d)<.05?String(myId)<String(partnerId):d>0;}
// 상대 x·z를 길 좌표로: 내 s 근처만 1m 간격으로 찾고 다듬는다(summit.projectToRoute와 같은 방식, 길 전체를 훑지 않음).
// sample(s) → {x,z,...}. 반환 {s,lateral}
export function projectNear(x,z,s0,sample,{back=PAIR_WALK.searchBack,minS=-Infinity,maxS=Infinity}={}){
 const lo=Math.max(minS,s0-back),hi=Math.min(maxS,s0+back);let s=s0,best=Infinity;
 for(let t=lo;t<=hi+1e-9;t+=1){const q=sample(t),d=(q.x-x)**2+(q.z-z)**2;if(d<best){best=d;s=t;}}
 for(let i=0;i<4;i++){const q=sample(s),a=sample(s-2),b=sample(s+2),len=Math.hypot(b.x-a.x,b.z-a.z)||1;s=clamp(s+((x-q.x)*(b.x-a.x)+(z-q.z)*(b.z-a.z))/len,lo,hi);}
 const q=sample(s),a=sample(s-2),b=sample(s+2),len=Math.hypot(b.x-a.x,b.z-a.z)||1,nx=-(b.z-a.z)/len,nz=(b.x-a.x)/len;
 return {s,lateral:(x-q.x)*nx+(z-q.z)*nz};
}
// 자동 걷기 속도 배율과 '기다리는 중'. lead = 내가 앞선 거리(m, 걷는 방향 기준, 음수면 뒤).
// myBase = 배율을 곱하기 전 내 속도, partnerSpeed = 상대 속도(보간 값). 둘 다 자동 걷기면 앞선 쪽이 상대 속도에 맞추되 조금 더 늦춰 따라잡게 한다.
export function autoPace({lead,auto,partnerAuto,myBase,partnerSpeed}){
 if(!auto)return {pace:1,waiting:false};
 if(lead>PAIR.autoWait)return {pace:.2,waiting:true};
 if(lead>PAIR.autoLead)return {pace:.4,waiting:false};
 if(partnerAuto&&lead>.5&&myBase>.05)return {pace:clamp(partnerSpeed/myBase*(1-.05*lead),.45,1),waiting:false};
 return {pace:1,waiting:false};
}
// 앞뒤 줄 뒷사람의 속도 배율: 1.5m보다 가까워지면 줄여서 간격을 지킨다(0.8m에서 가장 느림). 앞사람·간격 충분이면 1.
export function filePace({gap,leader}){if(leader||gap>=PAIR.fileGap)return 1;return clamp((gap-PAIR.push)/(PAIR.fileGap-PAIR.push),.15,1);}
// 밀어내기: 두 몸 중심 거리 d가 0.85m(rest)보다 작으면 이번 프레임에 내가 비켜날 거리와 방향(월드 x·z 단위 벡터).
// 서로 같은 계산을 하므로 둘이 반씩 비켜난다. 딱 겹치면(d≈0) ID 순서로 방향을 정한다(tie = 길 오른쪽 법선 등 호출자가 준 단위 벡터).
export function pushStep({dx,dz,dt,side=1,tie={x:1,z:0}}){
 const d=Math.hypot(dx,dz);if(d>=PAIR_WALK.rest||!(dt>0))return null;
 const speed=Math.min(PAIR_WALK.pushMax,(PAIR_WALK.rest-d)*PAIR_WALK.pushGain),step=speed*Math.min(dt,.1);
 const ux=d>1e-3?dx/d:tie.x*side,uz=d>1e-3?dz/d:tie.z*side;
 return {x:ux*step,z:uz*step,step,d};
}
// 월드 밀기(x·z)를 길 좌표(ds·dl)로: 옆으로 비킬 자리가 있으면 옆, 없으면(좁은 길·가장자리) 앞뒤로.
// normal·forward = 그 자리 길 법선·앞 방향 단위 벡터, room = 옆으로 더 갈 수 있는 거리(밀리는 쪽). alongSign = 앞뒤가 같을 때 갈 쪽(앞사람 +, 뒷사람 −).
export function pushToRoute(push,{normal,forward,lateral,width,margin=PAIR_WALK.margin,alongSign=1}){
 let dl=push.x*normal.x+push.z*normal.z,ds=push.x*forward.x+push.z*forward.z;
 const lim=Math.max(0,width/2-margin),room=dl>=0?lim-lateral:lim+lateral;
 if(Math.abs(dl)>Math.max(0,room)){const rest=Math.abs(dl)-Math.max(0,room);dl=Math.sign(dl)*Math.max(0,room);ds+=(Math.abs(ds)>1e-6?Math.sign(ds):alongSign)*rest;}
 return {ds,dl};
}
// 길 위 살짝 옮기기 검사(main.js local.nudge가 쓴다). 지금보다 길 바깥으로는 margin 안쪽 한도까지만 가고(이미 밖이면 더 나가지 않음),
// 막힌 곳(바위·시설 금지 원, animal-lanes.inForbid)에 새로 들어가면 거부한다. halfWidth(s) = 그 자리 노면 반폭(route-surfaces 폭).
export function routeNudge(cur,{ds=0,dl=0},{halfWidth,minS=-Infinity,maxS=Infinity,blocked=()=>false,margin=PAIR_WALK.margin}){
 const s=clamp(cur.s+ds,minS,maxS),lim=Math.max(0,halfWidth(s)-margin),keep=Math.max(lim,Math.abs(cur.lateral));
 let l=cur.lateral+dl;if(Math.abs(l)>keep)l=Math.sign(l)*keep;
 if(Math.abs(s-cur.s)<1e-9&&Math.abs(l-cur.lateral)<1e-9)return null;
 if(blocked(s,l)&&!blocked(cur.s,cur.lateral))return null;
 return {s,lateral:l};
}
// 한 프레임 안내. me/partner = {zone,x,z,s?,lateral?}, here = 내 자리 {width,stairs,normal,forward}.
// 반환 {near,mode,distance,lead,laneTarget(자동 걷기 옆 목표|null),pace,waiting,drift(직접 걷기 옆 이동 dl),push({ds,dl}|{x,z}|null)}
export function pairGuide({me,partner,myId,partnerId,here,dir=1,dt,auto=false,partnerAuto=false,myBase=0,partnerSpeed=0,moving=false,steering=false}){
 const dx=me.x-partner.x,dz=me.z-partner.z,distance=Math.hypot(dx,dz),sameZone=me.zone===partner.zone;
 const out={near:false,mode:null,distance,lead:0,laneTarget:null,pace:1,waiting:false,drift:0,push:null};
 if(!sameZone)return out;
 const route=me.zone==='route'&&Number.isFinite(me.s)&&Number.isFinite(partner.s);
 if(route)out.lead=(me.s-partner.s)*dir;
 // 자동 걷기 속도(거리와 상관없이: 멀리 앞서도 천천히 걸어 기다린다)
 const ap=autoPace({lead:out.lead,auto,partnerAuto,myBase,partnerSpeed});out.pace=ap.pace;out.waiting=ap.waiting;
 out.near=distance<=PAIR.near;
 const side=sideOf(myId,partnerId);
 if(route&&out.near){
  out.mode=pairMode(here);
  if(out.mode==='side')out.laneTarget=sideLateral(side,here.width);
  else{
   const leader=isLeader({meS:me.s,partnerS:partner.s,dir,myId,partnerId});out.laneTarget=0;
   // 앞뒤 줄의 앞사람은 0m가 아니라 1.5m 간격까지만 기다린다(앞사람이 0m를 노리고 뒷사람이 1.5m를 지키면 둘 다 기어감)
   if(leader){const ap2=autoPace({lead:out.lead-PAIR.fileGap,auto,partnerAuto,myBase,partnerSpeed});out.pace=ap2.pace;out.waiting=ap2.waiting||out.waiting;}
   out.pace=Math.min(out.pace,filePace({gap:Math.abs(me.s-partner.s),leader}));
  }
  // 직접 걷는 동안(옆 키를 누르지 않을 때)만 자리로 천천히 옮긴다. 자동 걷기는 advance가 laneTarget으로 옮긴다.
  if(!auto&&moving&&!steering){const want=out.laneTarget-me.lateral;out.drift=Math.sign(want)*Math.min(Math.abs(want),PAIR_WALK.driftSpeed*Math.min(dt,.1));}
 }
 const p=pushStep({dx,dz,dt,side,tie:here?.normal??{x:1,z:0}});
 if(p)out.push=route&&here?pushToRoute(p,{normal:here.normal,forward:here.forward,lateral:me.lateral,width:here.width,alongSign:isLeader({meS:me.s,partnerS:partner.s,dir,myId,partnerId})?dir:-dir}):{x:p.x,z:p.z};
 return out;
}
