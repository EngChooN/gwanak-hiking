// 함께 걷기 HUD 입구: 설정 시트의 '👋 함께 걷기' 버튼 → 서버 고르기 창(src/server-pick.js, 11-08부터 방 이름 칸 없음), 그리고 연결 상태 칩.
// 연결 코드(multi-client.js·main.js)와는 window 이벤트로만 만난다.
//  - 보냄(서버 고르기 창이 보냄): 'hiking:multi-join' {room,name,server} · 'hiking:multi-leave'
//  - 받음: 'hiking:multi-status' {state:'connecting'|'online'|'reconnecting'|'offline'|'full', room, count, transport:'server'|'local'}
//  - 'full'(서버 정원 20명이 방금 참)이 오면 나가기를 보내고 서버 고르기 창을 '방금 꽉 찼어요'로 다시 띄운다.
// 색·글꼴은 등산 수첩 토큰(hud-notebook.css의 낮·노을·밤)을 따른다. 사양: docs/함께걷기-HUD-입구-디자인.md
import {findServer} from './multi-protocol.js';
export const DEFAULT_ROOM='관악산-1';
export const NAME_MAX=12,ROOM_MAX=24;
export {NAME_KEY} from './server-pick.js';
const clean=s=>String(s??'').normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f]/g,'').replace(/\s+/g,' ').trim();
// 방 이름: server/rooms.mjs의 sanitizeRoom과 같은 규칙(한글·영문·숫자·-·_ 24자). 비면 기본 방. (옛 ?multi= 주소용)
export const cleanRoom=raw=>{const s=[...String(raw??'').normalize('NFC').replace(/[^0-9A-Za-z가-힣_-]/g,'')].slice(0,ROOM_MAX).join('');return s||DEFAULT_ROOM;};
// 닉네임: 12자까지. 비우면 빈 글자('')를 보내 연결 쪽이 등산객XXXX를 붙이게 한다.
export const cleanName=raw=>[...clean(raw)].slice(0,NAME_MAX).join('').trim();
// 서버 방 이름(welcome의 room: 관악산) → 서버 이름(관악산 1서버). 서버 목록 밖 방(옛 주소)은 '방 이름'.
export const roomLabel=room=>{const s=room?findServer('hiking',room):null;return s?s.name:room?`방 ${room}`:'';};
export const currentServerId=room=>room?findServer('hiking',room)?.id??null:null;

// 상태 → 칩 모양. tone: wait(연결 중)·ok(연결됨)·local(서버 없음)·warn(다시 연결 중·꽉 참)·bad(끊김)
export function statusView(d={}){
 const local=d.transport==='local',n=Math.max(0,Number(d.count)||0),where=roomLabel(d.room||'');
 switch(d.state){
  case 'connecting':return {tone:'wait',ic:'⏳',text:'연결 중…',sub:where,action:null};
  // 서버 주소가 없거나(이 창끼리만) 서버 목록 밖 방(옛 ?multi=방 링크)이면 분명히 알린다(11-08 '상대가 안 보임' 운영 원인)
  case 'online':return local
   ?{tone:'local',ic:'💻',text:`내 컴퓨터 모드 · ${n||1}명`,sub:'서버 없음 · 이 브라우저 창끼리만(다른 기기 ✕)',action:null}
   :d.room&&!findServer('hiking',d.room)
   ?{tone:'warn',ic:'🟡',text:`다른 방 · ${n||1}명`,sub:`'${d.room}' · 서버 고르기와 따로`,action:null}
   :{tone:'ok',ic:'🟢',text:`연결됨 · ${n||1}명`,sub:where,action:null};
  case 'reconnecting':return {tone:'warn',ic:'🔄',text:'다시 연결 중…',sub:'혼자 걷기는 계속돼요',action:null};
  case 'offline':return {tone:'bad',ic:'⚠',text:'끊김',sub:'혼자 걷기는 계속돼요',action:'retry'};
  case 'full':return {tone:'warn',ic:'🚪',text:'방금 꽉 찼어요',sub:'다른 서버를 골라 주세요',action:'other'};
  default:return null;
 }
}

