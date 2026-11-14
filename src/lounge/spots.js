// 옥상에서 할 일(B5): 난간에 기대기·벤치에 앉기·자판기 캔커피. 상황 고르기(B6) 단추와 패널도 여기서 직접 만든다(hud.js는 건드리지 않는다).
// 자세는 동동이 원본(src/toon/**, realistic-hiker.js)을 고치지 않고, 원래 동작이 끝난 뒤(player.extra 맨 앞, 흡연 팔보다 먼저) 뼈 회전을 덧씌워 만든다.
// - 기대기: 난간 쪽을 보고 상체를 앞으로 숙이고, 두 팔을 들어 콘크리트 턱 윗면에 올린다.
// - 앉기: 동동이는 다리가 짧아(허벅지·정강이 각 약 6cm) 좌판(0.44m)에 앉으면 발이 바닥에 닿지 않는다(온라인 등산 벤치 앉기 'bench-sit'도 같은 높이에 발이 뜬다).
//   엉덩이를 좌판에 붙여 등받이 쪽으로 조금 들어가 기대고, 허벅지는 앞으로·정강이는 아래로(무릎 약 90도)·발바닥은 평평하게 둔다(11-13).
// - 캔커피: 옥상 어디서든 「캔커피 뽑기」를 누르면 자판기까지 걸어가 뽑는다. 꺼내는 곳으로 캔이 떨어지고, 담배 안 든 손(왼손)에 툰 재질 캔을 들고
//   가끔 저절로 마시며, 「한 모금」 단추(C 키)로 원할 때 마신다(커담 = 커피 한 모금 + 담배 한 모금).
// 상태가 바뀌면 'lounge:spot' {id:'me', spot:'rail'|'bench'|'vending'|'ashtray', state:'enter'|'leave'|'use'|'fail'}를 보낸다(fail = 길이 막힘·자리 없음, 알림도 띄움).
// 단추: 온라인 등산(interaction-ui .ix-marker)처럼 대상(자판기·벤치·난간·재떨이) 위에 표시를 띄운다. 멀면 작은 점, 가까우면 그림, 닿을 거리면 「그림+글」 행동 단추.
//  표시를 누르면 멀리서도 걸어가서 한다. 모양은 「등산 수첩」 종이 톤(hud.css 변수, 44px 이상), 자리는 spots.css. PC는 E 키 = 닿을 거리의 할 일, C 키 = 캔커피.
// 걷기: main.js 자동 이동(직선+충돌)이 장애물·다른 동동이에 막혀도 조용히 끝나지 않게, 여기서 도착을 넉넉히 보고(WALK) 막히면 「길이 막혔어요」 알림 뒤 단추를 되살린다.
import * as THREE from 'three';
import {legTargets} from '../hiker-ik.js';
import {part} from '../toon/concept-kit.js';
import {finishTrailModel,BENCH} from '../toon/trail-props.js';
import {SCENES} from './scene.js';

export const SPOT_RANGE=Object.freeze({rail:1.2,bench:1.5,vending:1.6,ashtray:1.6});
// 자동 걷기 판정: arrive 안이면 도착, stall초 동안 더 가까워지지 않으면 near 안에선 그 자리에서 시작·밖이면 실패. 시간 한도 = extra + 거리/0.9m/s(불 붙이기·끄기로 못 걷는 동안은 세지 않는다)
export const WALK=Object.freeze({arrive:.35,stall:1,near:.8,extra:4,away:.5});
export const MARK=Object.freeze({show:15,far:7}); // 대상 위 표시: 15m 안만, 7m 밖은 작은 점
export const POSE_BLEND=.35;                 // 자세가 들어가고 빠지는 시간(초)
export const SEAT_PAD=.06;                   // 좌판 위 골반 높이(허벅지 두께)
export const SIT=Object.freeze({back:-.12,lean:.16}); // 앉기: 좌판 안쪽으로 들어가 앉는 거리(m, 음수 = 앞쪽으로 당겨 앉아 신발이 좌판 앞 가장자리 밖으로 나온다), 등받이 쪽으로 기대는 허리 각(rad)
export const SIT_LEG=Object.freeze({right:1.15,left:.75}); // 등산 bench-sit과 같은 다리 들기(rad)
export const SIP=Object.freeze({first:1.2,every:[9,15],secs:1.6}); // 캔: 첫 모금까지(쥐자마자 한 모금 — 뽑은 게 보이게), 다음 저절로 마실 때까지, 한 모금 길이(초)
export const CAN=Object.freeze({r:.034,h:.1,body:'#8a5a3c',band:'#f6efdc',top:'#b9bec0'}); // 캔커피(갈색·크림 띠). 동동이 키 1.0m 기준, 담배처럼 실제보다 조금 굵은 만화 크기
export const DROP=Object.freeze({fall:.45,wait:.35,fly:.3}); // 캔이 떨어짐·놓여 있음·손으로 날아옴(초). 소리 순서 audio.js CAN_SEQ가 이 값에 맞춤
const R=.2,UP=new THREE.Vector3(0,1,0),V3=THREE.Vector3,Q=THREE.Quaternion;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};

