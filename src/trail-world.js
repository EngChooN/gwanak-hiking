// 자동걷기 즐길거리 실행(2026-11-06): 산스장·벤치·먼지털이기 모형을 가까이 갈 때만 만들고, 동물(다람쥐·산고양이·까치·멧토끼)을 최대 3마리 움직이며,
// 들르기(근처 6m) 제안 이벤트를 보내고, 들르면 그 자리로 걸어가 동작(src/toon/hiker-acts.js)을 한 뒤 원래 자리로 돌아와 자동걷기를 잇는다.
// HUD와는 window 이벤트로만 주고받는다:
//  보냄  hiking:trail-offer {id,kind,act,label,seconds}  들르기 버튼(4초)을 띄울 때, hiking:trail {type,…} 동작 진행·끝, hiking:trail-say 말풍선
//        hiking:trail-view {near,act,stage,offer,auto,busy} 즐길거리 줄(src/trail-hud.js)용 요약(바뀔 때만)
//        hiking:trail-chip {id,x,y,w}|null  상호작용 칩을 붙일 대상 위 점의 클립 좌표(매 프레임, src/trail-chip.js chipScreen으로 화면 자리)
//  받음  hiking:command {id:'trail-play',value:{act,id,manual}} · {id:'trail-stop'} · {id:'trail-press'}(역기 연타) · {id:'chocolate'} · {id:'cramp-release'}(🦶 발끝 당기기)
//  ⑥ 헥헥·쥐: main이 update(…,{runner:{exhausted,auto,uphill}})로 스테미너 0 순간을 넘기면 src/exhaustion.js 규칙대로 동작하고,
//        hiking:trail {type:'exhaust',phase:'pant'|'cramp'|'none',left,label:'쥐 0:02'|null,release:버튼을 띄울지}를 보낸다. 1인칭 시야는 eyeDrop(0~0.3m).
// 소리: main이 넘긴 sound(src/trail-sound.js, 발소리와 같은 마스터·켜기/끄기)로만 낸다. 문구는 src/trail-lines.js의 pickLine(자리).
// 동물(2026-11-07): 고정 자리 대신 출현 구역(interaction-data.js ANIMAL_ZONES)에서 5분 칸마다 결정적 난수로 자리·종류를 정하고(src/animal-zones.js),
//  평소에는 그 배회 계획(시간의 함수)을 따라 움직인다. 같은 방 사람은 같은 동물을 본다. 다가갔을 때 반응은 이 화면에서 정한다.
//  함께 걷기(2026-11-08): 출현 동물이 놀라 달아나면 hiking:animal-startle {zone,slot,i,kind,at,x,z}를 보내고(multi-client.js가 서버로 중계),
//  hiking:animal-remote로 받은 것은 같은 동물(구역·시간 칸·칸 번호가 같은 것)이 같은 반응을 한다. 보이지 않는 거리면 같은 시간 동안 나오지 않는다.
//  출현 목록·배회 계획(결정적 난수)은 건드리지 않는다.
// main.js는 override()가 돌려준 자리로 등산객을 두고(걷는 동안 clip 'Walk'), ground() 뒤 update()를, 카메라를 놓은 뒤 afterCamera()를 부른다.
import * as THREE from 'three';
import {makeTrailProp,trailPropTemplate,BENCH,MAGPIE_FOOT} from './toon/trail-props.js';
import {createHikerActs,ACT_LABEL} from './toon/hiker-acts.js';
import {TRAIL_RULES as R} from './interaction-data.js';
import {LIMITS} from './device-profile.js';
import {TRAIL_BUTTONS} from './trail-rules.js';
import {pickChipTarget} from './trail-chip.js';
import {createExhaustion,onRunExhausted,stepExhaustion,releaseCramp,crampLabel} from './exhaustion.js';
import {pickLine,TRAIL_SFX} from './trail-lines.js';
import {ANIMAL_STYLE} from './interaction-data.js';
import {zoneSpawns,wanderAt,slotOf} from './animal-zones.js';
import {laneLimit} from './animal-lanes.js';
import {routeMeasure} from '../assets/realistic/interaction-sites.js';

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

