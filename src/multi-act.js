// 등산 함께 걷기 행동 상태(act, 2026-11-10 '내 상호작용이 상대에게 안 보임' 수정)의 순수 규칙. 화면·네트워크 없음(시험 tests/multi-act-hiking.test.mjs).
// 규격은 src/multi-protocol.js ACT_SCHEMA.hiking: p 자세(stand·sit·tea) · g 기구(none·binoculars·phone) · sf 셀카 · x 지금 동작 · n 동작 횟수 · v 보조 값(역기 횟수).
//  - 보내기(multi-client.js): main.js local.act()가 준 지금 상태를 hikingAct로 맞추고, createActSender가 바뀔 때만 내보낸다.
//    x가 새로 시작되면(빈 값 → 동작, 다른 동작으로 바뀜) n을 1 올린다 — 받는 쪽은 (x,n)이 바뀔 때만 동작을 처음부터 재생한다.
//  - 받기: remoteActPlan이 원격 몸(hiker-acts)에 무엇을 할지(시작·멈춤·역기 누르기) 정하고, remoteBody가 hiker.update에 넘길 자세·기구를 정한다.
import {ACT_SECONDS} from './toon/hiker-acts.js';

export const TEA_SECONDS=3; // movement.js와 같은 차 마시는 시간(초). 받는 쪽은 tea를 받은 때부터 센다.
// 몸 동작이 있는 즐길거리 동작(src/toon/hiker-acts.js). 이 밖의 x(스트레칭·약수·손 담그기·돌 올리기)는 내 몸에도 동작이 없고 1인칭 카메라만 움직인다.
export const BODY_ACTS=Object.freeze(Object.keys(ACT_SECONDS));
const P=['stand','sit','tea'],G=['none','binoculars','phone'];

// 지금 내 상태 → act a(n 빼고). trail = hiker-acts active {name,state,reps}, action = interaction-controller action {id}
export function hikingAct({pose='stand',gadget='none',selfie=false,trail=null,action=null}={}){
 const t=trail&&trail.state!=='out'?trail:null;
 const x=t?.name??action?.id??'';
 return {p:P.includes(pose)?pose:'stand',g:G.includes(gadget)?gadget:'none',sf:selfie?1:0,x:/^[a-z0-9-]{0,24}$/.test(x)?x:'',v:t?.name==='gym-lift'?Math.min(0xffff,t.reps|0):0};
}
// 바뀔 때만 보내기. next(a) → 보낼 a(n 포함) 또는 null. force면 같아도 보낸다(처음 보는 사람·다시 접속).
export function createActSender(){
 let n=0,lastX='',sig='',cur=null;
 return {
  next(a,force=false){
   if(!a)return null;
   if(a.x&&a.x!==lastX)n=(n+1)&0xffff;lastX=a.x;
   const out={...a,n},s=JSON.stringify(out);
   cur=out;if(!force&&s===sig)return null;sig=s;return out;
  },
  get current(){return cur;},
 };
}
// 받은 act → 원격 몸에 할 일. applied = 이 몸에 지금 걸어 둔 것 {key,v}(없으면 null), active = 원격 hiker-acts의 active 이름(없으면 null).
// 돌려줌 {start:동작|null, stop:bool, press:누를 횟수, applied:새 applied}
export function remoteActPlan(applied,a,active=null){
 const x=a?.x??'',body=BODY_ACTS.includes(x),key=body?`${x}:${a.n??0}`:null;
 if(!body)return {start:null,stop:!!active&&!!applied,press:0,applied:null};
 if(applied?.key!==key)return {start:x,stop:false,press:0,applied:{key,v:a.v??0}};
 const press=x==='gym-lift'?Math.max(0,(a.v??0)-(applied.v??0)):0;
 return {start:null,stop:false,press,applied:press?{key,v:a.v}:applied};
}
// 원격 몸 자세·기구. flags = 위치 메시지 flags(act가 아직 없을 때 옛 FLAG.sit 그대로), teaSince = tea를 받은 시각(초).
export function remoteBody(a,{sitFlag=false,teaSince=null,now=0,session=false}={}){
 const pose=a?.p??(sitFlag?'sit':'stand');
 const teaProgress=pose==='tea'&&teaSince!==null?Math.min(1,Math.max(0,(now-teaSince)/TEA_SECONDS)):0;
 const gadget=session?'phone':a?.g??'none',selfie=session||a?.sf===1;
 return {pose,teaProgress,gadget,selfie};
}
// 동작 자리 행렬 다시 세우기: 원격 사람의 위치·몸 방향(= hiker-acts spotOf의 heading)과 동작 정의(spot·facing)로 소품 공간 원점·회전을 구한다.
// spotOf: heading = frameYaw + facing + π, 서는 자리 = 원점 + R(frameYaw)·[spot x,0,spot z]. → {x,z,yaw}
export function frameFromSpot(def,{x,z,heading}){
 const yaw=heading-Math.PI-(def?.facing??0),[sx,sz]=def?.spot??[0,0];
 const c=Math.cos(yaw),s=Math.sin(yaw);
 return {x:x-(c*sx+s*sz),z:z-(-s*sx+c*sz),yaw};
}
