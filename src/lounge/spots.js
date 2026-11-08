// 옥상에서 할 일(B5): 난간에 기대기·벤치에 앉기·자판기 캔커피. 상황 고르기(B6) 단추와 패널도 여기서 직접 만든다(hud.js는 건드리지 않는다).
// 자세는 동동이 원본(src/toon/**, realistic-hiker.js)을 고치지 않고, 원래 동작이 끝난 뒤(player.extra 맨 앞, 흡연 팔보다 먼저) 뼈 회전을 덧씌워 만든다.
// - 기대기: 난간 쪽을 보고 상체를 앞으로 숙이고, 두 팔을 들어 콘크리트 턱 윗면에 올린다.
// - 앉기: 동동이는 다리가 짧아(1.0m·2.1등신) 좌판(0.44m)에 앉으면 발이 뜬다 → 「벤치에 걸터앉기」: 몸을 좌판 높이로 올리고 허벅지는 앞으로, 정강이는 아래로 늘어뜨린다.
// - 캔커피: 자판기 꺼내는 곳으로 캔이 떨어지고, 담배 안 든 손(왼손)에 툰 재질 캔을 들고 가끔 마신다.
// 상태가 바뀌면 'lounge:spot' {id:'me', spot:'rail'|'bench'|'vending', state:'enter'|'leave'|'use'}를 보낸다.
// 단추는 「등산 수첩」 종이 톤(hud.css .lg-btn, 44px 이상), 자리·패널은 spots.css. PC는 E 키 = 지금 뜬 할 일 단추.
import * as THREE from 'three';
import {legTargets} from '../hiker-ik.js';
import {part} from '../toon/concept-kit.js';
import {finishTrailModel} from '../toon/trail-props.js';
import {SCENES} from './scene.js';

export const SPOT_RANGE=Object.freeze({rail:1.2,bench:1.5,vending:1.6});
export const POSE_BLEND=.35;                 // 자세가 들어가고 빠지는 시간(초)
export const SEAT_PAD=.06;                   // 좌판 위 골반 높이(허벅지 두께)
export const SIP=Object.freeze({first:2.5,every:[7,12],secs:1.6}); // 캔: 첫 모금까지, 다음 모금 간격, 한 모금 길이(초)
export const CAN=Object.freeze({r:.028,h:.088,body:'#8a5a3c',band:'#f6efdc',top:'#b9bec0'}); // 캔커피(갈색·크림 띠). 동동이 키 1.0m 기준
const DROP=Object.freeze({fall:.45,wait:.35,fly:.3});
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
export function railSpot(rooftop,x,z){
 const b=rooftop.bounds,ins=rooftop.rail?.inset??.22,m=ins+.25;
 const cx=clamp(x,b.minX+m,b.maxX-m),cz=clamp(z,b.minZ+m,b.maxZ-m);
 const list=[
  {x:cx,z:b.minZ+ins,heading:0,n:[0,-1]},{x:cx,z:b.maxZ-ins,heading:Math.PI,n:[0,1]},
  {x:b.minX+ins,z:cz,heading:Math.PI/2,n:[-1,0]},{x:b.maxX-ins,z:cz,heading:-Math.PI/2,n:[1,0]},
 ].map(s=>({...s,d:Math.hypot(s.x-x,s.z-z)})).sort((p,q)=>p.d-q.d);
 for(const s of list){if(s.d>SPOT_RANGE.rail)break;if(!blocked(rooftop.colliders,s.x,s.z))return {kind:'rail',...s};}
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
 const side=s=>({arm:[B(s+'Arm'),B(s+'ForeArm'),B(s+'Hand')],leg:[B(s+'UpLeg'),B(s+'Leg'),B(s+'Foot')]});
 return {hips:B('Hips'),spine:['Spine','Spine1','Spine2'].map(B).filter(Boolean),head:B('Head'),Left:side('Left'),Right:side('Right')};
}

