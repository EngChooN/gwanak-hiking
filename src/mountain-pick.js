// 산 고르기(첫 화면). 사양: docs/UI-산고르기-자유설정-사양.md §1
// 로딩은 뒤에서 그대로 진행한다(메모리는 예전과 같음). '▶ 오르기'가 출발 신호('hiking:start')를 보낸다.
// 이 모듈은 main.js보다 먼저 실행되어 수동 시작(data-start-mode=manual)을 걸어 둔다.
// 건너뛰기: ?pick=off, 자동화 브라우저(navigator.webdriver)는 ?pick=on일 때만 보인다(기존 점검 스크립트가 그대로 돌게).
import './free-settings.css';
import {MOUNTAINS,formatEta} from './mountains.js';
import {SEASON_LABEL,SEASON_ICON} from './season.js';
import {seasonTag} from './free-settings.js';
import {freeState,onFreeChange,panelHTML,handlePanelClick,sealFor,recordHTML,sealSeenOnce,applyHudTime,mountFreeSettingsHud} from './free-settings-ui.js';
import {summitOf} from './summit-records.js';
import {SAVE_KEY} from './movement.js';
import {seoulClock,sunPosition} from './daytime.js';
import {START_EVENT} from './loading.js';
import {hikingServerPick,hikingPickMode} from './hiking-server-pick.js';
import {loadPickName,savePickName,PICK_LABELS} from './server-pick.js';
import {NET} from './multi-protocol.js';

