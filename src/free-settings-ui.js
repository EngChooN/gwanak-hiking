// 자유 설정판·'등산 완료' 도장 화면. 사양: docs/UI-산고르기-자유설정-사양.md §2·§3
// main.js와는 window 이벤트로만 만난다(등산 수첩 HUD 규칙).
//  - 쓰기: 'hiking:free-settings'(바뀐 칸만 {weather|time|season}), 'hiking:free-start'({id} 출발 지점에서 다시 출발), 'hiking:sheet'
//  - 읽기: 'hiking:state'(지금 위치·남은 거리), 'hiking:environment'(실제 날씨 realKind), 'hiking:summit-record'(정상 도착 → 도장), 'hiking:started'
// 판 하나를 설정 탭 시트(data-sheet="free")와 산 고르기 화면(mountain-pick.js)에서 함께 쓴다.
import {WEATHER_CHOICES,TIME_CHOICES,SEASON_CHOICES,normalizeFree,isManual,loadFree,saveFree,FREE_START_KEY,actualValues,statusLine,chipText,freeUnlocked,devBuild,timeChoiceOf} from './free-settings.js';
import {loadSummits,summitOf,clearSummits,sealDate,recordLine,SEAL_SEEN_KEY} from './summit-records.js';
import {mountainById,DEFAULT_MOUNTAIN} from './mountains.js';
import {jumpTargets} from './section-jump.js';
import {route} from './route.js';
import {loadProgress,stampCount} from './interaction-logic.js';
import {STAMPS} from './interaction-data.js';

const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const store=k=>{try{return globalThis[k]??null;}catch{return null;}};
// ── 출발 지점 8곳(구간 이동 목록 + 정상) ──
const START_LABEL={plaza:'입구 광장',gate:'일주문',summit:'정상 연주대'};
export const START_POINTS=Object.freeze([...jumpTargets().map(t=>({id:t.id,label:START_LABEL[t.id]??t.label,s:t.pos.zone==='plaza'?0:t.pos.s})),{id:'summit',label:START_LABEL.summit,s:route.length}]);
// 지금 위치 → 지나온 마지막 출발 지점 번호
export function hereIndex(st){
 if(!st||st.zone==='plaza')return 0;if(st.zone==='summit')return START_POINTS.length-1;
 let i=0;START_POINTS.forEach((p,k)=>{if(Number.isFinite(st.s)&&st.s>=p.s-1)i=k;});return i;
}

