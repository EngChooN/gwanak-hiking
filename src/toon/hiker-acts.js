// 동동이 즐길거리 동작(2026-11-06 시안 승인 → link-hiker 뼈대로 다시 만듦): 벤치 앉기·역기·거꾸리·허리돌리기·철봉·에어건·초콜릿·고양이 쓰다듬기.
// 시안(props-concepts.js)은 부위 Group을 직접 돌렸다. 여기서는 같은 각도(시안 Euler, 앞 +Z·왼쪽 +X)를 팔·다리 목표점으로 바꿔 두 관절 IK로 푼다.
// 등산객 코드(realistic-hiker.js)가 ground()까지 정한 자세 위에 덮어쓴다: 바인드 자세에서 다시 세운 동작 자세와 원래 자세를 weight로 섞는다.
// 모자·배낭은 따로 된 메시(ToonHiker_Hat·ToonHiker_Pack)를 숨기고 같은 형상의 단단한 사본을 움직인다(모자 날아가기·배낭 내려놓기).
import * as THREE from 'three';
import {legTargets} from '../hiker-ik.js';
import {v,ell,part} from './concept-kit.js';
import {surfaceFrame} from './link-hiker.js';
import {LIMITS} from '../device-profile.js';
import {makeTrailProp,setHose,lineMat,trailPropTemplate,BENCH} from './trail-props.js';
import {pickLine} from '../trail-lines.js';