// 장애물(원·상자)과 R 안으로 겹치면 막힌 자리
export function blocked(colliders,x,z,r=R){
 for(const c of colliders??[]){
  if(c.r!==undefined){if(Math.hypot(x-c.x,z-c.z)<c.r+r)return true;}
  else{const nx=clamp(x,c.minX,c.maxX),nz=clamp(z,c.minZ,c.maxZ);if(Math.hypot(x-nx,z-nz)<r)return true;}
 }
 return false;
}
// 난간 기대기 자리: 가까운 둘레에서 경계 안쪽 inset에 서서 바깥(난간)을 본다. 앞이 막힌 곳(부스·계단실·화분)은 건너뛴다.
// range: 이 거리 안의 난간만. free(x,z): 다른 동동이가 서 있지 않은지(없으면 장애물만 본다). 막혔으면 난간을 따라 0.45·0.9m 옆자리를 찾는다.
// 막힌 난간 지점 옆으로 찾아보는 거리(m). 같이 피우기에서 옆 사람이 기대 있으면 그 옆으로 간다(전에는 ±0.9m만 봐서 다른 쪽 난간까지 11m를 걸어갔다, 11-10).
const RAIL_STEPS=[0,.45,-.45,.9,-.9,1.35,-1.35,1.8,-1.8,2.25,-2.25,2.7,-2.7];
export function railSpot(rooftop,x,z,range=SPOT_RANGE.rail,free=null){
 const b=rooftop.bounds,ins=rooftop.rail?.inset??.22,m=ins+.25;
 const cx=clamp(x,b.minX+m,b.maxX-m),cz=clamp(z,b.minZ+m,b.maxZ-m);
 const list=[
  {x:cx,z:b.minZ+ins,heading:0,n:[0,-1]},{x:cx,z:b.maxZ-ins,heading:Math.PI,n:[0,1]},
  {x:b.minX+ins,z:cz,heading:Math.PI/2,n:[-1,0]},{x:b.maxX-ins,z:cz,heading:-Math.PI/2,n:[1,0]},
 ].map(s=>({...s,d:Math.hypot(s.x-x,s.z-z)})).sort((p,q)=>p.d-q.d);
 for(const s of list){if(s.d>range)break;
  for(const o of RAIL_STEPS){
   const t={...s,x:s.n[0]?s.x:clamp(s.x+o,b.minX+m,b.maxX-m),z:s.n[0]?clamp(s.z+o,b.minZ+m,b.maxZ-m):s.z};t.d=Math.hypot(t.x-x,t.z-z);
   if(t.d<=range&&!blocked(rooftop.colliders,t.x,t.z)&&(!free||free(t.x,t.z)))return {kind:'rail',...t};
  }}
 return null;
}
// 지금 가까운 할 일 자리 하나(벤치·자판기·난간 중 가장 가까운 것)
export function nearestSpot(rooftop,x,z){
 const c=[];
 (rooftop.spots?.benches??[]).forEach((s,i)=>c.push({kind:'bench',index:i,...s,d:Math.hypot(s.x-x,s.z-z)}));
 const vm=rooftop.spots?.vending;if(vm)c.push({kind:'vending',...vm,d:Math.hypot(vm.x-x,vm.z-z)});
 const r=railSpot(rooftop,x,z);if(r)c.push(r);
 return c.filter(s=>s.d<=SPOT_RANGE[s.kind]).sort((p,q)=>p.d-q.d)[0]??null;
}

// ── 뼈 덧씌우기 도구(월드 기준 회전 → 부모 기준으로 바꿔 넣는다)
const _q=new Q(),_q2=new Q(),_q3=new Q();
function setWorldQuat(b,qw){b.parent.getWorldQuaternion(_q3);b.quaternion.copy(_q3.invert().multiply(qw));b.updateMatrixWorld(true);}
function turnWorld(b,axis,angle){if(!b||!angle)return;b.getWorldQuaternion(_q2);_q.setFromAxisAngle(axis,angle);setWorldQuat(b,_q2.premultiply(_q));}
function aim(b,from,to){if(from.lengthSq()<1e-10||to.lengthSq()<1e-10)return;_q.setFromUnitVectors(from.clone().normalize(),to.clone().normalize());b.getWorldQuaternion(_q2);setWorldQuat(b,_q2.premultiply(_q));}
const wpos=(o,t=new V3())=>o.getWorldPosition(t);
// 두 관절 IK(smoke.js·hiker-acts.js와 같은 풀이: src/hiker-ik.js legTargets)
function limb([up,mid,end],target,bend){
 if(!up||!mid||!end)return;const a=wpos(up),b=wpos(mid),c=wpos(end);
 const s=legTargets(a.clone(),target,a.distanceTo(b),b.distanceTo(c),bend);aim(up,b.clone().sub(a),s.knee.clone().sub(a));
 const b2=wpos(mid),c2=wpos(end);aim(mid,c2.sub(b2),s.foot.clone().sub(b2));
}
// 뼈들의 원래 회전과 덧씌운 회전을 w로 섞는다
function blend(bones,w,fn){
 bones=bones.filter(Boolean);if(w<=.001||!bones.length)return;
 const keep=bones.map(b=>b.quaternion.clone());fn();
 if(w<.999)bones.forEach((b,i)=>b.quaternion.slerpQuaternions(keep[i],b.quaternion.clone(),w));
 bones[0].parent?.updateMatrixWorld(true);bones.forEach(b=>b.updateMatrixWorld(true));
}
export function poseRig(model){
 const B=n=>model.getObjectByName('mixamorig'+n)??null;
 const side=s=>({arm:[B(s+'Arm'),B(s+'ForeArm'),B(s+'Hand')],leg:[B(s+'UpLeg'),B(s+'Leg'),B(s+'Foot')],toe:B(s+'ToeBase')});
 return {hips:B('Hips'),spine:['Spine','Spine1','Spine2'].map(B).filter(Boolean),head:B('Head'),Left:side('Left'),Right:side('Right')};
}

function makeCan(toonify){
 const g=new THREE.Group();g.name='캔커피';
 part(g,new THREE.CylinderGeometry(CAN.r,CAN.r,CAN.h,14).translate(0,CAN.h/2,0),CAN.body,{line:.35});
 part(g,new THREE.CylinderGeometry(CAN.r*1.02,CAN.r*1.02,CAN.h*.34,14).translate(0,CAN.h*.52,0),CAN.band,{line:0});
 part(g,new THREE.CylinderGeometry(CAN.r*.86,CAN.r,CAN.h*.08,14).translate(0,CAN.h*1.04,0),CAN.top,{line:.25});
 finishTrailModel(g,toonify,{shadow:true});return g;
}