// ── '등산 완료' 도장(사양 §2-1). 그림 파일 없이 SVG 한 장. 40px 이하는 잉크 효과를 뺀다. ──
let SEAL_N=0;
export function sealSVG(size,{name='관악산',date='',count=1,cls=''}={}){
 const id=`fs${SEAL_N++}`,ink=size>40;
 return `<svg class="fs-seal ${cls}" viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="${esc(name)} 등산 완료 ${esc(date)}${count>1?` · ${count}회`:''}">
<defs>${ink?`<filter id="f${id}" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="${4+SEAL_N%5}"/><feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.4 0 0 0 2.05"/><feComposite in="SourceGraphic" operator="in"/></filter>`:''}<path id="t${id}" d="M22 60 A38 38 0 0 1 98 60"/><path id="b${id}" d="M20 60 A40 40 0 0 0 100 60"/></defs>
<g fill="currentColor" stroke="currentColor"${ink?` filter="url(#f${id})"`:''}><circle cx="60" cy="60" r="55" fill="none" stroke-width="5"/><circle cx="60" cy="60" r="47.5" fill="none" stroke-width="1.6"/>
<text font-size="15" font-weight="900" stroke="none" letter-spacing="5" text-anchor="middle"><textPath href="#t${id}" startOffset="50%">${esc(name)}</textPath></text>
<text font-size="10" font-weight="800" stroke="none" letter-spacing="1.5" text-anchor="middle"><textPath href="#b${id}" startOffset="50%">${esc(date)}</textPath></text>
<text x="21" y="64" font-size="8" stroke="none" text-anchor="middle">★</text><text x="99" y="64" font-size="8" stroke="none" text-anchor="middle">★</text>
<path d="M38 57 L50 44 L56 50 L63 40 L82 57" fill="none" stroke-width="2.6" stroke-linejoin="round"/><line x1="33" y1="61" x2="87" y2="61" stroke-width="1.4"/>
<text x="60" y="81" font-size="17" font-weight="900" stroke="none" text-anchor="middle" letter-spacing="1">등산 완료</text></g>${count>1?`<g transform="rotate(12 104 100)"><circle cx="104" cy="100" r="13" fill="var(--paper)" stroke="currentColor" stroke-width="2"/><text x="104" y="104.5" font-size="12" font-weight="900" fill="currentColor" text-anchor="middle">×${count}</text></g>`:''}</svg>`;
}
export const sealSlot=size=>`<div class="fs-seal-slot" style="width:${size}px;height:${size}px"><span><i aria-hidden="true">⛰</i>완등 도장<br>자리</span></div>`;
export const recordHTML=r=>recordLine(r)?.map(([t,b])=>b?`<b>${esc(t)}</b>`:esc(t)).join('')??'';
export function sealFor(id,size,records){const r=summitOf(records,id);return r?sealSVG(size,{name:mountainById(id)?.name??'',date:sealDate(r.first),count:r.count}):sealSlot(size);}

// ── 상태 보관(한 탭에 하나) ──
const ss=store('sessionStorage'),ls=store('localStorage');
export const freeState={
 free:loadFree(ss),records:loadSummits(ls),dev:devBuild(),realKind:'clear',game:null,started:false,startPick:null,listeners:new Set(),
 get unlocked(){return freeUnlocked({records:this.records,mountain:DEFAULT_MOUNTAIN,dev:this.dev});},
 get actual(){return actualValues({weatherKind:this.realKind});},
};
const notify=()=>{for(const f of freeState.listeners)try{f();}catch(e){console.error(e);}};
export const onFreeChange=f=>{freeState.listeners.add(f);return ()=>freeState.listeners.delete(f);};
export function setFree(patch){
 const next=normalizeFree({...freeState.free,...patch}),changed={};
 for(const k of Object.keys(next))if(next[k]!==freeState.free[k])changed[k]=next[k];
 freeState.free=next;saveFree(ss,next);
 if(Object.keys(changed).length)globalThis.dispatchEvent?.(new CustomEvent('hiking:free-settings',{detail:changed}));
 notify();return changed;
}
export const resetFree=()=>setFree({weather:null,time:null,season:null});
// 출발 지점: 게임 중이면 바로 옮기고, 아직 출발 전(산 고르기)이면 출발할 때 쓰도록 남긴다.
export function chooseStart(id,{now=false}={}){
 if(!START_POINTS.some(p=>p.id===id))return false;
 freeState.startPick=id;
 if(now){
  if(freeState.started)globalThis.dispatchEvent(new CustomEvent('hiking:free-start',{detail:{id}}));
  else try{ss?.setItem(FREE_START_KEY,id);}catch{}
  freeState.startPick=null;
 }
 notify();return true;
}
export function refreshRecords(){freeState.records=loadSummits(ls);notify();}
// 시각 톤(낮·노을·밤): 게임이 시작되기 전(산 고르기)에도 종이색을 맞춘다. 게임 중에는 hud-notebook.js가 정한다.
export function applyHudTime(){
 const t=freeState.free.time??freeState.actual.time,root=document.documentElement;
 if(!freeState.started&&root.dataset.hudTime!==t)root.dataset.hudTime=t;
}

// ── 자유 설정판 HTML ──
const seg=(group,list,picked,real,locked)=>`<div class="fs-seg" style="grid-template-columns:repeat(${list.length},1fr)" role="group" aria-label="${group}">${list.map(([v,ic,label])=>{const on=picked===v,isReal=real===v;
 return `<button type="button" data-free-${group}="${v}" class="${on?'on':''}${isReal?' real':''}" aria-pressed="${on}"${locked?' disabled':''} title="${esc(label)}${isReal?' · 지금 실제 값':''}"><em aria-hidden="true">${ic}</em>${esc(label)}</button>`;}).join('')}</div>`;
const GROUP_LABEL={weather:'날씨',time:'시간',season:'계절'};
function routeSVG(sel,here){
 const n=START_POINTS.length,x=i=>14+i*(292/(n-1));
 return `<svg class="fs-route" viewBox="0 0 320 30" preserveAspectRatio="none" aria-hidden="true"><path d="M14 22 C70 22 90 12 140 15 S230 6 306 8" fill="none" stroke="var(--edge)" stroke-width="2.4" stroke-dasharray="5 4" vector-effect="non-scaling-stroke"/>${START_POINTS.map((p,i)=>{const y=22-i*(14/(n-1));const isSel=sel===i,isHere=here===i;return `<circle cx="${x(i)}" cy="${y}" r="${isSel?6.5:isHere?5.5:3.6}" fill="${isSel?'var(--stamp)':isHere?'var(--go)':'var(--ink2)'}" ${isHere&&!isSel?'stroke="var(--paper)" stroke-width="1.5"':''}/>`;}).join('')}</svg>`;
}
export function panelHTML({context='game'}={}){
 const f=freeState.free,a=freeState.actual,unlocked=freeState.unlocked,dev=freeState.dev&&!summitOf(freeState.records,DEFAULT_MOUNTAIN);
 const st=statusLine(f,a),here=freeState.started?hereIndex(freeState.game):-1,selIdx=START_POINTS.findIndex(p=>p.id===freeState.startPick);
 const head=`<h4><span class="fs-t">🎛 자유 설정${dev?' <i class="nb-devmark">🛠 개발 버전</i>':''}</span><button type="button" class="nb-close" data-free-close aria-label="자유 설정 닫기">✕</button></h4>`;
 if(!unlocked){
  const g=freeState.game,remain=g&&Number.isFinite(g.courseLength)?Math.max(0,(g.courseLength-(g.courseDistance||0))/1000):null,stamps=stampCount(loadProgress(ls));
  return `${head}<div class="fs-cols fs-lockcols"><div class="fs-lockbox">${sealSlot(context==='pick'?84:64)}<div><b>연주대 정상에서 완등 도장을 받으면 열려요</b><small>${remain!==null?`정상까지 ${remain.toFixed(1)} km · `:''}스탬프 ${stamps} / ${STAMPS.length}</small><div class="nb-prog fs-prog"><i style="width:${Math.round(stamps/STAMPS.length*100)}%"></i></div><small>열리면 날씨 · 시간 · 계절 · 출발 지점을 마음대로 골라요</small></div></div>
<div class="fs-ghost" aria-hidden="true">${['weather','time','season'].map(k=>`<div class="fs-lb">${GROUP_LABEL[k]}</div>${seg(k,{weather:WEATHER_CHOICES,time:TIME_CHOICES,season:SEASON_CHOICES}[k],null,null,true)}`).join('')}</div></div>`;
 }
 const left=`<div class="fs-now${st.manual?' manual':''}"><span class="fs-txt"><b>${esc(st.head)}</b>${esc(st.sub)}</span><button type="button" class="fs-reset${st.manual?'':' on'}" data-free-reset aria-pressed="${!st.manual}">${st.manual?'↺':'✓'} 현재 그대로</button></div>
<div class="fs-lb">날씨<small>고르면 바로 바뀌어요</small></div>${seg('weather',WEATHER_CHOICES,f.weather,a.weather)}
<div class="fs-lb">시간</div>${seg('time',TIME_CHOICES,f.time,a.time)}
<div class="fs-lb">계절</div>${seg('season',SEASON_CHOICES,f.season,a.season)}`;
 const goLabel=context==='pick'?'▶ 이대로 오르기':'📍 여기서 다시 출발';
 const goNote=context==='pick'?(selIdx>=0?`${START_POINTS[selIdx].label}에서 출발해요`:'고르지 않으면 원래 자리에서 출발해요'):'진행 기록은 새로 시작해요 · 완등 도장은 그대로 남아요';
 const right=`<div class="fs-lb">출발 지점<small>${here>=0?'초록 = 지금 있는 곳':'고른 곳에서 출발'}</small></div>${routeSVG(selIdx,here)}
<div class="fs-start" role="group" aria-label="출발 지점">${START_POINTS.map((p,i)=>`<button type="button" data-free-start="${p.id}" class="${selIdx===i?'on':''}${here===i?' here':''}" aria-pressed="${selIdx===i}"><i aria-hidden="true">${i+1}</i>${esc(p.label)}</button>`).join('')}</div>
<div class="fs-go"><button type="button" class="btn-stamp" data-free-go${context!=='pick'&&selIdx<0?' disabled':''}>${goLabel}</button><small>${esc(goNote)}</small></div>`;
 return `${head}<div class="fs-cols"><div class="fs-col">${left}</div><div class="fs-col">${right}</div></div>`;
}
// 판 안의 누름 처리(시트·산 고르기 공용). 처리했으면 true.
export function handlePanelClick(e,{context='game',onGo=null,onClose=null}={}){
 const b=e.target.closest('button');if(!b||b.disabled)return false;
 const d=b.dataset;
 if('freeClose' in d){onClose?.();return true;}
 if(!freeState.unlocked)return false;
 if('freeReset' in d){resetFree();}
 else if(d.freeWeather)setFree({weather:freeState.free.weather===d.freeWeather?null:d.freeWeather});
 else if(d.freeTime)setFree({time:freeState.free.time===d.freeTime?null:d.freeTime});
 else if(d.freeSeason)setFree({season:freeState.free.season===d.freeSeason?null:d.freeSeason});
 else if(d.freeStart)chooseStart(freeState.startPick===d.freeStart?null:d.freeStart)||(freeState.startPick=null,notify());
 else if('freeGo' in d){if(context==='pick'){if(freeState.startPick)chooseStart(freeState.startPick,{now:true});onGo?.();}else if(freeState.startPick){chooseStart(freeState.startPick,{now:true});onGo?.();}}
 else return false;
 b.blur?.();return true;
}

// ── 게임 화면에 붙이기: 설정 탭 항목·시트, 꼬리표, 지도 도장, 정상 도착 도장, 개발용 '완등 기록 지우기' ──
export function mountFreeSettingsHud(doc=document,win=window){
 const app=doc.getElementById('app'),sheets=app?.querySelector('.nb-sheets'),settings=app?.querySelector('[data-sheet="settings"] .nb-grid');
 if(!sheets||!settings)return null;
 const open=id=>win.dispatchEvent(new CustomEvent('hiking:sheet',{detail:{id}}));
 // 설정 탭 맨 위 넓은 항목
 const entry=doc.createElement('button');entry.type='button';entry.className='nb-it fs-entry';entry.addEventListener('click',()=>{open('free');entry.blur();});
 settings.prepend(entry);
 // 시트
 const sheet=doc.createElement('section');sheet.className='nb-sheet fs-panel fs-sheet';sheet.dataset.sheet='free';sheet.id='nb-sheet-free';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-label','자유 설정');sheet.hidden=true;
 sheet.addEventListener('click',e=>{if(handlePanelClick(e,{context:'game',onGo:()=>open(null),onClose:()=>open(null)})){e.stopPropagation();}},true);
 sheets.append(sheet);
 // 개발용 칸: 완등 기록 지우기
 const devSlot=app.querySelector('[data-dev-slot]');let clearBtn=null;
 if(freeState.dev&&devSlot){clearBtn=doc.createElement('button');clearBtn.type='button';clearBtn.className='nb-it nb-dev fs-clear';clearBtn.innerHTML='<em aria-hidden="true">🧽</em><span>완등 기록 지우기</span><small>개발용 · 도장 다시 보기</small>';
  clearBtn.addEventListener('click',()=>{clearSummits(ls);refreshRecords();clearBtn.querySelector('small').textContent='지웠어요 · 다시 오르면 도장이 찍혀요';clearBtn.blur();});
  win.addEventListener('hiking:started',()=>setTimeout(()=>devSlot.append(clearBtn),0),{once:true});}
 // 오른쪽 위 시각·날씨 꼬리표(직접 고르면 점선 + '✎ … 직접 고름', 누르면 판이 열린다)
 const chip=doc.getElementById('env-chip');
 const paintChip=()=>{if(!chip)return;const t=chipText(freeState.free);chip.classList.toggle('fs-manual',!!t);
  let tag=chip.querySelector('.fs-chip');if(t){if(!tag){tag=doc.createElement('em');tag.className='fs-chip';chip.append(tag);}tag.dataset.short=t.short;tag.textContent=t.long;chip.setAttribute('role','button');chip.tabIndex=0;chip.setAttribute('aria-label',`${t.long} · 눌러서 자유 설정 열기`);}
  else{tag?.remove();chip.setAttribute('role','status');chip.removeAttribute('tabindex');chip.setAttribute('aria-label','서울 현재 시각과 날씨');}};
 chip?.addEventListener('click',()=>{if(isManual(freeState.free))open('free');});
 chip?.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&isManual(freeState.free)){e.preventDefault();open('free');}});
 // 지도(M): 오른쪽 아래 도장 + 부제 · 기록 줄 + '자유 설정에서 더 고르기'
 const map=doc.getElementById('map'),mapBox=map?.querySelector('.nb-mapbox'),mapSub=map?.querySelector('.dialog-heading small'),mapSide=map?.querySelector('.nb-map-side');
 const mapSubBase=mapSub?.textContent??'';let mapSeal=null,mapRec=null,mapLink=null;
 if(mapBox){mapSeal=doc.createElement('div');mapSeal.className='fs-mapseal';mapBox.append(mapSeal);}
 if(mapSide){mapRec=doc.createElement('p');mapRec.className='fs-maprec';mapSide.prepend(mapRec);
  const choice=mapSide.querySelector('.start-choice');mapLink=doc.createElement('button');mapLink.type='button';mapLink.className='btn-paper fs-maplink';mapLink.textContent='🎛 자유 설정에서 더 고르기';
  mapLink.addEventListener('click',()=>{map.close();open('free');});choice?.after(mapLink);}
 // 정상 도착 창: 도장(찍히는 동작) + '자유 설정이 열렸어요'
 const summit=doc.getElementById('summit'),summitSeal=summit?.querySelector('.nb-seal');let summitLink=null;
 if(summit){summitLink=doc.createElement('button');summitLink.type='button';summitLink.className='fs-summit-link';summitLink.hidden=true;summitLink.innerHTML='🎛 자유 설정이 열렸어요 · 열어 보기 ›';
  summitLink.addEventListener('click',()=>{summit.close();open('free');});summit.querySelector('.nb-dlg-row')?.before(summitLink);}
 win.addEventListener('hiking:summit-record',()=>{
  refreshRecords();const r=summitOf(freeState.records,DEFAULT_MOUNTAIN);if(!r||!summitSeal)return;
  const land=matchMedia('(orientation:landscape) and (max-height:540px)').matches;
  summitSeal.className='nb-seal fs-summit-seal';summitSeal.innerHTML=sealSVG(land?104:150,{name:'관악산',date:sealDate(r.first),count:r.count});
  summitSeal.classList.remove('fs-stamping');void summitSeal.offsetWidth;summitSeal.classList.add('fs-stamping');
  setTimeout(()=>{try{navigator.vibrate?.(15);}catch{}},420);
  if(summitLink)summitLink.hidden=false;
 });
 // 다시 그리기
 let sheetSig='';
 function render(){
  const r=summitOf(freeState.records,DEFAULT_MOUNTAIN),unlocked=freeState.unlocked,devOnly=freeState.dev&&!r;
  entry.classList.toggle('nb-dev',devOnly);entry.classList.toggle('fs-locked',!unlocked);
  entry.innerHTML=unlocked?`<em aria-hidden="true">🎛</em><span>자유 설정</span><small>${devOnly?'개발 버전이라 처음부터 열려 있어요':'날씨 · 시간 · 계절 · 출발 지점'}</small>${r?`<b class="fs-entry-seal">${sealSVG(40,{date:sealDate(r.first),count:r.count})}</b>`:devOnly?'<i class="nb-devmark">🛠 개발</i>':''}`
   :'<em aria-hidden="true">🔒</em><span>자유 설정</span><small>완등하면 열려요</small>';
  entry.setAttribute('aria-label',unlocked?'자유 설정 열기':'자유 설정 · 완등하면 열려요');
  const html=panelHTML({context:'game'});if(html!==sheetSig){sheetSig=html;sheet.innerHTML=html;}
  sheet.classList.toggle('fs-locked',!unlocked);
  paintChip();
  if(mapSeal){const land=matchMedia('(orientation:landscape) and (max-height:540px)').matches;mapSeal.innerHTML=r?sealSVG(land?78:92,{date:sealDate(r.first),count:r.count}):'';mapSeal.hidden=!r;}
  if(mapSub)mapSub.textContent=r?`${mapSubBase} · 등산 완료`:mapSubBase;
  if(mapRec){mapRec.innerHTML=r?recordHTML(r):'';mapRec.hidden=!r;}
  if(mapLink)mapLink.hidden=!unlocked;
 }
 onFreeChange(render);
 // 위치·남은 거리는 0.15초마다 오므로, 판이 열려 있을 때만 지금 위치 칸을 다시 그린다.
 let hereSig='';
 win.addEventListener('hiking:state',e=>{const s=e.detail||{};freeState.game={zone:s.zone,s:s.s,courseDistance:s.courseDistance,courseLength:s.courseLength};
  const sig=`${hereIndex(freeState.game)}|${Math.round((s.courseLength-s.courseDistance)/100)}`;if(sig!==hereSig&&!sheet.hidden){hereSig=sig;render();}});
 win.addEventListener('hiking:environment',e=>{const k=e.detail?.realKind;if(k&&k!==freeState.realKind){freeState.realKind=k;render();}queueMicrotask(paintChip);setTimeout(paintChip,0);});
 win.addEventListener('hiking:started',()=>{freeState.started=true;render();});
 win.addEventListener('hiking:sheet',e=>{if(e.detail?.id==='free')render();});
 render();
 return {render,sheet,entry};
}
// 산 고르기 카드 도장: 완등한 뒤 처음 열 때 한 번만 찍히는 동작(사양 §2-3)
export function sealSeenOnce(id){
 const r=summitOf(freeState.records,id);if(!r)return false;
 let seen={};try{seen=JSON.parse(ls?.getItem(SEAL_SEEN_KEY)||'{}')||{};}catch{}
 if((seen[id]||0)>=r.count)return false;
 seen[id]=r.count;try{ls?.setItem(SEAL_SEEN_KEY,JSON.stringify(seen));}catch{}return true;
}
export {timeChoiceOf};
