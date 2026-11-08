// 등산 수첩 HUD(책갈피 탭·종이 시트·빨간 도장·상황 꼬리표·시간대 색). 사양: docs/UI-등산수첩-사양.md
// main.js와는 window 이벤트로만 만난다. 버튼 id와 단축키는 그대로이고, 이 모듈은 배치·상태 표시만 맡는다.
//  - 읽기: 'hiking:state'(자세·자동 걷기·기구·스테미너), 'hiking:environment'(해 높이 → 낮·노을·밤),
//          'hiking:interact-view'(상호작용 줄, interaction-ui.js), 'hiking:action-view'(행동 진행)
//  - 쓰기: 'hiking:command'(interact·choice-2·choice-3·sit·auto·stretch·labels-toggle·card-open), 'hiking:quality', 'hiking:feedback-open'(💌 의견 보내기)
import {staminaView} from './hud.js';
import {installFeedback} from './feedback.js';
import {DONATE_URL} from './donate.js';
import {checkpoints} from './route.js';
import {GATE_S} from './plaza.js';
import {COURSE_LENGTH} from './movement.js';

export const SHEETS=Object.freeze(['backpack','rest','settings','jump','free']);
// 해 높이(도) → HUD 색. 노을은 해가 지평선 근처(−4°~8°)일 때다. 값을 모르면 낮.
export function timeOfDay(elevation){
 if(!Number.isFinite(elevation))return 'day';
 return elevation< -4?'night':elevation<8?'dusk':'day';
}
// 상호작용 줄 하나 → 도장 모양(사양 3-2).
const STAMP_RULES=[
 [/^이정표/,'🪧','읽기',()=>'이정표'],
 [/읽기$/,'🪧','읽기',()=>'안내판'],
 [/^정상 인증/,'㊞','정상 인증',()=>'연주대'],
 [/^스탬프 ✓/,'✓','찍음',()=>'이미 찍었어요'],
 [/^스탬프 찍기/,'㊞','찍기',l=>l.split('·')[1]?.trim()||'스탬프'],
 [/완등 기록 카드/,'🏅','카드',()=>'정상 인증 완료'],
 [/약수/,'💧','마시기',()=>'약수'],
 [/손 담그기/,'🖐','담그기',()=>'계곡물'],
 [/돌 올리기/,'🪨','올리기',()=>'돌탑'],
 [/^인사/,'👋','인사',(l,r)=>r.sub||'함께 걷기'],
 [/자세히$/,'🔎','자세히',l=>l.replace(/\s*자세히$/,'')],
];
export function stampFor(row={}){
 const label=String(row.label??'');
 const hit=STAMP_RULES.find(([re])=>re.test(label));
 const v=hit?{ic:hit[1],label:hit[2],sub:hit[3](label,row)}:{ic:'☝',label:label.slice(0,6)||'하기',sub:''};
 if(row.state==='lock'){const sec=String(row.reason??'').match(/(\d+)\s*초/);return {...v,ic:'⏳',label:sec?`${sec[1]}초`:'잠시 뒤',cls:'lock'};}
 if(row.state==='done')return {...v,label:hit?.[2]==='읽기'?'다시 읽기':v.label,cls:'done'};
 return {...v,cls:''};
}
// 도장 상태(사양 3-1 우선순위). rows가 있으면 첫 줄이 도장, 나머지는 상황 꼬리표.
export function stampView({rows=null,action=null,pose='stand',auto=false,gadget='none'}={}){
 if(gadget&&gadget!=='none')return {mode:'hidden'};
 if(action){const step=String(action.step||action.label||'').replace(/[…\.]+$/,'');return {mode:'busy',ic:action.breath?'🧘':'⏳',label:step||'하는 중',sub:'움직이면 멈춰요',key:'',cls:'busy',progress:Math.max(0,Math.min(1,action.progress||0))};}
 if(pose&&pose!=='stand')return {mode:'stand-up',ic:'🧍',label:'일어나기',sub:'쉬는 중',key:'C',cls:''};
 if(rows?.length){const s=stampFor(rows[0]);return {mode:'interact',...s,key:rows[0].key||'F'};}
 if(auto)return {mode:'stop',ic:'✋',label:'멈추기',sub:'자동 걷기 중',key:'R',cls:'walking'};
 return {mode:'walk',ic:'▶',label:'걷기',sub:'자동 걷기',key:'R',cls:''};
}
// 상황 꼬리표 제목·둘째 줄. 읽기는 대상 이름(sub)을 제목으로 올린다.
export function contextView(rows){
 if(!rows?.length)return null;
 const [r,...rest]=rows,read=/읽기$/.test(r.label??'');
 return {head:read?(r.sub||r.label):r.label,sub:read?r.label.replace(/\s*읽기$/,''):(r.state==='lock'?'':r.sub||''),lock:r.state==='lock'?r.reason||'':'',
  alts:rest.map((x,i)=>({cmd:`choice-${i+2}`,key:x.key,label:x.label,sub:x.state==='lock'?x.reason||x.sub:x.sub,state:x.state}))};
}
// 진행 막대 위 체크포인트 눈금(일주문 기준 0~1).
export const checkpointTicks=(list=checkpoints,gate=GATE_S,length=COURSE_LENGTH)=>list.map(c=>({id:c.id,at:Math.max(0,Math.min(1,(c.s-gate)/length))}));
export const formatRemainKm=m=>`${(Math.max(0,m)/1000).toFixed(1)} km`;
// 화질 단추 글자(main.js가 #quality에 쓰는 글) → 고른 모드.
export function qualityModeFromText(text=''){
 if(/자동/.test(text))return 'auto';
 return /높음/.test(text)?'high':/균형/.test(text)?'balanced':/낮음/.test(text)?'low':'auto';
}
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