// serverPick: src/hiking-server-pick.js의 창(open({current,note,closable})). 없으면 버튼이 아무것도 열지 않는다.
export function installMultiEntry({serverUrl=null,serverPick=null,doc=document,win=window}={}){
 const body=doc.body;
 if(!body||doc.querySelector('.me-chip'))return null;
 import('./multi-entry-ui.css'); // node 시험에서는 설치 함수를 부르지 않으므로 CSS를 읽지 않는다
 const emit=(type,detail)=>win.dispatchEvent(new CustomEvent(type,detail===undefined?undefined:{detail}));
 let joined=false,left=false,last=null,lastJoin=null;
 const mk=(tag,cls,html='')=>{const e=doc.createElement(tag);e.className=cls;e.innerHTML=html;return e;};

 // ── 설정 시트 안 시작 버튼 ──
 const slot=doc.querySelector('#nb-sheet-settings .nb-grid');
 const entry=mk('button','nb-it me-entry','<em aria-hidden="true">👋</em><span>함께 걷기</span><small>서버 고르기</small>');
 entry.type='button';entry.dataset.meOpen='1';entry.setAttribute('aria-haspopup','dialog');
 if(slot)slot.insertBefore(entry,slot.querySelector('[data-dev-slot]'));

 // ── 상태 칩 ──
 const chip=mk('button','me-chip','<i aria-hidden="true"></i><span class="me-chip-t"></span><small class="me-chip-s"></small>');
 chip.type='button';chip.hidden=true;chip.setAttribute('role','status');chip.setAttribute('aria-live','polite');
 body.append(chip);

 function openPick(note=null){
  win.dispatchEvent(new CustomEvent('hiking:sheet',{detail:{id:null}})); // 설정 시트는 접는다
  serverPick?.open({current:joined&&last?.state!=='full'?currentServerId(last?.room):null,note,closable:true});
 }
 function render(){
  const v=last&&joined?statusView(last):null;
  chip.hidden=!v;
  if(v){chip.dataset.tone=v.tone;chip.dataset.state=last.state;chip.dataset.action=v.action??'';
   chip.querySelector('i').textContent=v.ic;chip.querySelector('.me-chip-t').textContent=v.text;chip.querySelector('.me-chip-s').textContent=v.sub;
   chip.setAttribute('aria-label',`함께 걷기 ${v.text}${v.sub?' · '+v.sub:''}`);}
  entry.querySelector('span').textContent=joined?'함께 걷는 중':'함께 걷기';
  entry.querySelector('small').textContent=joined?`${roomLabel(last?.room)||'서버'} · 바꾸기`:'서버 고르기';
  entry.classList.toggle('on',joined);
 }
 entry.addEventListener('click',()=>openPick());
 chip.addEventListener('click',()=>{
  if(chip.dataset.action==='retry'&&lastJoin){emit('hiking:multi-join',lastJoin);return;}
  openPick(chip.dataset.action==='other'?'full':null);
 });
 // 참가·나가기는 서버 고르기 창이 보낸다. 여기서는 그 신호로 상태만 맞춘다.
 win.addEventListener('hiking:multi-join',e=>{const d=e.detail??{};lastJoin={room:d.room,name:d.name??'',server:d.server};joined=true;left=false;
  last={state:'connecting',room:d.room||'',count:0,transport:serverUrl?'server':'local'};body.classList.add('nb-multi');render();});
 win.addEventListener('hiking:multi-leave',()=>{joined=false;left=true;last=null;body.classList.remove('nb-multi','nb-multi-open');render();});
 // 상태 받기. 주소(?multi=)로 들어온 경우처럼 참가 이벤트 없이 오면 참가 중으로 본다.
 win.addEventListener('hiking:multi-status',e=>{
  const d=e.detail;if(!d||!statusView(d))return;
  if(left)return; // 나간 뒤 늦게 온 상태
  if(!joined){joined=true;body.classList.add('nb-multi');}
  last={state:d.state,room:d.room||last?.room||'',count:d.count||0,transport:d.transport==='local'?'local':'server'};
  render();
  // 서버 정원이 방금 찼다: 30초 뒤 다시 시도하지 않고 나간 뒤 다른 서버를 고르게 한다
  if(d.state==='full'){emit('hiking:multi-leave');openPick('full');}
 });
 render();
 return {open:()=>openPick(),close:()=>serverPick?.close(),get joined(){return joined;},get isOpen(){return !!serverPick?.isOpen;}};
}
