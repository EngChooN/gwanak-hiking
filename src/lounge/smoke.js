// 가상 담배 한 대: 꺼내기 → 라이터 → 들이마시기·내뿜기 반복(담배가 점점 짧아짐) → 재 털기 → 꽁초 버리기.
// 몸짓은 온라인 등산 즐길거리 동작(src/toon/hiker-acts.js)과 같은 방식이다: 등산객 코드가 ground()까지 정한 자세 위에
// 팔만 두 관절 IK(src/hiker-ik.js legTargets)로 덮어쓰고, 원래 자세와 weight로 섞는다. 동동이 원본은 고치지 않는다.
// 소품·연기는 온라인 등산 소품과 같은 형상 도우미(concept-kit·trail-props) + 툰 단색 재질 + 얇은 외곽선이다.
// 연기 뭉게는 등산 「헥헥 입김」(trail-props puff)과 같은 형상을 조금 회색으로 쓴다.
// 상태가 바뀔 때마다 window 'lounge:smoke' {id,state,puffs,left,lit,isPlayer,kind,quality,trick,first,amount}. NPC도 같은 함수를 쓴다(isPlayer:false면 혼자 알아서 피운다).
// v2 맛(기획서 v2 A1·A2·A5·A6): drawStart/drawEnd로 누르는 동안 들이마시고(누른 시간 → quality), 크게·오래·바람 따라 내뿜고,
// 내뿜는 중 짧게 탭하면 링, trick('ring'|'nose'|'french'), start(kind)로 순한 맛·독한 맛·멘솔·시가. 숫자는 smoke-feel.js.
// v2 함께(기획서 v2 B1·B4): lightFrom()은 남의 불로 붙이기(내 라이터 없이), lend(target,mode)는 NPC가 라이터·담배 끝을 남의 담배 끝에 대 주기,
// tip()은 지금 담배 끝 위치, cloud(p,amount)는 같이 내뿜었을 때 큰 구름.
import * as THREE from 'three';
import {legTargets} from '../hiker-ik.js';
import {v,ell,part} from '../toon/concept-kit.js';
import {rod,puff,finishTrailModel} from '../toon/trail-props.js';
import {surfaceFrame} from '../toon/link-hiker.js';
import {LIMITS} from '../device-profile.js';
import {DRAW,CIG_KINDS,QUALITY,ROOF_WIND,cigKind,drawQuality,drawLevel,smokeAmount,exhalePuffs,puffRadius,puffLife} from './smoke-feel.js';