// 자세·캔 그리기(뼈 덧씌우기). 내 동동이와 같은 방 다른 사람 동동이(multi.js, 11-10)가 같은 코드를 쓴다.
// S: {pose,w,last,spot,can:{held,sips,sipN,next,sip,drop}} — 내 것은 createSpots가, 다른 사람 것은 받은 행동 상태(act)로 multi.js가 채운다.
// auto: 캔을 저절로 마실지(내 것만. 다른 사람은 받은 한 모금 횟수 sip으로만 마신다). 반환: pose(dt) — avatar.extra 맨 앞에 넣는다.
export function createPoser({S,avatar,rooftop,world,toon,smokeState=()=>'idle',auto=true,onChange=()=>{}}){
 const model=avatar.hiker.model,root=avatar.root,rig=poseRig(model);
 const skeleton=model.getObjectByName('ToonHiker_Body')?.skeleton,face=model.userData?.face;
 const headInv=skeleton&&rig.head?skeleton.boneInverses[skeleton.bones.indexOf(rig.head)]:null;
 const mq=()=>model.getWorldQuaternion(new Q());
 const dirM=(x,y,z)=>new V3(x,y,z).applyQuaternion(mq()).normalize(); // 모델 공간(앞 +Z, 왼쪽 +X) → 월드
 const mouth=()=>{
  if(headInv&&face?.mouth)return new V3().fromArray(face.mouth.p).applyMatrix4(new THREE.Matrix4().multiplyMatrices(rig.head.matrixWorld,headInv));
  return wpos(rig.head??model).addScaledVector(dirM(0,0,1),.2).addScaledVector(UP,-.05);
 };
 const handCenter=s=>{const [,f,h]=rig[s].arm;if(!h)return wpos(model);const hp=wpos(h),fp=wpos(f);return hp.clone().add(hp.clone().sub(fp).normalize().multiplyScalar(.03));};

 // ── 캔(손에 든 것 하나 + 자판기에서 떨어지는 것 하나)
 const can=makeCan(toon?.toonify);can.visible=false;world.add(can);
 const fall=makeCan(toon?.toonify);fall.visible=false;world.add(fall);

 // ── 자세(player.extra 맨 앞: 원래 동작 → 이 자세 → 흡연 팔)
 function pose(dt){
  const want=S.pose==='stand'?0:1;S.w+=(want-S.w)*Math.min(1,dt/POSE_BLEND*2.2);if(Math.abs(want-S.w)<.002)S.w=want;
  const w=smooth(S.w),F=dirM(0,0,1),L=dirM(1,0,0);
  const kind=S.pose!=='stand'?S.pose:S.last;
  if(w>0&&kind==='sit')sit(w,F,L,dt);
  if(w>0&&kind==='lean')lean(w,F,L);
  holdCan(dt,F,L);
 }
 function sit(w,F,L,dt){
  const dn=(th,b)=>F.clone().multiplyScalar(Math.sin(-th)).addScaledVector(UP,-Math.cos(th)).addScaledVector(L,b).normalize(); // hiker-acts P.leg와 같은 방향: 아래(0,-1,0)를 X축으로 th만큼 돌린 것
  const seat=S.spot?.seat??{y:.44};
  const hipsH=rig.hips?wpos(rig.hips).y-root.position.y:.4;
  // 엉덩이를 좌판에 붙이고(골반 = 좌판 + 허벅지 두께), 좌판 안쪽(등받이 쪽)으로 조금 들어가 앉는다
  root.position.y+=(seat.y+SEAT_PAD-hipsH)*w;root.position.addScaledVector(F,-SIT.back*w);root.updateMatrixWorld(true);
  // 등받이에 살짝 기댄다: 허리를 뒤로, 목은 반쯤 되돌려 앞을 본다
  blend([...rig.spine,rig.head],w,()=>{turnWorld(rig.spine[0],L,-SIT.lean);turnWorld(rig.head,L,SIT.lean*.6);});
  // 다리: 등산 'bench-sit'(src/toon/hiker-acts.js)과 같은 값·같은 흔들림. 오른쪽 -1.15(+sw*.6)·왼쪽 -0.75(-sw)만큼 앞으로 들고 달랑달랑(sw=sin(t*3.8)*.22). 사람마다 위상이 달라 NPC끼리 박자가 겹치지 않는다.
  S.swingT??=Math.random()*6;S.swingT+=dt*3.8;const sw=Math.sin(S.swingT)*.22*w;
  for(const [s,x] of [['Left',1],['Right',-1]]){
   const [up,mid,end]=rig[s].leg,toe=rig[s].toe;if(!up||!mid)continue;
   const th=x<0?-SIT_LEG.right+sw*.6:-SIT_LEG.left-sw,d=dn(th,x*.05);
   blend([up,mid,end],w,()=>{
    const hp=wpos(up),len=hp.distanceTo(wpos(mid))+(end?wpos(mid).distanceTo(wpos(end)):0);
    limb([up,mid,end],hp.clone().addScaledVector(d,len*.96),UP.clone().multiplyScalar(-Math.sin(th)).addScaledVector(F,Math.cos(th)));
    if(toe&&end){const f2=wpos(end),tp=wpos(toe);aim(end,tp.sub(f2),F.clone().addScaledVector(UP,.3).addScaledVector(L,x*.12));}
   });
   // 손은 허벅지 위(캔 든 왼손은 holdCan이 정한다)
   if(s==='Left'&&S.can.held)continue;
   const t=wpos(up).lerp(wpos(mid),.6).addScaledVector(UP,.08).addScaledVector(L,x*.03);
   blend(rig[s].arm,w,()=>limb(rig[s].arm,t,dirM(x*.5,-.2,-1)));
  }
 }
 function lean(w,F,L){
  const n=S.spot?.n?new V3(S.spot.n[0],0,S.spot.n[1]):F.clone().setY(0).normalize(),rl=rooftop.rail??{inset:.22,cap:.5,ledge:.12};
  // 상체를 난간 쪽으로 숙인다(척추 세 마디에 나눠서)
  blend(rig.spine,w,()=>{turnWorld(rig.spine[0],L,.16);turnWorld(rig.spine[1],L,.1);turnWorld(rig.spine[2],L,.05);});
  // 두 팔을 들어 콘크리트 턱 윗면에 올린다(팔꿈치는 바깥·아래로)
  const base=new V3(root.position.x,0,root.position.z).addScaledVector(n,rl.inset+rl.ledge*.5);
  for(const [s,x] of [['Left',1],['Right',-1]]){
   if(s==='Left'&&S.can.held)continue;
   const t=base.clone().setY(rl.cap+.035).addScaledVector(L,x*.1);
   blend(rig[s].arm,w,()=>limb(rig[s].arm,t,dirM(x*.9,-.35,-.3)));
  }
 }
 function holdCan(dt,F,L){
  const c=S.can;
  // 자판기에서 떨어지는 캔 → 잠깐 놓였다가 손으로
  if(c.drop){const d=c.drop;d.t+=dt;const o=rooftop.spots?.vending?.outlet??{x:root.position.x,y:.3,z:root.position.z};
   if(d.t<DROP.fall){const k=d.t/DROP.fall,bounce=k<.75?(1-(k/.75)**2)*.32:Math.sin((k-.75)/.25*Math.PI)*.03;fall.visible=true;fall.position.set(o.x,o.y-.02+bounce,o.z);fall.rotation.set(0,0,k<.75?0:.3*(1-k));}
   else if(d.t<DROP.fall+DROP.wait){fall.position.set(o.x,o.y-.02,o.z);fall.rotation.set(0,0,0);}
   else if(d.t<DROP.fall+DROP.wait+DROP.fly){const k=smooth((d.t-DROP.fall-DROP.wait)/DROP.fly);fall.position.lerpVectors(new V3(o.x,o.y-.02,o.z),handCenter('Left'),k);}
   else{fall.visible=false;c.drop=null;c.held=true;c.sips=0;c.next=SIP.first;c.sip=-1;onChange();}
  }
  if(!c.held){can.visible=false;return;}
  const st=smokeState(),busyMouth=st==='inhale',lighting=st==='lighting';
  // 가끔 마신다(담배를 빨아들이는 중에는 기다린다)
  if(c.sip<0&&auto){c.next-=dt;if(c.next<=0&&!busyMouth&&!lighting){c.sip=0;c.sipN=(c.sipN+1)&0xffff;}}
  let k=0;if(c.sip>=0){c.sip+=dt;const p=c.sip/SIP.secs;k=p<.3?smooth(p/.3):p>.75?1-smooth((p-.75)/.25):1;
   if(c.sip>=SIP.secs){c.sip=-1;c.sips++;c.next=SIP.every[0]+Math.random()*(SIP.every[1]-SIP.every[0]);k=0;}}
  if(lighting){can.visible=false;return;} // 라이터를 켜는 왼손에는 캔을 숨긴다
  const sh=rig.Left.arm[0]?wpos(rig.Left.arm[0]):wpos(model).addScaledVector(UP,.55);
  const hold=sh.clone().addScaledVector(F,.13).addScaledVector(UP,-.17).addScaledVector(L,.05);
  if(S.pose==='lean'&&S.w>.5)hold.copy(sh).addScaledVector(F,.2).addScaledVector(UP,-.06).addScaledVector(L,.06);
  const t=hold.lerp(mouth().addScaledVector(F,.075).addScaledVector(UP,-.05),k);
  blend(rig.Left.arm,1,()=>limb(rig.Left.arm,t,dirM(.45,-.35,-1)));
  can.visible=true;can.position.copy(handCenter('Left')).addScaledVector(UP,-CAN.h*.45);
  can.quaternion.setFromAxisAngle(L,-1.15*k); // 마실 때 캔 위쪽을 입 쪽(뒤)으로 기울인다
  can.updateMatrixWorld(true);
 }
 return {pose,can,fall,rig,dispose(){world.remove(can);world.remove(fall);}};
}

