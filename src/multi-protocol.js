// 함께 걷기(멀티) 순수 로직: 메시지 규격, 이름 정리, 위치 보간, 거리별 표시 단계, 인사·손 흔들기·같이 셀카 규칙.
// 네트워크·렌더링 코드는 없다(전송은 multi-transport.js, 화면은 multi-client.js). 서버를 붙여도 이 파일은 그대로 쓴다.
// 위치 입력은 movement.playerPosition(state)의 {zone,x,z,heading,s,lateral}이다.
export const NET=Object.freeze({
 sendHz:10,            // 위치 전송 횟수/초
 interpDelay:.15,      // 받은 위치를 이만큼 늦게 그려 부드럽게 잇는다(초)
 maxExtrapolate:.25,   // 새 위치가 끊겼을 때 마지막 속도로 더 가 보는 최대 시간(초)
 snapDistance:25,      // 이보다 멀리 갑자기 옮기면(구간 이동) 보간하지 않고 바로 옮긴다(m)
 timeout:5,            // 이 시간 동안 소식이 없으면 목록에서 뺀다(초)
 nameMax:12,
 gestureRange:12,      // 인사·손 흔들기를 보낼 수 있는 거리(m)
 selfieRange:6,        // 같이 셀카를 요청·수락할 수 있는 거리(m)
 selfieTimeout:10,     // 요청 유효 시간(초)
 selfieSeconds:6,      // 같이 셀카 자세 유지 시간(초)
 cooldown:Object.freeze({hello:3,wave:3,selfie:15}), // 같은 종류 반복 제한(초)
 maxRoster:60          // 한 방 최대 인원(설계 상한)
});
export const GESTURES=Object.freeze({hello:{seconds:2.2},wave:{seconds:3}});
// 이름표 단계(설계: 20m 안 이름 / 20~60m 작은 점 / 60m 밖 없음). 동시에 보이는 수에도 상한을 둔다.
export const TIERS=Object.freeze({name:20,dot:60,fullAvatar:30,fullCap:4,capsuleRange:160,capsuleCap:100,nameCap:8,dotCap:20});
export const ZONE_CODE=Object.freeze({route:0,plaza:1,summit:2});
const ZONE_NAME=['route','plaza','summit'];
const clean=s=>String(s??'').normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯﻿]/g,'').replace(/\s+/g,' ').trim();
// 표시 이름: 제어·방향 전환 문자 제거, 공백 정리, 12자 제한. 링크처럼 보이는 글은 버린다. 비면 대체 이름.
export function sanitizeName(raw,fallback='등산객',banned=[]){
 let s=[...clean(raw)].slice(0,NET.nameMax).join('').trim();
 if(/https?:|www\.|\.[a-z]{2,}\//i.test(s))s='';
 const low=s.toLowerCase();if(banned.some(w=>w&&low.includes(String(w).toLowerCase())))s='';
 return s||fallback;
}
export const anonymousName=id=>`등산객${String(id).replace(/[^0-9a-z]/gi,'').slice(-4).toUpperCase()}`;
const r2=v=>Math.round(v*100)/100;
// 위치 메시지(약 10회/초). 고도 y는 보내지 않는다 — 받는 쪽이 같은 지형에서 직접 구한다.
export function encodeState(id,seq,p,extra={}){
 return {t:'s',id,q:seq,z:ZONE_CODE[p.zone]??0,x:r2(p.x),y:r2(p.z),h:r2(p.heading),v:r2(extra.speed??0),f:extra.flags??0};
}
export function decodeState(m){
 if(!m||m.t!=='s'||!Number.isFinite(m.x)||!Number.isFinite(m.y)||!Number.isFinite(m.h))return null;
 return {id:m.id,seq:m.q,zone:ZONE_NAME[m.z]??'route',x:m.x,z:m.y,heading:m.h,speed:Number.isFinite(m.v)?m.v:0,flags:m.f|0};
}
// flags 비트: 1 앉음, 2 달리는 중
export const FLAG={sit:1,run:2};
// 압축 전송 크기(바이트) 추정. 서버 비용 계산에 쓴다: seq u16, zone·flags u8, x·z float32, heading u16, speed u8.
export const BINARY_STATE_BYTES=2+1+1+4+4+2+1;
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const lerpAngle=(a,b,t)=>a+wrap(b-a)*t;
// 받은 위치 보간기. push(now,snap)으로 쌓고 sample(now)로 interpDelay만큼 과거 위치를 얻는다.
export function createInterpolator({delay=NET.interpDelay,maxExtrapolate=NET.maxExtrapolate,snap=NET.snapDistance}={}){
 const buf=[];let lastSeq=-1;
 return {
  push(now,s){
   if(s.seq!==undefined&&s.seq<=lastSeq&&lastSeq-s.seq<30000)return false; // 오래된 패킷
   lastSeq=s.seq??lastSeq;
   const last=buf[buf.length-1];
   // 구역이 바뀌었거나 멀리 옮겼으면 이전 기록을 버려 순간이동한다.
   if(last&&(last.zone!==s.zone||Math.hypot(last.x-s.x,last.z-s.z)>snap))buf.length=0;
   buf.push({...s,at:now});while(buf.length>40)buf.shift();return true;
  },
  sample(now){
   if(!buf.length)return null;
   const t=now-delay;
   if(t<=buf[0].at)return {...buf[0],moving:false,vx:0,vz:0};
   for(let i=buf.length-1;i>0;i--){
    const a=buf[i-1],b=buf[i];
    if(t>=a.at&&t<=b.at){const k=(t-a.at)/Math.max(1e-6,b.at-a.at),vx=(b.x-a.x)/Math.max(1e-6,b.at-a.at),vz=(b.z-a.z)/Math.max(1e-6,b.at-a.at);
     return {...b,x:a.x+(b.x-a.x)*k,z:a.z+(b.z-a.z)*k,heading:lerpAngle(a.heading,b.heading,k),vx,vz,speed:Math.hypot(vx,vz),moving:Math.hypot(vx,vz)>.05};}
   }
   const last=buf[buf.length-1],prev=buf[buf.length-2],over=Math.min(maxExtrapolate,t-last.at);
   if(!prev||over<=0)return {...last,moving:false,vx:0,vz:0,speed:0};
   const dt=Math.max(1e-6,last.at-prev.at),vx=(last.x-prev.x)/dt,vz=(last.z-prev.z)/dt;
   // 끊긴 지 오래되면(over가 상한이면) 멈춘 것으로 본다.
   const stale=t-last.at>maxExtrapolate,f=stale?0:1;
   return {...last,x:last.x+vx*over*f,z:last.z+vz*over*f,vx:vx*f,vz:vz*f,speed:Math.hypot(vx,vz)*f,moving:!stale&&Math.hypot(vx,vz)>.05};
  },
  get size(){return buf.length;},
  get lastAt(){return buf.length?buf[buf.length-1].at:-Infinity;}
 };
}
// 내 위치에서 본 다른 사람들의 표시 단계. players: [{id,x,z,...}], 거리 오름차순.
export function classify(players,cam,{tiers=TIERS}={}){
 const rows=players.map(p=>({p,d:Math.hypot(p.x-cam.x,p.z-cam.z)})).sort((a,b)=>a.d-b.d);
 const out={avatar:[],capsule:[],name:[],dot:[],hidden:0};
 for(const r of rows){
  const full=r.d<=tiers.fullAvatar&&out.avatar.length<tiers.fullCap;
  if(full)out.avatar.push(r);
  else if(r.d<=tiers.capsuleRange&&out.capsule.length<tiers.capsuleCap)out.capsule.push(r);
  else out.hidden++;
  if(r.d<=tiers.name&&out.name.length<tiers.nameCap)out.name.push(r);
  else if(r.d<=tiers.dot&&out.dot.length<tiers.dotCap)out.dot.push(r);
 }
 return out;
}
// 가장 가까운 사람(행동 대상). range 안에 없으면 null.
export function nearestWithin(players,me,range){
 let best=null,bd=range;for(const p of players){const d=Math.hypot(p.x-me.x,p.z-me.z);if(d<=bd){bd=d;best=p;}}return best&&{player:best,distance:bd};
}
// 같이 셀카 자리: 요청자 오른쪽 0.7m, 뒤로 0.45m(카메라에서 멀어져야 둘 다 화면에 들어온다). 둘 다 요청자 방향(= 카메라 쪽)을 본다.
export function selfieSpot(requester,offset=.7,back=.45){
 const rx=Math.cos(requester.heading),rz=-Math.sin(requester.heading),fx=-Math.sin(requester.heading),fz=-Math.cos(requester.heading);
 return {zone:requester.zone,x:requester.x+rx*offset-fx*back,z:requester.z+rz*offset-fz*back,heading:requester.heading};
}
// 사회 행동 상태기계. 입력은 handle(msg,now)로 들어오고, 보낼 메시지는 send로 나간다.
// ctx: {id, send(msg), position(id)->{x,z,zone}|null, mine()->{x,z,zone}, blocked(id)->bool}
export function createSocial({id,send,position,mine,blocked=()=>false}){
 const last={hello:-Infinity,wave:-Infinity,selfie:-Infinity};
 const state={gesture:null,incoming:null,outgoing:null,session:null,log:[]};
 const note=(type,detail={})=>{state.log.push({type,...detail});if(state.log.length>50)state.log.shift();};
 const dist=pid=>{const o=position(pid),m=mine();return o&&m&&o.zone===m.zone?Math.hypot(o.x-m.x,o.z-m.z):Infinity;};
 const ready=(kind,now)=>now-last[kind]>=NET.cooldown[kind];
 function gesture(kind,now){
  if(!GESTURES[kind]||!ready(kind,now)||state.session)return false;
  last[kind]=now;state.gesture={kind,from:now,until:now+GESTURES[kind].seconds};send({t:'g',id,k:kind});note('gesture-sent',{kind});return true;
 }
 function requestSelfie(to,now){
  if(state.session||state.outgoing||!ready('selfie',now))return {ok:false,reason:state.session?'busy':state.outgoing?'pending':'cooldown'};
  if(dist(to)>NET.selfieRange)return {ok:false,reason:'far'};
  last.selfie=now;state.outgoing={to,at:now};send({t:'sr',id,to});note('selfie-request',{to});return {ok:true};
 }
 function accept(now){
  const r=state.incoming;if(!r)return false;
  if(now-r.at>NET.selfieTimeout||dist(r.from)>NET.selfieRange){state.incoming=null;note('selfie-expired',{from:r.from});return false;}
  state.incoming=null;
  state.session={requester:r.from,partner:id,from:now,until:now+NET.selfieSeconds,role:'partner'};
  send({t:'sa',id,to:r.from});note('selfie-accepted',{from:r.from});return true;
 }
 function decline(now){const r=state.incoming;if(!r)return false;state.incoming=null;send({t:'sd',id,to:r.from});note('selfie-declined',{from:r.from});return true;}
 function cancelSession(){if(!state.session)return;const s=state.session;state.session=null;send({t:'se',id,to:s.requester===id?s.partner:s.requester});note('selfie-cancel');}
 function handle(m,now,onGesture=()=>{}){
  if(!m||m.id===id||(m.to&&m.to!==id))return;
  if(blocked(m.id)){note('blocked-drop',{from:m.id,type:m.t});return;}
  switch(m.t){
   case 'g':if(GESTURES[m.k]&&dist(m.id)<=NET.gestureRange)onGesture(m.id,m.k,now);break;
   case 'sr':
    if(state.session||state.incoming||dist(m.id)>NET.selfieRange){send({t:'sd',id,to:m.id});note('selfie-auto-decline',{from:m.id});break;}
    state.incoming={from:m.id,at:now};note('selfie-incoming',{from:m.id});break;
   case 'sa':
    if(state.outgoing&&state.outgoing.to===m.id){state.outgoing=null;state.session={requester:id,partner:m.id,from:now,until:now+NET.selfieSeconds,role:'requester'};note('selfie-start',{partner:m.id});}
    break;
   case 'sd':if(state.outgoing&&state.outgoing.to===m.id){state.outgoing=null;note('selfie-refused',{by:m.id});}break;
   case 'se':if(state.session&&(state.session.requester===m.id||state.session.partner===m.id)){state.session=null;note('selfie-ended-by-peer',{by:m.id});}break;
  }
 }
 // 시간이 지난 요청·행동 정리. 반환: 방금 끝난 같이 셀카 세션(없으면 null).
 function tick(now){
  let ended=null;
  if(state.gesture&&now>=state.gesture.until)state.gesture=null;
  if(state.outgoing&&now-state.outgoing.at>NET.selfieTimeout){note('selfie-timeout',{to:state.outgoing.to});state.outgoing=null;}
  if(state.incoming&&now-state.incoming.at>NET.selfieTimeout){note('selfie-incoming-expired',{from:state.incoming.from});state.incoming=null;}
  if(state.session){
   const other=state.session.requester===id?state.session.partner:state.session.requester;
   if(now>=state.session.until||dist(other)>NET.selfieRange*2){ended=state.session;state.session=null;note('selfie-end',{reason:now>=ended.until?'done':'far'});}
  }
  return ended;
 }
 return {state,gesture,requestSelfie,accept,decline,cancelSession,handle,tick,ready};
}
// 신고 기록(서버 없이 내 컴퓨터에만 저장하는 시제품). 서버가 생기면 같은 모양을 서버로 보낸다.
export const REPORT_REASONS=Object.freeze(['부적절한 이름','방해·괴롭힘','기타']);
export function createModeration({storage=null,key='gwanak-multi-moderation'}={}){
 let data={blocked:[],reports:[]};
 try{const raw=storage?.getItem(key);if(raw)data={...data,...JSON.parse(raw)};}catch{}
 const save=()=>{try{storage?.setItem(key,JSON.stringify(data));}catch{}};
 return {
  isBlocked:id=>data.blocked.some(b=>b.id===id),
  block(id,name=''){if(!data.blocked.some(b=>b.id===id))data.blocked.push({id,name:name||id});save();},
  unblock(id){data.blocked=data.blocked.filter(b=>b.id!==id);save();},
  report({id,name,reason},at=0){if(!REPORT_REASONS.includes(reason))return false;data.reports.push({id,name,reason,at});save();this.block(id,name);return true;},
  get data(){return JSON.parse(JSON.stringify(data));}
 };
}