export function installNotebookHud(doc=document,win=window){
 const app=doc.getElementById('app');if(!app||!app.querySelector('.nb-tabs'))return null;
 const root=doc.documentElement,body=doc.body,$=s=>app.querySelector(s),all=s=>[...doc.querySelectorAll(s)];
 const send=(id,value)=>win.dispatchEvent(new CustomEvent('hiking:command',{detail:{id,value}}));
 const stamp=doc.getElementById('auto'),ctx=$('.nb-ctx'),tabs=$('.nb-tabs'),sheets=$('.nb-sheets');
 if(new URLSearchParams(win.location?.search??'').has('multi'))body.classList.add('nb-multi');
 // ── 진행 카드 접기: 휴대폰 세로에서는 카드가 풍경을 많이 가려 처음엔 접고(상태·속도·스테미너만), 고른 상태는 기억한다 ──
 const card=$('.nb-card'),fold=doc.getElementById('card-fold');
 if(card&&fold){
  const KEY='gwanak:card-folded';let saved=null;try{saved=win.localStorage?.getItem(KEY);}catch{}
  const setFold=on=>{card.classList.toggle('folded',on);fold.setAttribute('aria-expanded',String(!on));fold.setAttribute('aria-label',on?'등반 정보 펼치기':'등반 정보 접기');fold.firstElementChild.textContent=on?'▾':'▴';};
  setFold(saved!=null?saved==='1':!!win.matchMedia?.('(orientation:portrait) and (max-width:600px)').matches);
  fold.addEventListener('click',()=>{const on=!card.classList.contains('folded');setFold(on);try{win.localStorage?.setItem(KEY,on?'1':'0');}catch{}});
 }
 // ── 시간대 색 ──
 const setTime=t=>{if(root.dataset.hudTime!==t)root.dataset.hudTime=t;};
 setTime('day');
 win.addEventListener('hiking:environment',e=>setTime(timeOfDay(e.detail?.sunElevation)));
 // ── 진행 막대 체크포인트 눈금 ──
 const ticks=$('.nb-ticks');
 if(ticks)ticks.innerHTML=checkpointTicks().map(t=>`<u data-cp="${esc(t.id)}" style="left:${(t.at*100).toFixed(2)}%"></u>`).join('');
 // ── 탭과 종이 시트 ──
 let openSheet=null;
 function setSheet(id){
  openSheet=SHEETS.includes(id)?id:null;
  for(const s of all('.nb-sheet'))s.hidden=s.dataset.sheet!==openSheet;
  for(const t of tabs.querySelectorAll('[data-tab]')){const on=t.dataset.tab===openSheet||((openSheet==='jump'||openSheet==='free')&&t.dataset.tab==='settings');if(t.hasAttribute('aria-expanded'))t.setAttribute('aria-expanded',String(on));t.classList.toggle('on',on);}
  body.classList.toggle('nb-sheet-open',!!openSheet);
  if(openSheet)syncSheets();
 }
 tabs.addEventListener('click',e=>{
  const t=e.target.closest('[data-tab]');if(!t)return;
  // 지도·수첩 탭은 기존 버튼(#map-toggle·#stamps)이라 main.js가 대화창을 연다. 여기서는 열린 시트만 접는다.
  if(!t.hasAttribute('aria-expanded')){setSheet(null);return;}
  setSheet(openSheet===t.dataset.tab?null:t.dataset.tab);t.blur();
 });
 // 설정 시트에 「💌 의견 보내기」 줄(공용 src/feedback.js 카드를 'hiking:feedback-open' 이벤트로 연다)
 const fbSlot=$('#nb-sheet-settings .nb-grid');
 if(fbSlot&&!fbSlot.querySelector('[data-act=feedback]')){
  const fb=doc.createElement('button');fb.type='button';fb.className='nb-it';fb.dataset.act='feedback';
  fb.innerHTML='<em aria-hidden="true">💌</em><span>의견 보내기</span><small>고장·바라는 점</small>';
  fbSlot.insertBefore(fb,fbSlot.querySelector('[data-dev-slot]'));
 }
 // 그 옆에 「💗 후원하기」 링크(새 탭). <a>라 아래 시트 click 처리(button만 봄)를 타지 않는다
 if(fbSlot&&!fbSlot.querySelector('[data-act=donate]')){
  const dn=doc.createElement('a');dn.className='nb-it';dn.dataset.act='donate';dn.href=DONATE_URL;dn.target='_blank';dn.rel='noopener noreferrer';dn.style.textDecoration='none';
  dn.innerHTML='<em aria-hidden="true">💗</em><span>후원하기</span><small>새 탭에서 열려요</small>';
  fbSlot.insertBefore(dn,fbSlot.querySelector('[data-dev-slot]'));
 }
 let envView={};
 win.addEventListener('hiking:environment',e=>{const d=e.detail||{};envView={time:d.timeLabel,day:timeOfDay(d.sunElevation),weather:d.weatherLabel};});
 const DAY_KO={day:'낮',dusk:'노을',night:'밤'};
 installFeedback({exp:'hiking',openEvent:'hiking:feedback-open',doc,win,
  state:()=>({시간대:envView.day?`${DAY_KO[envView.day]}${envView.time?` · ${envView.time}`:''}`:'',날씨:envView.weather||''})});
 sheets.addEventListener('click',e=>{
  if(e.target.closest('[data-sheet-close]')){setSheet(null);return;}
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.proxy){doc.getElementById(b.dataset.proxy)?.click();b.blur();}
  else if(b.dataset.cmd){send(b.dataset.cmd);b.blur();}
  else if(b.dataset.act==='multi'){body.classList.toggle('nb-multi-open');}
  else if(b.dataset.act==='city-labels'){win.dispatchEvent(new CustomEvent('hiking:city-labels'));b.blur();}
  else if(b.dataset.quality){win.dispatchEvent(new CustomEvent('hiking:quality',{detail:{mode:b.dataset.quality}}));b.blur();}
  else if(b.dataset.act==='feedback'){setSheet(null);b.blur();win.dispatchEvent(new CustomEvent('hiking:feedback-open'));return;}
  // 다른 화면을 여는 항목은 시트를 접는다.
  if(b.id==='help-toggle'||b.id==='hud-hide'||b.dataset.proxy==='lock'||b.dataset.cmd==='stretch'&&openSheet==='rest')setSheet(null);
  else syncSheets();
 });
 win.addEventListener('hiking:sheet',e=>setSheet(e.detail?.id??null));
 // ESC: 열린 시트를 먼저 닫는다(input.js의 ESC 처리보다 앞, 같은 키로 기구까지 닫지 않게).
 win.addEventListener('keydown',e=>{if(e.code==='Escape'&&openSheet&&!doc.querySelector('dialog[open]')){e.stopPropagation();e.preventDefault();setSheet(null);}},true);
 // 바깥을 누르면 닫힌다.
 doc.addEventListener('pointerdown',e=>{if(openSheet&&!e.target.closest?.('.nb-sheet,.nb-tabs'))setSheet(null);},true);
 // ── 시트 안 거울 항목(원래 버튼 상태를 그대로 보여 준다) ──
 let lastState={};
 function syncSheets(){
  for(const b of all('.nb-sheet [data-proxy]')){
   const src=doc.getElementById(b.dataset.proxy);if(!src)continue;
   const pressed=src.getAttribute('aria-pressed');if(pressed!==null)b.setAttribute('aria-pressed',pressed);
   b.classList.toggle('on',pressed==='true'||src.classList.contains('active'));
   if(b.dataset.proxy==='sit'){const seated=lastState.pose&&lastState.pose!=='stand';b.querySelector('span').textContent=seated?'일어나기':'앉기';b.querySelector('small').textContent=seated?'다시 걸을 준비':'그 자리에 앉아 쉬기';}
   if(b.dataset.proxy==='tea'){const seated=lastState.pose&&lastState.pose!=='stand';b.disabled=!seated||src.disabled;b.classList.toggle('off',!seated);b.querySelector('small').textContent=lastState.pose==='tea'?'마시는 중':seated?'따뜻한 차 한 잔':'앉으면 마실 수 있어요';}
   if(b.dataset.proxy==='sound-toggle')b.querySelector('[data-sound-label]').textContent=src.querySelector('span')?.textContent?.replace('소리 ','')??'';
  }
  const st=staminaView(lastState),rv=$('[data-rest-stamina]'),rb=$('[data-rest-bar]');
  if(rv)rv.textContent=String(st.percent);if(rb){rb.dataset.level=st.level;rb.firstElementChild.style.width=`${st.width}%`;}
  const q=doc.getElementById('quality'),mode=qualityModeFromText(q?.textContent);
  for(const b of all('.nb-seg [data-quality]')){const on=b.dataset.quality===mode;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));}
 }
 // ── 도장·상황 꼬리표 ──
 let rows=null,action=null,stampSig='',ctxSig='';
 const stampHtml=v=>`<i class="ic" aria-hidden="true">${esc(v.ic)}</i><span>${esc(v.label)}</span><small>${esc(v.sub)}</small>${v.key?`<kbd>${esc(v.key)}</kbd>`:''}`;
 function renderStamp(){
  const v=stampView({rows,action,pose:lastState.pose,auto:!!lastState.auto,gadget:lastState.gadget});
  const sig=`${v.mode}|${v.ic}|${v.label}|${v.sub}|${v.key}|${v.cls}`;
  if(sig!==stampSig){stampSig=sig;stamp.dataset.mode=v.mode;stamp.className=`primary nb-stamp ${v.cls||''}${lastState.auto?' active':''}`.trim();if(v.mode!=='hidden')stamp.innerHTML=stampHtml(v);
   stamp.setAttribute('aria-label',v.mode==='walk'||v.mode==='stop'?`자동 걷기 ${v.mode==='stop'?'끄기':'켜기'} (R)`:`${v.label}${v.sub?' · '+v.sub:''}${v.key?` (${v.key})`:''}`);
   body.dataset.stamp=v.mode;}
  stamp.style.setProperty('--p',v.mode==='busy'?`${(v.progress*100).toFixed(1)}%`:'0%');
  // 상황 꼬리표: 도장이 상호작용일 때만. 마지막 줄은 늘 '▶ 자동 걷기'.
  const c=v.mode==='interact'?contextView(rows):null,cs=c?JSON.stringify(c)+lastState.auto:'';
  if(cs!==ctxSig){ctxSig=cs;ctx.hidden=!c;
   if(c)ctx.innerHTML=`<b class="nb-ctx-head">${esc(c.head)}</b>${c.sub?`<span class="nb-ctx-sub">${esc(c.sub)}</span>`:''}${c.lock?`<span class="nb-ctx-sub nb-lock">${esc(c.lock)}</span>`:''}`
    +c.alts.map(a=>`<button type="button" class="nb-alt${a.state==='lock'?' lock':''}" data-cmd="${a.cmd}"><em aria-hidden="true">${esc(stampFor(a).ic)}</em><span>${esc(a.label)}<kbd>${esc(a.key)}</kbd><small>${esc(a.sub)}</small></span></button>`).join('')
    +`<button type="button" class="nb-alt" data-cmd="auto"><em aria-hidden="true">${lastState.auto?'✋':'▶'}</em><span>${lastState.auto?'자동 걷기 멈추기':'자동 걷기'}<kbd>R</kbd><small>도장이 바뀌어도 여기서 켜고 끌 수 있어요</small></span></button>`;}
 }
 ctx.addEventListener('click',e=>{const b=e.target.closest('[data-cmd]');if(b){send(b.dataset.cmd);b.blur();}});
 // 도장: 평소(걷기·멈추기)는 #auto 원래 클릭(main.js)으로 보내고, 다른 상태에서는 그 행동 명령으로 바꾼다.
 $('.nb-dial').addEventListener('click',e=>{
  if(!e.target.closest('#auto'))return;const mode=stamp.dataset.mode;
  if(mode==='walk'||mode==='stop')return;
  e.stopPropagation();stamp.blur();
  if(mode==='interact')send('interact');else if(mode==='stand-up')send('sit');
 },true);
 win.addEventListener('hiking:interact-view',e=>{rows=e.detail?.rows?.length?e.detail.rows:null;renderStamp();});
 win.addEventListener('hiking:action-view',e=>{action=e.detail||null;renderStamp();});
 // ── 게임 상태 ──
 const surface=doc.getElementById('surface'),mapSurface=doc.querySelector('[data-map-surface]'),qNow=$('.nb-q'),quality=doc.getElementById('quality');
 let tabSig='';
 win.addEventListener('hiking:state',e=>{
  const s=e.detail||{};lastState=s;
  const pose=s.pose||'stand';if(body.dataset.pose!==pose)body.dataset.pose=pose;
  const g=s.gadget||'none';if(body.dataset.gadget!==g)body.dataset.gadget=g;
  if(Number.isFinite(s.courseDistance)&&Number.isFinite(s.courseLength)&&ticks){
   for(const u of ticks.children)u.classList.toggle('got',(s.checkpoints||[]).includes(u.dataset.cp));
  }
  if(mapSurface&&surface)mapSurface.textContent=surface.textContent;
  if(qNow&&quality){const t=`· ${quality.textContent.replace(/^화질\s*/,'화질 ')}`;if(qNow.textContent!==t)qNow.textContent=t;}
  // 지도·수첩 탭: 열린 대화창이면 종이색(on).
  const mapOpen=!!doc.getElementById('map')?.open,bookOpen=!!doc.querySelector('.ix-book:not([hidden])'),sig=`${mapOpen}${bookOpen}`;
  if(sig!==tabSig){tabSig=sig;tabs.querySelector('[data-tab=map]')?.classList.toggle('on',mapOpen);tabs.querySelector('[data-tab=book]')?.classList.toggle('on',bookOpen);}
  renderStamp();if(openSheet)syncSheets();
 });
 // 정상 도착 → 완등 기록 카드. 대화창이 열려 있으면 main.js가 명령을 받지 않으므로 먼저 닫는다.
 doc.querySelector('[data-summit-card]')?.addEventListener('click',()=>{doc.getElementById('summit')?.close();send('card-open');});
 renderStamp();
 return {setSheet,get openSheet(){return openSheet;},renderStamp};
}