const {Vector3:V3,Quaternion:Q,Matrix4:M4,MathUtils}=THREE;
const smooth=(a,b,x)=>{const t=MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const POSE=['Hips','Spine','Spine1','Spine2','Neck','Head','LeftShoulder','RightShoulder','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'];
const ARMS=['LeftShoulder','RightShoulder','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand'];
const RIGHT_ARM=['RightShoulder','RightArm','RightForeArm','RightHand'];
// 동작 길이(초). hold = 멈추라고 할 때까지(벤치), 들르기에서는 holdSeconds만큼 앉았다 일어난다.
export const ACT_SECONDS=Object.freeze({pant:1.5,cramp:3,'bench-sit':8,'gym-lift':6.2,'gym-hang':7.2,'gym-twist':2.6,'gym-bar':4.2,airgun:4.8,choco:1.2,'pet-cat':4});
export const ACT_LABEL=Object.freeze({pant:'헥헥',cramp:'다리에 쥐','bench-sit':'벤치에 앉기','gym-lift':'시멘트 역기','gym-hang':'거꾸리','gym-twist':'허리돌리기','gym-bar':'철봉','airgun':'💨 신발 털기','choco':'🍫 먹기','pet-cat':'고양이 쓰다듬기'});
export const DIZZY_SECONDS=2;   // 허리돌리기 뒤 비틀거리기(조작은 그대로 받는다)
export const HAT_RETURN_SECONDS=2; // 에어건: 모자가 날아갔다가 2초 뒤 머리 위로 떨어진다
export const LIFT_REPS=10;      // 역기 득근 게이지 칸

// 시안 Euler(XYZ, 라디안)로 돌린 벡터
const eul=new THREE.Euler();
const rot=(vec,[x=0,y=0,z=0])=>vec.clone().applyEuler(eul.set(x,y,z,'XYZ'));

// quiet: 다른 사람 몸(함께 걷기 원격 아바타, multi-client.js)에 같은 동작을 재생할 때. 말풍선(hiking:trail-say)·사건(hiking:trail — 도장·소리)을 내 화면에 내지 않는다(11-10).
export function createHikerActs(hiker,{toonify,world,quiet=false}){
 const model=hiker.model,root=hiker.scene,rest=model.userData.restPose,face=model.userData.face;
 const B=n=>model.getObjectByName('mixamorig'+n),bones=Object.fromEntries(POSE.map(n=>[n,B(n)]));
 const restOf=new Map(POSE.map(n=>{const r=rest['mixamorig'+n];return [bones[n],{q:new Q().fromArray(r.q),p:new V3().fromArray(r.p)}];}));
 const body=model.getObjectByName('ToonHiker_Body'),skeleton=body.skeleton,boneInv=n=>skeleton.boneInverses[skeleton.bones.indexOf(B(n))];
 const modelQ0=model.quaternion.clone(),modelY0=model.position.y,modelS=model.scale.clone();
 const A=new V3(),Bv=new V3(),C=new V3(),q1=new Q(),q2=new Q(),q3=new Q(),m1=new M4(),m2=new M4();
 const mq=()=>model.getWorldQuaternion(new Q());
 const axis=(x,y,z)=>new V3(x,y,z).applyQuaternion(mq()).normalize();
 const toWorld=(x,y,z)=>model.localToWorld(new V3(x,y,z));
 const offset=(x,y,z)=>new V3(x,y,z).applyQuaternion(mq()); // 모델 공간 거리(m) → 월드(정규화하지 않음)
 const turn=(b,ax,a)=>{if(!a)return;q1.setFromAxisAngle(ax,a);b.getWorldQuaternion(q2);q2.premultiply(q1);b.parent.getWorldQuaternion(q3);b.quaternion.copy(q3.invert().multiply(q2));b.updateMatrixWorld(true);};
 const aim=(b,from,to)=>{q1.setFromUnitVectors(from.normalize(),to.normalize());b.getWorldQuaternion(q2);q2.premultiply(q1);b.parent.getWorldQuaternion(q3);b.quaternion.copy(q3.invert().multiply(q2));b.updateMatrixWorld(true);};
 const setWorldQ=(b,q)=>{b.parent.getWorldQuaternion(q3);b.quaternion.copy(q3.invert().multiply(q));b.updateMatrixWorld(true);};
 const limb=(up,mid,end,target,bend)=>{const a=up.getWorldPosition(A),b=mid.getWorldPosition(Bv),c=end.getWorldPosition(C);
  const s=legTargets(a.clone(),target,a.distanceTo(b),b.distanceTo(c),bend);aim(up,b.clone().sub(a),s.knee.clone().sub(a));
  mid.getWorldPosition(Bv);end.getWorldPosition(C);aim(mid,C.clone().sub(Bv),s.foot.clone().sub(Bv));};
 const reset=list=>{for(const n of list){const b=bones[n],r=restOf.get(b);b.quaternion.copy(r.q);if(n==='Hips')b.position.copy(r.p);}model.updateMatrixWorld(true);};
 // 바인드 자세 치수(모델 공간): 팔·다리 길이, 발 바인드 방향
 reset(POSE);
 const armLen=['Left','Right'].map(s=>B(s+'Arm').getWorldPosition(new V3()).distanceTo(B(s+'ForeArm').getWorldPosition(new V3()))+B(s+'ForeArm').getWorldPosition(new V3()).distanceTo(B(s+'Hand').getWorldPosition(new V3())));
 const legLen=B('LeftUpLeg').getWorldPosition(new V3()).distanceTo(B('LeftLeg').getWorldPosition(new V3()))+B('LeftLeg').getWorldPosition(new V3()).distanceTo(B('LeftFoot').getWorldPosition(new V3()));
 const footRestModel=['Left','Right'].map(s=>mq().invert().multiply(B(s+'Foot').getWorldQuaternion(new Q())));
 const footRestLocal=['Left','Right'].map(s=>model.worldToLocal(B(s+'Foot').getWorldPosition(new V3())));
 const handRestModel=['Left','Right'].map(s=>mq().invert().multiply(B(s+'Hand').getWorldQuaternion(new Q())));

 // ── 자세 도우미(P). 좌표는 모델 공간(앞 +Z·왼쪽 +X·발바닥 0). side: 1 = 왼쪽, -1 = 오른쪽(시안 [-1,1] 순서와 같다).
 const S=s=>s>0?'Left':'Right';
 const P={
  hips(dy=0,dz=0,dx=0){const h=bones.Hips,w=h.getWorldPosition(new V3()).add(offset(1,0,0).multiplyScalar(dx)).add(offset(0,1,0).multiplyScalar(dy)).add(offset(0,0,1).multiplyScalar(dz));h.position.copy(h.parent.worldToLocal(w));h.updateMatrixWorld(true);},
  spine(pitch=0,yaw=0,roll=0){for(const n of ['Spine','Spine1','Spine2']){turn(bones[n],axis(0,1,0),yaw/3);turn(bones[n],axis(1,0,0),pitch/3);turn(bones[n],axis(0,0,1),roll/3);}},
  head(pitch=0,yaw=0,roll=0){for(const [n,k] of [['Neck',.4],['Head',.6]]){turn(bones[n],axis(0,1,0),yaw*k);turn(bones[n],axis(1,0,0),pitch*k);turn(bones[n],axis(0,0,1),roll*k);}},
  // 시안 팔 Euler: 어깨 축에서 장갑 쪽(아래)으로 뻗은 팔을 돌린다. reach = 팔 길이 비율(1 = 다 편 팔)
  arm(s,e,{reach=.94,bend=null}={}){const sh=B(S(s)+'Arm').getWorldPosition(new V3()),d=rot(v(s*.035,-.2,0).normalize(),e).applyQuaternion(mq());
   const be=bend?axis(...bend):rot(v(s*.45,0,-1),e).applyQuaternion(mq()).normalize();limb(B(S(s)+'Arm'),B(S(s)+'ForeArm'),B(S(s)+'Hand'),sh.addScaledVector(d,armLen[s>0?0:1]*reach),be);
   setWorldQ(B(S(s)+'Hand'),mq().multiply(new Q().setFromEuler(eul.set(...e,'XYZ'))).multiply(handRestModel[s>0?0:1]));},
  // 팔을 모델 공간 점(손목)으로
  armTo(s,p,bend=[s*.4,-.3,-1]){limb(B(S(s)+'Arm'),B(S(s)+'ForeArm'),B(S(s)+'Hand'),toWorld(...p),axis(...bend));},
  // 시안 다리 Euler: 엉덩이 관절에서 아래로 뻗은 다리를 돌린다. 발은 같은 회전을 따른다.
  leg(s,e,{reach=.96}={}){const hp=B(S(s)+'UpLeg').getWorldPosition(new V3()),d=rot(v(0,-1,0),e).applyQuaternion(mq());
   limb(B(S(s)+'UpLeg'),B(S(s)+'Leg'),B(S(s)+'Foot'),hp.addScaledVector(d,legLen*reach),rot(v(0,0,1),e).applyQuaternion(mq()).normalize());
   setWorldQ(B(S(s)+'Foot'),mq().multiply(new Q().setFromEuler(eul.set(...e,'XYZ'))).multiply(footRestModel[s>0?0:1]));},
  legTo(s,p,bend=[0,0,1]){limb(B(S(s)+'UpLeg'),B(S(s)+'Leg'),B(S(s)+'Foot'),toWorld(...p),axis(...bend));setWorldQ(B(S(s)+'Foot'),mq().multiply(footRestModel[s>0?0:1]));},
  hand:s=>B(S(s)+'Hand').getWorldPosition(new V3()),
  // 뼈 자리(모델 공간): 무릎·종아리 가운데(무릎~발목 k)
  local:(n)=>model.worldToLocal(B(n).getWorldPosition(new V3())),
  calf:(s,k=.45)=>model.worldToLocal(B(S(s)+'Leg').getWorldPosition(new V3()).lerp(B(S(s)+'Foot').getWorldPosition(new V3()),k)),
 };

 // ── 단단한 사본(모자·배낭): 메시 형상을 그대로 쓰고 밑면 가운데를 원점으로 둔다.
 const rigid=(meshName,lineName,anchor)=>{const mesh=model.getObjectByName(meshName),line=model.getObjectByName(lineName),g=mesh.geometry;g.computeBoundingBox();const bb=g.boundingBox;
  const c=anchor==='base'?new V3((bb.min.x+bb.max.x)/2,bb.min.y,(bb.min.z+bb.max.z)/2):bb.getCenter(new V3());
  const grp=new THREE.Group();grp.name=`acts-${meshName}`;grp.matrixAutoUpdate=false;grp.visible=false;
  const m=new THREE.Mesh(g,mesh.material);m.position.copy(c).negate();m.castShadow=true;const l=new THREE.Mesh(g,line.material);l.position.copy(m.position);l.userData.outline=true;grp.add(m,l);
  return {grp,mesh,line,c,size:bb.getSize(new V3()),set(W){grp.matrix.copy(W);grp.matrixWorldNeedsUpdate=true;},show(on){grp.visible=on;mesh.visible=line.visible=!on;}};};
 const hat=rigid('ToonHiker_Hat','ToonHiker_lineHat','base'),pack=rigid('ToonHiker_Pack','ToonHiker_linePack','center');
 world.add(hat.grp,pack.grp);
 // 머리 뼈에 붙은 모자의 월드 행렬(squash: 모자 높이 배율)
 const hatOnHead=(sy=1)=>new M4().multiplyMatrices(bones.Head.matrixWorld,boneInv('Head')).multiply(m1.makeTranslation(hat.c.x,hat.c.y,hat.c.z)).multiply(m2.makeScale(1,sy,1));
 // 모자 정수리: 모자 형상에서 가장 높은 꼭짓점(모자 원점 = 밑면 가운데 기준). 머리 뼈를 따라 걷기·뛰기·앉기 때도 같이 움직인다.
 const hatCrown=(()=>{const p=hat.mesh.geometry.attributes.position,t=new V3(0,-Infinity,0),q=new V3();for(let i=0;i<p.count;i++){q.fromBufferAttribute(p,i);if(q.y>t.y)t.copy(q);}return t.sub(hat.c);})();
 const packOnBack=()=>new M4().multiplyMatrices(bones.Spine2.matrixWorld,boneInv('Spine2')).multiply(m1.makeTranslation(pack.c.x,pack.c.y,pack.c.z));
 // ── 얼굴 덧붙임(머리 뼈 자식, 바인드 모델 공간 형상): 실눈·빨간 볼·입가 초콜릿
 const hc=new V3().fromArray(face.hc),hr=new V3().fromArray(face.hr);
 const faceGroup=(build)=>{const g=new THREE.Group();g.matrixAutoUpdate=false;g.matrix.copy(boneInv('Head'));build(g);toonify?.(g,{kind:'character'});g.visible=false;bones.Head.add(g);return g;};
 const onFace=(g,yaw,pitch,size,color,lift)=>{const f=surfaceFrame(hc,hr,yaw,pitch,{lift});const m=part(g,ell(size,{w:14,h:10}),color,{line:0,shadow:false});m.position.copy(f.p);m.quaternion.copy(f.q);return m;};
 const squint=faceGroup(g=>{for(const s of [-1,1]){onFace(g,s*.32,-.16,v(.043,.058,.012),'#f7d9b8',.004);onFace(g,s*.32,-.17,v(.036,.009,.006),'#2a2321',.012);}});
 const blush=faceGroup(g=>{for(const s of [-1,1])onFace(g,s*.58,-.3,v(.07,.045,.012),'#ef6f6c',.005);});
 // ⑥ 헥헥: 벌린 입 + 혀, 쥐: 벌린 입(시안 openMouth)
 const pantMouth=faceGroup(g=>{onFace(g,0,-.36,v(.05,.04,.012),'#6b2a2a',.006);onFace(g,0,-.44,v(.028,.022,.01),'#ef6f8a',.009);});
 const yellMouth=faceGroup(g=>{onFace(g,0,-.36,v(.05,.04,.012),'#6b2a2a',.006);});
 const chocoMouth=faceGroup(g=>{onFace(g,-.25,-.42,v(.03,.022,.008),'#5a3324',.005);onFace(g,.05,-.5,v(.018,.012,.006),'#5a3324',.005);});
 // ── 손 소품·효과(월드에 둔다)
 const held={};const prop=k=>{if(!held[k]){const o=makeTrailProp(k,toonify);o.visible=false;world.add(o);held[k]=o;}return held[k];};
 let hose=null;const hoseMesh=()=>{if(!hose){const src=trailPropTemplate('airgun',toonify).getObjectByName('hose-rest');hose=new THREE.Mesh(new THREE.BufferGeometry(),src.material);const l=new THREE.Mesh(hose.geometry,lineMat(.0036));l.userData.outline=true;hose.add(l);hose.userData.outlineMesh=l;world.add(hose);}return hose;};
 const fx=[];const effect=(kind,{p,life=1,update})=>{while(fx.length>=(LIMITS.trailEffects??60))world.remove(fx.shift().o); // 휴대폰 상한(device-profile.js)
 const o=makeTrailProp(kind,toonify);o.position.copy(p);o.scale.setScalar(.001);world.add(o);fx.push({o,t:0,life,update});update?.(o,0);return o;};
 const say=(text,{at='head',kind='',seconds=2.2}={})=>quiet?undefined:window.dispatchEvent(new CustomEvent('hiking:trail-say',{detail:{text,kind,seconds,at}}));
 // 문구는 src/trail-lines.js의 자리 이름으로 고른다(같은 자리에서 바로 전 문구는 피함).
 const line=id=>{const l=pickLine(id);if(l)say(l.text,{at:l.at,kind:l.kind,seconds:l.seconds});};
 const event=(type,detail={})=>quiet?undefined:window.dispatchEvent(new CustomEvent('hiking:trail',{detail:{type,...detail}}));

 // ── 동작 정의. pose(t,P,a) = 바인드 자세에서 세우는 몸짓, place(t,a) = 모델 강체 변환(소품 공간), extras(t,a) = 모자·소품·효과.
 // a.frame = 소품 월드 행렬, a.spot = 소품 공간 서는 자리 [x,z], a.facing = 소품 공간 바라보는 각.
 const defs={
  'bench-sit':{bones:POSE,blendIn:.55,blendOut:.5,hold:true,spot:[-.22,.62],facing:0,
   // 시안: 벤치 공간 (-0.22, 0.26, 0.06)에 앉고 다리 한쪽 -1.15·한쪽 -0.75 앞으로, 팔은 무릎 위
   place:(t)=>({p:[-.22,.26,.06],yaw:0}),
   pose(t,P,a){const sw=Math.sin(t*3.8)*.22*smooth(.4,1,t);P.leg(-1,[-1.15+sw*.6,0,-.05]);P.leg(1,[-.75-sw,0,.05]);
    for(const s of [-1,1])P.arm(s,[-.5,0,s*.25]);P.head(.08+Math.sin(t*1.3)*.03,0,Math.sin(t*.9)*.05);},
   extras(t,a,w){const pk=w>.5;pack.show(pk);if(pk)pack.set(placeIn(a,[.38,.62,-.03],Math.PI));
    const soulOn=a.state!=='out'?smooth(1,1.5,t):1-smooth(0,.35,a.outT);const so=prop('soul');so.visible=soulOn>.01;
    if(so.visible){const m=headPoint(face.mouth.p);so.position.copy(m);so.quaternion.copy(mq());so.scale.setScalar(Math.max(.01,soulOn));so.getObjectByName('soul-body').position.y=Math.sin(t*2.2)*.025;}
    if(t>=1.2&&!a.said){a.said=true;line('bench.soul');event('bench-sit',{id:a.id});}
    if(a.state==='out'&&a.said&&!a.back){a.back=true;line('bench.back');}}}, // 영혼이 몸으로 쏙
  'gym-lift':{bones:POSE,blendIn:.45,blendOut:.45,spot:[-.6,.35],facing:0,approach:[-.6,1.05],
   place:()=>({p:[-.6,0,.35],yaw:0}),
   pose(t,P,a){const pump=a.pump??0,shake=Math.sin(t*38)*.04;P.hips(-.025-pump*.03);for(const s of [-1,1])P.leg(s,[0,0,s*.28]);
    for(const s of [-1,1])P.arm(s,[shake*s,0,s*(2.35-pump*.25)],{reach:.96});P.head(-.05+pump*.06,0,shake*.4);},
   extras(t,a,w){const on=w>.5;squint.visible=on;hat.show(on);hat.set(hatOnHead(on?.55:1));
    const rack=a.target?.getObjectByName('barbell'),bb=prop('barbell');if(rack)rack.visible=!on;bb.visible=on;
    if(on){const top=new V3(0,.155,0).applyMatrix4(hatOnHead(.55));bb.position.copy(top).add(offset(0,1,0).multiplyScalar(.018+(a.pump??0)*.02));bb.quaternion.copy(mq()).multiply(q1.setFromAxisAngle(v(0,0,1),.06+Math.sin(t*38)*.02));}
    // 들어 올리기: 자동(들르기)이면 0.45초마다, 아니면 press()로 한 칸씩
    if(t>.6&&a.auto&&(a.reps??0)<LIFT_REPS&&t-(a.lastPress??0)>.45)press(a);
    a.pump=Math.max(0,(a.pump??0)-(a.dt??0)*3);
    if(t>.8&&!a.said){a.said=true;line('gym-lift.start');}
    if((a.reps??0)>=LIFT_REPS&&!a.done){a.done=true;a.endAt=t+1.2;line('gym-lift.done');event('gym-lift-done',{id:a.id});}
    if(!a.done&&!a.auto)a.endAt=(a.lastPress??t)+15;}},
  'gym-hang':{bones:POSE,blendIn:.5,blendOut:.5,spot:[0,-.62],facing:Math.PI,frameChild:'inversion',
   // 거꾸리 판에 등을 대고(판 뒤쪽 면) 판이 0.55 → π−0.15로 돌면 거꾸로 매달린다. 판 공간에서 몸을 놓는다.
   board:t=>.55+(Math.PI-.7)*(smooth(.6,1.6,t)-smooth(5,6,t)),
   place(t,a){return {board:true};},
   pose(t,P,a){const inv=smooth(.6,1.6,t)-smooth(5,6,t),kick=Math.sin(t*5)*.12*inv;for(const s of [-1,1]){P.leg(s,[.12+kick*s,0,s*.06]);P.arm(s,[.15-inv*.45,0,s*(.9*inv+.15)])}P.head(-.15*inv,0,0);},
   extras(t,a,w){const inv=smooth(.6,1.6,t)-smooth(5,6,t);blush.visible=inv>.6;
    // 모자: 1.5초에 머리에서 떨어져 땅에 툭, 내려온 뒤(6.3초~) 주워 쓴다
    if(t<1.5){hat.show(false);a.hatLaunch=null;}
    else if(t<6.4){if(!a.hatLaunch){const W=hatOnHead();const p=new V3().setFromMatrixPosition(W),q=new Q().setFromRotationMatrix(W),f=offset(0,0,1).setY(0).normalize().multiplyScalar(.2).add(offset(1,0,0).setY(0).normalize().multiplyScalar(.55));a.hatLaunch={p,q,f,g:a.groundY(p.x+f.x,p.z+f.z)};line('gym-hang.hat');}
     const L=a.hatLaunch,k=smooth(0,.45,t-1.5),rest=new Q().setFromAxisAngle(v(0,1,0),.5);hat.show(true);
     hat.set(new M4().compose(new V3(L.p.x+L.f.x*k,MathUtils.lerp(L.p.y,L.g+.008,k*k),L.p.z+L.f.z*k),L.q.clone().slerp(rest,k),new V3(1,1,1)));}
    else{const k=smooth(6.4,6.8,t);hat.show(k<1);if(k<1&&a.hatLaunch){const L=a.hatLaunch;hat.set(new M4().compose(new V3(L.p.x+L.f.x,L.g+.008+k*.6,L.p.z+L.f.z),new Q().setFromAxisAngle(v(0,1,0),.5),new V3(1,1,1)));}}
    if(t>1.9&&!a.said){a.said=true;line('gym-hang.start');}
    if(t>5.4&&!a.said2){a.said2=true;event('gym-hang',{id:a.id});}}},
  'gym-twist':{bones:POSE,blendIn:.3,blendOut:.25,spot:[.35,-1.5],facing:0,approach:[.35,-.85],
   place:(t)=>({p:[.35,.195,-1.5],yaw:Math.PI*2*3*smooth(.2,2.3,t)}),
   pose(t,P){for(const s of [-1,1]){P.arm(s,[0,0,s*1.25]);P.leg(s,[0,0,s*.1]);}P.spine(0,Math.sin(t*12)*.25,0);P.head(0,-Math.sin(t*12)*.2,0);},
   extras(t,a,w){const plate=a.target?.getObjectByName('waist-plate');if(plate)plate.rotation.y=Math.PI*2*3*smooth(.2,2.3,t);if(t>.4&&!a.said){a.said=true;line('gym-twist.spin');}
    if(a.state==='out'&&!a.dizzyStarted){a.dizzyStarted=true;dizzy=DIZZY_SECONDS;line('gym-twist.dizzy');event('gym-twist',{id:a.id});}}},
  'gym-bar':{bones:POSE,blendIn:.35,blendOut:.35,spot:[-1.68,-1.3],facing:0,approach:[-1.68,-.7],
   // 철봉 1.85m를 두 손으로 잡고 매달린다(어깨 = 봉 − 팔 길이). 다리는 버둥버둥.
   place(t){const up=smooth(0,.35,t)-smooth(3.5,3.8,t),hop=Math.sin(Math.PI*MathUtils.clamp(t/.35,0,1))*.12;return {p:[-1.68,up*(1.85-.443-armLen[0]*.9)+hop*(1-up),-1.3-.17*up],yaw:0};},
   pose(t,P,a){const up=smooth(0,.35,t)-smooth(3.5,3.8,t),k=Math.sin(t*11)*.7*up,y=1.85-(a.placeY??0);for(const s of [-1,1]){P.armTo(s,[s*.16,MathUtils.lerp(.62,y,up),.02+.17*up],[s*.7,-.2,-1]);P.leg(s,[k*s-.15,0,s*.08]);}P.hips(0,0,Math.sin(t*11)*.02*up);P.head(-.12*up,0,0);},
   extras(t,a){if(t>.6&&!a.said){a.said=true;line('gym-bar.hang');}if(t>2.7&&!a.kicked&&a.state!=='out'){a.kicked=true;line('gym-bar.kick');}if(t>3&&!a.said2){a.said2=true;event('gym-bar',{id:a.id});}}},
  'airgun':{bones:POSE,blendIn:.45,blendOut:.45,spot:[1.05,.6],facing:-.55,approach:[1.25,1.2],
   place(t){const blast=smooth(1,1.15,t)-smooth(3.6,4.2,t);return {p:[1.05,0,.6],yaw:-.55,lean:-.18*blast+.18*smooth(.4,.9,t)*(1-smooth(1,1.1,t))};},
   pose(t,P,a){const blast=smooth(1,1.15,t)-smooth(3.6,4.2,t),aimS=smooth(.3,.8,t)*(1-blast);
    P.arm(-1,[MathUtils.lerp(-.25,-.55,blast)-aimS*.2,0,.2]);P.arm(1,[MathUtils.lerp(-.2,-1.2,blast),0,MathUtils.lerp(.15,-.5,blast)]);P.leg(1,[-.3*blast,0,.04]);P.leg(-1,[0,0,-.04]);P.head(.2*aimS-.08*blast,0,0);},
   extras(t,a,w){const on=w>.3,blast=smooth(1,1.15,t)-smooth(3.6,4.2,t);squint.visible=blast>.5;
    const rest=a.target?.getObjectByName('nozzle-rest'),hoseRest=a.target?.getObjectByName('hose-rest'),gun=prop('air-gun'),h=hoseMesh();
    if(rest)rest.visible=!on;if(hoseRest)hoseRest.visible=!on;gun.visible=on;h.visible=on;
    if(on){const hp=P.hand(-1);gun.position.copy(hp).add(offset(0,-.02,.03));gun.quaternion.copy(mq()).multiply(q1.setFromEuler(eul.set(-.5,0,.1)));
     const ha=a.target?.getObjectByName('hose-anchor');if(ha)setHose(h,ha.getWorldPosition(new V3()),hp.clone().add(offset(0,-.06,.02)));else h.visible=false;}
    // 펑! 1초에 흙먼지·바람 줄, 모자가 날아갔다가 2초 뒤(3.2초) 머리 위로 툭
    if(t>=1&&!a.blasted){a.blasted=true;const foot=toWorld(0,.04,.12);
     for(const [x,z,r] of [[.2,.4,.09],[.4,.38,.07],[.12,.22,.06],[.48,.2,.08],[.3,.5,.05],[.05,.42,.05]]){const o=offset(x-.3,0,z-.35),d=o.clone().normalize();effect('puff',{p:foot.clone().addScaledVector(o,1.3),life:1.3,update:(o,k)=>{const s=r*(.35+1.2*smooth(0,.25,k))*(1-smooth(.7,1,k));o.scale.setScalar(Math.max(.001,s));o.position.addScaledVector(d,.003).y+=.003;}});}
     line('airgun.blast');event('airgun-blast',{id:a.id});}
    hatFlight(t,a);
    if(t>3.9&&!a.sparkled){a.sparkled=true;for(const [x,y,z] of [[.09,.06,.12],[-.08,.08,.1],[.0,.03,.17],[-.1,.04,-.02]])effect('sparkle',{p:toWorld(x,y,z),life:.9,update:(o,k)=>{o.scale.setScalar(.03*Math.sin(Math.PI*k)+.001);o.rotation.y+=.15;}});event('airgun-done',{id:a.id});}
    if(t>4.15&&!a.shine){a.shine=true;line('airgun.shine');}}}, // 모자가 돌아오고(툭) 나서 신발 반짝
  'choco':{bones:RIGHT_ARM,blendIn:.2,blendOut:.25,free:true,
   pose(t,P){const k=smooth(.1,.5,t);P.arm(-1,[MathUtils.lerp(-.3,-2.25,k),0,MathUtils.lerp(.1,.45,k)],{reach:.9});},
   extras(t,a,w){const c=prop('chocolate');c.visible=w>.3&&t<1.05;if(c.visible){c.position.copy(P.hand(-1)).add(offset(.03,.04,.06));c.quaternion.copy(mq()).multiply(q1.setFromEuler(eul.set(.3,.2,1.2)));c.scale.setScalar(1.5);}
    if(t>.8&&!a.said){a.said=true;boost.mouth=true;line('choco.eat');event('choco-eaten');}}},
  'pet-cat':{bones:POSE,blendIn:.4,blendOut:.4,spot:[0,-.5],facing:0,
   place(t,a){return {p:a.local,yaw:0,lean:.2*(1-smooth(3.05,3.3,t))-.25*(smooth(3.05,3.2,t)-smooth(3.5,3.9,t))};},
   pose(t,P,a){const rub=Math.sin(t*9)*.035*(1-smooth(2.9,3.05,t));P.hips(-.04);P.leg(-1,[-.5,0,-.05]);P.leg(1,[.25,0,.05]);
    P.armTo(-1,[-.06+rub,.2,.4],[-.5,.2,-1]);P.arm(1,[-.7,0,.15]);P.head(.18,0,0);},
   extras(t,a){if(!a.started){a.started=true;event('pet-start',{id:a.id});}
    if(t>.4&&t<3&&(t-(a.lastHeart??0))>.45){a.lastHeart=t;const p=toWorld(-.05+Math.random()*.1,.35,.42);effect('heart',{p,life:1.2,update:(o,k)=>{o.position.y+=.006;o.scale.setScalar(.05*(1-k*.4)*smooth(0,.15,k));o.rotation.y+=.05;}});}
    if(t>3.05&&!a.punched){a.punched=true;line('cat.after');event('pet-punch',{id:a.id});}}},
  // ⑥ 헥헥(src/exhaustion.js가 1.5초 뒤 stop): 멈춰 서서 무릎을 짚고 헥헥. 시안 pant: 몸 .42 앞으로, 무릎 굽힘, 손은 무릎, 고개는 들어 앞을 봄
  'pant':{bones:POSE,blendIn:.25,blendOut:.4,hold:true,
   pose(t,P){const br=Math.sin(t*10)*.5+.5;P.hips(-.075-br*.008,-.04);P.spine(.42+br*.05,0,0);
    for(const s of [-1,1]){const f=footRestLocal[s>0?0:1];P.legTo(s,[f.x+s*.02,f.y,f.z+.02],[0,0,1]);}
    for(const s of [-1,1]){const k=P.local(S(s)+'Leg');P.armTo(s,[k.x-s*.005,k.y+.03,k.z+.05],[s*.3,0,-1]);}
    P.head(-.6+br*.06,0,0);},
   extras(t,a,w){const on=w>.4;squint.visible=on;pantMouth.visible=on;
    if(!a.started){a.started=true;line('pant.start');event('pant',{});}
    if(on)breathe(a,t,.32,.5);}},
  // ⑥ 다리에 쥐(3초, 발끝 당기기면 누른 뒤 1초 — src/exhaustion.js가 stop): 뒤로 넘어져 오른쪽 종아리를 잡고 좌우로 뒹굴뒹굴, 모자 떨어짐, 종아리에 찌릿 번개.
  // 시안 cramp: 등을 대고 누움(배낭 때문에 0.24m 뜸), 오른다리 -1.25 당기고 왼다리 -.25, 두 손은 종아리, 턱은 당김.
  'cramp':{bones:POSE,blendIn:.4,blendOut:.6,hold:true,
   place(t){const roll=Math.sin(Math.max(0,t-.45)*4.4)*.55*smooth(.35,.7,t);return {p:[0,.24,0],yaw:0,lean:-1.35,spin:roll};},
   pose(t,P){const kick=Math.sin(t*9)*.12;P.leg(-1,[-1.25+kick,0,-.06],{reach:.9});P.leg(1,[-.25-kick*.5,0,.3]);
    const c=P.calf(-1,.25);for(const s of [-1,1])P.armTo(s,[c.x+s*.045,c.y,c.z],[s*.5,.3,-1]);P.head(.35,0,Math.sin(t*4.4)*.15);},
   extras(t,a,w){const on=w>.35;squint.visible=on;yellMouth.visible=on;
    if(!a.started){a.started=true;line('cramp.start');event('cramp',{});}
    if(t>2.5&&!a.said2&&a.state!=='out'){a.said2=true;line('cramp.zap');}
    // 넘어질 때 흙먼지
    if(t>.35&&!a.dusted){a.dusted=true;for(const [x,z,r] of [[-.35,-.3,.06],[.3,-.25,.05],[.1,-.55,.045]]){const p=toWorld(x,.03,z);p.y=a.groundY(p.x,p.z)+r*.6;effect('puff',{p,life:.9,update:(o,k)=>{o.scale.setScalar(r*(.4+k)*(1-k)+.001);o.position.y+=.002;}});}}
    // 종아리 찌릿 번개(0.28초마다 깜빡)
    if(on&&a.state!=='out'&&t-(a.lastZap??-1)>.28){a.lastZap=t;const c=model.localToWorld(P.calf(-1)),sd=Math.random()<.5?-1:1;const p=c.add(offset(sd*.1,.04,.13));const s0=.1+Math.random()*.05;
     effect('zap',{p,life:.32,update:(o,k)=>{o.scale.setScalar(s0*(k<.2?k/.2:1)*(1-smooth(.75,1,k))+.001);o.quaternion.setFromRotationMatrix(a.frame);o.rotateY(sd*.7);o.rotateZ(sd*.4);}});event('cramp-zap',{});}
    // 모자: 0.25초에 머리에서 떨어져 옆 땅에 툭, 일어나며(out) 주워 쓴다
    if(t<.25&&a.state!=='out'){hat.show(false);}
    else{if(!a.hatLaunch){const W=hatOnHead(),p=new V3().setFromMatrixPosition(W),f=axis(1,0,0).setY(0).normalize().multiplyScalar(.62).add(axis(0,0,-1).setY(0).normalize().multiplyScalar(.5));
      a.hatLaunch={p,q:new Q().setFromRotationMatrix(W),f,g:a.groundY(p.x+f.x,p.z+f.z)};}
     const L=a.hatLaunch,land=new V3(L.p.x+L.f.x,L.g+.008,L.p.z+L.f.z),rest=new Q().setFromEuler(eul.set(0,.4,1.4));
     if(a.state!=='out'){const k=smooth(0,.4,t-.25);hat.show(true);hat.set(new M4().compose(new V3(L.p.x+L.f.x*k,MathUtils.lerp(L.p.y,land.y,k*k)+Math.sin(Math.PI*k)*.15,L.p.z+L.f.z*k),L.q.clone().slerp(rest,k),new V3(1,1,1)));if(k>=1&&!a.thud){a.thud=true;}}
     else{const k=smooth(.05,.55,a.outT);if(k>=1){hat.show(false);}else{const W=hatOnHead(),to=new V3().setFromMatrixPosition(W);hat.show(true);hat.set(new M4().compose(land.clone().lerp(to,k).add(v(0,Math.sin(Math.PI*k)*.25,0)),rest.clone().slerp(new Q().setFromRotationMatrix(W),k),new V3(1,1,1)));}
      if(a.outT>.3&&!a.said3){a.said3=true;line('cramp.done');}}}}},
 };
 // 헥헥 입김(퐁퐁)·땀방울. every = 입김 간격(초), sweat = 땀 간격(초)
 function breathe(a,t,every,sweat){
  if(t-(a.lastBreath??-1)>every){a.lastBreath=t;const m=headPoint(face.mouth.p).add(offset(-.09,-.01,.07)),d=offset(-.8,.35,.6).normalize(),r=.028+Math.random()*.02;
   effect('breath',{p:m,life:.8,update:(o,k)=>{o.scale.setScalar(r*(.3+k)*(1-smooth(.7,1,k))+.001);o.position.addScaledVector(d,.0045);}});}
  if(t-(a.lastSweat??-1)>sweat){a.lastSweat=t;const sd=Math.random()<.5?-1:1,p=headPoint(face.hc).add(offset(sd*.17,.1,0)),out=offset(sd,.6,0).normalize();
   effect('drop',{p,life:.7,update:(o,k)=>{o.scale.setScalar(.028*(1-k*.4));o.position.addScaledVector(out,.006);o.position.y-=.004*k;}});}
 }
 // 소품 공간 점 → 월드
 function placeIn(a,p,yaw=0){return new M4().multiplyMatrices(a.frame,new M4().compose(new V3(...p),new Q().setFromAxisAngle(v(0,1,0),yaw),new V3(1,1,1)));}
 const headPoint=p=>new V3().fromArray(p).applyMatrix4(new M4().multiplyMatrices(bones.Head.matrixWorld,boneInv('Head')));
 // 에어건 모자 비행: 1.05초에 머리에서 위·뒤로 날아올라 빙글빙글 떠 있다가 2초 뒤(3.05초) 머리 위로 0.35초 만에 툭 떨어진다.
 function hatFlight(t,a){
  if(t<1.05){hat.show(false);return;}
  if(!a.hatLaunch){const W=hatOnHead();a.hatLaunch={p:new V3().setFromMatrixPosition(W),q:new Q().setFromRotationMatrix(W)};}
  const L=a.hatLaunch,u=t-1.05,back=axis(0,0,-1),side=axis(1,0,0);
  if(u<HAT_RETURN_SECONDS){const k=smooth(0,.9,u),bob=Math.sin(u*4)*.05*smooth(.8,1.2,u);
   const p=L.p.clone().add(v(0,.85*k+bob,0)).addScaledVector(back,.45*k).addScaledVector(side,.2*k),q=L.q.clone().multiply(q1.setFromEuler(eul.set(-.9*k,u*6,.7*k)));
   hat.show(true);hat.set(new M4().compose(p,q,new V3(1,1,1)));if(!a.hatSaid&&u>.15){a.hatSaid=true;line('airgun.hat');}a.hatTop=p;}
  else{const k=smooth(0,.35,u-HAT_RETURN_SECONDS),W=hatOnHead(1-.25*Math.sin(Math.PI*smooth(.3,.5,u-HAT_RETURN_SECONDS))),target=new V3().setFromMatrixPosition(W),tq=new Q().setFromRotationMatrix(W);
   if(k>=1&&u-HAT_RETURN_SECONDS>.5){hat.show(false);return;}
   const from=a.hatTop??target;hat.show(true);hat.set(k<1?new M4().compose(from.clone().lerp(target,k*k),L.q.clone().slerp(tq,k),new V3(1,1,1)):W);
   if(k>=1&&!a.thud){a.thud=true;line('airgun.land');}}
 }
 function press(a=active){if(!a||a.name!=='gym-lift'||a.done||(a.reps??0)>=LIFT_REPS)return 0;a.reps=(a.reps??0)+1;a.lastPress=a.t;a.pump=1;
  const p=toWorld((Math.random()-.5)*.5,.75+Math.random()*.2,.15);effect('drop',{p,life:.8,update:(o,k)=>{o.position.y-=.004;o.scale.setScalar(.03*(1-k*.5));}});
  event('gym-lift-rep',{id:a.id,reps:a.reps,of:LIFT_REPS});if(a.reps===4)line('gym-lift.strain');return a.reps;}

 let active=null,dizzy=0,trudge=false,trudgeK=0;const trudgeT={t:0};
 // 초콜릿 효과(30초) 화면: 뒤에 흰 바람 줄, 발밑 흙먼지, 입가 초콜릿
 const boost={left:0,mouth:false,puffAt:0,lines:null};
 const linesObj=()=>{if(!boost.lines){const g=new THREE.Group();const m=new THREE.MeshBasicMaterial({color:'#ffffff',toneMapped:false,transparent:true,opacity:.85,depthWrite:false});
  for(let i=0;i<8;i++){const l=new THREE.Mesh(new THREE.BoxGeometry(.012,.012,1),m);l.userData.k=i;g.add(l);}g.visible=false;world.add(g);boost.lines=g;}return boost.lines;};
 const api={
  defs,P,
  get active(){return active;},get dizzy(){return dizzy;},get boost(){return boost.left;},
  // 동작 시작. frame = 소품 월드 행렬(Object3D.matrixWorld), target = 소품 Object3D(움직이는 부분 찾기), groundY(x,z) = 땅 높이.
  start(name,{frame=new M4(),target=null,id=null,auto=true,local=[0,0,0],groundY=()=>0,holdSeconds=ACT_SECONDS[name]}={}){const d=defs[name];if(!d)return false;
   if(active&&active.name!==name)api.cancel();
   active={name,d,t:0,w:0,frame:frame.clone(),target,id,auto,local,groundY,state:'in',holdSeconds,outT:0};api.state=name;return true;},
  // 일어나기·끝내기(벤치는 이걸로만 끝난다)
  stop(){if(active&&active.state!=='out'){active.state='out';active.outT=0;}},
  cancel(){if(active){cleanup(active);active=null;}},
  press:()=>press(),
  // ⑥ 터벅터벅 켜기·끄기(main이 exhaustion.trudge를 넘긴다)
  setTrudge(on){trudge=!!on;},get trudge(){return trudgeK;},
  // 지금 선 자리의 몸 기준 행렬(헥헥·쥐처럼 소품 없이 그 자리에서 하는 동작용)
  bodyFrame(){root.updateMatrixWorld(true);return new M4().multiplyMatrices(root.matrixWorld,new M4().compose(new V3(0,modelY0,0),modelQ0,new V3(1,1,1)));},
  eatChocolate(seconds=30){if(active&&!defs[active.name].free)return false;boost.left=seconds;api.start('choco');return true;},
  // 동작 중인 몸의 서는 자리·방향(월드). 들르기·main.js가 등산객 루트를 여기에 둔다.
  spotOf(name,frame){const d=defs[name],s=d.spot??[0,0],w=new V3(s[0],0,s[1]).applyMatrix4(frame);const yaw=Math.atan2(frame.elements[8],frame.elements[10])+(d.facing??0);return {x:w.x,z:w.z,heading:yaw+Math.PI,approach:d.approach?new V3(d.approach[0],0,d.approach[1]).applyMatrix4(frame):null};},
  // ground() 뒤에 부른다. 동작 자세를 덮고 모자·소품·효과를 움직인다.
  apply(dt,{moving=false}={}){
   for(let i=fx.length-1;i>=0;i--){const f=fx[i];f.t+=dt;const k=f.t/f.life;if(k>=1){world.remove(f.o);fx.splice(i,1);continue;}f.update?.(f.o,k);}
   // 초콜릿: 효과가 남은 동안 입가 초콜릿과 움직일 때 바람 줄·흙먼지
   if(boost.left>0){boost.left=Math.max(0,boost.left-dt);chocoMouth.visible=boost.mouth;const L=linesObj();L.visible=moving;
    if(moving){root.updateMatrixWorld(true);L.position.copy(toWorld(0,.45,-.35));L.quaternion.copy(mq());L.children.forEach((l,i)=>{const len=.25+((i*.37+performance.now()/400)%1)*.35;l.scale.z=len;l.position.set(((i*.618)%1-.5)*.6,((i*.381)%1-.5)*.6,-len/2-((i*.53)%1)*.3);});
     boost.puffAt-=dt;if(boost.puffAt<=0){boost.puffAt=.16;const p=toWorld((Math.random()-.5)*.2,.03,-.12);const r=.04+Math.random()*.04;effect('puff',{p,life:.7,update:(o,k)=>{o.scale.setScalar(r*(.4+k)*(1-k)+.001);o.position.y+=.002;}});}}
    if(!boost.left){chocoMouth.visible=false;boost.mouth=false;L.visible=false;}}
   // 허리돌리기 뒤 비틀비틀(조작은 그대로)
   if(dizzy>0&&!active){dizzy=Math.max(0,dizzy-dt);const k=Math.min(1,dizzy/.4),tt=performance.now()/1000;turn(bones.Hips,axis(0,0,1),Math.sin(tt*5.5)*.22*k);P.head(0,0,Math.sin(tt*7)*.25*k);model.updateMatrixWorld(true);}
   // ⑥ 헥헥 뒤 스테미너 30까지: 고개 숙이고 터벅터벅(속도는 그대로), 입 벌리고 가끔 헥헥·입김·땀
   trudgeK=MathUtils.clamp(trudgeK+(trudge&&!active?dt:-dt)/.5,0,1);
   if(trudgeK>0&&!active){P.spine(.16*trudgeK,0,0);P.head(.3*trudgeK,0,Math.sin(performance.now()/420)*.06*trudgeK);model.updateMatrixWorld(true);pantMouth.visible=trudgeK>.5;
    trudgeT.t+=dt;if(trudgeK>.5){breathe(trudgeT,trudgeT.t,.9,1.6);if(trudgeT.t-(trudgeT.lastHuff??-9)>2.6){trudgeT.lastHuff=trudgeT.t;event('pant-breath',{});}}}
   else if(!active&&pantMouth.visible)pantMouth.visible=false;
   if(!active)return;
   const a=active,d=a.d;a.dt=dt;a.t+=dt;
   if(a.state==='in'){a.w=Math.min(1,a.w+dt/d.blendIn);if(a.w>=1)a.state='hold';}
   if(a.state==='hold'&&!d.hold&&a.t>=(a.endAt??a.holdSeconds))api.stop();
   if(a.state==='hold'&&d.hold&&a.auto&&a.t>=a.holdSeconds)api.stop();
   if(a.state==='out'){a.outT+=dt;const delay=a.name==='bench-sit'?.35:0;if(a.outT>delay)a.w=Math.max(0,a.w-dt/d.blendOut);}
   const w=smooth(0,1,a.w);
   // 1) 원래 자세 저장
   const list=d.bones.map(n=>bones[n]),qA=list.map(b=>b.quaternion.clone()),hipsA=bones.Hips.position.clone(),mpA=model.position.clone(),mqA=model.quaternion.clone();
   // 2) 몸 강체 변환(소품 공간 → 루트 공간)
   if(d.place){const pl=d.place(a.t,a);let W;
    if(pl.board){const inv=a.target?.getObjectByName('inversion'),board=a.target?.getObjectByName('inversion-board');if(board){board.rotation.x=d.board(a.t);board.updateMatrixWorld(true);
      W=new M4().multiplyMatrices(board.matrixWorld,new M4().compose(new V3(0,-.72,-.4),new Q().setFromAxisAngle(v(0,1,0),Math.PI),modelS));}}
    else{const lean=new Q().setFromAxisAngle(v(1,0,0),pl.lean??0).multiply(q1.setFromAxisAngle(v(0,1,0),pl.spin??0));W=placeIn(a,pl.p,pl.yaw).multiply(new M4().compose(new V3(),lean,modelS));a.placeY=pl.p[1];}
    if(W){root.updateMatrixWorld(true);const L=new M4().copy(root.matrixWorld).invert().multiply(W),p=new V3(),q=new Q(),s=new V3();L.decompose(p,q,s);
     model.position.lerpVectors(mpA,p,w);model.quaternion.slerpQuaternions(mqA,q,w);}}
   model.updateMatrixWorld(true);
   // 3) 동작 자세(바인드 자세에서) → 4) 섞기
   reset(d.bones);d.pose(a.t,P,a);
   list.forEach((b,i)=>{b.quaternion.slerpQuaternions(qA[i],b.quaternion.clone(),w);});if(d.bones.includes('Hips'))bones.Hips.position.lerpVectors(hipsA,bones.Hips.position.clone(),w);
   model.updateMatrixWorld(true);
   hiker.props.poles.forEach((p,i)=>{p.group.visible=w<.5||!!(d.free&&i===0);});
   d.extras?.(a.t,a,w);
   if(a.state==='out'&&a.w<=0){cleanup(a);active=null;api.state=null;event('act-end',{name:a.name,id:a.id});}
  },
  // 말풍선 자리(월드): head 머리 위·soul 영혼·hat 날아간 모자·feet 발·hands 손
  anchor(at='head'){root.updateMatrixWorld(true);if(at==='soul'&&held.soul?.visible)return held.soul.getObjectByName('soul-body').getWorldPosition(new V3()).add(v(0,.72,0));
   if(at==='hat'&&hat.grp.visible)return new V3().setFromMatrixPosition(hat.grp.matrix).add(v(0,.22,0));if(at==='feet')return toWorld(0,.32,.25);if(at==='hands')return P.hand(1).add(v(0,.15,0));if(at==='calf')return model.localToWorld(P.calf(-1)).add(v(0,.3,0));
   // 머리 가운데 위 0.42m. 거꾸로 매달리면(몸 위쪽이 아래를 보면) 발 위에 띄운다.
   if(offset(0,1,0).y<0)return toWorld(-.42,.5,0);return headPoint(face.hc).add(v(0,.42,0));},
  // 다람쥐가 앉는 모자 꼭대기, 까치가 앉는 모자 정수리(형상의 가장 높은 점, 2026-11-07), 배낭 위(월드 행렬)
  hatTop(){return hatOnHead().multiply(m1.makeTranslation(0,.15,0));},
  crownTop(){return hatOnHead().multiply(m1.makeTranslation(hatCrown.x,hatCrown.y,hatCrown.z));},
  packTop(){return packOnBack().multiply(m1.makeTranslation(0,pack.size.y/2+.04,.02));},
  // 모자 위 다람쥐가 무거워 고개를 숙인다(0~1)
  headLoad(k){if(k>0&&!active){P.head(.12*k,0,0);model.updateMatrixWorld(true);}},
  status(){return {trudge:+trudgeK.toFixed(2),active:active&&{name:active.name,t:+active.t.toFixed(2),w:+active.w.toFixed(2),state:active.state,reps:active.reps??0},dizzy:+dizzy.toFixed(2),boost:+boost.left.toFixed(1),hatDetached:hat.grp.visible,hatAt:hat.grp.visible?new V3().setFromMatrixPosition(hat.grp.matrix).toArray().map(x=>+x.toFixed(2)):null,packDetached:pack.grp.visible,poles:hiker.props.poles.map(p=>p.group.visible),held:Object.fromEntries(Object.entries(held).filter(([,o])=>o.visible).map(([k,o])=>[k,o.getWorldPosition(new V3()).toArray().map(x=>+x.toFixed(3))])),hands:[1,-1].map(s=>P.hand(s).toArray().map(x=>+x.toFixed(3)))};},
 };
 function cleanup(a){if(a?.name==='choco'&&boost.left>0)boost.mouth=true;pantMouth.visible=yellMouth.visible=false;hat.show(false);pack.show(false);squint.visible=false;blush.visible=false;for(const k of ['soul','barbell','air-gun','chocolate'])if(held[k])held[k].visible=false;if(hose)hose.visible=false;
  if(a?.target){for(const n of ['barbell','nozzle-rest','hose-rest'])a.target.getObjectByName(n)&&(a.target.getObjectByName(n).visible=true);const b=a.target.getObjectByName('inversion-board');if(b)b.rotation.x=.55;const pl=a.target.getObjectByName('waist-plate');if(pl)pl.rotation.y=0;}
  for(const p of hiker.props.poles)p.group.visible=true;model.position.set(0,modelY0,0);model.quaternion.copy(modelQ0);}
 return api;
}
export {BENCH};
