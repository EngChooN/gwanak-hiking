// 함께 걷기 시제품 연결부. 주소에 ?multi 가 있을 때만 main.js가 만든다(없으면 이 코드는 불러오지도 않는다).
//  ?multi=방이름  &name=표시이름  &sim=N(가짜 등산객 N-1명을 같은 경로로 흉내, 부하 측정용)  &simzone=plaza|route  &fullcap=N(모델로 그릴 최대 인원)
// 흐름: 내 위치 10Hz 전송 → 받은 위치 보간 → 거리별로 모델/캡슐/이름표 → 행동(인사·손 흔들기·같이 셀카).
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkinned} from 'three/addons/utils/SkeletonUtils.js';
import {createRealisticHiker} from './realistic-hiker.js';
import {NET,TIERS,GESTURES,FLAG,encodeState,decodeState,createInterpolator,classify,nearestWithin,selfieSpot,createSocial,createModeration,REPORT_REASONS,sanitizeName,anonymousName} from './multi-protocol.js';
import {createBroadcastTransport,createLoopbackHub} from './multi-transport.js';
import {applyGesture,boneSet} from './multi-gestures.js';
import {createSimCrowd} from './multi-sim.js';
import './multi-ui.css';

const COLORS=[0xd9534f,0x3b82c4,0x4caf6a,0xe0a030,0x9b59b6,0x16a5a5,0xd2691e,0x7a8b2e];
const hash=s=>{let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};

