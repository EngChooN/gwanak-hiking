// 같이 등산하기 HUD(동행, 2026-11-08 기획서 A): 👥 버튼 → '함께 있는 사람' 목록, 이름표 고르기 카드, 받은 제안 카드(수락·거절·30초 띠),
// 보낸 제안 칩('기다리는 중…'·취소), 동행 칩('○○님과 동행 중'·나란히/앞뒤/기다리는 중·동행 끝내기), 짧은 알림.
// 연결 코드(multi-client.js)와는 window 이벤트로만 만난다.
//  - 보냄: hiking:pair-offer {to} · hiking:pair-accept · hiking:pair-decline · hiking:pair-cancel · hiking:pair-end
//  - 받음: hiking:pair-state · hiking:pair-note · hiking:pair-people · hiking:pair-pick · hiking:multi-status · hiking:multi-leave
// 모양은 등산 수첩 톤(hud-notebook.css 토큰: 낮·노을·밤)으로 산개발이 먼저 만들었고, 산디자인이 다듬는다(pair-ui.css).
export const WALK_TEXT=Object.freeze({side:'나란히 걷는 중',file:'앞뒤로 걷는 중',far:'조금 떨어져 있어요'});
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// 남은 초(올림, 0 아래로 안 감)
export const secondsLeft=(until,now)=>Math.max(0,Math.ceil((until-now)/1000));
// 위쪽 칩 모양: 보낸 제안이면 기다리는 중, 동행이면 동행 칩. 그 밖에는 null.
export function chipModel(st){
 if(!st)return null;
 if(st.phase==='outgoing'&&st.offer)return {kind:'wait',title:`${st.offer.name}님에게 제안했어요`,sub:'기다리는 중…',action:'cancel',label:'취소'};
 if(st.phase==='paired'&&st.partner){
  const w=st.walk,sub=st.away?`${st.partner.name}님 연결을 기다리는 중…`:w?.waiting?w.lag:w?.near&&w.mode?WALK_TEXT[w.mode]:WALK_TEXT.far;
  return {kind:'pair',title:`🤝 ${st.partner.name}님과 동행 중`,sub,action:'end',label:'동행 끝내기',lag:!!(w?.waiting||st.away)};
 }
 return null;
}
// 목록 한 줄의 단추 상태
export function rowModel(p,st){
 if(p.partner)return {label:'동행 중',disabled:true};
 if(p.offer)return {label:st?.phase==='incoming'?'제안 받음':'제안 중',disabled:true};
 if(st&&st.phase!=='idle')return {label:'🤝 같이 등산하기',disabled:true};
 return {label:'🤝 같이 등산하기',disabled:false};
}