// 다른 사람 자세 상태 S에 받은 행동 상태 a({p,b,can,sip}, multi-protocol ACT_SCHEMA.smoking)를 넣는다(11-10).
//  자세는 바뀔 때만(빠질 때 섞이도록 last를 남김), 캔은 1(뽑는 중)이면 자판기에서 떨어지는 장면부터, 2(들고 있음)를 처음 받으면(중간 입장) 바로 손에,
//  한 모금 횟수 sip이 늘면 한 모금(처음 받은 값은 기준으로만 둔다).
export const newPoseState=()=>({pose:'stand',w:0,last:null,spot:null,can:{held:false,sips:0,sipN:0,next:0,sip:-1,drop:null,seen:null}});
export function applyRemoteAct(S,a,rooftop){
 if(!S||!a)return S;
 const p=a.p??'stand';
 if(p!==S.pose){
  if(p!=='stand')S.last=p;
  S.pose=p;
  if(p==='sit'){const i=Number.isInteger(a.b)?a.b:0,b=rooftop?.spots?.benches?.[i];S.spot=b?{kind:'bench',index:i,...b}:{kind:'bench',index:i,seat:{y:BENCH.seatY}};}
  else if(p==='lean')S.spot=null; // 난간 쪽 = 그 사람이 바라보는 쪽(lean이 몸 앞 방향을 쓴다)
 }
 const c=S.can,want=a.can??0;
 if(want===1&&!c.drop){c.held=false;c.drop={t:0};c.sip=-1;}
 else if(want===2&&!c.held&&!c.drop){c.held=true;c.sip=-1;}
 else if(want===0){c.held=false;c.drop=null;c.sip=-1;}
 if(Number.isInteger(a.sip)){if(c.seen!==null&&a.sip!==c.seen&&c.held&&c.sip<0)c.sip=0;c.seen=a.sip;}
 return S;
}
// 내 행동 상태(보낼 것): 자세·앉은 벤치·캔·한 모금 횟수
export function actOf(S){
 const a={p:S.pose,can:S.can.drop?1:S.can.held?2:0,sip:S.can.sipN&0xffff};
 if(S.pose==='sit'&&Number.isInteger(S.spot?.index))a.b=S.spot.index;
 return a;
}