const {Vector3:V3,Quaternion:Q,Matrix4:M4,MathUtils}=THREE;
const smooth=(a,b,x)=>{const t=MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const bump=(a,b,c,d,x)=>smooth(a,b,x)*(1-smooth(c,d,x)); // a~b 올라 c~d 내려오는 언덕

// 동작 길이(초)
export const SMOKE_SECONDS=Object.freeze({out:.9,lighting:2.3,inhale:1.5,exhale:1.8,flick:.8,dispose:1.1});
export const PUFFS_PER_CIG=12;           // 한 대에 대략 몇 모금(짧게 빨 때. 꿀모금·진한 모금은 조금 더 탄다)
const PASSIVE_BURN=1/420;                // 불 붙여 두기만 해도 7분이면 다 탄다
const DRAW_FULL=.75,DRAW_TAIL=.3;        // 한 모금에서 처음 0.75초만 제대로 타고, 그 뒤로 길게 빨면 30% 속도로만 더 탄다(꾹 누르기가 담배를 다 태우지 않게)
const BUSY=new Set(['lighting','inhale','exhale','flick']); // 이 동작 중에 온 단추는 끝난 뒤에 한다
const LIGHTER_UP=.05;                    // 라이터를 장갑 위로 내놓는 높이(장갑 반지름 0.056에 묻히지 않게)
const BUTT_FLIGHT=.45;                  // 꽁초가 재떨이까지 날아가는 시간(초)
// 담배 치수(m). 동동이 1.0m에 맞춘 만화 크기(실제보다 굵고 짧다).
export const CIG=Object.freeze({r:.0095,filter:.024,paper:.066,ashMax:.026});
const COLORS={filter:'#e3a35a',paper:'#f6f2e8',ash:'#9b958e',ember:'#ff5a1f',emberHot:'#ffc15a',lighter:'#f2c14e',metal:'#c9ccd0',flame:'#ffa43a',flameCore:'#fff3b0',smoke:'#eceef2',ashBit:'#8f8a85',mouth:'#6b2a2a'};

// 연기 뭉게·재 부스러기 원형(종류마다 한 번 만들고 clone으로 형상·재질을 나눠 쓴다)
const templates=new Map();
function fxTemplate(kind,toonify){
 if(!templates.has(kind)){const g=new THREE.Group();g.name=`smoke-${kind}`;
  puff(g,v(),1,kind==='ash'?COLORS.ashBit:COLORS.smoke);finishTrailModel(g,toonify,{shadow:false,lineScale:kind==='ash'?.6:.8});templates.set(kind,g);}
 return templates.get(kind);
}

function buildCigarette(toonify){
 const g=new THREE.Group();g.name='cigarette';
 const filter=rod(g,v(0,0,0),v(0,0,CIG.filter),CIG.r,COLORS.filter,{line:.5});filter.name='filter';
 const unit=c=>new THREE.CylinderGeometry(CIG.r,CIG.r,1,12).rotateX(Math.PI/2).translate(0,0,.5);
 const paper=part(g,unit(),COLORS.paper,{line:.5});paper.position.z=CIG.filter;paper.name='paper';
 const ember=part(g,ell(v(CIG.r*1.04,CIG.r*1.04,CIG.r*.55),{w:12,h:8}),COLORS.ember,{line:0,glow:true,shadow:false});ember.name='ember';
 const ash=part(g,unit(),COLORS.ash,{line:.5});ash.name='ash';
 finishTrailModel(g,toonify,{shadow:false});
 ember.material=ember.material.clone();ember.material.emissive=new THREE.Color(COLORS.ember);
 // 담배 종류마다 종이·필터 색이 달라서 재질을 따로 둔다(툰 재질 그대로 복사)
 filter.material=filter.material.clone();paper.material=paper.material.clone();
 g.traverse(o=>{if(o.isMesh)o.castShadow=false;});
 g.matrixAutoUpdate=false;g.visible=false;
 return {g,filter,paper,ember,ash};
}
function buildLighter(toonify){
 const g=new THREE.Group();g.name='lighter';
 const body=part(g,new THREE.BoxGeometry(.028,.042,.015),COLORS.lighter,{line:.5});body.position.y=.0;
 const cap=part(g,new THREE.BoxGeometry(.028,.01,.015),COLORS.metal,{line:.5});cap.position.y=.026;
 const flame=new THREE.Group();flame.name='flame';flame.position.y=.046;g.add(flame);
 part(flame,ell(v(.009,.017,.009),{w:12,h:10,shape:V=>{if(V.y>0){V.x*=1-V.y*.7;V.z*=1-V.y*.7;}}}),COLORS.flame,{line:0,glow:true,shadow:false});
 const core=part(flame,ell(v(.0045,.009,.0045),{w:10,h:8}),COLORS.flameCore,{line:0,glow:true,shadow:false});core.position.y=-.004;
 finishTrailModel(g,toonify,{shadow:false});
 g.traverse(o=>{if(o.isMesh)o.castShadow=false;});
 g.matrixAutoUpdate=false;g.visible=false;
 return {g,flame};
}

// auto: 혼자 알아서 불 붙이고·피우고·버린다(기본 꺼짐 — 지금 NPC는 npc.js가 start·light·puff·flick·dispose를 직접 부른다).
// ashtrays(): 재떨이 목록 [{x,z,at:{x,y,z}}]. 안 주면 rooftop.spots.ashtrays(window.lounge)를 찾아본다.
export function createSmoker(avatar,{toon,world,audio,isPlayer=true,profile=null,auto=false,ashtrays=null}={}){
 const toonify=toon?.toonify,hiker=avatar.hiker,model=hiker.model,root=avatar.root,id=avatar.id;
 const B=n=>model.getObjectByName('mixamorig'+n);
 const bones={Head:B('Head'),RightArm:B('RightArm'),RightForeArm:B('RightForeArm'),RightHand:B('RightHand'),LeftArm:B('LeftArm'),LeftForeArm:B('LeftForeArm'),LeftHand:B('LeftHand')};
 const body=model.getObjectByName('ToonHiker_Body'),skeleton=body?.skeleton;
 const headInv=skeleton?skeleton.boneInverses[skeleton.bones.indexOf(bones.Head)]:new M4();
 const face=model.userData.face??{mouth:{p:[0,.65,.2]},hc:[0,.73,0],hr:[.25,.225,.23]};
 const A=new V3(),Bv=new V3(),C=new V3(),q1=new Q(),q2=new Q(),q3=new Q(),m1=new M4();
 const mq=()=>model.getWorldQuaternion(q1.clone());
 const offset=(x,y,z)=>new V3(x,y,z).applyQuaternion(mq()); // 모델 공간 방향·거리(앞 +Z, 왼쪽 +X) → 월드
 const axis=(x,y,z)=>offset(x,y,z).normalize();
 // ── 두 관절 IK(hiker-acts.js의 limb와 같은 풀이)
 const aim=(b,from,to)=>{q1.setFromUnitVectors(from.normalize(),to.normalize());b.getWorldQuaternion(q2);q2.premultiply(q1);b.parent.getWorldQuaternion(q3);b.quaternion.copy(q3.invert().multiply(q2));b.updateMatrixWorld(true);};
 const limb=(up,mid,end,target,bend)=>{const a=up.getWorldPosition(A),b=mid.getWorldPosition(Bv),c=end.getWorldPosition(C);
  const s=legTargets(a.clone(),target,a.distanceTo(b),b.distanceTo(c),bend);aim(up,b.clone().sub(a),s.knee.clone().sub(a));
  mid.getWorldPosition(Bv);end.getWorldPosition(C);aim(mid,C.clone().sub(Bv),s.foot.clone().sub(Bv));};
 function solveArm(side,target,bend,w){
  if(w<=.001)return;const up=bones[side+'Arm'],mid=bones[side+'ForeArm'],end=bones[side+'Hand'];if(!up||!mid||!end)return;
  const qa=up.quaternion.clone(),qb=mid.quaternion.clone();limb(up,mid,end,target,bend);
  up.quaternion.slerpQuaternions(qa,up.quaternion.clone(),w);mid.quaternion.slerpQuaternions(qb,mid.quaternion.clone(),w);up.updateMatrixWorld(true);}
 const mouth=()=>new V3().fromArray(face.mouth.p).applyMatrix4(m1.multiplyMatrices(bones.Head.matrixWorld,headInv));
 // 장갑 가운데(손목에서 손 쪽으로 조금)
 const handCenter=side=>{const h=bones[side+'Hand'].getWorldPosition(new V3()),f=bones[side+'ForeArm'].getWorldPosition(new V3());return h.clone().add(h.clone().sub(f).normalize().multiplyScalar(.03));};

 // ── 얼굴 덧붙임: 내뿜을 때 동그란 입(등산 「헥헥」 벌린 입과 같은 방식·색, 더 작게)
 let ohMouth=null;
 if(skeleton&&face.hc){const hc=new V3().fromArray(face.hc),hr=new V3().fromArray(face.hr);const g=new THREE.Group();g.matrixAutoUpdate=false;g.matrix.copy(headInv);
  const f=surfaceFrame(hc,hr,0,-.37,{lift:.006});const m=part(g,ell(v(.022,.02,.01),{w:14,h:10}),COLORS.mouth,{line:0,shadow:false});m.position.copy(f.p);m.quaternion.copy(f.q);
  toonify?.(g,{kind:'character'});g.visible=false;bones.Head.add(g);ohMouth=g;}

 // ── 소품
 const cig=buildCigarette(toonify),lighter=buildLighter(toonify);world.add(cig.g,lighter.g);
 // 뭉게 개수 상한: NPC는 예전대로 LIMITS의 절반, 내 담배는 큰 연기를 위해 LIMITS만큼(PC 60·휴대폰 24)
 const fxCap=isPlayer?Math.max(16,LIMITS.trailEffects??60):Math.max(10,Math.round((LIMITS.trailEffects??60)*.5));
 const fx=[];
 // grow: 다 자라는 시점(0~1), wind: 옥상 바람을 따르는 정도
 function effect(kind,p,{vel=new V3(),life=1.5,r0=.01,r1=.04,gravity=0,lift=.03,drag=1.5,grow=.6,wind=0}){
  let o;if(fx.length>=fxCap){const old=fx.shift();o=old.kind===kind?old.o:(world.remove(old.o),null);}
  o??=fxTemplate(kind,toonify).clone(true);o.position.copy(p);o.scale.setScalar(.001);o.rotation.y=Math.random()*6.28;if(!o.parent)world.add(o);
  fx.push({kind,o,t:0,life,vel:vel.clone(),r0,r1,gravity,lift,drag,grow,wind});return o;}
 const windNow=()=>globalThis.lounge?.rooftop?.wind??ROOF_WIND;
 // 도넛 링: 작은 뭉게 8~10개를 입 앞에 고리로 놓고, 앞으로 날아가며 고리가 커진다
 function emitRing(m,F,L,U){
  const n=LIMITS.trailEffects<40?8:10,c=m.clone().addScaledVector(F,.06);
  for(let i=0;i<n;i++){const a=i/n*Math.PI*2,rad=L.clone().multiplyScalar(Math.cos(a)).addScaledVector(U,Math.sin(a));
   effect('smoke',c.clone().addScaledVector(rad,.035),{vel:F.clone().multiplyScalar(.55).addScaledVector(U,.04).addScaledVector(rad,.13),life:3.2,r0:.01,r1:.032,lift:.015,drag:.45,grow:.25,wind:.6});}
 }
 function updateFx(dt){
  const W=windNow();
  for(let i=fx.length-1;i>=0;i--){const f=fx[i];f.t+=dt;const k=f.t/f.life;if(k>=1){world.remove(f.o);fx.splice(i,1);continue;}
   f.vel.multiplyScalar(Math.exp(-dt*f.drag));f.vel.y+=(f.lift-f.gravity)*dt;f.o.position.addScaledVector(f.vel,dt);
   if(f.wind){const w=f.wind*smooth(0,.25,k)*dt;f.o.position.x+=W.x*w;f.o.position.z+=W.z*w;}
   f.o.scale.setScalar(Math.max(.001,MathUtils.lerp(f.r0,f.r1,smooth(0,f.grow,k))*(1-smooth(.75,1,k))));f.o.rotation.y+=dt*.6;}
 }
 // 꽁초(버린 뒤 떨어지는 사본)
 const butts=[];

 // ── 상태
 // 맛: kind(담배 종류), hold(꾹 누르는 중)·held(누른 시간)·drew(들이마신 시간), quality·amount·trick(이번 내뿜기), first(불 붙인 뒤 첫 내뿜기)
 const S={state:'idle',t:0,puffs:0,left:1,ash:0,lit:false,heat:0,wR:0,wL:0,wait:0,atAshtray:null,nextPuff:0,emitAt:0,wispAt:0,ashSaid:false,soundFlags:{},
  kind:cigKind(profile?.cigKind),hold:false,held:0,drew:0,draw:0,quality:null,amount:0,trick:null,first:false,exhaled:false,exLen:SMOKE_SECONDS.exhale,emitted:0,planned:0,
  pendingTrick:null,tapAt:-1,rings:0,pause:0,borrowed:false,lend:null};
 const curR=new V3(),curL=new V3();let curInit=false;
 const say=(extra={})=>window.dispatchEvent(new CustomEvent('lounge:smoke',{detail:{id,state:S.state,puffs:S.puffs,left:+S.left.toFixed(2),lit:S.lit,isPlayer,
  kind:S.kind,quality:S.quality,trick:S.trick,first:S.first,amount:S.amount,...(S.state==='done'?{atAshtray:!!S.atAshtray}:{}),...extra}}));
 const go=state=>{if(state==='exhale')beginExhale();S.state=state;S.t=0;S.soundFlags={};say();
  if(S.queued&&(state==='ready'||state==='smoking'||state==='finished')){const q=S.queued;S.queued=null;api[q.name](q.arg);}};
 const queue=(name,arg)=>{S.queued={name,arg};return true;};
 // 가까운 재떨이(1.6m 안 — HUD 매너 도장과 같은 거리)의 모래 위 자리. 없으면 null(바닥).
 function nearAshtray(){
  const list=(typeof ashtrays==='function'?ashtrays():ashtrays)??globalThis.lounge?.rooftop?.spots?.ashtrays??[];
  let best=null,bd=1.6;for(const a of list){const d=Math.hypot(a.x-avatar.x,a.z-avatar.z);if(d<bd){bd=d;best=a;}}
  return best?(best.at??true):null;}
 const sound=(name,flag=name)=>{if(S.soundFlags[flag])return;S.soundFlags[flag]=true;audio?.play?.(name,isPlayer?{quality:S.quality}:{at:root.position,quality:S.quality});};
 const burn=amount=>{amount*=CIG_KINDS[S.kind].burn;const before=S.left;S.left=Math.max(0,S.left-amount);S.ash=Math.min(CIG.ashMax,S.ash+(before-S.left)*CIG.paper*.55);};
 // 내뿜기 시작: 누른 시간으로 맛을 정하고 이번 연기 양·뭉게 수·길이를 정한다
 function beginExhale(){
  S.quality=S.hold||S.held>DRAW.tap?drawQuality(S.held):(isPlayer?'light':'sweet');S.hold=false;
  S.amount=smokeAmount(S.quality,S.kind);S.exLen=QUALITY[S.quality].exhale;
  S.trick=S.quality==='cough'?null:S.pendingTrick;S.pendingTrick=null;S.rings=0;S.pause=0;S.tapAt=-1;
  S.first=!S.exhaled;S.exhaled=true;S.emitted=0;S.planned=exhalePuffs(S.amount,fxCap);S.emitAt=0;
  if(S.trick==='ring'){S.rings=1;S.ringNow=true;S.pause=.4;S.planned=Math.max(2,Math.round(S.planned*.4));} // 링으로 시작하면 뭉게는 조금만
 }
 const applyKind=()=>{const k=CIG_KINDS[S.kind];cig.paper.material.color.set(k.paper);cig.filter.material.color.set(k.filter);};
 applyKind();

 const api={
  id,isPlayer,
  get active(){return S.state!=='idle';},
  get state(){return S.state;},
  // 🚬 한 대 꺼내기
  // 동작 중에 누른 단추는 하나만 기억했다가 그 동작이 끝나면 한다(NPC가 조금 일찍 불러도 빠지지 않게).
  // kind: 'mild'|'strong'|'menthol'|'cigar'(안 주면 지난번 고른 것)
  start(kind){if(S.state!=='idle')return false;if(kind)S.kind=cigKind(kind);applyKind();
   Object.assign(S,{puffs:0,left:1,ash:0,lit:false,heat:0,atAshtray:null,wait:0,queued:null,hold:false,held:0,drew:0,draw:0,quality:null,amount:0,trick:null,first:false,exhaled:false,pendingTrick:null,borrowed:false});go('out');return true;},
  get kind(){return S.kind;},
  // 🔥 라이터(꺼내 든 상태에서). 꺼내기 전이면 꺼내기부터.
  light(){if(S.state==='idle')return api.start();if(S.state==='out')return queue('light');if(S.state!=='ready')return false;S.borrowed=false;go('lighting');return true;},
  // 남의 불로 붙이기(불 빌리기·맞불): 담배를 입에 물고 빨아들이기만 한다. 라이터는 상대(lend)가 든다.
  lightFrom(){if(S.state==='out')return queue('lightFrom');if(S.state!=='ready')return false;S.borrowed=true;go('lighting');return true;},
  // 불 대 주기(NPC): target()이 주는 자리(남의 담배 끝)에 sec초 동안 'lighter'면 왼손 라이터를, 'tip'이면 내 담배 끝(맞불)을 댄다.
  lend(target,mode='lighter',sec=2.6){S.lend={target,mode,len:sec,t:0,clicked:false};return true;},
  get lending(){return !!S.lend;},
  // 지금 담배 끝(월드). 담배를 안 들었으면 null.
  tip(){return cig.g.visible?lastTip.clone():null;},
  // 같이 내뿜었을 때 큰 구름: p(월드 {x,y,z}) 둘레에 크게 자라 6~8초 머무는 뭉게를 몇 개 낸다(이 담배의 뭉게 상한 안에서).
  cloud(p,amount=1){const c=new V3(p.x,p.y,p.z),n=Math.max(4,Math.min(Math.round(fxCap*.35),Math.round(6+6*amount)));
   for(let i=0;i<n;i++){const a=i/n*Math.PI*2,off=v(Math.cos(a)*.18*Math.random(),(Math.random()-.3)*.12,Math.sin(a)*.18*Math.random());
    effect('smoke',c.clone().add(off),{vel:off.clone().multiplyScalar(.6).add(v(0,.05,0)),life:6+2*Math.random(),r0:.04,r1:.24+.1*Math.random(),lift:.03,drag:.8,grow:.3,wind:1});}
   return n;},
  // 한 모금(들이마시기 → 내뿜기, 짧게 탭한 기본 모금). 불 안 붙였으면 불부터.
  puff(){if(S.state==='ready')return api.light();if(BUSY.has(S.state))return queue('puff');if(S.state!=='smoking')return false;S.hold=false;S.held=0;S.drew=0;go('inhale');return true;},
  // 꾹 누르는 모금: 누르는 동안 들이마신다. 0.25초 안에 떼면 기본 모금. 내뿜는 중에 짧게 탭하면 링.
  drawStart(){
   if(S.state==='exhale'){S.tapAt=S.t;return true;}
   if(S.state!=='smoking')return api.puff();
   S.hold=true;S.held=0;S.drew=0;go('inhale');return true;},
  drawEnd(){
   if(S.state==='exhale'&&S.tapAt>=0){const quick=S.t-S.tapAt<DRAW.tap+.1;S.tapAt=-1;return quick?api.trick('ring'):false;}
   if(S.state!=='inhale'||!S.hold)return false;
   if(S.held<DRAW.tap){S.hold=false;S.held=0;return true;} // 짧은 탭 → 기본 모금으로 이어서
   S.puffs++;go('exhale');return true;},
  // 연기 묘기: 'ring'(도넛 링) | 'nose'(코로 내뿜기) | 'french'(입→코로 다시 들이마시기).
  // 내뿜는 중이면 링은 바로 하나 더, 코·프렌치는 다음 내뿜기에. 피우는 중이면 기본 모금 뒤 내뿜을 때 한다.
  trick(name){
   if(!['ring','nose','french'].includes(name))return false;
   if(S.state==='exhale'){
    if(name==='ring'&&S.quality!=='cough'&&S.rings<4&&S.t<S.exLen-.5){S.rings++;S.trick='ring';S.pause=.4;S.ringNow=true;say({state:'trick',trick:'ring'});sound('ring','ring'+S.rings);return true;}
    S.pendingTrick=name;return true;}
   if(S.state==='inhale'){S.pendingTrick=name;return true;}
   if(S.state!=='smoking')return false;
   S.pendingTrick=name;return api.puff();},
  // 재 털기
  flick(){if(BUSY.has(S.state))return queue('flick');if(S.state!=='smoking')return false;go('flick');return true;},
  // 꽁초 버리기. atAshtray: 안 주면 1.6m 안 재떨이를 찾는다 / true(재떨이 근처) / {x,y,z}(그 재떨이로 톡) / false(바닥)
  dispose(atAshtray){if(BUSY.has(S.state)||S.state==='out')return queue('dispose',atAshtray);if(!['ready','smoking','finished'].includes(S.state))return false;
   S.atAshtray=atAshtray===undefined?nearAshtray():(atAshtray||null);go('dispose');return true;},
  blocksMove(){return S.state==='lighting'||S.state==='dispose';},
  status(){return {id,state:S.state,puffs:S.puffs,left:+S.left.toFixed(2),ash:+(S.ash/CIG.ashMax).toFixed(2),lit:S.lit,heat:+S.heat.toFixed(2),arm:+S.wR.toFixed(2),smoke:fx.length,smokeCap:fxCap,auto,
   draw:+S.draw.toFixed(2),kind:S.kind,hold:S.hold,held:+S.held.toFixed(2),quality:S.quality,trick:S.trick,amount:S.amount};},
  set auto(on){auto=!!on;},get auto(){return auto;},
  // 소품·효과를 모두 치운다(아바타를 지울 때)
  remove(){for(const f of fx)world.remove(f.o);fx.length=0;for(const b of butts)world.remove(b.g);butts.length=0;world.remove(cig.g,lighter.g);ohMouth?.parent?.remove(ohMouth);},
  apply(dt,{moving=false}={}){
   updateFx(dt);updateButts(dt);
   if(S.state==='idle'&&S.wR<=0&&!S.lend){cig.g.visible=lighter.g.visible=false;if(ohMouth)ohMouth.visible=false;return;}
   S.t+=dt;const t=S.t,T=SMOKE_SECONDS;
   let toMouth=0,raiseL=0,flame=0,tap=0,pocket=0,drop=0,inhaling=0,exhaling=0,show=true;
   switch(S.state){
    case 'out':pocket=bump(0,.25,.45,.85,t);show=t>.35;if(t>=T.out)go('ready');break;
    case 'ready':if(auto&&t>.6)api.light();break;
    case 'lighting':toMouth=bump(0,.45,1.75,2.2,t);if(!S.borrowed){raiseL=bump(.25,.65,1.55,1.95,t);flame=bump(.62,.68,1.5,1.58,t);}
     if(t>.62&&!S.borrowed)sound('lighter');if(t>1.05&&!S.lit){S.lit=true;S.heat=1;sound('inhale','light-inhale');}if(t>1.05)inhaling=bump(1.05,1.2,1.45,1.6,t);
     if(t>=T.lighting){S.borrowed=false;go('smoking');S.nextPuff=1.2+Math.random()*1.5;}break;
    case 'smoking':if(auto){S.wait+=dt;if(S.wait>S.nextPuff){S.wait=0;S.nextPuff=3.5+Math.random()*3.5;if(S.ash>CIG.ashMax*.6&&Math.random()<.7)api.flick();else api.puff();}}break;
    case 'inhale':
     if(S.hold){ // 꾹 누르는 동안: 입에 물고 계속 빨아들인다. 3초 넘으면 콜록.
      S.held+=dt;toMouth=smooth(0,.45,t);inhaling=smooth(.35,.5,t);if(t>.35)sound('inhale');
      if(S.held>DRAW.cough){S.puffs++;go('exhale');sound('cough');break;}}
     else{toMouth=bump(0,.45,1.15,1.5,t);inhaling=bump(.4,.55,1.1,1.25,t);if(t>.4)sound('inhale');}
     if(inhaling>0){burn(dt*(1/PUFFS_PER_CIG)/DRAW_FULL*(S.drew<DRAW_FULL?1:DRAW_TAIL));S.drew+=dt;}
     S.draw=S.hold?drawLevel(S.held):drawLevel(S.drew);
     if(!S.hold&&t>=T.inhale){S.puffs++;go('exhale');}break;
    case 'exhale':{const L2=S.exLen;exhaling=bump(.05,.2,L2-.75,L2-.4,t);if(t>.05)sound(S.quality==='cough'?'cough':'exhale');
     S.draw=Math.max(0,S.draw-dt*1.5);
     if(t>=L2){if(S.left<=.02){S.left=0;go('finished');S.wait=0;}else go('smoking');}break;}
    case 'flick':tap=t<.75?Math.max(0,Math.sin(t*Math.PI*2/.25))*bump(.15,.2,.6,.7,t):0;
     if(t>.3)sound('ash');
     if(t>.3&&S.ash>0){const tip=tipWorld();for(let i=0;i<3;i++)effect('ash',tip.clone().add(v((Math.random()-.5)*.02,0,(Math.random()-.5)*.02)),{vel:v(0,-.1,0),life:.7,r0:.004,r1:.007,gravity:2.5,lift:0,drag:.5});S.ash=0;}
     if(t>=T.flick)go('smoking');break;
    case 'finished':if(auto&&t>.8)api.dispose();break;
    case 'dispose':drop=bump(0,.4,.75,1.05,t);show=t<.55;if(t>=.55&&!S.released){S.released=true;releaseButt();}
     if(t>=T.dispose){S.released=false;S.lit=false;go('done');S.state='idle';}break;
   }
   // 불 대 주기(lend): 라이터는 왼손을 올려 불꽃을, 맞불은 오른손 담배 끝을 상대 담배 끝으로
   let lendTo=null,lendTip=0;
   if(S.lend){const Ld=S.lend;Ld.t+=dt;const k=Ld.t,n=Ld.len;lendTo=Ld.target?.()??null;
    if(Ld.mode==='tip')lendTip=lendTo?bump(.2,.7,n-.6,n-.2,k):0;
    else if(lendTo){raiseL=Math.max(raiseL,bump(.15,.55,n-.6,n-.2,k));const f=bump(.55,.62,n-.8,n-.7,k);flame=Math.max(flame,f);
     if(f>.05&&!Ld.clicked){Ld.clicked=true;audio?.play?.('lighter',isPlayer?{}:{at:root.position});}}
    if(k>=n)S.lend=null;}
   // 팔 섞기 비율: 담배를 든 동안 1, 버리고 나면 0으로
   const wantR=S.state==='idle'?0:1;S.wR=wantR>S.wR?Math.min(wantR,S.wR+dt/.3):Math.max(wantR,S.wR-dt/.35);
   S.wL=raiseL;
   if(S.state!=='inhale'&&S.state!=='exhale')S.draw=0;
   // 불씨 밝기: 들이마신 정도(draw)를 따라 밝아진다
   S.heat=MathUtils.damp(S.heat,S.lit?(inhaling>0?.4+.6*Math.max(S.draw,S.state==='lighting'?1:.15):.25):0,inhaling>0?6:2.5,dt);
   if(S.lit&&S.state!=='inhale'&&S.state!=='lighting')burn(dt*PASSIVE_BURN);
   if(S.lit&&S.left<=0&&S.state==='smoking'){go('finished');}

   // ── 팔 목표(월드). 어깨·입 기준, 모델 축(앞·왼쪽·위)으로 둔다. 동동이 팔은 짧아서(0.225m) IK가 닿는 만큼만 간다.
   model.updateMatrixWorld(true);
   const sh=bones.RightArm.getWorldPosition(new V3()),m=mouth(),F=axis(0,0,1),L=axis(1,0,0),U=axis(0,1,0);
   const hold=sh.clone().addScaledVector(L,-.02).addScaledVector(U,-.15).addScaledVector(F,.12).addScaledVector(U,-.025*tap);
   const chest=sh.clone().addScaledVector(L,.1).addScaledVector(U,-.1).addScaledVector(F,.1);
   // 입에 물 때 담배 방향: 앞으로, 조금 아래·바깥(오른손 쪽). 손은 담배 가운데 밑을 받친다(팔이 짧아 닿는 만큼).
   const mouthDir=F.clone().addScaledVector(L,-.3).addScaledVector(U,-.22).normalize();
   const atMouth=m.clone().addScaledVector(mouthDir,CIG.filter+.02).addScaledVector(U,-.045).addScaledVector(F,-.01);
   const low=sh.clone().addScaledVector(L,-.04).addScaledVector(U,-.19).addScaledVector(F,.15);
   const wantRW=hold.clone().lerp(chest,pocket).lerp(atMouth,toMouth).lerp(low,drop);
   if(lendTip>0)wantRW.lerp(new V3(lendTo.x,lendTo.y,lendTo.z).addScaledVector(F,-(CIG.filter+CIG.paper*S.left)*.9),lendTip);
   if(!curInit){curR.copy(root.worldToLocal(hold.clone()));curL.copy(curR);curInit=true;}
   curR.lerp(root.worldToLocal(wantRW.clone()),1-Math.exp(-dt*14));
   solveArm('Right',root.localToWorld(curR.clone()),axis(-.45,-.35,-1),smooth(0,1,S.wR));
   model.updateMatrixWorld(true);

   // ── 담배 자리: 손에 들기 ↔ 입에 물기
   const hc=handCenter('Right');
   const holdDir=F.clone().addScaledVector(L,-.35).addScaledVector(U,.22).normalize();
   const holdFilter=hc.clone().addScaledVector(holdDir,-.012).addScaledVector(U,.01);
   const mouthFilter=m.clone().addScaledVector(F,.004);
   const k=smooth(.25,.85,toMouth);
   const filterPos=holdFilter.clone().lerp(mouthFilter,k),dir=holdDir.clone().lerp(mouthDir,k).normalize();
   const cq=new Q().setFromUnitVectors(v(0,0,1),dir);
   const len=CIG.paper*Math.max(S.left,.04);
   cig.paper.scale.set(1,1,len);cig.ember.position.z=CIG.filter+len;cig.ember.visible=S.lit||S.state==='dispose';
   cig.ash.position.z=CIG.filter+len+CIG.r*.3;cig.ash.scale.set(.96,.96,Math.max(.0005,S.ash));cig.ash.visible=S.ash>.001;
   const em=cig.ember.material;em.emissive.set(COLORS.ember).lerp(new THREE.Color(COLORS.emberHot),S.heat*.8);em.emissiveIntensity=S.lit?.5+S.heat*2.2:0;cig.ember.scale.set(1+S.heat*.3,1+S.heat*.3,1+S.heat*1.2);
   if(!S.lit){em.color.set(COLORS.paper);}else em.color.set(COLORS.ember);
   cig.g.visible=show&&S.state!=='idle'&&S.wR>.05;const th=CIG_KINDS[S.kind].thick;cig.g.matrix.compose(filterPos,cq,v(th,th,1));cig.g.matrixWorldNeedsUpdate=true;
   lastTip.copy(filterPos).addScaledVector(dir,CIG.filter+len+S.ash);

   // ── 라이터(왼손): 담배 끝 아래로 손을 올리고 딸깍·불꽃
   if(S.wL>.001){const tipNow=S.lend?.mode==='lighter'&&lendTo?new V3(lendTo.x,lendTo.y,lendTo.z):lastTip.clone();
    const wantLW=tipNow.clone().addScaledVector(U,-(LIGHTER_UP+.06)).addScaledVector(L,.015).addScaledVector(F,-.005);
    curL.lerp(root.worldToLocal(wantLW.clone()),1-Math.exp(-dt*14));
    solveArm('Left',root.localToWorld(curL.clone()),axis(.45,-.35,-1),smooth(0,1,S.wL));model.updateMatrixWorld(true);
    const lh=handCenter('Left');lighter.g.visible=S.wL>.3;
    // 라이터 불꽃이 담배 끝을 향하도록 손 위에 세운다
    lighter.g.matrix.compose(lh.clone().addScaledVector(U,LIGHTER_UP),mq(),v(1,1,1));lighter.g.matrixWorldNeedsUpdate=true;
    lighter.flame.visible=flame>.05;lighter.flame.scale.set(1,(.6+.4*flame)*(1+Math.sin(performance.now()/45)*.12),1);
   }else{lighter.g.visible=false;curL.copy(curR);}

   // ── 연기: 내뿜기(입에서 뭉게뭉게), 담배 끝(가늘게 피어오름)
   // 큰 연기: 이번 양(amount)만큼 뭉게를 내뿜는 시간 앞쪽에 고르게 나눠 낸다. 크게 자라 5~8초 머물며 옥상 바람 따라 흐른다.
   const nose=m.clone().addScaledVector(U,.055).addScaledVector(F,.035);
   let fromNose=false;
   if(S.state==='exhale'){
    const trick=S.trick,a=S.amount,emitEnd=Math.max(.5,S.exLen*.5),te=S.t;
    fromNose=trick==='nose'||(trick==='french'&&te>.9);
    if(S.ringNow){S.ringNow=false;emitRing(m,F,L,U);}
    S.pause=Math.max(0,S.pause-dt);
    if(trick==='french'&&te<.9){ // 프렌치: 입에서 나온 연기가 천천히 위로 올라 코로 빨려 들어간다
     S.emitAt-=dt;if(S.emitAt<=0){S.emitAt=.08;const p=m.clone().addScaledVector(F,.02).addScaledVector(L,(Math.random()-.5)*.03);
      effect('smoke',p,{vel:U.clone().multiplyScalar(.09).addScaledVector(F,-.01),life:.85,r0:.008,r1:.022+.01*Math.random(),lift:0,drag:.2,grow:.3});}}
    else if(exhaling>.05&&S.pause<=0&&S.emitted<S.planned&&te<emitEnd+.2){
     S.emitAt-=dt;if(S.emitAt<=0){S.emitAt=emitEnd/S.planned;S.emitted++;
      const p=fromNose?nose.clone().addScaledVector(L,(S.emitted%2?.02:-.02)):m.clone().addScaledVector(F,.03);
      const spread=L.clone().multiplyScalar((Math.random()-.5)*.5).addScaledVector(U,(Math.random()-.3)*.25);
      const dirOut=fromNose?F.clone().addScaledVector(U,-.45):F.clone().addScaledVector(U,.2);
      const vel=dirOut.add(spread).normalize().multiplyScalar((.3+.25*Math.min(a,1.5))*(S.quality==='cough'?1.6:1));
      const r=Math.random();
      effect('smoke',p,{vel,life:puffLife(a,Math.random()),r0:.012,r1:puffRadius(a,r)*(fromNose?.8:1),lift:.045,drag:.9,grow:.35,wind:1});}}
   }
   if(ohMouth)ohMouth.visible=exhaling>.1&&!fromNose;
   if(S.lit&&cig.g.visible&&toMouth<.3){S.wispAt-=dt;if(S.wispAt<=0){S.wispAt=.38+Math.random()*.2;
     effect('smoke',lastTip.clone(),{vel:v((Math.random()-.5)*.03,.07,(Math.random()-.5)*.03),life:1.9,r0:.005,r1:.016*CIG_KINDS[S.kind].thick,lift:.03,drag:.6});}}
   void moving;
  },
 };
 const lastTip=new V3();
 const tipWorld=()=>lastTip.clone();
 function releaseButt(){
  const b=cig.g.clone(true);b.matrixAutoUpdate=true;cig.g.matrix.decompose(b.position,b.quaternion,b.scale);
  b.traverse(o=>{if(o.name==='ember'||o.name==='ash')o.visible=false;});world.add(b);
  const target=S.atAshtray&&typeof S.atAshtray==='object'?new V3(S.atAshtray.x,(S.atAshtray.y??.72)+.01,S.atAshtray.z):null;
  // 재떨이로: 0.45초 만에 모래 위에 닿는 포물선. 아니면 앞으로 툭 떨어진다.
  const vel=target?target.clone().sub(b.position).divideScalar(BUTT_FLIGHT).add(v(0,.5*9.8*BUTT_FLIGHT,0)):axis(0,0,1).multiplyScalar(.4).setY(.3);
  butts.push({g:b,vel,t:0,target,inAshtray:!!S.atAshtray,landed:false,spin:new V3(Math.random()*6,Math.random()*4,0)});
  audio?.play?.('drop',isPlayer?{}:{at:root.position});
 }
 function updateButts(dt){
  for(let i=butts.length-1;i>=0;i--){const b=butts[i];b.t+=dt;
   if(!b.landed){b.vel.y-=9.8*dt;b.g.position.addScaledVector(b.vel,dt);b.g.rotation.x+=b.spin.x*dt;b.g.rotation.y+=b.spin.y*dt;
    const floor=b.target?b.target.y:(b.inAshtray?.55:.006);
    if(b.target&&b.t>=BUTT_FLIGHT)b.g.position.copy(b.target);
    if((b.target?b.t>=BUTT_FLIGHT:b.g.position.y<=floor&&b.vel.y<0)){b.landed=true;b.t=0;if(!b.inAshtray){b.g.position.y=.006;b.g.rotation.set(Math.PI/2,b.g.rotation.y,0);}}}
   else{const life=b.inAshtray?.25:4;const k=b.t/life;if(b.inAshtray||k>.8)b.g.scale.setScalar(Math.max(.001,1-smooth(b.inAshtray?0:.8,1,k)));if(k>=1){world.remove(b.g);butts.splice(i,1);}}}
 }
 return api;
}