export function installPairUI({doc=document,win=window,now=()=>Date.now()}={}){
 const body=doc.body;if(!body||doc.querySelector('.pw-btn'))return null;
 import('./pair-ui.css');
 const mk=(tag,cls,html='')=>{const e=doc.createElement(tag);e.className=cls;e.innerHTML=html;return e;};
 const fire=(type,detail)=>win.dispatchEvent(new CustomEvent(type,detail===undefined?undefined:{detail}));
 let joined=false,left=false,st={phase:'idle'},people=[],sheetOpen=false,pickId=null,noteT=0,timer=0;

 const btn=mk('button','pw-btn','<span aria-hidden="true">👥</span><b class="pw-count" hidden></b>');
 btn.type='button';btn.hidden=true;btn.setAttribute('aria-label','함께 있는 사람');btn.setAttribute('aria-expanded','false');
 const sheet=mk('section','pw-sheet',`<h4><span>👥 함께 있는 사람</span><button type="button" class="pw-x" aria-label="목록 닫기">✕</button></h4>
  <p class="pw-help">이름을 고르고 🤝를 누르면 같이 등산하자고 제안해요. 머리 위 이름표를 눌러도 돼요.</p><ul class="pw-list"></ul>`);
 sheet.hidden=true;
 const pick=mk('section','pw-pick');pick.hidden=true;
 const offer=mk('section','pw-offer');offer.hidden=true;offer.setAttribute('role','alertdialog');
 const chip=mk('section','pw-chip');chip.hidden=true;
 const note=mk('div','pw-note');note.setAttribute('role','status');note.setAttribute('aria-live','polite');
 body.append(sheet,pick,offer,chip,note,btn);
 const listEl=sheet.querySelector('.pw-list'),countEl=btn.querySelector('.pw-count');

 // ── 👥 버튼 자리: 💬 버튼 오른쪽(없으면 연결 칩 오른쪽, 그것도 없으면 CSS 기본 자리)
 function placeBtn(){
  const ref=[doc.querySelector('.hc-btn'),doc.querySelector('.me-chip')].find(e=>e&&!e.hidden&&e.getBoundingClientRect().width);
  if(ref){const r=ref.getBoundingClientRect();btn.style.left=`${Math.round(r.right+8)}px`;btn.style.top=`${Math.round(r.top+(r.height-44)/2)}px`;return;}
  btn.style.left=btn.style.top='';
 }
 function renderBtn(){
  btn.hidden=!joined;btn.classList.toggle('on',sheetOpen);btn.setAttribute('aria-expanded',String(sheetOpen));
  countEl.hidden=!people.length;countEl.textContent=String(people.length);placeBtn();
 }
 function setSheet(on){
  sheetOpen=!!on&&joined;sheet.hidden=!sheetOpen;body.classList.toggle('pw-open',sheetOpen);
  if(sheetOpen){setPick(null);renderList();}
  renderBtn();
 }
 btn.addEventListener('click',()=>setSheet(!sheetOpen));
 sheet.querySelector('.pw-x').addEventListener('click',()=>setSheet(false));

 // ── 목록
 function renderList(){
  if(!sheetOpen)return;
  listEl.innerHTML=people.length?people.map(p=>{const m=rowModel(p,st);
   return `<li><span class="pw-name"><b>${esc(p.name)}</b><small>${p.distance===null?'다른 곳':`${p.distance}m`}</small></span><button type="button" class="pw-go" data-id="${esc(p.id)}" ${m.disabled?'disabled':''}>${esc(m.label)}</button></li>`;}).join('')
   :'<li class="pw-empty">아직 같은 서버에 아무도 없어요.</li>';
 }
 listEl.addEventListener('click',e=>{const b=e.target.closest('.pw-go');if(!b||b.disabled)return;fire('hiking:pair-offer',{to:b.dataset.id});setSheet(false);});

 // ── 이름표 고르기 카드
 function setPick(id){
  pickId=id;pick.hidden=!id;if(!id)return;
  const p=people.find(x=>x.id===id),name=p?.name??pickName,m=rowModel(p??{id},st);
  pick.innerHTML=`<p><b>${esc(name)}</b>${p&&p.distance!==null?` <small>· ${p.distance}m</small>`:''}</p>
   <div class="pw-row"><button type="button" class="pw-yes" ${m.disabled?'disabled':''}>${esc(m.label)}</button><button type="button" class="pw-no">닫기</button></div>`;
 }
 let pickName='';
 pick.addEventListener('click',e=>{
  if(e.target.closest('.pw-no')){setPick(null);return;}
  const y=e.target.closest('.pw-yes');if(y&&!y.disabled&&pickId){fire('hiking:pair-offer',{to:pickId});setPick(null);}
 });
 win.addEventListener('hiking:pair-pick',e=>{const d=e.detail;if(!d?.id||!joined)return;pickName=d.name??'';setSheet(false);setPick(d.id);});

 // ── 받은 제안 카드·위쪽 칩
 function renderOffer(){
  const inc=st.phase==='incoming'&&st.offer;offer.hidden=!inc;body.classList.toggle('pw-offering',!!inc);
  if(!inc)return;
  if(offer.dataset.id!==st.offer.id||!offer.firstChild){
   offer.dataset.id=st.offer.id;
   offer.innerHTML=`<p class="pw-offer-text"><span class="pw-stamp" aria-hidden="true">🤝</span><b>${esc(st.offer.name)}님이 같이 등산하자고 해요</b></p>
    <div class="pw-bar"><i></i></div><div class="pw-row"><button type="button" class="pw-accept">수락</button><button type="button" class="pw-decline">거절 <small></small></button></div>`;
  }
  tickOffer();
 }
 function tickOffer(){
  if(offer.hidden||!st.offer)return;
  const left=secondsLeft(st.offer.until,now()),ms=st.offer.ms||30000;
  offer.querySelector('.pw-bar i').style.transform=`scaleX(${Math.max(0,Math.min(1,(st.offer.until-now())/ms))})`;
  offer.querySelector('.pw-decline small').textContent=`${left}초`;
 }
 offer.addEventListener('click',e=>{if(e.target.closest('.pw-accept'))fire('hiking:pair-accept');else if(e.target.closest('.pw-decline'))fire('hiking:pair-decline');});
 // 위쪽 칩·알림 자리: 연결 상태 칩(.me-chip) 바로 아래(세로 휴대폰·PC). 휴대폰 가로는 CSS 기본 자리(오른쪽 위 태그 아래).
 // 진행 카드 위에 겹치지 않게 하려는 것(세로 휴대폰은 진행 카드가 화면 폭을 다 씀).
 const landscape=()=>!!win.matchMedia?.('(orientation:landscape) and (max-height:540px)').matches;
 function placeChip(){
  const me=doc.querySelector('.me-chip'),r=me&&!me.hidden?me.getBoundingClientRect():null,use=r&&r.width&&!landscape()&&r.top<win.innerHeight/2;
  for(const [el,below] of [[chip,null],[note,chip]]){
   if(!use){el.style.left=el.style.top=el.style.transform='';continue;}
   const b=below&&!below.hidden?below.getBoundingClientRect():null,top=(b&&b.height?b.bottom:r.bottom)+8;
   el.style.top=`${Math.round(top)}px`;el.style.transform='none';
   el.style.left=`${Math.round(Math.max(8,Math.min(r.left,win.innerWidth-el.offsetWidth-8)))}px`;
  }
 }
 function renderChip(){
  const m=joined?chipModel(st):null;chip.hidden=!m;body.classList.toggle('pw-paired',st.phase==='paired');
  placeChip();if(!m)return;
  chip.dataset.kind=m.kind;chip.classList.toggle('lag',!!m.lag);
  const sig=JSON.stringify(m);if(chip.dataset.sig===sig)return;chip.dataset.sig=sig;
  chip.innerHTML=`<span class="pw-chip-text"><b>${esc(m.title)}</b><small>${esc(m.sub)}</small></span><button type="button" class="pw-chip-act" data-act="${m.action}">${esc(m.label)}</button>`;
  placeChip();
 }
 chip.addEventListener('click',e=>{const b=e.target.closest('.pw-chip-act');if(!b)return;fire(b.dataset.act==='end'?'hiking:pair-end':'hiking:pair-cancel');});
 function render(){renderOffer();renderChip();renderList();if(pickId)setPick(pickId);renderBtn();
  clearInterval(timer);if(st.phase==='incoming')timer=setInterval(tickOffer,250);}

 // ── 알림
 function showNote(text,kind=''){
  if(!text)return;note.textContent=text;note.dataset.kind=kind;placeChip();note.classList.add('on');clearTimeout(noteT);noteT=setTimeout(()=>note.classList.remove('on'),2800);
 }

 // ── 받기
 win.addEventListener('hiking:pair-state',e=>{st=e.detail??{phase:'idle'};render();});
 win.addEventListener('hiking:pair-note',e=>{const d=e.detail;if(!d||!joined)return;if(d.code==='offer'||d.code==='sent')return;showNote(d.text,d.code);});
 win.addEventListener('hiking:pair-people',e=>{people=e.detail?.people??[];renderList();if(pickId)setPick(pickId);renderBtn();});
 win.addEventListener('hiking:multi-status',e=>{
  const d=e.detail;if(!d)return;if(left&&d.state!=='connecting')return;left=false;
  joined=d.state==='online'||d.state==='reconnecting';if(!joined){setSheet(false);setPick(null);}render();
 });
 win.addEventListener('hiking:multi-join',()=>{left=false;});
 win.addEventListener('hiking:multi-leave',()=>{joined=false;left=true;people=[];st={phase:'idle'};setSheet(false);setPick(null);render();});
 win.addEventListener('resize',()=>{placeBtn();placeChip();});
 // 💬 버튼이 나중에 보이거나 자리를 옮기면 따라간다
 const mo=win.MutationObserver?new win.MutationObserver(()=>placeBtn()):null;
 const watch=()=>{const h=doc.querySelector('.hc-btn');if(h&&mo&&!h._pwObserved){mo.observe(h,{attributes:true,attributeFilter:['hidden','style']});h._pwObserved=true;}};
 win.setInterval?.(watch,1000);watch();
 render();
 return {openList:()=>setSheet(true),close:()=>{setSheet(false);setPick(null);},get state(){return st;},get people(){return people;}};
}