function makeCan(toonify){
 const g=new THREE.Group();g.name='캔커피';
 part(g,new THREE.CylinderGeometry(CAN.r,CAN.r,CAN.h,14).translate(0,CAN.h/2,0),CAN.body,{line:.35});
 part(g,new THREE.CylinderGeometry(CAN.r*1.02,CAN.r*1.02,CAN.h*.34,14).translate(0,CAN.h*.52,0),CAN.band,{line:0});
 part(g,new THREE.CylinderGeometry(CAN.r*.86,CAN.r,CAN.h*.08,14).translate(0,CAN.h*1.04,0),CAN.top,{line:.25});
 finishTrailModel(g,toonify,{shadow:true});return g;
}

// ctx: main.js ctx(THREE·toon·world·rooftop·player·smoker·dispatch). goTo({x,z,heading,done}): main.js 자동 이동. scene: scene.js createScene 결과.
export function createSpots({ctx,player=ctx.player,smoker=ctx.smoker,rooftop=ctx.rooftop,world=ctx.world,toon=ctx.toon,goTo,scene=null,query=null,ui=true}){
 const dispatch=ctx.dispatch??((type,detail)=>globalThis.dispatchEvent(new CustomEvent(type,{detail})));
 const send=(spot,state,extra={})=>dispatch('lounge:spot',{id:player.id,spot,state,...extra});
 const model=player.hiker.model,root=player.root,rig=poseRig(model);
 const skeleton=model.getObjectByName('ToonHiker_Body')?.skeleton,face=model.userData?.face;
 const headInv=skeleton&&rig.head?skeleton.boneInverses[skeleton.bones.indexOf(rig.head)]:null;
 const S={pose:'stand',w:0,spot:null,anchor:null,pending:null,near:null,
  can:{held:false,sips:0,next:0,sip:-1,drop:null}};
 const mq=()=>model.getWorldQuaternion(new Q());
 const dirM=(x,y,z)=>new V3(x,y,z).applyQuaternion(mq()).normalize(); // 모델 공간(앞 +Z, 왼쪽 +X) → 월드
 const smokeState=()=>smoker?.status?.()?.state??'idle';
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
  if(w>0&&kind==='sit')sit(w,F,L);
  if(w>0&&kind==='lean')lean(w,F,L);
  holdCan(dt,F,L);
 }
 function sit(w,F,L){
  const seat=S.spot?.seat??{y:.44};
  const hipsH=rig.hips?wpos(rig.hips).y-root.position.y:.4;
  root.position.y+=(seat.y+SEAT_PAD-hipsH)*w;root.updateMatrixWorld(true);
  // 등받이에 살짝 기대 상체를 뒤로
  blend(rig.spine,w,()=>turnWorld(rig.spine[0],L,-.1));
  for(const [s,x] of [['Left',1],['Right',-1]]){
   const [up,mid,end]=rig[s].leg;if(!up||!mid)continue;
   blend([up,mid,end],w,()=>{
    const hp=wpos(up),kp=wpos(mid);aim(up,kp.clone().sub(hp),F.clone().multiplyScalar(.98).addScaledVector(UP,-.12).addScaledVector(L,x*.12));
    if(!end)return;const k2=wpos(mid),fp=wpos(end),len=k2.distanceTo(fp),dy=clamp((k2.y-.04)/Math.max(len,1e-3),0,1);
    aim(mid,fp.clone().sub(k2),UP.clone().multiplyScalar(-dy).addScaledVector(F,Math.sqrt(1-dy*dy)+.08)); // 발이 바닥에 닿으면 앞으로 뻗는다
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
  if(c.drop){const d=c.drop;d.t+=dt;const o=rooftop.spots?.vending?.outlet??{x:player.x,y:.3,z:player.z};
   if(d.t<DROP.fall){const k=d.t/DROP.fall,bounce=k<.75?(1-(k/.75)**2)*.32:Math.sin((k-.75)/.25*Math.PI)*.03;fall.visible=true;fall.position.set(o.x,o.y-.02+bounce,o.z);fall.rotation.set(0,0,k<.75?0:.3*(1-k));}
   else if(d.t<DROP.fall+DROP.wait){fall.position.set(o.x,o.y-.02,o.z);fall.rotation.set(0,0,0);}
   else if(d.t<DROP.fall+DROP.wait+DROP.fly){const k=smooth((d.t-DROP.fall-DROP.wait)/DROP.fly);fall.position.lerpVectors(new V3(o.x,o.y-.02,o.z),handCenter('Left'),k);}
   else{fall.visible=false;c.drop=null;c.held=true;c.sips=0;c.next=SIP.first;c.sip=-1;}
  }
  if(!c.held){can.visible=false;return;}
  const st=smokeState(),busyMouth=st==='inhale',lighting=st==='lighting';
  // 가끔 마신다(담배를 빨아들이는 중에는 기다린다)
  if(c.sip<0){c.next-=dt;if(c.next<=0&&!busyMouth&&!lighting){c.sip=0;}}
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
 player.extra.unshift(pose);

 // ── 할 일
 function begin(kind,spot){
  S.pending=null;
  if(kind==='sit'){const s=spot.seat;player.x=s.x;player.z=s.z;player.heading=s.heading;player.root.position.set(s.x,0,s.z);}
  else player.heading=spot.heading;
  S.pose=kind;S.last=kind;S.spot=spot;S.anchor={x:player.x,z:player.z};
  send(kind==='sit'?'bench':'rail','enter',kind==='sit'?{index:spot.index}:{});render();
 }
 function stand(){
  if(S.pose==='stand')return false;const kind=S.pose,spot=S.spot;S.pose='stand';
  if(kind==='sit'&&spot){const m=Math.hypot(player.x-spot.seat.x,player.z-spot.seat.z);if(m<.05){player.x=spot.x;player.z=spot.z;}} // 좌판 앞으로 일어선다
  S.anchor=null;send(kind==='sit'?'bench':'rail','leave');render();return true;
 }
 // 자리까지 걸어간 뒤 시작(이미 그 자리면 바로). 8초 안에 못 가면(막힘) 그만둔다.
 function walkThen(spot,fn){
  stand();S.pending={spot,t:0};
  if(Math.hypot(spot.x-player.x,spot.z-player.z)<.12){player.heading=spot.heading;fn();return;}
  goTo?.({x:spot.x,z:spot.z,heading:spot.heading,done:()=>{if(S.pending?.spot===spot)fn();}});
 }
 function buy(){
  S.pending=null;const c=S.can;c.held=false;c.drop={t:0};can.visible=false;
  send('vending','use',{item:'can-coffee'});render();
 }
 const act={
  lean(){const s=railSpot(rooftop,player.x,player.z);if(!s)return false;walkThen(s,()=>begin('lean',s));return true;},
  sit(){const n=nearestSpot(rooftop,player.x,player.z);if(n?.kind!=='bench')return false;walkThen(n,()=>begin('sit',n));return true;},
  coffee(){const vm=rooftop.spots?.vending;if(!vm||Math.hypot(vm.x-player.x,vm.z-player.z)>SPOT_RANGE.vending)return false;walkThen({kind:'vending',...vm},buy);return true;},
  stand,
  dropCan(){if(!S.can.held)return false;S.can.held=false;can.visible=false;render();return true;},
 };
 // 지금 뜬 할 일(E 키·첫 단추)
 const primary=()=>S.pose!=='stand'?'stand':S.near?.kind==='rail'?'lean':S.near?.kind==='bench'?'sit':S.near?.kind==='vending'?'coffee':null;

 // ── 매 프레임(이동 뒤): 움직이면 자세를 풀고, 가까운 자리를 찾는다
 let nearT=0;
 function update(dt){
  if(S.pose!=='stand'&&S.anchor&&Math.hypot(player.x-S.anchor.x,player.z-S.anchor.z)>.04)stand();
  if(S.pending){S.pending.t+=dt;if(S.pending.t>8)S.pending=null;}
  nearT-=dt;if(nearT<=0){nearT=.2;const n=S.pose==='stand'?nearestSpot(rooftop,player.x,player.z):S.near;
   const sig=n?n.kind+(n.index??''):'';if(sig!==(S.near?S.near.kind+(S.near.index??''):'')){S.near=n;render();}else S.near=n;}
 }

 // ── 단추·상황 패널(브라우저에서만)
 let render=()=>{};
 if(ui&&globalThis.document)render=buildUi();
 function buildUi(){
  const cssReady=import('./spots.css').catch(()=>{}); // 노드 테스트가 이 파일을 읽을 수 있게 CSS는 브라우저에서만 불러온다
  const app=document.getElementById('app')??document.body;
  const mood=document.createElement('div');mood.className='sp-mood';app.prepend(mood);
  const dock=document.createElement('div');dock.className='sp-dock';dock.setAttribute('aria-label','옥상에서 할 일');dock.hidden=true;cssReady.then(()=>{dock.hidden=false;});app.appendChild(dock);
  const panel=document.createElement('section');panel.className='lg-card sp-panel';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','상황 고르기');app.appendChild(panel);
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const btn=(a,icon,label,cls='',extra='')=>`<button class="lg-btn sp-btn ${cls}" data-sp="${a}" aria-label="${esc(label)}"${extra}><span class="sp-i" aria-hidden="true">${icon}</span><span class="sp-t">${esc(label)}</span></button>`;
  const LABEL={lean:['🧍','난간에 기대기'],sit:['🪑','벤치에 걸터앉기'],coffee:['🥫','캔커피'],stand:['↩','일어나기']};
  let sig='';
  function renderDock(){
   const p=primary(),cur=scene?.current?SCENES[scene.current]:null;
   const s=JSON.stringify([p,S.pose,S.can.held,S.pose==='stand'&&S.near?.kind==='vending',cur?.id]);if(s===sig)return;sig=s;
   dock.innerHTML=(p?btn(p,LABEL[p][0],p==='stand'&&S.pose==='lean'?'난간에서 떨어지기':LABEL[p][1],'primary',' title="E"'):'')
    +(S.can.held?btn('dropCan','🗑','캔 버리기'):'')
    +(scene?btn('scene',cur?cur.icon:'🕐',cur?cur.label:'상황 고르기','',' aria-haspopup="dialog"'):'');
  }
  function renderPanel(){
   const cur=scene?.current;
   panel.innerHTML=`<h3>어떤 한 대 피울까요? <button class="lg-btn sp-x" data-sp="close" aria-label="닫기">✕</button></h3>
    <div class="sp-scenes">${scene.list.map(s=>`<button class="lg-btn ${s.id===cur?'on':''}" data-scene="${s.id}"><span class="sp-i" aria-hidden="true">${s.icon}</span><b>${esc(s.label)}</b><small>${esc(s.sub)}</small></button>`).join('')}</div>
    <button class="lg-btn sp-keep" data-sp="close">지금 시간 그대로 둘게요</button>`;
  }
  const openPanel=()=>{if(!scene)return;renderPanel();panel.hidden=false;};
  const closePanel=()=>{panel.hidden=true;};
  const pick=id=>{scene?.set(id);closePanel();sig='';renderDock();syncSettings();};
  const onClick=e=>{
   const sc=e.target.closest('[data-scene]');if(sc){pick(sc.dataset.scene);return;}
   const t=e.target.closest('[data-sp]');if(!t)return;const a=t.dataset.sp;
   if(a==='scene'){panel.hidden?openPanel():closePanel();return;}
   if(a==='close'){closePanel();return;}
   act[a]?.();
  };
  dock.addEventListener('click',onClick);panel.addEventListener('click',onClick);
  // PC: E 키 = 지금 뜬 할 일
  const modal=app.querySelector('.lg-modal');
  addEventListener('keydown',e=>{const a=document.activeElement;if(e.key==='Escape'&&!panel.hidden){closePanel();return;}if(e.code!=='KeyE'||e.repeat||(a&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA'))||(modal&&!modal.hidden))return;const p=primary();if(p){e.preventDefault();act[p]();}});
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
  return ()=>{renderDock();};
 }
 render();

 return {
  update,act,
  lean:act.lean,sit:act.sit,coffee:act.coffee,stand:act.stand,dropCan:act.dropCan,
  get pose(){return S.pose;},
  status(){return {pose:S.pose,w:+S.w.toFixed(2),near:S.near?.kind??null,primary:primary(),pending:!!S.pending,
   can:{held:S.can.held,dropping:!!S.can.drop,sips:S.can.sips,sipping:S.can.sip>=0}};},
  can,
 };
}
