// 흡연장 멀티 화면: 위 오른쪽 '👥 같이 피우기' 단추(참가하면 연결 상태 칩으로 바뀜) → 서버 고르기 창(src/server-pick.js, 등산과 공용), 다른 사람 머리 위 이름표, 알림.
// 연결 쪽(multi.js)과는 반환 객체(join·leave·people·avatarOf)와 'lounge:multi-status'·'lounge:multi-note' 이벤트로만 만난다.
// 서버 고르기(11-08): 방 이름 칸은 없앴다. 서버가 full(정원 30명)로 거절하면 나간 뒤 창을 '방금 꽉 찼어요'로 다시 띄운다.
// 모양은 hud.css(「등산 수첩」 종이 톤, 단추 44px 이상) + multi.css + ../server-pick.css.
import './multi.css';
import '../server-pick.css';
import {cleanName,loungeStatusView} from './multi.js';
import {createServerPick} from '../server-pick.js';
import {currentChoice} from '../server-link.js';
import {findServer} from '../multi-protocol.js';

// 서버 방 이름(welcome room: 옥상) → 서버 id. 목록 밖 방(옛 주소)은 null.
export const loungeServerId=room=>room?findServer('smoking',room)?.id??null:null;

export function installLoungeMultiUi({multi,ctx,hud=null,root=document.getElementById('app'),doc=document,win=window,pickOptions={}}){
 const top=root?.querySelector('.lg-top-r');if(!top)return null;
 doc.body.classList.add('lg-mp');
 // ── 단추(= 상태 칩)
 const btn=doc.createElement('button');btn.type='button';btn.className='lg-btn lg-mp-btn';btn.dataset.mp='open';btn.setAttribute('aria-haspopup','dialog');
 btn.innerHTML='<i aria-hidden="true">👥</i><span class="lg-mp-t">같이 피우기</span><b class="lg-mp-n" hidden></b>';
 top.prepend(btn);
 // ── 이름표 층(말풍선 아래에 깔리게 맨 앞에)
 const tags=doc.createElement('div');tags.className='lg-mp-tags';root.prepend(tags);
 // ── 알림(HUD 토스트와 겹치지 않게 조금 아래)
 const note=doc.createElement('div');note.className='lg-mp-toast';note.hidden=true;note.setAttribute('role','status');root.appendChild(note);

 let last=null,noteT=0;
 // ── 서버 고르기 창: 고르면 그 서버 방으로 참가, 혼자 피우기(참가 중이면 나가기)
 const pick=createServerPick({experience:'smoking',serverUrl:multi.server,serverOff:currentChoice().source==='file-off',defaultName:cleanName(ctx.profile?.nickname),doc,win,
  onJoin:d=>multi.join({room:d.room,name:d.name}),
  onSolo:({left})=>{if(left)multi.leave();},...pickOptions});
 const openPick=(note=null,closable=true)=>pick.open({current:last?.joined&&last.state!=='full'?loungeServerId(last.room):null,note,closable});
 function render(){
  const v=last?.joined?loungeStatusView(last):null;
  btn.dataset.tone=v?.tone??'';btn.dataset.state=last?.joined?last.state:'';
  btn.querySelector('i').textContent=v?.ic??'👥';
  btn.querySelector('.lg-mp-t').textContent=v?.text??'같이 피우기';
  const n=btn.querySelector('.lg-mp-n');n.hidden=!v;n.textContent=v?.short??'';
  btn.setAttribute('aria-label',v?`같이 피우기 ${v.text}${v.sub?' · '+v.sub:''}`:'같이 피우기');
 }
 btn.addEventListener('click',()=>{
  // 끊김이면 단추로 바로 다시 연결
  if(last?.joined&&last.state==='offline'){multi.join({room:last.room,name:pick.state.name});return;}
  openPick();
 });
 win.addEventListener('lounge:multi-status',e=>{const d=e.detail;if(!d)return;const was=last?.state;last=d;
  if(d.joined&&d.state==='online'&&was!=='online')say(d.transport==='local'?'내 컴퓨터 모드로 옥상에 올라왔어요':`${findServer('smoking',d.room)?.name??'옥상 '+d.room}에 올라왔어요 · ${d.count}명`);
  else if(d.joined&&d.state==='offline'&&was&&was!=='offline')say('연결이 끊겼어요. 단추를 눌러 다시 연결해요');
  render();
  // 서버 정원이 방금 찼다: 30초 뒤 다시 시도하지 않고 나간 뒤 다른 서버를 고르게 한다
  if(d.joined&&d.state==='full'){multi.leave();openPick('full');}
 });
 function say(text){note.textContent=text;note.hidden=false;note.classList.remove('out');noteT=2.6;}
 win.addEventListener('lounge:multi-note',e=>{if(e.detail?.text)say(e.detail.text);});

 // ── 이름표: 다른 사람 머리 위(말풍선이 떠 있으면 말풍선이 이름을 보여 주니 숨김)
 const tagEls=new Map();const v=new ctx.THREE.Vector3();
 function update(dt){
  if(noteT>0){noteT-=dt;if(noteT<=.4)note.classList.add('out');if(noteT<=0)note.hidden=true;}
  const seen=new Set();
  for(const p of multi.people()){
   const a=p.avatar;if(!a)continue;seen.add(p.id);
   let el=tagEls.get(p.id);if(!el){el=doc.createElement('div');el.className='lg-mp-tag';tags.appendChild(el);tagEls.set(p.id,el);}
   if(el.textContent!==p.name)el.textContent=p.name;
   a.headTop(v);v.project(ctx.camera);
   const hide=v.z>1||Math.abs(v.x)>1.1||Math.abs(v.y)>1.1||hud?.hasBubble?.(p.id);
   el.style.display=hide?'none':'';
   if(!hide){const d=Math.hypot(a.x-ctx.player.x,a.z-ctx.player.z);el.style.opacity=String(Math.max(.55,1-d/18));el.style.transform=`translate(${(v.x*.5+.5)*innerWidth}px,${(-v.y*.5+.5)*innerHeight}px) translate(-50%,-100%)`;}
  }
  for(const [id,el] of tagEls)if(!seen.has(id)){el.remove();tagEls.delete(id);}
 }
 render();
 return {update,pick,open:(o={})=>openPick(o.note??null,o.closable??true),close:()=>pick.close(),get isOpen(){return pick.isOpen;}};
}
