// 서버 고르기 창(등산·흡연장 공용, 2026-11-08). 기획: 산기획 「서버 고르기 창 기획」.
// 서버 목록은 src/multi-protocol.js의 SERVERS 표, 인원은 함께 걷기 서버 GET /health의 servers·total(5초마다 다시 받음).
//  - 서버 줄을 누르면 바로 들어간다(onJoin {server,room,name}). 꽉 찬 줄(n ≥ 정원)은 고를 수 없다.
//  - 위쪽에 '지금 접속 n명'(이 체험 합계)·'전체 n명'(모든 체험 합계).
//  - 서버 주소가 없으면(?server=off·빌드 변수 없음) 내 컴퓨터 모드: 인원 대신 '이 브라우저 창끼리'로 보이고 줄은 고를 수 있다.
//  - /health를 못 받으면 '서버에 연결할 수 없어요' + 혼자 걷기/피우기만. 공개 파일이 '꺼짐'이면(serverOff) '서버가 꺼져 있어요'.
//  - 들어간 뒤 다시 열면 지금 서버 줄에 '지금 여기', 아래 단추는 '나가서 혼자 걷기'(onSolo).
//  - 서버가 full로 거절하면 호출한 쪽이 open({note:'full'})로 다시 띄운다 → '방금 꽉 찼어요'.
// 11-08 입장 흐름 개편: 서버를 허브 체험 카드와 같은 카드(그림·이름·인원 막대·들어가기)로 보여 준다. 입장 전(current 없음·closable false)은
// 게임 화면을 가리는 불투명 전체 화면(data-mode=entry), 게임 안에서 서버를 바꿀 때는 같은 카드의 창(data-mode=switch).
// 체험 코드(main.js·lounge)와는 콜백으로만 만난다. 모양은 server-pick.css(등산 수첩 종이 톤, 단추 44px 이상, 안전 영역 안).
import {SERVERS,SERVER_MAX,EXPERIENCES,NET} from './multi-protocol.js';
import {ART,hubTime} from './hub/hub.js';
import {sunPosition} from './daytime.js';