// env() = {season,hour}(출현 가중용, 시간 칸이 바뀔 때만 읽음), now() = 배회 시계(ms, 기본 Date.now — 여러 컴퓨터가 같은 값을 쓰도록 실제 시계).
export function createTrailWorld({scene,camera,hiker,landscape,toonify,auto,sound=null,env=()=>({}),now=()=>Date.now()}){
 const height=(x,z)=>landscape.surfaceHeight(x,z),info=landscape.status.trailProps??{sites:[],zones:[]};
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
 // ── 동물: 구역 → 이번 시간 칸의 출현 목록(spawns) → 가까운 3마리만 모형. 배회 좌표 (u,v)는 toWorld로 월드 자리가 된다.
 const zones=info.zones??[],zoneById=new Map(zones.map(z=>[z.id,z])),measure=landscape.route?.length?routeMeasure(landscape.route):null;
 const halfWidth=m=>measure?measure.at(m).width/2:1.1;
 const toWorld=(zone,u,v,out=new V3())=>{if(zone.frame){const f=zone.frame,c=Math.cos(f.yaw),s=Math.sin(f.yaw);return out.set(f.x+u*c+v*s,0,f.z-u*s+v*c);}const p=measure.at(u);return out.set(p.x-p.tz*v,0,p.z+p.tx*v);};
 // 허용 폭·금지 원 확인(animal-zones.js spotOk)에 쓰는 월드 자리. 표본마다 새 벡터를 만들지 않게 하나를 돌려 쓴다.
 const LW=new V3(),laneWorld=(zone,u,v)=>toWorld(zone,u,v,LW);
 const usable=zones.filter(z=>z.frame||measure);
 let slot=null,spawns=[];
 function refreshSpawns(sec){const sl=slotOf(sec,R.animalSlot);if(sl===slot)return;slot=sl;const e=env()??{};
  spawns=usable.flatMap(z=>zoneSpawns(z,sl,{season:e.season,hour:e.hour,halfWidth,toWorld:laneWorld,slotSeconds:R.animalSlot,salt:e.salt??''}));
  for(const sp of spawns){const p=toWorld(zoneById.get(sp.zone),sp.u,sp.v);sp.x=p.x;sp.z=p.z;}}
 const plan=(a,sec)=>wanderAt(a.spawn,sec,zoneById.get(a.spawn.zone),halfWidth,laneWorld);
 const animals=new Map(),SCALE={squirrel:1.25,cat:1.15,magpie:1.3,hare:1.35}; // 토끼 1.35배 = 몸길이 약 0.5m(멧토끼 크기). 1.15배는 가을 풀에 묻혀 안 보였다
 // c = 출현 목록 한 줄(spawn) 또는 임시 동물(벤치 고양이: x·y·z·state). 출현 동물은 지금 시각의 배회 자리에서 시작한다.
 const makeAnimal=c=>{const g=new THREE.Group();g.name=`${c.id} · 동물`;g.rotation.order='YXZ';
  const a={id:c.id,kind:c.kind,spawn:c.u!=null?c:null,pos:new V3(c.x,c.y??0,c.z),yaw:c.yaw??0,state:c.state??'wander',t:0,still:0,g,parts:{},phase:((c.seed??0)%628)/100,scale:SCALE[c.kind]};
  if(c.kind==='squirrel'){const m=makeTrailProp('squirrel',toonify),ac=makeTrailProp('acorn',toonify);ac.position.set(0,.115,.09);m.add(ac);g.add(m);a.parts={m,ac,tail:m.getObjectByName('tail'),head:m.getObjectByName('head')};}
  else if(c.kind==='cat'){const m=makeTrailProp('cat',toonify),b=makeTrailProp('cat-belly',toonify);b.visible=false;g.add(m,b);a.parts={m,b,tail:m.getObjectByName('tail'),head:m.getObjectByName('head'),paw:m.getObjectByName('paw')};}
  else if(c.kind==='hare'){const m=makeTrailProp('hare',toonify),n=k=>m.getObjectByName(k);g.add(m);a.parts={m,body:n('body'),head:n('head'),ears:n('ears'),earL:n('ear-L'),earR:n('ear-R'),legF:n('leg-F'),legH:n('leg-H'),puff:n('tail'),tail:null};a.parts.earX=a.parts.earL.rotation.x;}
  else{const m=makeTrailProp('magpie',toonify),f=makeTrailProp('magpie-fly',toonify);f.visible=false;g.add(m,f);a.parts={m,f,wings:[f.getObjectByName('wing-L'),f.getObjectByName('wing-R')],sitWings:[m.getObjectByName('wing-L'),m.getObjectByName('wing-R')].map(w=>({w,z:w.rotation.z})),tail:null};}
  if(a.spawn&&a.state==='wander'){const w=plan(a,now()/1000),p=toWorld(zoneById.get(a.spawn.zone),w.u,w.v,a.pos);p.y=ground(p.x,p.z)+(c.kind==='magpie'?MAGPIE_FOOT*a.scale:0);if(w.du||w.dv){const q=toWorld(zoneById.get(a.spawn.zone),w.u+w.du*.01,w.v+w.dv*.01);a.yaw=Math.atan2(q.x-p.x,q.z-p.z);}else a.yaw=(c.seed??0)%7;}
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
 // ── 상호작용 칩 자리: 대상 위 점(고양이 머리 위·소품 꼭대기 위·산스장은 기구 위)을 이번 카메라로 투영해 보낸다.
 let chipNear=null,chipTarget=null,chipSent=false;const C4=new THREE.Vector4(),CA=new V3();
 // 산스장 기구별 서는 자리(가장 가까운 기구 고르기)와 칩 자리(기구 위 1.9m). 모형을 만든 뒤 한 번만 잰다.
 const gymSpots=s=>s.gymSpots??=TRAIL_BUTTONS.gym.map(b=>{const child=acts.defs[b.act]?.frameChild,o=(child&&s.obj.getObjectByName(child))||s.obj,sp=acts.spotOf(b.act,o.matrixWorld),w=o.getWorldPosition(new V3());return {act:b.act,x:sp.x,z:sp.z,anchor:new V3(w.x,s.y+1.9,w.z)};});
 const nearestGymAct=(id,pos,prev)=>{const s=props.find(p=>p.id===id);if(!s?.obj)return prev??TRAIL_BUTTONS.gym[0].act;let best=null,cur=null;
  for(const g of gymSpots(s)){const d=Math.hypot(g.x-pos[0],g.z-pos[2]);if(g.act===prev)cur={g,d};if(!best||d<best.d)best={g,d};}
  return (cur&&best.d>cur.d-.4?cur:best).g.act;};
 const chipAnchor=(t,out)=>{if(t.kind==='cat'){const a=animals.get(t.id);return a&&!a.gone?out.set(a.pos.x,a.pos.y+.62,a.pos.z):null;}
  const s=props.find(p=>p.id===t.id);if(!s?.obj)return null;
  if(t.kind==='gym'&&t.act){const g=gymSpots(s).find(q=>q.act===t.act);if(g)return out.copy(g.anchor);}
  const b=s.box??=new THREE.Box3().setFromObject(s.obj);return out.set((b.min.x+b.max.x)/2,b.max.y+.2,(b.min.z+b.max.z)/2);};
 const placeChip=()=>{const t=chipTarget,p=t&&chipAnchor(t,CA);
  if(!p){if(chipSent){chipSent=false;window.dispatchEvent(new CustomEvent('hiking:trail-chip',{detail:null}));}return;}
  camera.updateMatrixWorld();C4.set(p.x,p.y,p.z,1).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
  chipSent=true;window.dispatchEvent(new CustomEvent('hiking:trail-chip',{detail:{id:t.id,x:C4.x,y:C4.y,w:C4.w}}));};
 // ── 들르기·동작 진행
 let clock=0,active=null,offerAt=null,viewSig='';const offered=new Set();
 const offerItems=()=>[...props.map(s=>({id:s.id,kind:s.kind,x:s.x,z:s.z,r:OFFER_REACH[s.kind]??0})),...[...animals.values()].filter(a=>a.kind==='cat'&&a.state!=='flee'&&a.state!=='gone').map(a=>({id:a.id,kind:'cat',x:a.pos.x,z:a.pos.z}))];
 const offer=item=>{const detail={id:item.id,kind:item.kind,act:OFFER_ACT[item.kind],label:OFFER_LABEL[item.kind],seconds:R.offer};offerAt={...detail,until:clock+R.offer};window.dispatchEvent(new CustomEvent('hiking:trail-offer',{detail}));};
 // 동작 하나를 시작한다: 소품 앞까지 걸어가(approach) → 동작 → (자동걷기였으면) 길로 돌아와 자동걷기를 다시 켠다.
 function play(act,id,{auto:autoAct=true,from=null}={}){
  if(active)return false;const site=props.find(s=>s.id===id)??null,animal=animals.get(id)??null;
  if(!site&&!animal)return false; // 고양이가 이미 떠났거나(배회·달아남) 없는 id면 아무것도 하지 않는다
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
 // state 'wander' = 출현 구역의 배회 계획을 따름(모든 화면에서 같음). 그 밖의 상태는 이 화면에서만 일어나는 반응이다.
 const ground=(x,z)=>{const h=height(x,z);return Number.isFinite(h)?h:0;};
 const faceTo=(a,x,z,k)=>{const want=Math.atan2(x-a.pos.x,z-a.pos.z);a.yaw+=wrap(want-a.yaw)*Math.min(1,k);};
 const run=(a,dt,speed,hop=.06)=>{const dx=Math.sin(a.yaw),dz=Math.cos(a.yaw);a.pos.x+=dx*speed*dt;a.pos.z+=dz*speed*dt;a.hopT=(a.hopT??0)+dt*speed*3;a.pos.y=ground(a.pos.x,a.pos.z)+Math.abs(Math.sin(a.hopT))*hop;};
 let ride=null;const forceRide={on:false},goneUntil=new Map(),goneFor=(a,sec)=>{a.state='gone';a.gone=true;goneUntil.set(a.id,clock+sec);};
 // 함께 걷기 중계: 이 화면에서 출현 동물이 놀라 달아난 순간 알린다(임시 동물·검수용으로 부른 동물은 빼고). 받은 반응은 다시 알리지 않는다.
 const startle=a=>{const n=/#(\d+)$/.exec(a.id);if(!a.spawn||!n||a.remote)return;
  window.dispatchEvent(new CustomEvent('hiking:animal-startle',{detail:{zone:a.spawn.zone,slot:a.spawn.slot,i:+n[1],kind:a.kind,at:now(),x:+lastPos[0].toFixed(2),z:+lastPos[2].toFixed(2)}}));};
 const GONE={squirrel:40,cat:60,hare:ANIMAL_STYLE.hare.gone};
 const remoteLog=[];
 // 다른 사람 화면에서 달아난 동물: 여기서도 그 동물이면 같은 반응(달아나는 방향은 그 사람 자리 반대쪽, 늦게 받은 만큼 앞당김), 없으면 같은 시간 동안 나오지 않게.
 const onRemote=e=>{const d=e.detail;if(!d||typeof d.zone!=='string')return;const id=`${d.zone}@${d.slot}#${d.i}`,a=animals.get(id),lag=MathUtils.clamp((now()-(d.at??now()))/1000,0,.5);
  remoteLog.push({id,kind:d.kind,at:clock,seen:!!a,state:a?.state??null});if(remoteLog.length>20)remoteLog.shift();
  if(!a){if(GONE[d.kind])goneUntil.set(id,Math.max(goneUntil.get(id)??0,clock+GONE[d.kind]));return;}
  if(a.kind!==d.kind||!['wander','look','alert','wary','return'].includes(a.state))return;
  const away=Number.isFinite(d.x)&&Number.isFinite(d.z)?Math.atan2(a.pos.x-d.x,a.pos.z-d.z):a.yaw+Math.PI;a.remote=true;a.t=lag;
  if(a.kind==='magpie'){a.state='fly';a.center=a.pos.clone();sfx.play('caw');}
  else{a.state='flee';a.yaw=away;sfx.play(a.kind==='hare'?'rustle':a.kind==='cat'?'meow':'squeak');}};
 window.addEventListener('hiking:animal-remote',onRemote);
 // 반응이 끝나 배회로 돌아갈 때는 계획 자리까지 걸어서 따라잡는다(순간 이동하지 않게). 속도 m/s.
 const CATCH_UP={squirrel:2.6,cat:.8,magpie:1.1,hare:2};
 const TW=new V3(),TQ=new V3();
 const follow=(a,dt,sec)=>{const w=plan(a,sec),z=zoneById.get(a.spawn.zone),T=toWorld(z,w.u,w.v,TW),foot=a.kind==='magpie'?MAGPIE_FOOT*a.scale:0;T.y=ground(T.x,T.z)+foot+w.h;
  const dx=T.x-a.pos.x,dz=T.z-a.pos.z,d=Math.hypot(dx,dz);a.moved=0;
  if(a.blend){const step=CATCH_UP[a.kind]*dt;if(d>Math.max(.15,step)){a.pos.x+=dx/d*step;a.pos.z+=dz/d*step;a.pos.y=ground(a.pos.x,a.pos.z)+foot;a.yaw+=wrap(Math.atan2(dx,dz)-a.yaw)*Math.min(1,dt*8);a.moved=step;
    return {...w,h:0,mode:{squirrel:'run',cat:'prowl',magpie:'walk',hare:'hop'}[a.kind],k:(a.t*2)%1,hops:1};}a.blend=false;}
  if(d>.002&&d<2.5){a.yaw+=wrap(Math.atan2(dx,dz)-a.yaw)*Math.min(1,dt*10);a.moved=d;}
  if(w.mode==='climb'||w.mode==='hidden'||w.mode==='fly')a.moved=0;a.pos.copy(T);return w;};
 // 다람쥐 나무 타기: 6m 안 나무 밑동으로 뛰어가 줄기를 타고 올라 사라진다. 나무를 못 찾으면 길 바깥 덤불로 뛰어들어 사라진다.
 const climbTree=(a,w)=>{const z=zoneById.get(a.spawn.zone);
  if(a.climbLeg!==w.leg){a.climbLeg=w.leg;const from=a.pos.clone(),tr=landscape.treeNear?.(from.x,from.z,6);
   if(tr){const d=Math.hypot(tr.x-from.x,tr.z-from.z)||1,base=new V3(tr.x+(from.x-tr.x)/d*.32,0,tr.z+(from.z-tr.z)/d*.32);a.climb={from,base,tree:new V3(tr.x,0,tr.z)};}
   else{const out=z.frame?from.clone().add(new V3(Math.sin(a.yaw)*1.5,0,Math.cos(a.yaw)*1.5)):toWorld(z,w.u,w.v+Math.sign(w.v||1)*1.6);a.climb={from,base:out,tree:null};}}
  const c=a.climb,k=w.k,k1=Math.min(1,k/.35);a.pos.lerpVectors(c.from,c.base,k1);
  if(c.tree){faceTo(a,c.tree.x,c.tree.z,1);const up=Math.max(0,(k-.35)/.65);a.pos.y=ground(c.base.x,c.base.z)+up*2.4+(up?0:Math.abs(Math.sin(k1*Math.PI*3))*.06);a.pitch=-Math.PI/2*Math.min(1,up*8);a.shrink=1;}
  else{faceTo(a,c.base.x,c.base.z,1);a.pos.y=ground(a.pos.x,a.pos.z)+Math.abs(Math.sin(k1*Math.PI*3))*.06;a.shrink=k<.35?1:Math.max(0,1-(k-.35)/.3);}};
 // 토끼 자세(산디자인 §1-2): mode = graze·look·hop·alert·flee·return·wary-graze
 const harePose=(a,mode,k=0,hops=1)=>{const P=a.parts,ear=x=>{P.earL.rotation.x=P.earR.rotation.x=x;};
  P.body.rotation.x=0;P.body.position.y=.17;P.body.scale.y=1;P.legF.rotation.x=P.legH.rotation.x=0;P.head.rotation.set(0,0,0);P.puff.position.y=0;
  if(mode==='graze'){P.head.rotation.x=.75+Math.sin(clock*12.6+a.phase)*.12;P.ears.rotation.x=.5;ear(P.earX);}
  else if(mode==='look'){P.head.rotation.y=Math.sin(clock*1.3+a.phase)*.55;P.ears.rotation.x=.1;ear(P.earX);}
  else if(mode==='alert'){P.body.rotation.x=-.28;P.body.position.y=.21;P.head.rotation.x=-.15;P.ears.rotation.x=-.1;ear(-.05);P.puff.position.y=.03;P.puff.rotation.x=Math.sin(clock*9)*.05;}
  else if(mode==='hop'||mode==='flee'||mode==='return'){const s=Math.sin(Math.PI*((k*hops)%1));P.legH.rotation.x=.9*s;P.legF.rotation.x=-.9*s;P.body.scale.y=s<.15?.9:1+.06*s;
   P.ears.rotation.x=mode==='flee'?1:mode==='return'?.2:.45+.2*s;ear(P.earX);if(mode==='flee'){P.body.position.y=.14;P.head.rotation.x=.15;}if(mode==='return')P.head.rotation.x=.3;}};
 const munch=(a,dist)=>{if(clock>=(a.munchAt??0)&&dist<(TRAIL_SFX.munch.near??12)){a.munchAt=clock+4;sfx.play('munch');}};
 const lookedZones=new Set(); // 동동이의 '귀가… 나보다 길다'는 구역마다 한 번
 let stillFor=0;
 function animalStep(a,dt,pos,moving,sec){a.t+=dt;const P=a.parts,dist=Math.hypot(a.pos.x-pos[0],a.pos.z-pos[2]);a.still=moving?0:a.still+dt;
  if(P.tail)P.tail.rotation.x=Math.sin(clock*(a.kind==='cat'?1.6:3.2)+a.phase)*.18;
  if(a.state==='gone'){a.g.visible=false;return;}
  a.pitch=0;a.shrink=1;let w=null;
  if(a.state==='wander'&&a.spawn)w=follow(a,dt,sec);
  const mode=w?.mode??null,entered=mode!==a.lastMode;a.lastMode=mode;
  if(a.kind==='squirrel'){
   if(a.state==='wander'){P.ac.position.y=.115;
    if(mode==='run')a.pos.y+=Math.abs(Math.sin(a.hopT=(a.hopT??0)+a.moved*9))*.06;
    else if(mode==='pause')P.head.rotation.x=Math.sin(clock*7)*.12*(Math.sin(clock*.7+a.phase)>.3?1:0);
    else if(mode==='climb')climbTree(a,w);
    if(mode!=='climb'&&mode!=='hidden'&&dist<R.squirrelLook){a.state='look';a.t=0;sfx.play('squeak');line('squirrel.look',above(a,.45),{quiet:true});}}
   else if(a.state==='look'){faceTo(a,pos[0],pos[2],dt*6);P.head.rotation.x=-.25;P.ac.position.y=.13;
    if(dist>R.squirrelLook+1.5){a.state='wander';a.blend=true;P.ac.position.y=.115;}
    else if(a.still>R.squirrelHatAfter&&!active&&!acts.active&&!headTaken()){a.state='climb';a.t=0;a.from=a.pos.clone();line('squirrel.flee',above(a,.45));sfx.play('squeak');}}
   else if(a.state==='climb'){const top=new V3().setFromMatrixPosition(acts.hatTop()),k=Math.min(1,a.t/.9);a.pos.lerpVectors(a.from,top,k).y+=Math.sin(Math.PI*k)*.6;faceTo(a,pos[0],pos[2],1);
    if(k>=1){a.state='hat';a.t=0;line('squirrel.hat',above(a,.4));}
    if(moving){a.state='flee';a.t=0;startle(a);}}
   else if(a.state==='hat'){const M=acts.hatTop(),p=new V3().setFromMatrixPosition(M);a.pos.copy(p);a.yaw=Math.atan2(M.elements[8],M.elements[10]);acts.headLoad(Math.min(1,a.t*2));
    if(a.t>2.3&&!a.heavy){a.heavy=true;line('squirrel.heavy');}
    if(moving||acts.active){a.state='flee';a.t=0;a.heavy=false;a.yaw+=Math.PI*.7;sfx.play('squeak');line('squirrel.flee',above(a,.45),{quiet:true});startle(a);}}
   else if(a.state==='flee'){run(a,dt,3.4,.1);if(a.t>2.4){goneFor(a,40);}}
  }else if(a.kind==='hare'){const H=ANIMAL_STYLE.hare;
   if(a.state==='wander'){harePose(a,mode,w.k,w.hops??1);if(mode==='graze'){if(entered)a.munchAt=clock;munch(a,dist);}
    if(dist<H.alert){a.state='alert';a.t=0;
     if(Math.random()<.5){sfx.play('thump');line('hare.thump',above(a,.5),{quiet:true});}else line('hare.alert',above(a,.5),{quiet:true});
     const zid=a.spawn?.zone;if(zid&&!lookedZones.has(zid)){lookedZones.add(zid);after(1.4,()=>{if(a.state!=='gone')line('hare.look',null,{quiet:true});});}}}
   else if(a.state==='alert'){harePose(a,'alert');a.pos.y=ground(a.pos.x,a.pos.z);
    if(dist<H.flee||a.t>H.alertTime&&(dist<H.flee||moving&&dist<H.flee+1.5))a.state='flee-start';
    else if(a.t>H.alertTime){a.state='wary';a.t=0;}}
   else if(a.state==='wary'){const cyc=(a.t+a.phase)%4.5,grazing=cyc<3;harePose(a,grazing?'graze':'look');if(grazing)munch(a,dist);
    if(dist<H.flee)a.state='flee-start';else if(dist>H.alert+2){a.state='wander';a.blend=true;}}
   else if(a.state==='return'){const cyc=a.t%1;faceTo(a,pos[0],pos[2],dt*4);
    if(cyc<.35){run(a,dt,.4/.35,.08);harePose(a,'return',cyc/.35);}else{harePose(a,'look');a.pos.y=ground(a.pos.x,a.pos.z);}
    if(dist<=H.returnTo){a.state='wary';a.t=0;line('hare.munch',above(a,.5),{quiet:true});}
    else if(moving&&dist<H.alert){a.state='alert';a.t=0;}}
   if(a.state==='flee-start'){a.state='flee';a.t=0;a.yaw=Math.atan2(a.pos.x-pos[0],a.pos.z-pos[2]);sfx.play('rustle');line('hare.flee',above(a,.5));startle(a);}
   if(a.state==='flee'){run(a,dt,H.fleeSpeed,.15);harePose(a,'flee',(a.hopT/Math.PI)%1);
    if(a.t>H.fleeTime){goneFor(a,H.gone);if(a.spawn){a.spawn.fledAt=clock;a.spawn.fledTo=a.pos.clone();}}}
  }else if(a.kind==='cat'){
   if(a.state==='wander'){P.head.rotation.y=Math.sin(clock*.4+a.phase)*.4;if(mode==='prowl')a.pos.y+=Math.abs(Math.sin(a.hopT=(a.hopT??0)+a.moved*6))*.012;
    if(dist<4){a.state='look';a.t=0;}}
   else if(a.state==='look'){P.head.rotation.y=MathUtils.clamp(wrap(Math.atan2(pos[0]-a.pos.x,pos[2]-a.pos.z)-a.yaw),-.9,.9);if(!a.mewed){a.mewed=true;sfx.play('meow');}a.pos.y=ground(a.pos.x,a.pos.z);
    if(dist>5){a.state=a.spawn?'wander':'look';a.blend=true;}}
   else if(a.state==='petted'){const t=acts.active?.name==='pet-cat'?acts.active.t:0;P.m.visible=t<.4||t>3.05;P.b.visible=!P.m.visible;
    if(t>.5&&!a.purred){a.purred=true;line('cat.pet',above(a,.5));}
    if(t>3.05&&P.paw){P.paw.rotation.x=-1.2*Math.sin(Math.PI*Math.min(1,(t-3.05)/.25));if(!a.punch){a.punch=true;sfx.play('meow');line('cat.punch',above(a,.45));}}
    if(t>3.4){a.state='flee';a.t=0;a.purred=a.punch=false;P.paw&&(P.paw.rotation.x=0);a.yaw+=Math.PI;startle(a);}}
   else if(a.state==='bench'){const M=a.benchFrame;a.pos.copy(new V3(.62,BENCH.seatY,.02).applyMatrix4(M));a.yaw=Math.atan2(M.elements[8],M.elements[10])-.4;P.head.rotation.y=Math.sin(clock*.5)*.3;
    if(acts.active?.name!=='bench-sit'){a.leaveAt??=clock+2;if(clock>a.leaveAt){a.state='flee';a.t=0;a.leaveAt=null;startle(a);}}}
   else if(a.state==='to-bench'){const M=a.benchFrame,seat=new V3(.62,BENCH.seatY,.02).applyMatrix4(M),k=Math.min(1,a.t/1.6);a.pos.lerpVectors(a.from,seat,k).y+=Math.sin(Math.PI*k)*.35;faceTo(a,seat.x,seat.z,1);if(k>=1){a.state='bench';sfx.play('meow');line('bench.cat',above(a,.45));}}
   else if(a.state==='flee'){run(a,dt,2.6,.03);if(a.t>2.6){goneFor(a,60);}}
   if(dist>8)a.mewed=false;
  }else{ // 까치
   const fly=a.state==='fly'||a.state==='to-head'||a.state==='leave'||a.state==='wander'&&mode==='fly';P.m.visible=!fly;P.f.visible=fly;
   // 모자 위에서는 앉은 날개(위로 선 모양)를 몸통 옆으로 접는다. 뒤에서 보면 귀처럼 서 보였다(2026-11-07)
   P.sitWings.forEach(({w,z},i)=>{const fold=a.state==='ride',s=i?-1:1;w.rotation.set(0,fold?s*1.45:0,fold?s*.15:z);});
   if(P.f.visible)P.wings.forEach((w,i)=>{w.rotation.z=(i?-1:1)*(.55+Math.sin(clock*(a.state==='ride'?4:16))*.6);});
   if(a.state==='wander'){
    if(mode==='peck')a.pitch=Math.sin(clock*1.3+a.phase)>.85?.4:0;
    else if(mode==='walk')a.pos.y+=Math.abs(Math.sin(a.hopT=(a.hopT??0)+a.moved*11))*.025;
    if(mode!=='fly'&&dist<R.magpieFlee){a.state='fly';a.t=0;a.center=a.pos.clone();sfx.play('caw');line('magpie.fly',above(a,.3),{quiet:true});startle(a);
     if((forceRide.on||Math.random()<.35)&&clock>(ride?.cool??0)&&!headTaken()){a.state='to-head';forceRide.on=false;a.from=a.pos.clone();}}}
   else if(a.state==='fly'){const ang=a.t*.7+a.phase,r=5;a.pos.set(a.center.x+Math.cos(ang)*r,ground(a.center.x,a.center.z)+4+Math.sin(a.t)*.5,a.center.z+Math.sin(ang)*r);a.yaw=ang+Math.PI;
    if(a.t>7&&dist>R.magpieFlee+2){a.state='land';a.t=0;a.from=a.pos.clone();}}
   else if(a.state==='land'){const k=Math.min(1,a.t/1.4);let to=a.center.clone();if(a.spawn){const w2=plan(a,sec);to=toWorld(zoneById.get(a.spawn.zone),w2.u,w2.v,TQ).clone();}to.y=ground(to.x,to.z)+MAGPIE_FOOT*a.scale;
    a.pos.lerpVectors(a.from,to,k);faceTo(a,to.x,to.z,1);P.m.visible=k>=1;P.f.visible=k<1;if(k>=1){a.state=a.spawn?'wander':'idle';a.remote=false;}}
   else if(a.state==='to-head'){const to=perch(a).p,k=Math.min(1,a.t/1.4);a.pos.lerpVectors(a.from,to,k).y+=Math.sin(Math.PI*k)*.8;faceTo(a,to.x,to.z,1);
    if(k>=1){a.state='ride';a.t=0;ride={id:a.id,cool:clock+90};sfx.play('caw');line('magpie.ride',above(a,.3));after(2,()=>{if(a.state==='ride')line('magpie.rider',above(a,.32));});window.dispatchEvent(new CustomEvent('hiking:trail',{detail:{type:'magpie-ride',id:a.id}}));}}
   else if(a.state==='ride'){const pp=perch(a);a.pos.copy(pp.p);a.yaw=pp.yaw;
    if(a.t>R.magpieRide||acts.active){a.state='leave';a.t=0;a.from=a.pos.clone();sfx.play('caw');}}
   else if(a.state==='leave'){a.pos.y+=dt*2.2;a.pos.x+=Math.sin(a.yaw)*dt*4;a.pos.z+=Math.cos(a.yaw)*dt*4;if(a.t>3){goneFor(a,50);}}
  }
  a.g.position.copy(a.pos);a.g.rotation.y=a.yaw;a.g.rotation.x=a.pitch;
  a.g.scale.setScalar((a.state==='hat'||a.state==='bench'||a.state==='to-bench'||a.state==='petted'||a.state==='ride'?1:a.state==='to-head'?MathUtils.lerp(a.scale,1,Math.min(1,a.t/1.4)):a.scale)*a.shrink);
  // 몸에 올라탄 동물(모자 위 다람쥐·까치)은 1인칭(동동이 숨김)에서 숨기고, 카메라 근평면에 걸릴 만큼 가까우면 어느 시점이든 숨긴다.
  // 배회 중 나무 위·덤불 속(hidden)과 덤불로 뛰어든 끝(shrink 0)도 숨긴다.
  const onBody=a.state==='hat'||a.state==='ride'||(a.state==='climb'||a.state==='to-head')&&a.t>.5;
  a.g.visible=mode!=='hidden'&&a.shrink>.02&&!(onBody&&!hiker.scene.visible)&&a.g.position.distanceToSquared(camera.position)>.45*.45;
 }
 // 달아난 토끼: 등산객이 20초 넘게 가만히 있으면 달아난 쪽에서 다시 나타나 슬금슬금 5m까지 다가온다(산디자인 §1-2 return).
 function hareReturn(pos){const H=ANIMAL_STYLE.hare;if(stillFor<H.returnStill)return;
  for(const sp of spawns){if(sp.kind!=='hare'||sp.fledAt==null||clock-sp.fledAt<6||animals.has(sp.id)||!((goneUntil.get(sp.id)??0)>clock))continue;
   const f=sp.fledTo,dx=f.x-pos[0],dz=f.z-pos[2],d=Math.hypot(dx,dz);if(d>40)continue;
   // 3마리가 차 있으면 20m 넘게 떨어져 배회 중인 동물 하나를 내보내고 자리를 낸다(없으면 다음 기회에)
   if(animals.size>=(LIMITS.trailAnimals??3)){const far=[...animals.values()].filter(a=>a.state==='wander'&&!a.temp&&Math.hypot(a.pos.x-pos[0],a.pos.z-pos[2])>20).sort((a,b)=>Math.hypot(b.pos.x-pos[0],b.pos.z-pos[2])-Math.hypot(a.pos.x-pos[0],a.pos.z-pos[2]))[0];if(!far)return;root.remove(far.g);animals.delete(far.id);}
   goneUntil.delete(sp.id);sp.fledAt=null;const k=11/(d||1),x=pos[0]+dx*k,z=pos[2]+dz*k;
   const a=makeAnimal({...sp,u:sp.u,x,y:ground(x,z),z,state:'return'});a.spawn=sp;a.yaw=Math.atan2(pos[0]-x,pos[2]-z);animals.set(sp.id,a);line('hare.return',above(a,.5),{quiet:true});return;}}
 // 까치가 앉는 자리: 모자 정수리(머리 뼈를 따라감) 위에 발끝이 닿게. 크기는 모자 위에서 1배(다람쥐와 같게).
 const perch=a=>{const M=acts.crownTop(),up=new V3().setFromMatrixColumn(M,1).normalize();return {p:new V3().setFromMatrixPosition(M).addScaledVector(up,MAGPIE_FOOT-.01),yaw:Math.atan2(M.elements[8],M.elements[10])+Math.PI};}; // 뒤(3인칭 카메라 쪽)를 보고 앉아 얼굴·흰 배가 보이고, 긴 꼬리는 챙 앞으로 나간다
 // 머리(모자) 위 자리는 한 마리만: 다람쥐가 올라가 있거나 까치가 타고 있으면 다른 동물은 오르지 않는다.
 const headTaken=()=>{for(const x of animals.values())if(x.state==='hat'||x.state==='climb'||x.state==='ride'||x.state==='to-head')return true;return false;};
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
   // 동물: 이번 시간 칸 출현 목록 + 지난 칸에서 아직 나와 있는 동물 중 가까운 3마리(나온 자리 기준)
   const sec=now()/1000;refreshSpawns(sec);const walking=moving||!!(active&&active.stage!=='act');stillFor=walking?0:stillFor+dt;
   const cands=spawns.map(c=>({id:c.id,x:c.x,z:c.z,gone:(goneUntil.get(c.id)??0)>clock,c}));
   for(const a of animals.values())if(a.spawn&&!cands.some(x=>x.id===a.id))cands.push({id:a.id,x:a.spawn.x,z:a.spawn.z,gone:a.gone,c:a.spawn});
   const keep=new Set(pickAnimals(position,cands,animals));
   for(const [id,a] of animals){if(!keep.has(id)&&!a.temp&&a.state!=='hat'&&a.state!=='ride'&&a.state!=='bench'&&a.state!=='return'){root.remove(a.g);animals.delete(id);}}
   for(const id of keep)if(!animals.has(id)&&animals.size<(LIMITS.trailAnimals??3)){const c=cands.find(x=>x.id===id).c;animals.set(id,makeAnimal(c));}
   hareReturn(position);
   for(const a of animals.values())animalStep(a,dt,position,walking,sec);
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
   // 상호작용 칩: 가까운 대상 하나(src/trail-chip.js 켜짐·꺼짐 거리). 산스장은 가장 가까운 기구 하나만.
   let near=null;if(!active){const c=[];for(const it of items)if(TRAIL_BUTTONS[it.kind])c.push({id:it.id,kind:it.kind,d:Math.hypot(it.x-position[0],it.z-position[2])-(it.r??0)});
    const pk=pickChipTarget(c,chipNear?.id);if(pk){near={id:pk.id,kind:pk.kind};if(pk.kind==='gym')near.act=nearestGymAct(pk.id,position,chipNear?.id===pk.id?chipNear.act:null);}}
   chipNear=near;chipTarget=active||acts.active?null:offerAt?{id:offerAt.id,kind:offerAt.kind}:auto.get()?null:near; // 즐길거리 줄 trailBarView와 같은 조건
   const ac=acts.active,view={near:near&&(near.act?{id:near.id,kind:near.kind,act:near.act}:{id:near.id,kind:near.kind}),act:ac&&{name:ac.name,state:ac.state,reps:ac.reps??0,of:10,done:!!ac.done},stage:active?.stage??null,offer:offerAt&&{id:offerAt.id,kind:offerAt.kind,act:offerAt.act,label:offerAt.label,seconds:offerAt.seconds},auto:auto.get(),busy:!!active||!!(ac&&!acts.defs[ac.name].free)};
   const sig=JSON.stringify(view);if(sig!==viewSig){viewSig=sig;window.dispatchEvent(new CustomEvent('hiking:trail-view',{detail:view}));}
  },
  // ground() 뒤
  afterGround(dt,{moving=false}={}){acts.apply(dt,{moving});},
  // 카메라를 놓은 뒤(그리기 직전): 말풍선·상호작용 칩이 이번 프레임 카메라로 자리를 잡는다(한 프레임 늦게 따라오지 않게)
  afterCamera(){placeBubble();placeChip();},
  // ⑥ 1인칭 시야 낮춤(m), 상태, 검수용 강제 발생
  get eyeDrop(){return ex.eye;},exhaustion:()=>({...ex}),
  exhaust(kind='pant'){if(active||acts.active)return false;if(kind==='cramp')ex.crampAt=-Infinity;const k=onRunExhausted(ex,{uphill:kind==='cramp'?1:0,now:clock,random:kind==='cramp'?0:1});if(!k)return false;wasExhausted=true;acts.start(k,{frame:acts.bodyFrame(),groundY:ground,auto:false});exhaustEvent();return k;},
  offer:()=>offerAt&&{...offerAt,left:+(offerAt.until-clock).toFixed(2)},
  magpieRide(){if(headTaken())return false;forceRide.on=true;const m=[...animals.values()].find(a=>a.kind==='magpie'&&a.state==='wander'&&a.lastMode!=='fly');if(m){m.state='to-head';m.t=0;m.from=m.pos.clone();forceRide.on=false;return true;}return false;},
  squirrelHat(){if(headTaken())return false;const s=[...animals.values()].find(a=>a.kind==='squirrel'&&a.state!=='gone');if(!s)return false;s.state='climb';s.t=0;s.from=s.pos.clone();return true;},
  // 이번 시간 칸 출현 목록(검수용). m = 코스 거리(길 구역), 일주문 구역은 null
  spawns:()=>({slot,list:spawns.map(s=>({id:s.id,kind:s.kind,zone:s.zone,m:zoneById.get(s.zone)?.frame?null:+s.u.toFixed(1),x:+s.x.toFixed(2),z:+s.z.toFixed(2),gone:(goneUntil.get(s.id)??0)>clock}))}),
  // 검수용: 지금 자리 앞 ahead m·옆 offset m에 kind 동물을 하나 불러낸다(그 구역의 배회 계획을 그대로 따른다). 캡처 스크립트용
  summon(kind,{ahead=9,offset=3,side=1}={}){if(!measure||!ANIMAL_STYLE[kind])return null;const near=measure.nearest(lastPos[0],lastPos[2]);let zone,u,v;
   // 길에서 10m 넘게 떨어져 있으면(입구 광장 출발) 일주문 기준 구역에서 등산객 둘레(기준 좌표 +z 쪽 ahead m)에 부른다
   if(near.d>10&&(zone=usable.find(z=>z.frame))){const f=zone.frame,c=Math.cos(f.yaw),sn=Math.sin(f.yaw),dx=lastPos[0]-f.x,dz=lastPos[2]-f.z;u=dx*c-dz*sn+side*offset;v=dx*sn+dz*c+ahead;}
   else{u=Math.min(measure.length-1,near.m+ahead);zone=usable.find(z=>!z.frame&&u>=z.from&&u<z.to);v=side*(halfWidth(u)+Math.min(offset,laneLimit(u,side)));} // 물·절벽 쪽은 허용 폭까지만
   if(!zone)return null;const sec=now()/1000,sp={id:`summon-${kind}-${Math.round(u)}`,kind,zone:zone.id,slot,t0:sec,u,v,home:{u,v},seed:Math.round(Math.abs(u)*97)};const p=toWorld(zone,sp.u,sp.v);sp.x=p.x;sp.z=p.z;
   const onBody=new Set(['hat','ride','climb','to-head','bench','to-bench','petted']);for(const [id,a] of animals)if(!a.temp&&!onBody.has(a.state)){root.remove(a.g);animals.delete(id);if(a.spawn)goneUntil.set(id,clock+600);}spawns=spawns.filter(x=>!x.id.startsWith('summon-'));spawns.push(sp);goneUntil.delete(sp.id);return sp.id;},
  catToBench(){const s=props.find(p=>p.kind==='bench'&&p.obj&&acts.active?.id===p.id);if(!s)return false;catToBench(s.obj.matrixWorld.clone());return true;},
  status(){return {sites:props.map(s=>({id:s.id,kind:s.kind,x:+s.x.toFixed(2),y:+s.y.toFixed(2),z:+s.z.toFixed(2),slope:+s.slope.toFixed(3),m:s.routeMetres,loaded:!!s.obj})),
   animals:[...animals.values()].map(a=>({id:a.id,kind:a.kind,state:a.state,mode:a.lastMode??null,zone:a.spawn?.zone??null,x:+a.pos.x.toFixed(2),y:+a.pos.y.toFixed(2),z:+a.pos.z.toFixed(2),visible:a.g.visible})),active:active&&{act:active.act,id:active.id,stage:active.stage},exhaustion:{phase:ex.phase,left:+ex.left.toFixed(2),trudge:ex.trudge,eye:+ex.eye.toFixed(3),label:crampLabel(ex)},acts:acts.status(),offer:api.offer(),bubble:say&&{text:say.text,kind:say.kind},sound:sfx.snapshot?.()??null};},
  // 함께 걷기 동물 중계 기록(검수용): 받은 놀람과 그때 이 화면의 동물 상태
  remoteAnimals:()=>remoteLog.slice(),
  dispose(){window.removeEventListener('hiking:animal-remote',onRemote);window.removeEventListener('hiking:trail-say',onSay);window.removeEventListener('hiking:command',onCommand);window.removeEventListener('hiking:trail',onTrail);sfx.radio(null);scene.remove(root,fxRoot);bubble?.remove();},
 };
 return api;
}
export {ACT_LABEL};