// ctx: main.js ctx(THREE·toon·world·rooftop·player·smoker·dispatch). goTo({x,z,heading,done}): main.js 자동 이동. scene: scene.js createScene 결과.
export function createSpots({ctx,player=ctx.player,smoker=ctx.smoker,rooftop=ctx.rooftop,world=ctx.world,toon=ctx.toon,goTo,scene=null,query=null,ui=true,camera=ctx.camera}){
 const dispatch=ctx.dispatch??((type,detail)=>globalThis.dispatchEvent(new CustomEvent(type,{detail})));
 // 다른 동동이·장애물이 그 자리를 차지했는지: main.js collide(나는 빼고 민다)가 자리를 옮기면 차지된 것
 //  (collide는 정확히 같은 점에 선 동동이는 밀지 못하므로 3cm 옆 점도 함께 본다)
 // 같은 방 다른 사람(같이 피우기, 11-10)이 서 있거나 앉은 자리도 차지된 것으로 본다(ctx.multi.occupied). 전에는 두 사람이 같은 난간 지점·같은 좌판에 겹쳐 섰다.
 const taken=(x,z,r=.36)=>!!ctx.multi?.occupied?.(x,z,r)||(ctx.npcs?.avatars??[]).some(a=>Math.hypot(a.x-x,a.z-z)<r);
 const free=(x,z)=>!taken(x,z)&&(!ctx.collide||[[0,0],[.03,0],[0,.03]].every(([ox,oz])=>{const c=ctx.collide(x+ox,z+oz);return Math.hypot(c.x-x-ox,c.z-z-oz)<.05;}));
 // 벤치(길이 1.5m): 가운데에 누가 앉아 있으면 왼쪽·오른쪽 자리(±0.42m)에 앉는다. 셋 다 차면 null.
 const seatFor=spot=>{const s=spot.seat,ax=-Math.cos(s.heading),az=Math.sin(s.heading);
  for(const o of [0,.42,-.42]){const x=s.x+ax*o,z=s.z+az*o;if(!taken(x,z,.3))return o?{...spot,seat:{...s,x,z},x:spot.x+ax*o,z:spot.z+az*o}:spot;}
  return null;};
 const send=(spot,state,extra={})=>dispatch('lounge:spot',{id:player.id,spot,state,...extra});
 const S={pose:'stand',w:0,spot:null,anchor:null,pending:null,near:null,glide:null,notice:null,
  can:{held:false,sips:0,sipN:0,next:0,sip:-1,drop:null}};
 const smokeState=()=>smoker?.status?.()?.state??'idle';
 const poser=createPoser({S,avatar:player,rooftop,world,toon,smokeState,onChange:()=>render()});
 const {can}=poser;
 player.extra.unshift(poser.pose);

 // 짧은 알림: HUD 알림 자리(.lg-toast)를 같이 쓴다(hud.js는 그대로). 노드 테스트에서는 S.notice에만 남는다.
 let toastH=0;
 function toast(t){S.notice=t;const el=globalThis.document?.querySelector?.('.lg-toast');if(!el)return;el.textContent=t;el.hidden=false;el.style.opacity=1;
  clearTimeout(toastH);toastH=setTimeout(()=>{el.style.opacity=0;setTimeout(()=>{el.hidden=true;},400);},1800);}
 const spotName=k=>k==='bench'?'bench':k==='vending'?'vending':k==='ashtray'?'ashtray':'rail';
 // ── 할 일
 function begin(kind,spot){
  S.pending=null;
  if(kind==='sit'){const seat=seatFor(spot);if(!seat){toast('벤치에 자리가 없어요');send('bench','fail',{reason:'taken'});render();return;}spot=seat;const s=spot.seat;player.x=s.x;player.z=s.z;player.heading=s.heading;player.root.position.set(s.x,0,s.z);}
  else player.heading=spot.heading;
  S.pose=kind;S.last=kind;S.spot=spot;S.anchor={x:player.x,z:player.z};
  send(kind==='sit'?'bench':'rail','enter',kind==='sit'?{index:spot.index}:{});render();
 }
 function stand(){
  if(S.pose==='stand')return false;const kind=S.pose,spot=S.spot;S.pose='stand';S.glide=null;
  if(kind==='sit'&&spot){const m=Math.hypot(player.x-spot.seat.x,player.z-spot.seat.z);if(m<.05){player.x=spot.x;player.z=spot.z;}} // 좌판 앞으로 일어선다
  S.anchor=null;send(kind==='sit'?'bench':'rail','leave');render();return true;
 }
 // 자리까지 걸어간 뒤 시작(이미 가까우면 바로). 판정은 update()의 WALK(넉넉한 도착·막힘·시간 한도). main.js 자동 이동의 done도 같은 도착으로 받는다.
 function walkThen(spot,fn){
  stand();S.glide=null;const d=Math.hypot(spot.x-player.x,spot.z-player.z);
  if(d<WALK.arrive){S.pending=null;goTo?.(null);player.heading=spot.heading;fn();return;}
  const P={spot,fn,t:0,wait:0,limit:WALK.extra+d/.9,best:d,stall:0};S.pending=P;
  goTo?.({x:spot.x,z:spot.z,heading:spot.heading,done:()=>{if(S.pending===P)arrive();}});
  render();
 }
 function arrive(){const P=S.pending;if(!P)return;S.pending=null;goTo?.(null);player.heading=P.spot.heading;P.fn();render();}
 function fail(reason){const P=S.pending;S.pending=null;goTo?.(null);
  toast(P?.spot.kind==='vending'?'길이 막혔어요 · 자판기를 다시 눌러 보세요':'길이 막혔어요 · 다시 눌러 보세요');
  send(spotName(P?.spot.kind),'fail',{reason});render();}
 function buy(){
  S.pending=null;const c=S.can;c.held=false;c.drop={t:0};can.visible=false;
  send('vending','use',{item:'can-coffee'});toast('덜컹! 캔커피 나왔어요 ☕');render();
 }
 // 난간 기대기(닿을 거리): 걸어가지 않고 가장 가까운 빈 난간 지점에서 바로 시작한다(몸은 자세가 들어가는 동안 그 지점으로 스르륵 붙는다)
 function leanHere(s){
  stand();S.pending=null;goTo?.(null);
  S.glide={fx:player.x,fz:player.z,tx:s.x,tz:s.z,t:0,dur:clamp(Math.hypot(s.x-player.x,s.z-player.z)/1.6,.12,.75)};
  begin('lean',s);
 }
 const benchSpot=i=>{const b=rooftop.spots?.benches?.[i];return b?{kind:'bench',index:i,...b}:null;};
 const act={
  lean(){const s=railSpot(rooftop,player.x,player.z,SPOT_RANGE.rail,free);
   if(!s){toast('가까운 난간 자리가 없어요');send('rail','fail',{reason:'none'});return false;}
   leanHere(s);return true;},
  sit(){const n=nearestSpot(rooftop,player.x,player.z);if(n?.kind!=='bench'){toast('가까운 벤치가 없어요');send('bench','fail',{reason:'none'});return false;}walkThen(n,()=>begin('sit',n));return true;},
  // 캔커피는 옥상 어디서든: 자판기 앞까지 걸어가서 뽑는다(뽑는 중엔 한 번만)
  coffee(){const vm=rooftop.spots?.vending;if(!vm||buying())return false;
   const far=Math.hypot(vm.x-player.x,vm.z-player.z)>WALK.arrive;walkThen({kind:'vending',...vm},buy);if(far)toast('자판기로 걸어가요');return true;},
  // 한 모금(C 키): 캔을 들고 있고, 담배를 빨거나 불 붙이는 중이 아니면 바로 마신다
  sip(){const c=S.can,st=smokeState();if(!c.held||c.sip>=0||st==='inhale'||st==='lighting')return false;c.sip=0;c.sipN=(c.sipN+1)&0xffff;return true;},
  stand,
  dropCan(){if(!S.can.held)return false;S.can.held=false;can.visible=false;render();return true;},
  // 대상 위 표시를 눌렀을 때(멀리서도): kind = 'bench'|'rail'|'vending'|'ashtray', index = 벤치·재떨이 번호
  go(kind,index=0){
   if(kind==='vending')return act.coffee();
   if(kind==='bench'){const b=benchSpot(index);if(!b)return false;
    if(S.pose==='sit'&&S.spot?.index===index)return stand();
    const far=Math.hypot(b.x-player.x,b.z-player.z)>SPOT_RANGE.bench;walkThen(b,()=>begin('sit',b));if(far)toast('벤치로 걸어가요');return true;}
   if(kind==='rail'){if(S.pose==='lean')return stand();
    const near=railSpot(rooftop,player.x,player.z,SPOT_RANGE.rail,free);if(near){leanHere(near);return true;}
    const s=railSpot(rooftop,player.x,player.z,MARK.show,free);if(!s){toast('가까운 난간 자리가 없어요');send('rail','fail',{reason:'none'});return false;}
    walkThen(s,()=>begin('lean',s));toast('난간으로 걸어가요');return true;}
   if(kind==='ashtray'){const a=rooftop.spots?.ashtrays?.[index];if(!a)return false;walkThen({kind:'ashtray',index,...a},()=>send('ashtray','enter',{index}));toast('재떨이로 걸어가요');return true;}
   return false;
  },
 };
 // 자판기로 걸어가는 중이거나 캔이 떨어지는 중
 function buying(){return !!S.can.drop||S.pending?.spot.kind==='vending';}
 // 지금 뜬 할 일(E 키·첫 단추)
 const primary=()=>S.pose!=='stand'?'stand':S.near?.kind==='rail'?'lean':S.near?.kind==='bench'?'sit':S.near?.kind==='vending'?'coffee':null;

 // ── 매 프레임(이동 뒤): 움직이면 자세를 풀고, 가까운 자리를 찾는다
 let nearT=0;
 function update(dt){
  // 난간에 붙는 중: 자세가 들어가는 동안 몸을 난간 지점으로 옮긴다(이 움직임은 「움직이면 풀림」으로 치지 않는다)
  if(S.glide){const g=S.glide;g.t+=dt;const k=smooth(g.t/g.dur);player.x=g.fx+(g.tx-g.fx)*k;player.z=g.fz+(g.tz-g.fz)*k;S.anchor={x:player.x,z:player.z};if(g.t>=g.dur)S.glide=null;}
  else if(S.pose!=='stand'&&S.anchor&&Math.hypot(player.x-S.anchor.x,player.z-S.anchor.z)>.04)stand();
  // 걸어가는 중(WALK): 넉넉히 도착 → 시작, 1초 동안 더 가까워지지 않으면 가까울 땐 그 자리에서 시작·멀면 「길이 막혔어요」, 직접 움직여 멀어지면 조용히 그만둔다.
  // 불 붙이기·끄기(smoker.blocksMove)로 못 걷는 동안은 시간을 세지 않고 기다린다.
  if(S.pending){const P=S.pending,d=Math.hypot(P.spot.x-player.x,P.spot.z-player.z);
   if(smoker?.blocksMove?.()){P.wait+=dt;P.stall=0;}
   else{P.t+=dt;
    if(d<WALK.arrive)arrive();
    else if(d<P.best-.03){P.best=d;P.stall=0;}
    else if(d>P.best+WALK.away){S.pending=null;goTo?.(null);render();}
    else{P.stall+=dt;if(P.stall>=WALK.stall)d<=WALK.near?arrive():fail('blocked');}
    if(S.pending===P&&P.t>P.limit)d<=WALK.near?arrive():fail('timeout');}}
  nearT-=dt;if(nearT<=0){nearT=.2;const n=S.pose==='stand'?nearestSpot(rooftop,player.x,player.z):S.near;S.near=n;render();} // render는 바뀐 것만 다시 그린다
  placeMarksRef?.();
 }

 // ── 단추·상황 패널(브라우저에서만)
 let render=()=>{},placeMarksRef=null;
 if(ui&&globalThis.document)render=buildUi();
 function buildUi(){
  const cssReady=import('./spots.css').catch(()=>{}); // 노드 테스트가 이 파일을 읽을 수 있게 CSS는 브라우저에서만 불러온다
  const app=document.getElementById('app')??document.body;
  const mood=document.createElement('div');mood.className='sp-mood';app.prepend(mood);
  const dock=document.createElement('div');dock.className='sp-dock';dock.setAttribute('aria-label','상황');dock.hidden=true;cssReady.then(()=>{dock.hidden=false;});app.appendChild(dock);
  // 손에 든 캔(한 모금·캔 버리기)은 대상이 없으니 흡연 단추 옆(HUD 아래 단추 묶음 .lg-dock)에 둔다
  const hand=document.createElement('div');hand.className='grp sp-hand';hand.setAttribute('aria-label','캔커피');
  const lgDock=app.querySelector('.lg-dock');if(lgDock)lgDock.insertBefore(hand,lgDock.querySelector('.tools'));else dock.appendChild(hand);
  // 대상 위 표시 층(말풍선 아래)
  const marks=document.createElement('div');marks.className='sp-marks';marks.hidden=true;cssReady.then(()=>{marks.hidden=false;});mood.after(marks);
  const panel=document.createElement('section');panel.className='lg-card sp-panel';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','상황 고르기');app.appendChild(panel);
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const btn=(a,icon,label,cls='',extra='')=>`<button class="lg-btn sp-btn ${cls}" data-sp="${a}" aria-label="${esc(label)}"${extra}><span class="sp-i" aria-hidden="true">${icon}</span><span class="sp-t">${esc(label)}</span></button>`;
  let sig='';
  function renderDock(){
   const cur=scene?.current?SCENES[scene.current]:null;
   const s=JSON.stringify([S.can.held,cur?.id,S.pose]);if(s===sig)return;sig=s;
   dock.innerHTML=scene?btn('scene',cur?cur.icon:'🕐',cur?cur.label:'상황 고르기','',' aria-haspopup="dialog"'):'';
   // 앉음·기댐: 일어나기는 머리 위가 아니라 이 손 단추 줄 맨 앞(종이색 보조 단추, E 키). 머리 위 표시는 얼굴을 가려서 뺐다(11-13)
   const up=S.pose==='sit'?btn('stand','↩','일어나기','sec stand',' title="E"'):S.pose==='lean'?btn('stand','↩','난간에서 떨어지기','sec stand',' title="E"'):'';
   hand.innerHTML=up+(S.can.held?btn('sip','☕','한 모금','',' title="C"')+btn('dropCan','🗑','캔 버리기','sec'):'');
  }
  // ── 대상 위 표시: 0.2초마다 목록·상태를 정하고(바뀔 때만 글을 다시 쓴다 — 누르는 사이 단추가 다시 그려져 클릭이 사라지지 않게), 매 프레임 화면 좌표로 옮긴다
  const LIFT={vending:2.05,bench:1.0,benchBusy:1.55,rail:1.2,ashtray:1.05};
  const seatBusy=s=>{const ax=-Math.cos(s.heading),az=Math.sin(s.heading);return [0,.42,-.42].some(o=>taken(s.x+ax*o,s.z+az*o,.3));};
  const els=new Map();let targets=[];
  function targetList(){
   const px=player.x,pz=player.z,list=[],sp=rooftop.spots??{};
   const add=(kind,index,x,z,ax,az,lift=LIFT[kind])=>{const d=Math.hypot(x-px,z-pz);if(d<=MARK.show)list.push({key:kind+index,kind,index,x:ax??x,z:az??z,d,lift});};
   if(sp.vending)add('vending',0,sp.vending.x,sp.vending.z,sp.vending.outlet?.x,(sp.vending.outlet?.z??sp.vending.z)-.1);
   // 다른 사람·NPC가 앉아 있는 벤치는 표시를 앉은 머리 위로 올린다(좌판 위 1.0m는 앉은 얼굴 높이)
   (sp.benches??[]).forEach((b,i)=>add('bench',i,b.x,b.z,b.seat?.x,b.seat?.z,b.seat&&seatBusy(b.seat)?LIFT.benchBusy:LIFT.bench));
   (sp.ashtrays??[]).forEach((a,i)=>add('ashtray',i,a.x,a.z,a.at?.x,a.at?.z));
   const r=S.pose==='lean'&&S.spot?S.spot:railSpot(rooftop,px,pz,MARK.show,free);
   if(r){const ins=rooftop.rail?.inset??.22;add('rail',0,r.x,r.z,r.x+r.n[0]*(ins+.1),r.z+r.n[1]*(ins+.1));}
   return list;
  }
  function markState(t){
   const mine=(t.kind==='bench'&&S.pose==='sit'&&S.spot?.index===t.index)||(t.kind==='rail'&&S.pose==='lean');
   if(mine)return null; // 내가 앉은 벤치·기댄 난간: 일어나기는 아래 손 단추 줄에 있다(머리 위 표시는 얼굴을 가림)
   const busy=t.kind==='vending'&&buying(),going=S.pending&&S.pending.spot.kind===t.kind&&(S.pending.spot.index??0)===t.index;
   const near=t.d<=SPOT_RANGE[t.kind];
   const L={vending:['🥫','캔커피 뽑기'],bench:['🪑','걸터앉기'],rail:['🧍','난간에 기대기'],ashtray:['🚏','재떨이']}[t.kind];
   if(busy)return {st:'act',icon:'🥫',label:'뽑는 중…',off:true};
   if(going)return {st:'act',icon:L[0],label:'가는 중…',off:true};
   if(t.kind==='ashtray'&&near)return null; // 재떨이 앞에서는 흡연 단추(꽁초 버리기)가 할 일
   if(near)return {st:'act',icon:L[0],label:L[1]};
   return {st:t.d<=MARK.far?'mid':'far',icon:L[0],label:L[1]};
  }
  function renderMarks(){
   targets=targetList();const seen=new Set();
   for(const t of targets){
    const m=markState(t);if(!m)continue;seen.add(t.key);
    let o=els.get(t.key);
    if(!o){const el=document.createElement('button');el.type='button';el.dataset.sp='go';marks.appendChild(el);o={el,sig:''};els.set(t.key,o);}
    o.t=t;const sg=JSON.stringify(m);if(sg===o.sig)continue;o.sig=sg;
    const {el}=o;el.className=`sp-mark ${m.st}`;el.dataset.k=t.kind+':'+t.index;el.disabled=!!m.off;
    el.setAttribute('aria-label',m.label);el.title=m.st==='act'&&!m.off&&m.icon!=='↩'?m.label+(primary()&&t.d<=SPOT_RANGE[t.kind]?' (E)':''):m.label;
    el.innerHTML=`<span class="sp-i" aria-hidden="true">${m.icon}</span>`+(m.st==='act'?`<span class="sp-t">${esc(m.label)}</span>`:'');
    o.w=0; // 크기는 다음 배치 때 잰다
   }
   for(const [k,o] of els)if(!seen.has(k)){o.el.remove();els.delete(k);}
  }
  const pv=new V3();
  function placeMarks(){
   if(!camera||!els.size)return;const W=innerWidth,H=innerHeight,pad=8;
   const dr=dock.childElementCount?dock.getBoundingClientRect():null; // 「상황」 단추 자리
   for(const o of els.values()){const t=o.t;pv.set(t.x,t.lift,t.z).project(camera);
    const hide=pv.z>1||Math.abs(pv.x)>1.15||Math.abs(pv.y)>1.15;o.el.style.visibility=hide?'hidden':'';if(hide)continue;
    if(!o.w){o.w=o.el.offsetWidth;o.h=o.el.offsetHeight;}
    // 화면 가장자리를 넘으면 안쪽으로 붙인다(위 수첩·설정 줄 아래, 아래 단추 묶음 위까지)
    let x=clamp((pv.x*.5+.5)*W,o.w/2+pad,W-o.w/2-pad);const y=clamp((-pv.y*.5+.5)*H,o.h/2+60,H-o.h/2-pad);
    if(dr&&dr.width&&x+o.w/2>dr.left-4&&x-o.w/2<dr.right+4&&y+o.h/2>dr.top-4&&y-o.h/2<dr.bottom+4)x=dr.left-4-o.w/2; // 「상황」 단추와 겹치면 그 왼쪽으로 비킨다
    o.el.style.transform=`translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%)`;}
  }
  placeMarksRef=placeMarks;
  function renderPanel(){
   const cur=scene?.current;
   panel.innerHTML=`<h3>어떤 한 대 피울까요? <button class="lg-btn sp-x" data-sp="close" aria-label="닫기">✕</button></h3>
    <div class="sp-scenes">${scene.list.map(s=>`<button class="lg-btn ${s.id===cur?'on':''}" data-scene="${s.id}"><span class="sp-i" aria-hidden="true">${s.icon}</span><b>${esc(s.label)}</b><small>${esc(s.sub)}</small></button>`).join('')}</div>
    <button class="lg-btn sp-keep" data-sp="close">지금 시간 그대로 둘게요</button>
    <button class="lg-btn sp-fb" data-sp="feedback">💌 의견 보내기</button>`;
  }
  const openPanel=()=>{if(!scene)return;renderPanel();panel.hidden=false;};
  const closePanel=()=>{panel.hidden=true;};
  const pick=id=>{scene?.set(id);closePanel();sig='';renderDock();syncSettings();};
  const onClick=e=>{
   const sc=e.target.closest('[data-scene]');if(sc){pick(sc.dataset.scene);return;}
   const t=e.target.closest('[data-sp]');if(!t)return;const a=t.dataset.sp;
   if(a==='scene'){panel.hidden?openPanel():closePanel();return;}
   if(a==='close'){closePanel();return;}
   if(a==='feedback'){closePanel();dispatch('lounge:feedback-open');return;} // 카드는 공용 src/feedback.js(hud.js가 설치)
   if(a==='go'){const [k,i]=t.dataset.k.split(':');act.go(k,+i);renderMarks();return;}
   act[a]?.();
  };
  dock.addEventListener('click',onClick);panel.addEventListener('click',onClick);hand.addEventListener('click',onClick);marks.addEventListener('click',onClick);
  // PC: E 키 = 지금 뜬 할 일
  const modal=app.querySelector('.lg-modal');
  addEventListener('keydown',e=>{const a=document.activeElement;if(e.key==='Escape'&&!panel.hidden){closePanel();return;}if(e.code!=='KeyE'||e.repeat||(a&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA'))||(modal&&!modal.hidden))return;const p=primary();if(p){e.preventDefault();act[p]();}});
  // PC: C 키 = 캔커피(들고 있으면 한 모금, 없으면 뽑으러 가기)
  addEventListener('keydown',e=>{const a=document.activeElement;if(e.code!=='KeyC'||e.repeat||(a&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA'))||(modal&&!modal.hidden))return;e.preventDefault();S.can.held?act.sip():act.coffee();});
  // 설정 창에 「상황」 줄을 덧붙인다(hud.js는 그대로, 설정 창이 그려질 때마다 다시 붙인다)
  function syncSettings(){
   if(!modal||modal.hidden||!scene)return;const sheet=modal.querySelector('.lg-sheet');if(!sheet||!sheet.querySelector('[data-t]'))return;
   let box=sheet.querySelector('.sp-set');
   if(!box){box=document.createElement('div');box.className='sp-set';const h=[...sheet.querySelectorAll('h2')].find(x=>x.textContent==='소리');sheet.insertBefore(box,h??null);}
   const html=`<h2>상황</h2><div class="opts">${scene.list.map(s=>`<button class="lg-btn ${s.id===scene.current?'on':''}" data-scene="${s.id}">${s.icon} ${esc(s.label)}</button>`).join('')}</div>`;
   if(box.innerHTML!==html)box.innerHTML=html;
   sheet.querySelectorAll('[data-t]').forEach(b=>b.classList.toggle('on',b.dataset.t===globalThis.lounge?.timeState?.mode));
  }
  let lobbyWasOpen=false,asked=false;
  const askScene=()=>{if(asked||!scene)return;asked=true;cssReady.then(openPanel);};
  if(modal){
   modal.addEventListener('click',e=>{const sc=e.target.closest('[data-scene]');if(sc){scene?.set(sc.dataset.scene);sig='';renderDock();syncSettings();}});
   new MutationObserver(()=>{
    if(!modal.hidden){closePanel();if(modal.querySelector('[data-a=enter]'))lobbyWasOpen=true;syncSettings();}
    else if(lobbyWasOpen){lobbyWasOpen=false;askScene();} // 입장하기를 누른 뒤 상황을 묻는다
   }).observe(modal,{attributes:true,attributeFilter:['hidden'],childList:true});
  }
  // 주소에 ?scene=… 이 있으면 바로 그 상황, ?time·?capture가 있으면 묻지 않는다(자동 캡처용)
  const q=query??new URLSearchParams(location.search);
  if(q.get('scene')&&SCENES[q.get('scene')]){asked=true;scene?.set(q.get('scene'));}
  else{if(q.has('time')||q.has('capture'))asked=true;
   const sv=scene?.saved;if(sv&&!q.has('time')&&ctx.profile?.timeMode===SCENES[sv].time)scene.set(sv);} // 지난번 상황을 이어서(패널에 표시)
  if(modal&&!modal.hidden&&modal.querySelector('[data-a=enter]'))lobbyWasOpen=true;else askScene();
  return ()=>{renderDock();renderMarks();};
 }
 render();

 return {
  update,act,
  lean:act.lean,sit:act.sit,coffee:act.coffee,go:act.go,sip:act.sip,stand:act.stand,dropCan:act.dropCan,
  get pose(){return S.pose;},
  // 같이 피우기로 보낼 행동 상태(multi.js가 바뀔 때만 보낸다)
  act:()=>actOf(S),
  status(){const P=S.pending;return {pose:S.pose,w:+S.w.toFixed(2),near:S.near?.kind??null,primary:primary(),notice:S.notice,
   pending:P?{to:P.spot.kind,d:+Math.hypot(P.spot.x-player.x,P.spot.z-player.z).toFixed(2),t:+P.t.toFixed(1),waited:+P.wait.toFixed(1),stall:+P.stall.toFixed(1)}:null,
   can:{held:S.can.held,dropping:!!S.can.drop,sips:S.can.sips,sipping:S.can.sip>=0}};},
  can,
 };
}