export const NAME_KEY='gwanak-multi-name';   // 등산 함께 걷기 카드와 같은 저장값(닉네임 재사용)
export const REFRESH_MS=5000;
export const FETCH_TIMEOUT_MS=4000;
export const PICK_LABELS=Object.freeze({
 hiking:Object.freeze({art:'mountain',title:'함께 걷기 서버',icon:'👋',solo:'혼자 걷기',soloIcon:'🥾',leave:'나가서 혼자 걷기',anon:'등산객XXXX'}),
 smoking:Object.freeze({art:'rooftop',title:'같이 피우기 서버',icon:'👥',solo:'혼자 피우기',soloIcon:'🚬',leave:'나가서 혼자 피우기',anon:'손님XXXX'})
});
const clean=s=>String(s??'').normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f]/g,'').replace(/\s+/g,' ').trim();
export const cleanPickName=raw=>[...clean(raw)].slice(0,NET.nameMax).join('').trim();
// 저장된 닉네임 읽기·쓰기(산 고르기 첫 화면과 이 창이 같이 쓴다). 저장소가 막혀 있어도 멈추지 않는다.
export function loadPickName(storage=globalThis.localStorage){try{return cleanPickName(storage?.getItem(NAME_KEY)??'');}catch{return '';}}
export function savePickName(raw,storage=globalThis.localStorage){const n=cleanPickName(raw);try{storage?.setItem(NAME_KEY,n);}catch{}return n;}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// ws(s)://호스트/경로 → http(s)://호스트/health. 잘못된 주소면 null.
export function healthUrl(wsUrl){
 if(!wsUrl)return null;
 try{const u=new URL(String(wsUrl).replace(/^ws(s?):\/\//i,'http$1://'));if(!/^https?:$/.test(u.protocol))return null;u.pathname='/health';u.search='';u.hash='';return u.href;}catch{return null;}
}
// 창을 띄울지: 'legacy'(?multi= 옛 주소 → 창 없이 1서버로 바로) · 'skip'(점검 스크립트 navigator.webdriver, ?serverpick=off) · 'show'.
// ?serverpick=on이면 점검 스크립트에서도 띄운다.
export function serverPickMode(search='',webdriver=false){
 const q=new URLSearchParams(search),p=q.get('serverpick');
 if(q.has('multi'))return 'legacy';
 if(p==='on')return 'show';
 if(p==='off'||webdriver)return 'skip';
 return 'show';
}
// 서버 줄. health가 없으면 count는 null(아직 모름·연결 안 됨·내 컴퓨터 모드).
export function pickRows(experience,health=null,servers=SERVERS){
 const got=Array.isArray(health?.servers?.[experience])?health.servers[experience]:null;
 return (servers[experience]??[]).map(s=>{
  const h=got?.find(x=>String(x?.id)===s.id),count=h&&Number.isFinite(h.count)?Math.max(0,h.count):got?0:null,max=h&&Number.isFinite(h.max)&&h.max>0?h.max:SERVER_MAX;
  return {id:s.id,name:s.name,room:s.room,count,max,full:count!==null&&count>=max};
 });
}
// 위쪽 합계: here = 이 체험 서버들 합, total = /health total(없으면 모든 체험 서버 합). 모르면 null.
export function pickTotals(experience,health=null,servers=SERVERS){
 if(!health?.servers)return {here:null,total:null};
 const sum=x=>pickRows(x,health,servers).reduce((n,r)=>n+(r.count??0),0);
 const total=Number.isFinite(health.total)?health.total:EXPERIENCES.reduce((n,x)=>n+sum(x),0);
 return {here:sum(experience),total};
}
// 줄 오른쪽 글자
export function rowLabel(row,{local=false,current=null}={}){
 if(current===row.id)return {n:row.count===null?'':`${row.count} / ${row.max}명`,tag:'지금 여기',state:'here'};
 if(local)return {n:'이 브라우저 창끼리',tag:'',state:'local'};
 if(row.count===null)return {n:'… / '+row.max+'명',tag:'',state:'wait'};
 if(row.full)return {n:`${row.count} / ${row.max}명`,tag:'꽉 참',state:'full'};
 return {n:`${row.count} / ${row.max}명`,tag:'',state:'open'};
}

// 창 만들기. 여러 번 open/close 한다. fetchImpl·timers는 시험에서 바꿔 끼운다.
export function createServerPick({experience='hiking',serverUrl=null,serverOff=false,onJoin=()=>{},onSolo=()=>{},onClose=null,doc=globalThis.document,win=globalThis.window,
 fetchImpl=globalThis.fetch?.bind(globalThis),storage=globalThis.localStorage,defaultName='',servers=SERVERS,
 setTimer=setTimeout,clearTimer=clearTimeout}={}){
 const L=PICK_LABELS[experience]??PICK_LABELS.hiking,local=!serverUrl,url=healthUrl(serverUrl);
 const st={open:false,health:null,net:local?'local':'loading',current:null,note:null,closable:false};
 let root=null,timer=null,seq=0,abort=null;
 let saved='';try{saved=storage?.getItem(NAME_KEY)??'';}catch{}
 let name=cleanPickName(saved||defaultName);

 function build(){
  root=doc.createElement('div');root.className='sp-wrap';root.dataset.exp=experience;root.hidden=true;root.dataset.mode='switch';
  try{root.dataset.time=hubTime(sunPosition(Date.now()).elevation);}catch{root.dataset.time='day';}
  root.innerHTML=`<div class="sp-scrim" data-sp="scrim"></div>
<section class="sp-card" role="dialog" aria-modal="true" aria-labelledby="sp-title-${experience}">
 <header class="sp-head"><h2 id="sp-title-${experience}"><em aria-hidden="true">${L.icon}</em>${esc(L.title)}</h2><p class="sp-lead">들어갈 서버를 고르세요</p><button type="button" class="sp-x" data-sp="close" aria-label="서버 고르기 닫기">✕</button></header>
 <p class="sp-sum" aria-live="polite"><span>지금 접속 <b data-sp-here>…</b>명</span><span>전체 <b data-sp-total>…</b>명</span></p>
 <p class="sp-note" role="status" hidden></p>
 <ul class="sp-list" role="list"></ul>
 <label class="sp-name">닉네임 <small>(${NET.nameMax}자까지 · 비우면 ${esc(L.anon)})</small><input name="sp-name" type="text" maxlength="${NET.nameMax}" placeholder="${esc(L.anon)}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done"></label>
 <button type="button" class="sp-solo" data-sp="solo"><em aria-hidden="true">${L.soloIcon}</em><span>${esc(L.solo)}</span></button>
</section>`;
  doc.body.append(root);
  const input=root.querySelector('input');input.value=name;
  // 글자를 치는 동안 걷기·담배 단축키가 먹히지 않게(Esc만 통과)
  for(const ev of ['keydown','keyup'])input.addEventListener(ev,e=>{if(e.key!=='Escape')e.stopPropagation();});
  input.addEventListener('input',()=>{name=savePickName(input.value,storage);}); // 고치는 대로 같은 저장값에(산 고르기 칸과 같은 이름)
  root.addEventListener('click',e=>{
   const b=e.target.closest('[data-sp],[data-sp-server]');if(!b||b.disabled)return;
   if(b.dataset.spServer){join(b.dataset.spServer);return;}
   const a=b.dataset.sp;
   if(a==='solo')solo();
   else if((a==='close'||a==='scrim')&&st.closable)close();
  });
  win?.addEventListener?.('keydown',e=>{if(e.key==='Escape'&&st.open&&st.closable){e.stopPropagation();e.preventDefault();close();}},true);
 }
 function saveName(){name=savePickName(root?.querySelector('input')?.value??name,storage);return name;}
 function render(){
  if(!root)return;
  const rows=pickRows(experience,st.health,servers),tot=pickTotals(experience,st.health,servers),off=st.net==='error';
  root.dataset.net=st.net;
  root.querySelector('.sp-x').hidden=!st.closable;
  const sum=root.querySelector('.sp-sum');sum.hidden=local||off;
  root.querySelector('[data-sp-here]').textContent=tot.here??'…';root.querySelector('[data-sp-total]').textContent=tot.total??'…';
  const note=root.querySelector('.sp-note'),msg=st.note==='full'?{tone:'warn',text:'방금 꽉 찼어요. 다른 서버를 고르거나 잠시 뒤 다시 골라 주세요.'}
   :off?{tone:'bad',text:`서버에 연결할 수 없어요. 지금은 ${L.solo}만 할 수 있어요.`}
   :local?{tone:'local',text:serverOff?`🌙 지금은 서버가 꺼져 있어요. ${L.solo}만 할 수 있어요.`:`💻 서버 주소가 없어요. 지금은 ${L.solo}만 할 수 있어요.`}:null;
  note.hidden=!msg;if(msg){note.dataset.tone=msg.tone;note.textContent=msg.text;}
  const focused=doc.activeElement?.closest?.('[data-sp-server]')?.dataset.spServer??null,list=root.querySelector('.sp-list');
  // /health 실패·서버 주소 없음: 서버 카드 대신 '서버에 연결할 수 없어요' 카드 하나와 혼자 하기만(11-08 입장 흐름 개편)
  if(off||local){
   list.innerHTML=`<li><div class="sp-row sp-down" data-state="down" role="note"><span class="sp-art" aria-hidden="true">${ART[L.art]??''}</span><span class="sp-row-body"><b class="sp-row-name">서버에 연결할 수 없어요</b><span class="sp-row-n">${local?(serverOff?'서버가 꺼져 있어요':'서버 주소가 없어요'):'잠시 뒤 다시 확인해요'}</span><span class="sp-go">${esc(L.solo)}는 할 수 있어요</span></span></div></li>`;
  }else list.innerHTML=rows.map(r=>{
   const v=rowLabel(r,{local,current:st.current}),dis=v.state==='here'||v.state==='full'||v.state==='wait'||off;
   const pct=r.count===null?0:Math.min(100,Math.round(r.count/r.max*100));
   const go=v.state==='here'?'지금 여기':v.state==='full'?'꽉 참':v.state==='wait'?'확인 중…':'들어가기 ▶';
   return `<li><button type="button" class="sp-row" data-sp-server="${esc(r.id)}" data-state="${off?'off':v.state}"${dis?' disabled':''} aria-label="${esc(r.name)} ${esc(v.n)}${v.tag?' '+esc(v.tag):''}">
<span class="sp-art" aria-hidden="true">${ART[L.art]??''}${v.tag?`<span class="sp-tag">${esc(v.tag)}</span>`:''}</span>
<span class="sp-row-body"><b class="sp-row-name">${esc(r.name)}</b><span class="sp-row-n">${esc(off&&!local?'— / '+r.max+'명':v.n)}</span>${local?'':`<i class="sp-bar" aria-hidden="true"><i style="width:${pct}%"></i></i>`}
<span class="sp-go">${esc(go)}</span></span></button></li>`;}).join('');
  root.querySelector('.sp-solo span').textContent=st.current?L.leave:L.solo;
  if(focused)list.querySelector(`[data-sp-server="${focused}"]`)?.focus({preventScroll:true}); // 5초마다 다시 그려도 키보드 위치 유지
 }
 async function refresh(){
  if(local||!url||!fetchImpl){render();return;}
  const my=++seq;abort?.abort?.();const ctl=typeof AbortController==='function'?new AbortController():null;abort=ctl;
  const to=setTimer(()=>ctl?.abort(),FETCH_TIMEOUT_MS);
  try{
   const r=await fetchImpl(url,{cache:'no-store',signal:ctl?.signal});
   if(!r.ok)throw new Error(`HTTP ${r.status}`);
   const h=await r.json();if(my!==seq)return;
   if(!h?.servers)throw new Error('servers 없음');
   st.health=h;st.net='ok';
  }catch{if(my!==seq)return;st.health=null;st.net='error';}
  finally{clearTimer(to);}
  render();
 }
 function loop(){clearTimer(timer);if(!st.open||local)return;timer=setTimer(async()=>{await refresh();loop();},REFRESH_MS);}
 // open({current:지금 들어가 있는 서버 id|null, note:'full'|null, closable})
 function open({current=null,note=null,closable=!!current}={}){
  if(!root&&doc?.body)build(); // 화면이 없으면(node 시험) 상태·콜백만 움직인다
  // 열 때마다 저장값을 다시 읽는다: 산 고르기 첫 화면에서 넣은 이름이 이 창 칸에 미리 채워진다
  let had=false;try{had=storage?.getItem(NAME_KEY)!=null;}catch{}
  if(had){name=loadPickName(storage)||cleanPickName(defaultName);const input=root?.querySelector('input');if(input&&input!==doc.activeElement)input.value=name;}
  Object.assign(st,{open:true,current,note,closable});
  if(root)root.dataset.mode=!current&&(!closable||note==='full')?'entry':'switch';
  if(!local&&st.net!=='ok')st.net='loading';
  if(root){root.hidden=false;doc.documentElement.classList.add('sp-open');}
  render();const first=refresh().then(loop);
  if(root&&!matchMediaSafe('(pointer:coarse)'))(root.querySelector('.sp-row:not([disabled])')??root.querySelector('.sp-solo'))?.focus({preventScroll:true});
  return first;
 }
 function close(){
  if(!st.open)return;
  st.open=false;clearTimer(timer);timer=null;seq++;abort?.abort?.();
  if(root){root.hidden=true;doc.documentElement.classList.remove('sp-open');}
  onClose?.();
 }
 function join(id){
  const s=(servers[experience]??[]).find(x=>x.id===id);if(!s)return;
  const n=saveName();close();onJoin({server:s.id,room:s.room,name:n,serverName:s.name});
 }
 function solo(){saveName();const was=st.current;close();onSolo({left:!!was});}
 const matchMediaSafe=q=>{try{return !!win?.matchMedia?.(q).matches;}catch{return false;}};
 const api={open,close,refresh,join,solo,render,
  get isOpen(){return st.open;},get state(){return {...st,health:st.health,rows:pickRows(experience,st.health,servers),totals:pickTotals(experience,st.health,servers),name};},
  get root(){return root;},get url(){return url;}};
 return api;
}