const q=new URLSearchParams(location.search);
export const pickEnabled=(search=location.search,webdriver=!!navigator.webdriver)=>{const p=new URLSearchParams(search).get('pick');return p==='on'||(p!=='off'&&!webdriver);};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// ── 카드 그림: 능선·점선 코스·정상 깃발. 나무 색은 계절, 하늘은 시간대(사양 §4 색) ──
const TREE={spring:['#f6c9d8','#d4819f','#c2e46e','#8fc24a'],summer:['#61973b','#3f7124','#7aae4a','#4f8a2e'],autumn:['#ef5a3c','#f6a03c','#f8d44c','#c9772f'],winter:['#4b3f39','#6a5a50','#4b3f39','#5c4e46']};
const GROUND={spring:['#a9d27a','#7fb455'],summer:['#7fb455','#5a9a30'],autumn:['#d9b45e','#b98a3c'],winter:['#f4f8fc','#cfdbea']};
const SKY={day:['#7fbbe8','#dceefa'],dusk:['#5b6aa8','#ffb877'],night:['#121c45','#36406e']};
export function mountainArt(m,{season='autumn',time='day',w=362,h=150,gray=false}={}){
 const r=m.art?.ridge??[.3,.5,.7,.5,.3],n=r.length,pt=i=>[i/(n-1)*w,h-(r[i]*.62+.18)*h];
 const ridge=r.map((_,i)=>pt(i)),back=`M0 ${h} `+ridge.map(([x,y],i)=>`L${x.toFixed(1)} ${(y+h*.12+Math.sin(i*1.7)*6).toFixed(1)}`).join(' ')+` L${w} ${h}Z`;
 const front=`M0 ${h} `+ridge.map(([x,y])=>`L${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')+` L${w} ${h}Z`;
 const peakI=Math.round((m.art?.peak??.6)*(n-1)),[px,py]=ridge[peakI],[sx,sy]=[w*.06,h*.92];
 const t=TREE[season],g=GROUND[season],sky=SKY[time];
 let trees='';let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
 for(let i=0;i<38;i++){const x=rnd()*w,k=Math.min(n-1.001,x/w*(n-1)),a=Math.floor(k),f=k-a,top=ridge[a][1]*(1-f)+ridge[a+1][1]*f,y=top+8+rnd()*(h-top-10),s=5+rnd()*5,c=t[Math.floor(rnd()*t.length)];
  trees+=season==='winter'?`<path d="M${x.toFixed(1)} ${y.toFixed(1)} v-${(s*1.6).toFixed(1)} m0 ${(s*.6).toFixed(1)} l-${(s*.5).toFixed(1)} -${(s*.6).toFixed(1)} m${(s*.5).toFixed(1)} ${(s*.9).toFixed(1)} l${(s*.5).toFixed(1)} -${(s*.6).toFixed(1)}" stroke="${c}" stroke-width="1.3" fill="none"/>`
   :`<circle cx="${x.toFixed(1)}" cy="${(y-s*.6).toFixed(1)}" r="${s.toFixed(1)}" fill="${c}"/>`;}
 const course=`M${sx} ${sy} C${w*.25} ${h*.82} ${w*.3} ${h*.62} ${w*.45} ${h*.6} S${px-30} ${py+30} ${px} ${py+2}`;
 return `<svg class="pk-art" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true"${gray?' style="filter:grayscale(1) contrast(.8) brightness(1.05)"':''}>
<defs><linearGradient id="pks${m.id}${time}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#pks${m.id}${time})"/>${time==='night'?`<circle cx="${w*.82}" cy="${h*.2}" r="7" fill="#f6eccb"/>`:time==='dusk'?`<circle cx="${w*.18}" cy="${h*.52}" r="11" fill="#ffd28a" opacity=".9"/>`:''}
<path d="${back}" fill="${g[1]}" opacity=".55"/><path d="${front}" fill="${g[0]}"/>${trees}
<path d="${course}" fill="none" stroke="#fbf3df" stroke-width="2.4" stroke-dasharray="5 5" stroke-linecap="round"/>
<g transform="translate(${px.toFixed(1)} ${(py+2).toFixed(1)})"><line x1="0" y1="0" x2="0" y2="-20" stroke="#4a3618" stroke-width="2"/><path d="M0 -20 L14 -15 L0 -10Z" fill="#b9472f"/></g>
${time==='night'?`<rect width="${w}" height="${h}" fill="#0a1030" opacity=".28"/>`:''}</svg>`;
}

// 닉네임 칸(흡연장 로비 '입장하기'의 닉네임처럼). 저장값은 서버 고르기 창과 같은 NAME_KEY 'gwanak-multi-name'.
// 비우면 서버가 등산객XXXX를 붙인다. 고치는 대로 저장 → 다음 서버 고르기 창·👋 함께 걷기·다음 방문에 그대로 채워진다.
export function nickFieldHTML(name=''){
 return `<label class="pk-nick"><span class="pk-nick-k">✎ 닉네임 <small>${NET.nameMax}자까지 · 비우면 ${esc(PICK_LABELS.hiking.anon)}</small></span><input name="pk-nick" type="text" maxlength="${NET.nameMax}" placeholder="${esc(PICK_LABELS.hiking.anon)}" value="${esc(name)}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" aria-label="닉네임"></label>`;
}
// 글자를 치는 동안 걷기 단축키(R·C·F·WASD·Space…)가 먹히지 않게. Esc는 통과, Enter는 입력을 마친다(휴대폰 키보드 닫기).
export function bindNickInput(input,{storage=globalThis.localStorage,win=globalThis.window}={}){
 for(const ev of ['keydown','keyup','keypress'])input.addEventListener(ev,e=>{if(e.key==='Escape')return;e.stopPropagation();if(ev==='keydown'&&e.key==='Enter'){e.preventDefault();input.blur();}});
 input.addEventListener('input',()=>{savePickName(input.value,storage);fit();});
 input.addEventListener('change',()=>{input.value=savePickName(input.value,storage);});
 // 휴대폰 키보드가 올라오면 보이는 높이(visualViewport)에 맞춰 칸이 가려지지 않게 화면 안으로 끌어올린다
 const vv=win?.visualViewport,root=input.closest('#mountain-pick');
 function fit(){if(input.ownerDocument.activeElement!==input)return;const kb=vv?Math.max(0,win.innerHeight-vv.height-vv.offsetTop):0;root?.style.setProperty('--kb',`${Math.round(kb)}px`);input.scrollIntoView({block:'center',inline:'nearest'});}
 input.addEventListener('focus',()=>{root?.classList.add('pk-typing');setTimeout(fit,60);setTimeout(fit,350);});
 input.addEventListener('blur',()=>{root?.classList.remove('pk-typing');root?.style.removeProperty('--kb');});
 vv?.addEventListener('resize',fit);
 return input;
}

function hasResume(){try{const v=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');return !!v&&(v.zone!=='plaza'||(v.elapsed||0)>5);}catch{return false;}}
function headSub(){
 const c=seoulClock(Date.now()),a=freeState.actual,time=freeState.free.time??a.time,season=freeState.free.season??a.season;
 const wIcon={clear:time==='night'?'🌙':'☀',overcast:'☁',rain:'🌧',snow:'❄',fog:'🌫'}[freeState.free.weather??a.weather]??'☀';
 const wLabel={clear:'맑음',overcast:'흐림',rain:'비',snow:'눈',fog:'안개'}[freeState.free.weather??a.weather];
 return `지금 서울 · ${c.month}월 ${c.day}일 ${SEASON_ICON[season]} ${SEASON_LABEL[season]} · ${wIcon} ${c.label} ${wLabel}`;
}

export function mountMountainPick(doc=document,win=window){
 const root=doc.createElement('div');root.id='mountain-pick';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','산 고르기');
 root.innerHTML=`<div class="pk-dim"></div><header class="pk-head"><p class="pk-brand"><b>산길</b>등산 수첩${freeState.dev?'<span class="pk-devtag">🛠 개발 버전 · 자유 설정 열림</span>':''}</p><h1 class="pk-title">어느 산에 오를까요?</h1><p class="pk-sub" data-pk-now></p><p class="pk-sub pk-sub2">${MOUNTAINS.length===1?'지금은 1곳 · 산은 계속 늘어나요':`산 ${MOUNTAINS.length}곳 · 넘겨 보세요`}</p>${nickFieldHTML(loadPickName())}</header><div class="pk-list" role="list"></div><div class="pk-free" hidden><section class="fs-panel fs-pick" role="dialog" aria-label="자유 설정"></section></div><p class="pk-toast" role="status" hidden></p>`;
 doc.body.append(root);doc.documentElement.classList.add('pk-open');
 const nick=bindNickInput(root.querySelector('.pk-nick input'),{win}),list=root.querySelector('.pk-list'),freeBox=root.querySelector('.pk-free'),panel=freeBox.firstElementChild,toast=root.querySelector('.pk-toast'),now=root.querySelector('[data-pk-now]');
 let toastTimer=0;const say=t=>{toast.textContent=t;toast.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toast.hidden=true;},2600);};
 const size=()=>{const land=matchMedia('(orientation:landscape) and (max-height:540px)').matches,port=matchMedia('(orientation:portrait)').matches;return land?{w:300,art:112,seal:70}:port?{w:Math.min(362,innerWidth-28),art:150,seal:84}:{w:400,art:220,seal:104};};
 let animateSeal=MOUNTAINS.map(m=>sealSeenOnce(m.id)),sizeSig='';
 function cards(){
  const z=size(),a=freeState.actual,time=freeState.free.time??a.time,season=freeState.free.season??a.season,resume=hasResume();
  list.innerHTML=MOUNTAINS.map((m,i)=>{
   const r=summitOf(freeState.records,m.id),soon=!m.ready,unlocked=freeState.unlocked,devOnly=freeState.dev&&!r;
   const rec=soon?'산이 추가되면 이 카드가 열려요':r?recordHTML(r):devOnly?'아직 완등 전 · 개발 버전이라 자유 설정이 열려 있어요':'아직 오르지 않았어요 · 연주대에서 도장을 받아요';
   return `<article class="pk-card${soon?' soon':''}" role="listitem" data-mountain="${m.id}" style="width:${z.w}px">
<div class="pk-art-wrap">${mountainArt(m,{season:soon?'summer':season,time,w:z.w,h:z.art,gray:soon})}<span class="pk-tag">${soon?'⏳ 준비 중':esc(seasonTag(freeState.free,a.season))}</span></div>
<div class="pk-body"><div class="pk-top"><div class="pk-who"><h2 class="pk-name">${esc(m.name)} <small>${m.altitudeM} m</small></h2><span class="pk-course">${esc(m.course)}</span></div><div class="pk-seal${animateSeal[i]?' fs-stamping':''}">${soon?'':sealFor(m.id,z.seal,freeState.records)}</div></div>
<div class="pk-facts"><span>거리<b>${soon?'—':`${m.distanceKm} km`}</b></span><span>예상<b>${soon?'—':formatEta(m.etaMin)}</b></span><span>스탬프<b>${soon?'—':`${m.stamps}곳`}</b></span><span>난이도<b>${soon?'—':esc(m.difficulty)}</b></span></div>
<p class="pk-rec">${rec}</p>
<div class="pk-acts">${soon?'<button type="button" class="btn-paper fs-locked-btn" disabled style="flex:1">준비 중</button>':`<button type="button" class="btn-stamp" data-pk-go="${m.id}">▶ ${resume?'이어 오르기':'오르기'}</button><button type="button" class="btn-paper${unlocked?'':' fs-locked-btn'}" data-pk-free="${m.id}">${unlocked?'🎛':'🔒'} 자유 설정</button>`}</div></div></article>`;
  }).join('')+(MOUNTAINS.length===1?'<div class="pk-soon" aria-label="다음 산 준비 중"><b>⛰ 다음 산 준비 중</b><span>산이 늘어나면 이 자리에 카드가 붙어요</span></div>':'');
  animateSeal=animateSeal.map(()=>false);
 }
 function render(){now.textContent=headSub();cards();if(!freeBox.hidden)panel.innerHTML=panelHTML({context:'pick'});applyHudTime();}
 // 산 고르기 → 서버 고르기(함께 걷기 서버 or 혼자 걷기) → 출발. 서버 창을 건너뛰면 바로 출발.
 function go(){
  if(root.classList.contains('leaving'))return;
  root.classList.add('leaving');doc.documentElement.classList.remove('pk-open');
  nick.value=savePickName(nick.value); // '혼자 걷기'를 골라도 이름은 남는다(나중에 👋 함께 걷기에서 씀)
  if(hikingPickMode()==='show')hikingServerPick().open({closable:false});
  else{window.__hikingStartRequested=true;win.dispatchEvent(new CustomEvent(START_EVENT));}
  setTimeout(()=>root.remove(),450);
 }
 root.addEventListener('click',e=>{
  if(!freeBox.hidden&&freeBox.contains(e.target)){if(e.target===freeBox){freeBox.hidden=true;return;}handlePanelClick(e,{context:'pick',onGo:go,onClose:()=>{freeBox.hidden=true;}});return;}
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.pkGo)go();
  else if(b.dataset.pkFree){if(!freeState.unlocked){say('🔒 연주대에서 완등 도장을 받으면 열려요');return;}panel.innerHTML=panelHTML({context:'pick'});freeBox.hidden=false;panel.querySelector('button')?.focus({preventScroll:true});}
 });
 win.addEventListener('keydown',e=>{if(e.key==='Escape'&&!freeBox.hidden&&root.isConnected){freeBox.hidden=true;e.stopPropagation();}},true);
 onFreeChange(()=>{if(root.isConnected)render();});
 win.addEventListener('resize',()=>{const s=JSON.stringify(size());if(s!==sizeSig&&root.isConnected){sizeSig=s;cards();}});
 win.addEventListener('hiking:environment',e=>{if(e.detail?.realKind&&root.isConnected)now.textContent=headSub();});
 sizeSig=JSON.stringify(size());render();
 root.querySelector('[data-pk-go]')?.focus({preventScroll:true});
 return {root,go};
}

if(typeof document!=='undefined'){
 mountFreeSettingsHud();
 if(pickEnabled()){document.documentElement.dataset.startMode='manual';mountMountainPick();}
 // 산 고르기를 건너뛰어도(?pick=off, 점검 스크립트 + ?serverpick=on) 서버 고르기 창이 출발 문이 된다
 else if(hikingPickMode()==='show'){document.documentElement.dataset.startMode='manual';hikingServerPick().open({closable:false});}
 applyHudTime();
}
