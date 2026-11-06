// 자동걷기 즐길거리 실행(2026-11-06): 산스장·벤치·먼지털이기 모형을 가까이 갈 때만 만들고, 동물(다람쥐·산고양이·까치)을 최대 3마리 움직이며,
// 들르기(근처 6m) 제안 이벤트를 보내고, 들르면 그 자리로 걸어가 동작(src/toon/hiker-acts.js)을 한 뒤 원래 자리로 돌아와 자동걷기를 잇는다.
// HUD와는 window 이벤트로만 주고받는다:
//  보냄  hiking:trail-offer {id,kind,act,label,seconds}  들르기 버튼(4초)을 띄울 때, hiking:trail {type,…} 동작 진행·끝, hiking:trail-say 말풍선
//        hiking:trail-view {near,act,stage,offer,auto,busy} 즐길거리 줄(src/trail-hud.js)용 요약(바뀔 때만)
//  받음  hiking:command {id:'trail-play',value:{act,id,manual}} · {id:'trail-stop'} · {id:'trail-press'}(역기 연타) · {id:'chocolate'} · {id:'cramp-release'}(🦶 발끝 당기기)
//  ⑥ 헥헥·쥐: main이 update(…,{runner:{exhausted,auto,uphill}})로 스테미너 0 순간을 넘기면 src/exhaustion.js 규칙대로 동작하고,
//        hiking:trail {type:'exhaust',phase:'pant'|'cramp'|'none',left,label:'쥐 0:02'|null,release:버튼을 띄울지}를 보낸다. 1인칭 시야는 eyeDrop(0~0.3m).
// 소리: main이 넘긴 sound(src/trail-sound.js, 발소리와 같은 마스터·켜기/끄기)로만 낸다. 문구는 src/trail-lines.js의 pickLine(자리).
// main.js는 override()가 돌려준 자리로 등산객을 두고(걷는 동안 clip 'Walk'), ground() 뒤 update()를 부른다.
import * as THREE from 'three';
import {makeTrailProp,trailPropTemplate,BENCH,MAGPIE_FOOT} from './toon/trail-props.js';
import {createHikerActs,ACT_LABEL} from './toon/hiker-acts.js';
import {TRAIL_RULES as R} from './interaction-data.js';
import {LIMITS} from './device-profile.js';
import {TRAIL_BUTTONS} from './trail-rules.js';
import {createExhaustion,onRunExhausted,stepExhaustion,releaseCramp,crampLabel} from './exhaustion.js';
import {pickLine,TRAIL_SFX} from './trail-lines.js';

const {Vector3:V3,MathUtils}=THREE;
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
// 들르기 제안: 위치 pos에서 dropIn(6m) 안의 소품·동물 중 가장 가까운 것. offered = 이미 띄운 id(멀어지면 지운다).
// 거리는 소품 가장자리(it.r, OFFER_REACH)부터 잰다. 산스장은 가운데가 길에서 6.2m라 가운데로 재면 자동걷기로는 한 번도 안 뜬다.
export const OFFER_REACH=Object.freeze({gym:3.4,bench:.75,airgun:.6,cat:0});
export function nearestOffer(pos,items,offered,{dropIn=R.dropIn,reoffer=R.reoffer}={}){
 let best=null;for(const it of items){const d=Math.max(0,Math.hypot(it.x-pos[0],it.z-pos[2])-(it.r??0));if(d>reoffer)offered.delete(it.id);if(d<=dropIn&&!offered.has(it.id)&&(!best||d<best.d))best={...it,d};}
 return best;
}
// 동물 고르기: 후보 중 radius 안에서 가까운 순으로 max마리. 이미 나와 있는 것은 leave 거리까지 유지한다(경계에서 깜빡이지 않게).
export function pickAnimals(pos,candidates,active,{max=LIMITS.trailAnimals??3,radius=R.animalRadius,leave=R.animalLeave}={}){
 const d=c=>Math.hypot(c.x-pos[0],c.z-pos[2]);
 const keep=candidates.filter(c=>active.has(c.id)&&d(c)<=leave&&!c.gone).sort((a,b)=>d(a)-d(b));
 const add=candidates.filter(c=>!active.has(c.id)&&d(c)<=radius&&!c.gone).sort((a,b)=>d(a)-d(b));
 return [...keep,...add].sort((a,b)=>d(a)-d(b)).slice(0,max).map(c=>c.id);
}
// 동작 이름과 들르기 표시
export const OFFER_ACT=Object.freeze({gym:'gym-lift',bench:'bench-sit',airgun:'airgun',cat:'pet-cat'});
export const OFFER_LABEL=Object.freeze({gym:'💪 산스장 들르기',bench:'🪑 벤치에 앉기',airgun:'💨 신발 털기',cat:'🐱 고양이 쓰다듬기'});