export async function mountMultiplayer({scene,camera,hikerUrl,prepareGltf=null,night,groundHeight,local,search=location.search,command,onSelfieShot}){
 const q=new URLSearchParams(search),room=q.get('multi')||'gwanak-room-1',simN=Number(q.get('sim'))||0;
 const myId=Math.random().toString(36).slice(2,10),myName=sanitizeName(q.get('name'),anonymousName(myId));
 const fullCap=Number(q.get('fullcap'))||TIERS.fullCap,tiers={...TIERS,fullCap};
 const moderation=createModeration({storage:globalThis.localStorage});
 // 전송: 가짜 방(sim)이면 같은 프로세스 안의 허브, 아니면 브라우저 창 사이 채널.
 const hub=simN?createLoopbackHub({latency:Number(q.get('latency'))||60,jitter:20,loss:Number(q.get('loss'))||0}):null;
 const transport=hub?hub.join():createBroadcastTransport(room);
 const roster=new Map();             // id → {id,name,color,interp,gesture,sessionRole,lastSeen,hiker,...}
 let seq=0,sendAcc=0,lastAnnounce=-Infinity,tagsOn=true,frozenUntil=0,shotDone=false;
 const stats={sent:0,received:0,bytesOut:0,decoded:0,avatarsDrawn:0,capsules:0,hidden:0,frame:0};
 const send=m=>{stats.sent++;stats.bytesOut+=JSON.stringify(m).length;transport.send(m);};
 const peerPos=id=>{const r=roster.get(id),s=r?.sample;return s&&{x:s.x,z:s.z,zone:s.zone};};
 const social=createSocial({id:myId,send,position:peerPos,mine:()=>local.position(),blocked:id=>moderation.isBlocked(id)});

 // ── 모델 풀: GLB는 한 번만 읽고 SkeletonUtils로 복제한다. 가까운 fullCap명까지만 모델을 쓰고 나머지는 캡슐(night.setOthers)이다.
 // 카툰 모드는 같은 GLB 뼈대·동작으로 카툰 캐릭터 몸을 만든다(prepareGltf).
 const raw=await new GLTFLoader().loadAsync(hikerUrl),gltf=prepareGltf?prepareGltf(raw):raw;
 // 이름표 높이: 머리 위 25cm(실사 1.7m → 1.95m, 카툰 동동이 1.0m → 1.25m)
 const tagHeight=(gltf.scene.userData?.hikerProfile?.height??1.7)+.25;
 const pool=[];
 function makeAvatar(){
  const sc=cloneSkinned(gltf.scene),h=createRealisticHiker({scene:sc,animations:gltf.animations});
  sc.traverse(o=>{if(o.isMesh)o.castShadow=false;});
  const entry={hiker:h,bones:boneSet(h.model),assigned:null,walkPhase:0,prevY:null,slope:0,heading:null};
  h.scene.visible=false;scene.add(h.scene);pool.push(entry);return entry;
 }
 for(let i=0;i<fullCap;i++)makeAvatar();

 // ── 화면 요소
 const ui=el('div','multi-panel');ui.innerHTML=`<div class="multi-head"><b>함께 걷기</b> <span class="multi-count"></span></div><div class="multi-near"></div><div class="multi-buttons"></div><div class="multi-roster" hidden></div><div class="multi-note">시제품 · 이 컴퓨터 안에서만 연결됩니다</div>`;
 const tagLayer=el('div','multi-tags'),toast=el('div','multi-toast'),request=el('div','multi-request');request.hidden=true;
 document.body.append(ui,tagLayer,toast,request);
 const buttons=ui.querySelector('.multi-buttons'),mk=(label,key,fn)=>{const b=el('button','multi-btn',`${label}`);if(key)b.append(el('kbd','',key));b.type='button';b.onclick=()=>{fn();b.blur();};buttons.append(b);return b;};
 const bHello=mk('인사','X',()=>doGesture('hello')),bWave=mk('손 흔들기','G',()=>doGesture('wave')),bSelfie=mk('같이 셀카','K',()=>selfieKey());
 mk('이름표','N',()=>{if(command)command('labels-toggle');else tagsOn=!tagsOn;});mk('목록','',()=>{rosterEl.hidden=!rosterEl.hidden;});
 const rosterEl=ui.querySelector('.multi-roster'),nearEl=ui.querySelector('.multi-near'),countEl=ui.querySelector('.multi-count');
 let toastTimer=0;const say=text=>{toast.textContent=text;toast.classList.add('on');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('on'),2600);};

 function doGesture(kind){
  const sess=social.state.session;if(sess)return;
  if(!social.gesture(kind,performance.now()/1000)){say('조금 뒤에 다시 해 주세요');return;}
  say(kind==='wave'?'손을 흔들었어요':'인사했어요');
 }
 function nearestTarget(range){const me=local.position();return nearestWithin(visiblePlayers().filter(p=>p.zone===me.zone),me,range);}
 function visiblePlayers(){return [...roster.values()].filter(r=>r.sample&&!moderation.isBlocked(r.id)).map(r=>({id:r.id,name:r.name,x:r.sample.x,z:r.sample.z,zone:r.sample.zone,heading:r.sample.heading}));}
 function selfieKey(){
  const now=performance.now()/1000;
  if(social.state.incoming){if(social.accept(now))beginSession();return;}
  if(social.state.session){social.cancelSession();endSession();return;}
  const t=nearestTarget(NET.selfieRange);
  if(!t){say(`가까이(${NET.selfieRange}m 안) 가야 같이 셀카를 할 수 있어요`);return;}
  const r=social.requestSelfie(t.player.id,now);
  say(r.ok?`${t.player.name}님에게 같이 셀카를 요청했어요`:r.reason==='cooldown'?'조금 뒤에 다시 요청해 주세요':'지금은 요청할 수 없어요');
 }
 // 같이 셀카: 요청자는 기존 휴대폰 셀카를 켜고, 파트너는 요청자 오른쪽으로 서서 손을 흔든다. 둘 다 움직이지 않는다.
 function beginSession(){
  const s=social.state.session;if(!s)return;frozenUntil=s.until;shotDone=false;
  if(s.role==='requester'){command('phone');command('selfie');}
  else{
   const req=roster.get(s.requester)?.sample;
   if(req){const spot=selfieSpot(req);local.setPosition(spot);}
  }
  say(s.role==='requester'?'같이 셀카 준비 중…':'같이 셀카: 요청한 분 옆에 섰어요');
 }
 function endSession(){frozenUntil=0;if(local.gadget()!=='none')command('gadget-off');say('같이 셀카를 마쳤어요');}

 // ── 수신
 transport.onmessage((m,at)=>{
  stats.received++;if(!m||m.id===myId)return;
  if(m.t==='s'){
   const d=decodeState(m);if(!d)return;stats.decoded++;
   let r=roster.get(d.id);
   if(!r){if(roster.size>=NET.maxRoster)return;r=addPlayer(d.id);announce(true);}
   r.lastSeen=performance.now()/1000;r.flags=d.flags;
   if(moderation.isBlocked(d.id))return;
   r.interp.push(r.lastSeen,d);return;
  }
  if(m.t==='j'){const r=roster.get(m.id)??(roster.size<NET.maxRoster?addPlayer(m.id):null);if(r){r.name=sanitizeName(m.n,anonymousName(m.id));r.lastSeen=performance.now()/1000;}return;}
  if(m.t==='b'){roster.delete(m.id);return;}
  social.handle(m,performance.now()/1000,(from,kind,now)=>{const r=roster.get(from);if(r){r.gesture={kind,from:now,until:now+GESTURES[kind].seconds};say(`${r.name}님이 ${kind==='wave'?'손을 흔들어요':'인사했어요'}`);}});
  const sess=social.state.session;
  if(m.t==='sa'&&sess&&sess.role==='requester')beginSession();
  if(m.t==='se')endSession();
 });
 function addPlayer(id){
  const r={id,name:anonymousName(id),color:COLORS[hash(id)%COLORS.length],interp:createInterpolator(),gesture:null,lastSeen:performance.now()/1000,sample:null,flags:0,entry:null};
  roster.set(id,r);return r;
 }
 function announce(force=false){const now=performance.now()/1000;if(!force&&now-lastAnnounce<1)return;lastAnnounce=now;send({t:'j',id:myId,n:myName});}
 announce(true);addEventListener('pagehide',()=>{try{transport.send({t:'b',id:myId});}catch{}});

 // ── 키 입력(휴대폰은 위 버튼). 기존 키(E·Q·H·B·P·T·C·V·L·M·R·F 등)와 겹치지 않는 X·G·K·N만 쓴다.
 addEventListener('keydown',e=>{
  if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName))return;
  if(document.querySelector('dialog[open]'))return;
  if(e.code==='KeyG')doGesture('wave');else if(e.code==='KeyK')selfieKey(); // X(인사·누르고 있으면 메뉴)·N(이름표)은 input.js→interaction-controller가 맡는다
 });

 // ── 이름표(DOM). 가까운 8명은 이름, 60m까지 작은 점. 카메라 뒤는 숨긴다.
 const tagEls=new Map(),v3=new THREE.Vector3();
 function placeTag(r,d,kind,y){
  let t=tagEls.get(r.id);if(!t){t={root:el('div','multi-tag'),label:el('span','multi-tag-name')};t.root.append(t.label);tagLayer.append(t.root);tagEls.set(r.id,t);}
  v3.set(r.sample.x,y+tagHeight,r.sample.z).project(camera);
  const on=tagsOn&&!local.selfie?.()&&v3.z>-1&&v3.z<1&&Math.abs(v3.x)<1.1&&Math.abs(v3.y)<1.1;
  t.root.style.display=on?'block':'none';if(!on)return t.seen=true;
  t.root.style.transform=`translate(${(v3.x*.5+.5)*innerWidth}px,${(-v3.y*.5+.5)*innerHeight}px) translate(-50%,-100%)`;
  t.root.dataset.kind=kind;t.label.textContent=kind==='name'?r.name:'';t.root.style.opacity=kind==='name'?Math.max(.55,1-d/45):.8;
  t.root.dataset.gesture=r.gesture&&performance.now()/1000<r.gesture.until?r.gesture.kind:'';t.seen=true;
 }

 // ── 프레임 갱신
 const pos=new THREE.Vector3();
 function assign(rows,now){
  const want=new Set(rows.map(r=>r.p.id));
  for(const e of pool)if(e.assigned&&!want.has(e.assigned)){const prev=roster.get(e.assigned);if(prev)prev.entry=null;e.assigned=null;e.hiker.scene.visible=false;}
  for(const r of rows){
   const p=roster.get(r.p.id);if(p.entry)continue;
   const e=pool.find(x=>!x.assigned);if(!e)break;
   e.assigned=p.id;p.entry=e;e.prevY=null;e.walkPhase=0;e.heading=null;e.hiker.scene.visible=true;
  }
 }
 function driveAvatar(r,dt,now){
  const e=r.entry,s=r.sample,h=e.hiker,y=groundHeight(s.x,s.z);
  h.scene.position.set(s.x,y,s.z);
  if(e.heading===null){h.snapTo?.(s.heading);e.heading=s.heading;}
  h.turnTo(s.heading,dt);
  const horizontal=s.speed*dt;
  if(e.prevY!==null&&horizontal>1e-4)e.slope+=(THREE.MathUtils.clamp((y-e.prevY)/horizontal,-1,1)-e.slope)*.2;else if(!s.moving)e.slope*=.9;
  e.prevY=y;
  const sit=!!(r.flags&FLAG.sit),run=!!(r.flags&FLAG.run),step=.7*(run?1.16:1);
  e.walkPhase+=horizontal/step;
  const inSession=social.state.session&&(social.state.session.requester===r.id||social.state.session.partner===r.id),asRequester=inSession&&social.state.session.requester===r.id;
  const surface=(x,z)=>groundHeight(x,z);
  h.update({clip:!s.moving?'Idle':e.slope>.15?'Climb':'Walk',distance:e.walkPhase,stride:1,stepLength:step,idleSeconds:now,slope:e.slope,pose:sit?'sit':'stand',running:run,speed:s.speed,dt,surfaceHeight:surface,gadget:asRequester?'phone':'none',selfie:asRequester});
  h.ground({s:0,lateral:0,moving:s.moving,phase:e.walkPhase,floorHeight:()=>y,sample:()=>null,surfaceHeight:surface,pose:sit?'sit':'stand'});
  poseOverride(e,r,now,inSession&&!asRequester);
 }
 function poseOverride(e,r,now,asPartner){
  let g=r.gesture&&now<r.gesture.until?r.gesture:null;
  if(asPartner)g={kind:'wave',from:now-.4,until:now+1};
  if(!g)return;
  const heading=e.hiker.scene.rotation.y;
  if(applyGesture(e.bones,g.kind,now-g.from,heading,{side:asPartner?-1:1}))e.hiker.scene.updateMatrixWorld(true);
 }
 // 내 아바타(3인칭에서 보임)의 행동: main.js가 hiker.ground 직후에 부른다.
 function afterLocalGround(hiker,bones,now){
  const sess=social.state.session;let g=social.state.gesture;
  const asPartner=sess&&sess.role==='partner';
  if(asPartner)g={kind:'wave',from:now-.4,until:now+1};
  if(!g)return;
  if(!hiker._multiBones)hiker._multiBones=boneSet(hiker.model);
  if(applyGesture(hiker._multiBones,g.kind,now-g.from,hiker.scene.rotation.y,{side:asPartner?-1:1}))hiker.scene.updateMatrixWorld(true);
 }
 function renderRoster(){
  rosterEl.replaceChildren();
  for(const r of roster.values()){
   const row=el('div','multi-row'),name=el('span','',r.name);row.append(name);
   const blocked=moderation.isBlocked(r.id),b1=el('button','multi-mini',blocked?'차단 해제':'차단');b1.onclick=()=>{blocked?moderation.unblock(r.id):moderation.block(r.id,r.name);say(blocked?'차단을 풀었어요':'차단했어요. 이 사람은 더 보이지 않아요');};
   const b2=el('button','multi-mini','신고');b2.onclick=()=>{moderation.report({id:r.id,name:r.name,reason:REPORT_REASONS[0]},Date.now());say('신고를 기록하고 차단했어요(시제품: 내 컴퓨터에만 저장)');};
   row.append(b1,b2);rosterEl.append(row);
  }
 }
 let uiAt=0,rosterSig='';
 const sim=simN?createSimCrowd({count:simN-1,hub,zone:q.get('simzone')||(local.position().zone==='route'?'route':'plaza'),local,seedFrom:myId,groundHeight}):null;
 function update(dt,now,view){
  const t=performance.now()/1000;stats.frame++;
  if(sim)sim.update(performance.now(),dt);
  hub?.pump(performance.now());
  // 전송 10Hz
  sendAcc+=dt;if(sendAcc>=1/NET.sendHz){sendAcc%=1/NET.sendHz;const p=local.position();if(p)send(encodeState(myId,seq=(seq+1)&0xffff,p,{speed:local.speed(),flags:(local.sit()?FLAG.sit:0)|(local.run()?FLAG.run:0)}));}
  if(t-lastAnnounce>3)announce();
  // 오래 조용한 사람 정리
  for(const r of roster.values())if(t-r.lastSeen>NET.timeout){if(r.entry){r.entry.assigned=null;r.entry.hiker.scene.visible=false;}tagEls.get(r.id)?.root.remove();tagEls.delete(r.id);roster.delete(r.id);}
  for(const r of roster.values())r.sample=moderation.isBlocked(r.id)?null:r.interp.sample(t);
  const players=[...roster.values()].filter(r=>r.sample).map(r=>({id:r.id,x:r.sample.x,z:r.sample.z}));
  const cls=classify(players,camera.position,{tiers});
  assign(cls.avatar,t);
  for(const row of cls.avatar){const r=roster.get(row.p.id);if(r.entry)driveAvatar(r,dt,t);}
  // 모델이 아닌 사람은 캡슐(밤 조명 쪽 자리표시)로
  const capsule=cls.capsule.map(row=>{const r=roster.get(row.p.id),s=r.sample;return {x:s.x,y:groundHeight(s.x,s.z),z:s.z,heading:s.heading,color:r.color,lamp:true};});
  night?.setOthers(capsule);
  for(const e of pool)if(e.assigned&&!cls.avatar.some(row=>row.p.id===e.assigned)){roster.get(e.assigned)&&(roster.get(e.assigned).entry=null);e.assigned=null;e.hiker.scene.visible=false;}
  stats.avatarsDrawn=cls.avatar.length;stats.capsules=capsule.length;stats.hidden=cls.hidden;
  // 이름표
  for(const x of tagEls.values())x.seen=false;
  for(const row of cls.name){const r=roster.get(row.p.id);placeTag(r,row.d,'name',groundHeight(r.sample.x,r.sample.z));}
  for(const row of cls.dot){const r=roster.get(row.p.id);placeTag(r,row.d,'dot',groundHeight(r.sample.x,r.sample.z));}
  for(const [id,x] of tagEls)if(!x.seen)x.root.style.display='none';
  // 사회 행동 정리
  const ended=social.tick(t);if(ended){endSession();}
  // 같이 셀카 자동 촬영(요청자): 자세가 잡힌 뒤 한 번
  const sess=social.state.session;
  if(sess&&sess.role==='requester'&&!shotDone&&t-sess.from>2.2){shotDone=true;command('shutter');onSelfieShot?.({partner:sess.partner});}
  // 화면 요소
  if(now*1000-uiAt>150||true){
   uiAt=now*1000;countEl.textContent=`${roster.size+1}명 접속`;
   const nt=nearestTarget(NET.gestureRange),sess2=social.state.session;
   nearEl.textContent=sess2?'같이 셀카 중':nt?`가까운 사람: ${nt.player.name} · ${nt.distance.toFixed(0)}m`:'가까운 사람 없음';
   bHello.disabled=bWave.disabled=!nt||!!sess2||!social.ready('hello',t);
   const st=nearestTarget(NET.selfieRange);bSelfie.disabled=!(st||social.state.incoming||sess2);
   bSelfie.firstChild.textContent=social.state.incoming?'셀카 수락':sess2?'셀카 끝내기':social.state.outgoing?'요청 중…':'같이 셀카';
   const inc=social.state.incoming;request.hidden=!inc;
   if(inc){const from=roster.get(inc.from);request.replaceChildren(el('span','',`${from?.name??'등산객'}님이 같이 셀카를 요청했어요`));
    const ok=el('button','multi-mini ok','수락'),no=el('button','multi-mini','거절');ok.onclick=()=>{if(social.accept(performance.now()/1000))beginSession();};no.onclick=()=>social.decline(performance.now()/1000);request.append(ok,no);}
   const sig=[...roster.values()].map(r=>r.id+r.name+moderation.isBlocked(r.id)).join('|');if(sig!==rosterSig&&!rosterEl.hidden){rosterSig=sig;renderRoster();}else if(rosterEl.hidden)rosterSig='';
  }
 }
 const info=()=>({id:myId,name:myName,room,transport:transport.kind,roster:[...roster.values()].map(r=>({id:r.id,name:r.name,x:r.sample?.x,z:r.sample?.z,heading:r.sample?.heading,speed:r.sample?.speed,moving:r.sample?.moving,model:!!r.entry,gesture:r.gesture&&performance.now()/1000<r.gesture.until?r.gesture.kind:null,blocked:moderation.isBlocked(r.id)})),stats:{...stats},hub:hub?.stats??null,social:{session:social.state.session,incoming:social.state.incoming,outgoing:social.state.outgoing,log:social.state.log.slice(-12)},fullCap,pool:pool.length,moderation:moderation.data,sim:sim?.info()??null});
 return {update,afterLocalGround,info,social,doGesture,selfieKey,roster,nearest:range=>nearestTarget(range),setTags:on=>{tagsOn=!!on;},get tagsOn(){return tagsOn;},send,moderation,teleport:pos=>local.setPosition(pos),
  get frozen(){return performance.now()/1000<frozenUntil&&!!social.state.session;},
  group:scene};
}