export function createTrailWorld({scene,camera,hiker,landscape,toonify,auto,sound=null}){
 const height=(x,z)=>landscape.surfaceHeight(x,z),info=landscape.status.trailProps??{sites:[],cats:[]};
 const root=new THREE.Group();root.name='즐길거리';root.userData.metricKind='즐길거리';scene.add(root);
 const fxRoot=new THREE.Group();fxRoot.name='즐길거리 효과';scene.add(fxRoot);
 const acts=createHikerActs(hiker,{toonify,world:fxRoot});
 // ── 소품(가까이 있을 때만 모형을 만든다)
 const props=info.sites.map(s=>({...s,obj:null}));
 const frameOf=s=>new THREE.Matrix4().compose(new V3(s.x,s.y,s.z),new THREE.Quaternion().setFromAxisAngle(new V3(0,1,0),s.yaw),new V3(1,1,1));
 // 경사에 놓인 벤치: 다리 네 개 밑을 땅까지 받침돌로 채운다
 const addFootings=s=>{for(const [lx,lz] of [[-.62,.12],[.62,.12],[-.62,-.22],[.62,-.22]]){const w=new V3(lx,0,lz).applyMatrix4(s.obj.matrixWorld),h=s.y-height(w.x,w.z);if(!(h>.015))continue;
  const f=makeTrailProp('footing',toonify);f.position.set(lx,0,lz);f.scale.y=h+.06;s.obj.add(f);}};
 const streamProps=pos=>{const near=LIMITS.trailPropRadius??R.propLoad;
  for(const s of props){const d=Math.hypot(s.x-pos[0],s.z-pos[2]);
   if(!s.obj&&d<near){s.obj=makeTrailProp(s.kind,toonify);s.obj.position.set(s.x,s.y,s.z);s.obj.rotation.y=s.yaw;s.obj.name=`${s.id} · 즐길거리(추정 위치)`;s.obj.userData.site=s;root.add(s.obj);s.obj.updateMatrixWorld(true);if(s.kind==='bench')addFootings(s);if(s.kind==='gym')sfx.prepareRadio();}
   else if(s.obj&&d>near+80&&active?.site!==s){root.remove(s.obj);s.obj=null;if(s.kind==='gym')sfx.radio(null);}}}; // 모형을 떼면 라디오도 멈춤
 // ── 동물
 const spawns=(landscape.status.interactionProps?.spawns??[]).filter(s=>s.kind==='squirrel'||s.kind==='magpie').map(s=>({id:s.id,kind:s.kind,x:s.x,y:s.y,z:s.z,yaw:s.yaw}));
 const candidates=[...spawns,...(info.cats??[]).map(c=>({id:c.id,kind:'cat',x:c.x,y:c.y,z:c.z,yaw:c.yaw}))];
 const animals=new Map();
 const makeAnimal=c=>{const g=new THREE.Group();g.name=`${c.id} · 동물`;
  const a={...c,home:new V3(c.x,c.y,c.z),pos:new V3(c.x,c.y,c.z),yaw:c.yaw??0,state:'idle',t:0,still:0,g,parts:{}};
  if(c.kind==='squirrel'){const m=makeTrailProp('squirrel',toonify),ac=makeTrailProp('acorn',toonify);ac.position.set(0,.115,.09);m.add(ac);g.add(m);a.parts={m,ac,tail:m.getObjectByName('tail'),head:m.getObjectByName('head')};a.scale=1.25;}
  else if(c.kind==='cat'){const m=makeTrailProp('cat',toonify),b=makeTrailProp('cat-belly',toonify);b.visible=false;g.add(m,b);a.parts={m,b,tail:m.getObjectByName('tail'),head:m.getObjectByName('head'),paw:m.getObjectByName('paw')};a.scale=1.15;}
  else{const m=makeTrailProp('magpie',toonify),f=makeTrailProp('magpie-fly',toonify);f.visible=false;g.add(m,f);a.parts={m,f,wings:[f.getObjectByName('wing-L'),f.getObjectByName('wing-R')],tail:null};a.scale=1.3;a.pos.y+=MAGPIE_FOOT*1.3;}
  g.scale.setScalar(a.scale);g.position.copy(a.pos);g.rotation.y=a.yaw;root.add(g);return a;};
 // ── 말풍선(한 번에 하나, 1.8~2.5초). HUD(z 5~7) 위, 알림(z 32~33) 아래.
 const bubble=typeof document!=='undefined'?(()=>{const st=document.createElement('style');st.textContent=`#trail-bubble{position:fixed;left:0;top:0;z-index:20;transform:translate(-50%,-100%);padding:7px 12px;border-radius:15px;background:#fff;border:2.5px solid #2e2420;color:#2e2420;font:800 clamp(13px,1.6vw,18px)/1.25 'Apple SD Gothic Neo',system-ui,sans-serif;max-width:min(78vw,340px);text-align:center;box-shadow:2px 3px 0 #2e242059;pointer-events:none;opacity:0;transition:opacity .15s}#trail-bubble.on{opacity:1}#trail-bubble::after{content:'';position:absolute;left:50%;bottom:-10px;width:13px;height:13px;background:inherit;border-right:2.5px solid #2e2420;border-bottom:2.5px solid #2e2420;transform:translateX(-50%) rotate(45deg)}#trail-bubble.sfx{background:#ffe066;font-style:italic;border-radius:8px;transform:translate(-50%,-100%) rotate(-6deg)}#trail-bubble.sfx::after{display:none}#trail-bubble.tag{background:#fbf4e4;font-size:clamp(12px,1.3vw,15px);padding:4px 10px}`;document.head.append(st);const e=document.createElement('div');e.id='trail-bubble';e.setAttribute('aria-live','polite');document.body.append(e);return e;})():null;
 let say=null;const V=new V3();
 // 연달아 말할 때도 튀어나오는 움직임이 다시 돌게 클래스를 뺐다가(리플로) 다시 넣는다.
 const sayAt=(text,anchor,{kind='',seconds=2.2}={})=>{say={text,anchor,kind,until:clock+Math.min(2.8,Math.max(1.2,seconds))};if(bubble){bubble.classList.remove('on');void bubble.offsetWidth;bubble.textContent=text;bubble.className=`on ${kind}`.trim();}window.__trailLastSay={text,kind};};
 // 표의 자리 이름으로 말하기. anchor = 동물·소품 위 자리(없으면 동동이 몸의 at 자리). quiet = 다른 말풍선이 떠 있으면 건너뜀.
 const line=(id,anchor=null,{quiet=false}={})=>{if(quiet&&say&&clock<=say.until)return null;const l=pickLine(id);if(!l)return null;sayAt(l.text,anchor??(()=>acts.anchor(l.at)),l);return l;};
 const above=(a,h)=>()=>a.g.getWorldPosition(new V3()).add(new V3(0,h,0));
 const later=[];const after=(sec,fn)=>later.push({at:clock+sec,fn});
 const onSay=e=>{const d=e.detail??{};sayAt(d.text,()=>acts.anchor(d.at),d);};window.addEventListener('hiking:trail-say',onSay);
 const placeBubble=()=>{if(!bubble)return;if(!say||clock>say.until){bubble.classList.remove('on');say=null;return;}const p=say.anchor?.();if(!p)return;V.copy(p).project(camera);
  if(V.z>1||V.z<-1){bubble.classList.remove('on');return;}bubble.classList.add('on');
  // 화면 밖으로 잘리지 않게 안쪽으로 당긴다(말풍선은 HUD 위·알림 아래 층이라 가려지지 않는다).
  const w=bubble.offsetWidth||120,h=bubble.offsetHeight||36,m=8;bubble.style.left=`${MathUtils.clamp((V.x*.5+.5)*innerWidth,w/2+m,innerWidth-w/2-m)}px`;bubble.style.top=`${MathUtils.clamp((-V.y*.5+.5)*innerHeight-4,h+m,innerHeight-m)}px`;};
 // ── 효과음: TRAIL_SFX 표 파일(public/sounds/trail/)을 발소리와 같은 마스터로 낸다. 소리가 꺼져 있으면 아무것도 재생하지 않는다.
 const sfx=sound??{play(){},stop(){},radio(){},prepareRadio(){},snapshot:()=>null};
 // ── 들르기·동작 진행
 let clock=0,active=null,offerAt=null,viewSig='';const offered=new Set();
 const offerItems=()=>[...props.map(s=>({id:s.id,kind:s.kind,x:s.x,z:s.z,r:OFFER_REACH[s.kind]??0})),...[...animals.values()].filter(a=>a.kind==='cat'&&a.state!=='flee'&&a.state!=='gone').map(a=>({id:a.id,kind:'cat',x:a.pos.x,z:a.pos.z}))];
 const offer=item=>{const detail={id:item.id,kind:item.kind,act:OFFER_ACT[item.kind],label:OFFER_LABEL[item.kind],seconds:R.offer};offerAt={...detail,until:clock+R.offer};window.dispatchEvent(new CustomEvent('hiking:trail-offer',{detail}));};
 // 동작 하나를 시작한다: 소품 앞까지 걸어가(approach) → 동작 → (자동걷기였으면) 길로 돌아와 자동걷기를 다시 켠다.
 function play(act,id,{auto:autoAct=true,from=null}={}){
  if(active)return false;const site=props.find(s=>s.id===id)??null,animal=animals.get(id)??null;
  if(!site&&!animal&&act!=='pet-cat')return false;
  if(site&&!site.obj)streamProps([site.x,0,site.z]);
  let frame,target=site?.obj??null;
  if(animal){const to=new V3(animal.pos.x-from[0],0,animal.pos.z-from[2]);if(to.lengthSq()<1e-4)to.set(0,0,1);const yaw=Math.atan2(to.x,to.z);frame=new THREE.Matrix4().compose(new V3(animal.pos.x,height(animal.pos.x,animal.pos.z),animal.pos.z),new THREE.Quaternion().setFromAxisAngle(new V3(0,1,0),yaw),new V3(1,1,1));animal.state='petted';animal.t=0;animal.yaw=yaw+Math.PI;}
  else{target.updateMatrixWorld(true);const child=acts.defs[act].frameChild;frame=(child?target.getObjectByName(child):target).matrixWorld.clone();}
  const spot=acts.spotOf(act,frame),start=new V3(...from),path=[];
  if(spot.approach)path.push(spot.approach);path.push(new V3(spot.x,0,spot.z));
  const wasAuto=auto.get();auto.set(false);
  active={act,id,site,animal,frame,target,spot,start,path,leg:0,pos:start.clone(),heading:null,phase:0,stage:'go',wasAuto,auto:autoAct};return true;}
 function finishWalkBack(){const a=active;active=null;if(a.wasAuto)auto.set(true);window.dispatchEvent(new CustomEvent('hiking:trail',{detail:{type:'done',act:a.act,id:a.id}}));}
 const stepWalk=(dt,a)=>{const tgt=a.path[a.leg];if(!tgt)return true;const d=new V3(tgt.x-a.pos.x,0,tgt.z-a.pos.z),len=d.length(),step=R.walkSpeed*dt;
  if(len<=step){a.pos.set(tgt.x,0,tgt.z);a.leg++;return a.leg>=a.path.length;}d.multiplyScalar(1/len);a.pos.addScaledVector(d,step);a.heading=Math.atan2(-d.x,-d.z);a.phase+=step/.22;return false;};
 const onCommand=e=>{const id=e.detail?.id,val=e.detail?.value;
  if(id==='trail-play'&&val)play(val.act,val.id,{from:lastPos,auto:!val.manual});
  else if(id==='trail-stop'){if(active?.stage==='act')acts.stop();}
  else if(id==='trail-press')acts.press();
  else if(id==='cramp-release'){if(releaseCramp(ex)){say=null;sfx.stop('roll',.1);line('cramp.release');exhaustEvent();}}};
 window.addEventListener('hiking:command',onCommand);
 let lastPos=[0,0,0],lastMoving=false;
 // 동물 행동 ─────────────────────────────────────────────────────────
 const ground=(x,z)=>{const h=height(x,z);return Number.isFinite(h)?h:0;};
 const faceTo=(a,x,z,k)=>{const want=Math.atan2(x-a.pos.x,z-a.pos.z);a.yaw+=wrap(want-a.yaw)*Math.min(1,k);};
 const run=(a,dt,speed,hop=.06)=>{const dx=Math.sin(a.yaw),dz=Math.cos(a.yaw);a.pos.x+=dx*speed*dt;a.pos.z+=dz*speed*dt;a.hopT=(a.hopT??0)+dt*speed*3;a.pos.y=ground(a.pos.x,a.pos.z)+Math.abs(Math.sin(a.hopT))*hop;};
 let ride=null;const forceRide={on:false},goneUntil=new Map(),goneFor=(a,sec)=>{a.state='gone';a.gone=true;goneUntil.set(a.id,clock+sec);};
 function animalStep(a,dt,pos,moving,speed){a.t+=dt;const P=a.parts,dist=Math.hypot(a.pos.x-pos[0],a.pos.z-pos[2]);a.still=moving?0:a.still+dt;
  if(P.tail)P.tail.rotation.x=Math.sin(clock*(a.kind==='cat'?1.6:3.2)+a.home.x)*.18;
  if(a.state==='gone'){a.g.visible=false;return;}
  if(a.kind==='squirrel'){
   if(a.state==='idle'){P.head.rotation.x=Math.sin(clock*7)*.12*(Math.sin(clock*.7+a.home.z)>.3?1:0);if(dist<R.squirrelLook){a.state='look';a.t=0;sfx.play('squeak');line('squirrel.look',above(a,.45),{quiet:true});}}
   else if(a.state==='look'){faceTo(a,pos[0],pos[2],dt*6);P.head.rotation.x=-.25;P.ac.position.y=.13;
    if(dist>R.squirrelLook+1.5){a.state='idle';P.ac.position.y=.115;}
    else if(a.still>R.squirrelHatAfter&&!active&&!acts.active){a.state='climb';a.t=0;a.from=a.pos.clone();line('squirrel.flee',above(a,.45));sfx.play('squeak');}}
   else if(a.state==='climb'){const top=new V3().setFromMatrixPosition(acts.hatTop()),k=Math.min(1,a.t/.9);a.pos.lerpVectors(a.from,top,k).y+=Math.sin(Math.PI*k)*.6;faceTo(a,pos[0],pos[2],1);
    if(k>=1){a.state='hat';a.t=0;line('squirrel.hat',above(a,.4));}
    if(moving){a.state='flee';a.t=0;}}
   else if(a.state==='hat'){const M=acts.hatTop(),p=new V3().setFromMatrixPosition(M);a.pos.copy(p);a.yaw=Math.atan2(M.elements[8],M.elements[10]);acts.headLoad(Math.min(1,a.t*2));
    if(a.t>2.3&&!a.heavy){a.heavy=true;line('squirrel.heavy');}
    if(moving||acts.active){a.state='flee';a.t=0;a.heavy=false;a.yaw+=Math.PI*.7;sfx.play('squeak');line('squirrel.flee',above(a,.45),{quiet:true});}}
   else if(a.state==='flee'){run(a,dt,3.4,.1);if(a.t>2.4){goneFor(a,40);}}
  }else if(a.kind==='cat'){
   if(a.state==='idle'||a.state==='look'){P.head.rotation.y=dist<4?MathUtils.clamp(wrap(Math.atan2(pos[0]-a.pos.x,pos[2]-a.pos.z)-a.yaw),-.9,.9):Math.sin(clock*.4)*.4;a.state=dist<4?'look':'idle';if(a.state==='look'&&!a.mewed){a.mewed=true;sfx.play('meow');}if(dist>8)a.mewed=false;a.pos.y=ground(a.pos.x,a.pos.z);}
   else if(a.state==='petted'){const t=acts.active?.name==='pet-cat'?acts.active.t:0;P.m.visible=t<.4||t>3.05;P.b.visible=!P.m.visible;
    if(t>.5&&!a.purred){a.purred=true;line('cat.pet',above(a,.5));}
    if(t>3.05&&P.paw){P.paw.rotation.x=-1.2*Math.sin(Math.PI*Math.min(1,(t-3.05)/.25));if(!a.punch){a.punch=true;sfx.play('meow');line('cat.punch',above(a,.45));}}
    if(t>3.4){a.state='flee';a.t=0;a.purred=a.punch=false;P.paw&&(P.paw.rotation.x=0);a.yaw+=Math.PI;}}
   else if(a.state==='bench'){const M=a.benchFrame;a.pos.copy(new V3(.62,BENCH.seatY,.02).applyMatrix4(M));a.yaw=Math.atan2(M.elements[8],M.elements[10])-.4;P.head.rotation.y=Math.sin(clock*.5)*.3;
    if(acts.active?.name!=='bench-sit'){a.leaveAt??=clock+2;if(clock>a.leaveAt){a.state='flee';a.t=0;a.leaveAt=null;}}}
   else if(a.state==='to-bench'){const M=a.benchFrame,seat=new V3(.62,BENCH.seatY,.02).applyMatrix4(M),k=Math.min(1,a.t/1.6);a.pos.lerpVectors(a.from,seat,k).y+=Math.sin(Math.PI*k)*.35;faceTo(a,seat.x,seat.z,1);if(k>=1){a.state='bench';sfx.play('meow');line('bench.cat',above(a,.45));}}
   else if(a.state==='flee'){run(a,dt,2.6,.03);if(a.t>2.6){goneFor(a,60);}}
  }else{ // 까치
   const fly=a.state==='fly'||a.state==='to-pack'||a.state==='leave';P.m.visible=!fly;P.f.visible=fly;
   if(P.f.visible)P.wings.forEach((w,i)=>{w.rotation.z=(i?-1:1)*(.55+Math.sin(clock*(a.state==='ride'?4:16))*.6);});
   if(a.state==='idle'){if(Math.sin(clock*1.3+a.home.x)>.85)a.g.rotation.x=.4;else a.g.rotation.x=0;a.pos.y=ground(a.pos.x,a.pos.z)+MAGPIE_FOOT*a.scale;
    if(dist<R.magpieFlee){a.state='fly';a.t=0;a.center=a.home.clone();sfx.play('caw');line('magpie.fly',above(a,.3),{quiet:true});
     if((forceRide.on||Math.random()<.35)&&clock>(ride?.cool??0)){a.state='to-pack';forceRide.on=false;a.from=a.pos.clone();}}}
   else if(a.state==='fly'){a.g.rotation.x=0;const ang=a.t*.7+a.home.z,r=5;a.pos.set(a.center.x+Math.cos(ang)*r,ground(a.center.x,a.center.z)+4+Math.sin(a.t)*.5,a.center.z+Math.sin(ang)*r);a.yaw=ang+Math.PI;
    if(a.t>7&&dist>R.magpieFlee+2){a.state='land';a.t=0;a.from=a.pos.clone();}}
   else if(a.state==='land'){const k=Math.min(1,a.t/1.4),to=a.home.clone();to.y=ground(to.x,to.z)+MAGPIE_FOOT*a.scale;a.pos.lerpVectors(a.from,to,k);faceTo(a,to.x,to.z,1);if(k>=1)a.state='idle';}
   else if(a.state==='to-pack'){const M=acts.packTop(),to=new V3().setFromMatrixPosition(M),k=Math.min(1,a.t/1.4);a.pos.lerpVectors(a.from,to,k).y+=Math.sin(Math.PI*k)*.8;faceTo(a,to.x,to.z,1);
    if(k>=1){a.state='ride';a.t=0;ride={id:a.id,cool:clock+90};sfx.play('caw');line('magpie.ride',above(a,.3));after(2,()=>{if(a.state==='ride')line('magpie.rider');});window.dispatchEvent(new CustomEvent('hiking:trail',{detail:{type:'magpie-ride',id:a.id}}));}}
   else if(a.state==='ride'){const M=acts.packTop();a.pos.setFromMatrixPosition(M);a.yaw=Math.atan2(M.elements[8],M.elements[10])+Math.PI;
    if(a.t>R.magpieRide||acts.active){a.state='leave';a.t=0;a.from=a.pos.clone();sfx.play('caw');}}
   else if(a.state==='leave'){a.pos.y+=dt*2.2;a.pos.x+=Math.sin(a.yaw)*dt*4;a.pos.z+=Math.cos(a.yaw)*dt*4;if(a.t>3){goneFor(a,50);}}
  }
  a.g.position.copy(a.pos);a.g.rotation.y=a.yaw;a.g.scale.setScalar(a.state==='hat'||a.state==='bench'||a.state==='to-bench'||a.state==='petted'?1:a.scale);
 }
 // ⑥ 헥헥·쥐 상태(규칙은 src/exhaustion.js)
 const ex=createExhaustion();let wasExhausted=false,zapSound=0,lastLabel=null,prevPhase='none',rollAt=0;
 // 쥐: 나는 순간 비명 한 번, 뒹구는 동안 1.5초마다 쓸림(발끝 당기기·끝나면 0.1초 페이드로 멈춤)
 const exhaustEvent=()=>{if(ex.phase==='cramp'&&prevPhase!=='cramp'){sfx.play('scream');rollAt=clock+.45;}if(prevPhase==='cramp'&&ex.phase!=='cramp')sfx.stop('roll',.1);prevPhase=ex.phase;lastLabel=crampLabel(ex);window.dispatchEvent(new CustomEvent('hiking:trail',{detail:{type:'exhaust',phase:ex.phase,left:+ex.left.toFixed(2),label:lastLabel,release:ex.phase==='cramp'&&!ex.released}}));};
 function stepRunner(dt,runner){
  if(runner){const now=!!runner.exhausted;
   if(now&&!wasExhausted&&!active&&!(acts.active&&!acts.defs[acts.active.name].free)){const kind=onRunExhausted(ex,{uphill:runner.uphill??0,now:clock,auto:!!runner.auto});
    if(kind){acts.start(kind,{frame:acts.bodyFrame(),groundY:ground,auto:false});exhaustEvent();}}
   wasExhausted=now;}
  const ended=stepExhaustion(ex,dt,{runExhausted:!!runner?.exhausted});
  if(ended){if(acts.active?.name===ended)acts.stop();exhaustEvent();}else if(crampLabel(ex)!==lastLabel)exhaustEvent();
  if(ex.phase==='cramp'&&!ex.released&&clock>=rollAt){rollAt=clock+1.5;sfx.play('roll');}
  acts.setTrudge(ex.trudge);}
 const nearSquirrel=()=>[...animals.values()].find(a=>a.kind==='squirrel'&&!a.gone&&a.state!=='flee'&&a.pos.distanceTo(new V3(...lastPos))<8);
 const onTrail=e=>{const d=e.detail;if(d?.type==='pant'||d?.type==='pant-breath')sfx.play('pant');if(d?.type==='cramp-zap'&&clock-zapSound>.5){zapSound=clock;sfx.play('zap');}
  if(d?.type==='airgun-blast')sfx.play('airgun');
  if(d?.type==='choco-eaten'){sfx.play('crunch');const sq=nearSquirrel();if(sq)after(1.9,()=>{if(!sq.gone)line('choco.squirrel',above(sq,.4));});}
  if(d?.type==='bench-sit')sfx.play('whoo');
 if(d?.type==='bench-sit'&&(d.forceCat||Math.random()<R.benchCat)){const site=props.find(s=>s.id===d.id);if(site?.obj)catToBench(site.obj.matrixWorld.clone());}};window.addEventListener('hiking:trail',onTrail);
 function catToBench(M){let cat=[...animals.values()].find(a=>a.kind==='cat'&&a.state!=='gone');
  if(!cat){const p=new V3(2.6,0,1.4).applyMatrix4(M);const c={id:'cat-bench',kind:'cat',x:p.x,y:ground(p.x,p.z),z:p.z,yaw:0};
   // 3마리 상한: 가장 먼 동물을 내보낸다
   if(animals.size>=(LIMITS.trailAnimals??3)){const far=[...animals.values()].sort((a,b)=>b.pos.distanceTo(new V3(...lastPos))-a.pos.distanceTo(new V3(...lastPos)))[0];root.remove(far.g);animals.delete(far.id);}
   cat=makeAnimal(c);animals.set(c.id,cat);cat.temp=true;}
  cat.state='to-bench';cat.t=0;cat.from=cat.pos.clone();cat.benchFrame=M;}
 // 라디오: 산스장 18m 안에서 뽕짝(가까울수록 크게, 자동걷기로 지나갈 때도). 들어설 때 한 번 '♪ 뽕짝 ♪' 말풍선(다른 말풍선이 없을 때).
 let radioIn=false;
 function stepRadio(pos){const gym=props.find(s=>s.kind==='gym'),d=gym?.obj?Math.hypot(gym.x-pos[0],gym.z-pos[2]):null;sfx.radio(d);
  const near=TRAIL_SFX.radio.near;if(d!=null&&d<near&&!radioIn){radioIn=true;const r=gym.obj.getObjectByName('radio');if(r)line('gym-radio',()=>r.getWorldPosition(new V3()).add(new V3(0,.45,0)),{quiet:true});}
  else if(d==null||d>near+6)radioIn=false;}
 // ── main.js 연결
 const api={
  acts,props,animals,
  // 들른 동안 등산객 루트 자리. null이면 평소대로.
  override(){const a=active;if(!a)return null;
   const y=a.stage==='act'?ground(a.spot.x,a.spot.z):ground(a.pos.x,a.pos.z);
   return {position:[a.pos.x,y,a.pos.z],heading:a.heading??a.spot.heading,snap:a.stage==='act',moving:a.stage==='go'||a.stage==='back',phase:a.phase,busy:true};},
  busy:()=>!!active||(acts.active&&!acts.defs[acts.active.name].free),
  // 앉기 버튼: 벤치 2m 안이면 벤치에 앉는다(true를 돌려주면 main은 땅에 앉지 않는다). 앉아 있으면 일어난다.
  benchSit(pos=lastPos){if(acts.active?.name==='bench-sit'){acts.stop();return true;}if(active)return false;
   const b=props.filter(s=>s.kind==='bench'&&s.obj).map(s=>{const f=new THREE.Matrix4().compose(new V3(s.x,s.y,s.z),new THREE.Quaternion().setFromAxisAngle(new V3(0,1,0),s.yaw),new V3(1,1,1));const p=acts.spotOf('bench-sit',f);return {s,d:Math.hypot(p.x-pos[0],p.z-pos[2])};}).sort((a,b)=>a.d-b.d)[0];
   if(!b||b.d>R.benchSit)return false;return play('bench-sit',b.s.id,{from:pos,auto:false});},
  play:(act,id,o={})=>play(act,id,{from:lastPos,...o}),
  stop:()=>{if(active?.stage==='act')acts.stop();},
  // 검수용: 들르기·동작을 바로 그만둔다(제자리)
  reset(){acts.cancel();if(active?.wasAuto)auto.set(true);active=null;},
  update(dt,{position,moving=false,speed=0,input=false,runner=null}){clock+=dt;lastPos=position;lastMoving=moving;
   stepRunner(dt,runner);
   streamProps(position);
   for(let i=later.length-1;i>=0;i--)if(clock>=later[i].at){const f=later[i].fn;later.splice(i,1);f();}
   stepRadio(position);
   // 동물: 가까운 3마리
   const keep=new Set(pickAnimals(position,candidates.map(c=>({...c,gone:(goneUntil.get(c.id)??0)>clock})),animals));
   for(const [id,a] of animals){if(!keep.has(id)&&!a.temp&&a.state!=='hat'&&a.state!=='ride'&&a.state!=='bench'){root.remove(a.g);animals.delete(id);}}
   for(const id of keep)if(!animals.has(id)&&animals.size<(LIMITS.trailAnimals??3)){const c=candidates.find(x=>x.id===id);animals.set(id,makeAnimal(c));}
   for(const a of animals.values())animalStep(a,dt,position,moving||!!(active&&active.stage!=='act'),speed);
   for(const [id,a] of animals)if(a.temp&&a.gone){root.remove(a.g);animals.delete(id);}
   // 들르기 진행
   if(active){const a=active;
    if(input&&a.stage!=='back'){acts.cancel();a.stage='back';a.path=[a.start.clone()];a.leg=0;}
    if(a.stage==='go'){if(stepWalk(dt,a)){a.stage='turn';a.t=0;}}
    else if(a.stage==='turn'){a.t+=dt;a.heading=a.spot.heading;if(a.t>.25){a.stage='act';acts.start(a.act,{frame:a.frame,target:a.target,id:a.id,auto:a.auto,groundY:ground,local:a.act==='pet-cat'?[0,0,-.5]:[0,0,0]});}}
    else if(a.stage==='act'){a.heading=a.spot.heading;if(!acts.active){a.stage='back';a.path=[a.start.clone()];a.leg=0;}} // 직접 누른 동작도 끝나면 서 있던 길로 걸어 돌아간다(제자리로 순간 이동하지 않게)
    else if(a.stage==='back'){if(stepWalk(dt,a))finishWalkBack();}}
   // 들르기 제안(자동걷기 중·평소 모두, 한 번 지나갈 때 한 번)
   // 들르기 제안은 자동걷기 중에만(한 번 지나갈 때 한 번). 직접 걸을 때는 즐길거리 줄에 오브젝트 버튼(near)이 뜬다.
   const items=offerItems();
   if(!active&&!acts.active&&auto.get()){const o=nearestOffer(position,items,offered);if(o){offered.add(o.id);offer(o);}}
   if(offerAt&&(clock>offerAt.until||!auto.get()||active))offerAt=null;
   let near=null;if(!active)for(const it of items){const d=Math.hypot(it.x-position[0],it.z-position[2])-(it.r??0);if(d<=R.dropIn&&TRAIL_BUTTONS[it.kind]&&(!near||d<near.d))near={id:it.id,kind:it.kind,d};}
   const ac=acts.active,view={near:near&&{id:near.id,kind:near.kind},act:ac&&{name:ac.name,state:ac.state,reps:ac.reps??0,of:10,done:!!ac.done},stage:active?.stage??null,offer:offerAt&&{id:offerAt.id,kind:offerAt.kind,act:offerAt.act,label:offerAt.label,seconds:offerAt.seconds},auto:auto.get(),busy:!!active||!!(ac&&!acts.defs[ac.name].free)};
   const sig=JSON.stringify(view);if(sig!==viewSig){viewSig=sig;window.dispatchEvent(new CustomEvent('hiking:trail-view',{detail:view}));}
  },
  // ground() 뒤
  afterGround(dt,{moving=false}={}){acts.apply(dt,{moving});placeBubble();}, // 말풍선은 동작 자세가 정해진 뒤에 자리를 잡는다
  // ⑥ 1인칭 시야 낮춤(m), 상태, 검수용 강제 발생
  get eyeDrop(){return ex.eye;},exhaustion:()=>({...ex}),
  exhaust(kind='pant'){if(active||acts.active)return false;if(kind==='cramp')ex.crampAt=-Infinity;const k=onRunExhausted(ex,{uphill:kind==='cramp'?1:0,now:clock,random:kind==='cramp'?0:1});if(!k)return false;wasExhausted=true;acts.start(k,{frame:acts.bodyFrame(),groundY:ground,auto:false});exhaustEvent();return k;},
  offer:()=>offerAt&&{...offerAt,left:+(offerAt.until-clock).toFixed(2)},
  magpieRide(){forceRide.on=true;const m=[...animals.values()].find(a=>a.kind==='magpie'&&a.state==='idle');if(m){m.state='to-pack';m.t=0;m.from=m.pos.clone();forceRide.on=false;return true;}return false;},
  squirrelHat(){const s=[...animals.values()].find(a=>a.kind==='squirrel'&&a.state!=='gone');if(!s)return false;s.state='climb';s.t=0;s.from=s.pos.clone();return true;},
  catToBench(){const s=props.find(p=>p.kind==='bench'&&p.obj&&acts.active?.id===p.id);if(!s)return false;catToBench(s.obj.matrixWorld.clone());return true;},
  status(){return {sites:props.map(s=>({id:s.id,kind:s.kind,x:+s.x.toFixed(2),y:+s.y.toFixed(2),z:+s.z.toFixed(2),slope:+s.slope.toFixed(3),m:s.routeMetres,loaded:!!s.obj})),
   animals:[...animals.values()].map(a=>({id:a.id,kind:a.kind,state:a.state,x:+a.pos.x.toFixed(2),z:+a.pos.z.toFixed(2)})),active:active&&{act:active.act,id:active.id,stage:active.stage},exhaustion:{phase:ex.phase,left:+ex.left.toFixed(2),trudge:ex.trudge,eye:+ex.eye.toFixed(3),label:crampLabel(ex)},acts:acts.status(),offer:api.offer(),bubble:say&&{text:say.text,kind:say.kind},sound:sfx.snapshot?.()??null};},
  dispose(){window.removeEventListener('hiking:trail-say',onSay);window.removeEventListener('hiking:command',onCommand);window.removeEventListener('hiking:trail',onTrail);sfx.radio(null);scene.remove(root,fxRoot);bubble?.remove();},
 };
 return api;
}
export {ACT_LABEL};
