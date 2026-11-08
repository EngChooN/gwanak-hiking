// 관악산 FM 휴대용 라디오 HUD(2026-11-08, 설계 docs/radio-design.md, 규칙 docs/radio-options.md §4).
// 위쪽 태그 줄의 📻 버튼(켜져 있으면 `📻 91.9` 칩) → 화면 아래 라디오 기기: 앞면(전원 스위치·표시창·끌어서 돌리는 다이얼·0.1 단추·채널 바로 가기·볼륨 노브·♪ 곡 정보·내리기),
// 뒷면(실제 방송 듣기 = 새 탭 링크만, 소리 출처 보기). 설정 시트에 「소리 출처」 단추를 더한다.
// main.js와는 installRadio({context,destination,enabled,unlock})로 받은 소리 연결과 window 이벤트(hiking:radio 보냄, hiking:sound·environment·season·state 읽기)로만 만난다.
// 앱은 외부 주소에 요청하지 않는다: 소리·manifest는 같은 출처 assets/radio/, 방송사 주소는 사용자가 누르는 <a target=_blank>뿐.
import {FREQ_MIN,FREQ_MAX,FREQ_STEP,FM_CHANNELS,EXTERNAL_LINKS,clampFreq,snapFreq,mixAt} from './radio-stations.js';
import {MANIFEST_FILE,trackLabel,creditBlocks,validateManifest} from './radio-tracks.js';
import {createRadioAudio} from './radio-audio.js';

export const RADIO_SAVE_KEY='gwanak-radio';
export const RADIO_DEFAULT=Object.freeze({freq:91.9,vol:.6});
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt=f=>clampFreq(f).toFixed(1);
// 저장값 읽기: 전원은 늘 꺼진 채로 시작(브라우저 자동 재생 정책·대표 결정)
export function loadRadio(storage){
 try{const v=JSON.parse(storage?.getItem(RADIO_SAVE_KEY)??'null');if(v&&typeof v==='object')return {on:false,freq:clampFreq(Number.isFinite(v.freq)?v.freq:RADIO_DEFAULT.freq),vol:Number.isFinite(v.vol)?Math.max(0,Math.min(1,v.vol)):RADIO_DEFAULT.vol};}catch{}
 return {on:false,...RADIO_DEFAULT};
}
// HUD 칩 글자: 꺼짐 = 📻 라디오, 방송 = 📻 91.9, 잡음 = 📻 ~87.5
export function chipText(on,freq){if(!on)return '📻 라디오';const m=mixAt(freq);return `📻 ${m.clarity>0?'':'~'}${fmt(freq)}`;}
// 표시창 글자: {freq,name,status}
export function displayModel({on,freq,vol,deckState,sound=true,trackLine=''}){
 if(!on)return null;const m=mixAt(freq,vol);
 let status=m.label;
 if(m.channel&&deckState==='loading')status='…';
 if(m.channel&&deckState==='error')status='방송이 끊겼어요';
 if(vol<=0)status='음소거';
 if(!sound)status='소리 꺼짐';
 return {freq:fmt(freq),name:m.channel?`관악산 FM · ${m.channel.name}`:'',status,bars:m.channel&&deckState==='error'?0:m.bars,locked:m.locked,track:m.channel?trackLine:''};
}

export function installRadio({doc=document,win=window,context=()=>null,destination=()=>null,enabled=()=>true,unlock=()=>{},base=import.meta.env?.BASE_URL??'/',fetchFn=(...a)=>fetch(...a),storage=globalThis.localStorage,now=()=>Date.now()}={}){
 const body=doc.body;if(!body||doc.querySelector('.rd'))return null;
 import('./radio-ui.css');
 const mk=(tag,cls,html='')=>{const e=doc.createElement(tag);if(cls)e.className=cls;e.innerHTML=html;return e;};
 let st=loadRadio(storage),manifest=null,open=false,back=false,audioStatus=null,soundOn=!!enabled();
 const guide={kind:'clear',level:null,phase:'day',season:null,remaining:Infinity,elapsed:0};
 const save=()=>{try{storage?.setItem(RADIO_SAVE_KEY,JSON.stringify({freq:st.freq,vol:st.vol}));}catch{}};

 // ── 📻 태그(위쪽 태그 줄, 소리 태그 옆)
 const tag=mk('button','nb-tag rd-tag');tag.type='button';tag.id='radio-tag';tag.setAttribute('aria-label','라디오');
 const tags=doc.querySelector('.nb-tags');if(tags)tags.append(tag);else{tag.classList.add('rd-tag-float');body.append(tag);}

 // ── 기기
 const dev=mk('section','rd',`
 <div class="rd-card">
  <div class="rd-face rd-front" aria-label="라디오 앞면">
   <i class="rd-antenna" aria-hidden="true"></i>
   <header><button type="button" class="rd-power" aria-pressed="false"><i aria-hidden="true"></i><span>OFF</span></button><b class="rd-brand">관악산 FM</b><button type="button" class="rd-flip" aria-label="뒷면 보기 — 실제 방송 듣기·소리 출처">⟲</button></header>
   <div class="rd-screen" aria-live="polite"><div class="rd-freq"><b>--.-</b><small>MHz</small></div><div class="rd-name"></div><div class="rd-status"><span class="rd-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><span class="rd-stxt"></span></div><div class="rd-caption" hidden></div></div>
   <div class="rd-dial" role="slider" tabindex="0" aria-label="주파수 다이얼" aria-valuemin="${FREQ_MIN}" aria-valuemax="${FREQ_MAX}"><div class="rd-scale"><span>${FREQ_MIN}</span><span>${FREQ_MAX}</span></div>${FM_CHANNELS.map(c=>`<i class="rd-mark" style="left:${(c.freq-FREQ_MIN)/(FREQ_MAX-FREQ_MIN)*100}%" title="${c.freq}"></i>`).join('')}<i class="rd-needle"></i></div>
   <div class="rd-row rd-tune"><button type="button" data-step="-1" aria-label="주파수 0.1 내리기">◀</button>${FM_CHANNELS.map(c=>`<button type="button" data-go="${c.freq}" aria-label="${c.freq} ${esc(c.name)}">${c.freq}</button>`).join('')}<button type="button" data-step="1" aria-label="주파수 0.1 올리기">▶</button></div>
   <div class="rd-row rd-bottom"><div class="rd-vol"><button type="button" data-vol="-1" aria-label="볼륨 줄이기">−</button><div class="rd-knob" role="slider" tabindex="0" aria-label="볼륨" aria-valuemin="0" aria-valuemax="100"><i></i></div><button type="button" data-vol="1" aria-label="볼륨 키우기">+</button></div>
    <button type="button" class="rd-info" aria-label="곡 정보와 소리 출처"><span>♪ 곡 정보</span><small></small></button><button type="button" class="rd-down">내리기 ✕</button></div>
   <p class="rd-hint" hidden>전원을 켜 보세요</p>
  </div>
  <div class="rd-face rd-back" aria-label="라디오 뒷면">
   <header><button type="button" class="rd-flip rd-unflip">← 앞면으로</button></header>
   <h4>실제 방송 듣기</h4>
   <ul class="rd-links">${EXTERNAL_LINKS.map(l=>`<li><a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(l.name)}, 새 탭에서 열림">${esc(l.name)}<span aria-hidden="true">↗</span></a></li>`).join('')}</ul>
   <p class="rd-note">${EXTERNAL_LINKS.length?'누르면 새 탭에서 방송사 공식 페이지가 열려요. 실제 방송은 이 게임 소리와 섞이지 않아요. 게임 소리는 라디오를 끄거나 볼륨을 줄여 주세요. 돌아오면 이어서 걸어요.':'준비 중이에요'}</p>
   <p class="rd-fine">방송사 이름은 안내용 글자일 뿐, 방송사와 관계가 없어요.</p>
   <button type="button" class="rd-credits-open">소리 출처 보기 →</button>
  </div>
 </div>`);
 dev.hidden=true;dev.setAttribute('role','dialog');dev.setAttribute('aria-label','휴대용 라디오');
 body.append(dev);
 const $=s=>dev.querySelector(s);
 const power=$('.rd-power'),screen=$('.rd-screen'),dial=$('.rd-dial'),knob=$('.rd-knob'),caption=$('.rd-caption'),info=$('.rd-info');

 // ── 소리 출처 창(설정 시트 단추·라디오 뒷면·♪ 곡 정보에서 연다)
 const credits=mk('dialog','nb-dlg rd-credits',`<div class="dialog-heading"><h2>소리 출처<small>관악산 FM과 발소리·효과음</small></h2><button type="button" class="nb-close rd-cx" aria-label="소리 출처 닫기">✕</button></div><div class="rd-cbody"></div>`);
 body.append(credits);
 const settingsGrid=doc.querySelector('#nb-sheet-settings .nb-grid');
 if(settingsGrid){const b=mk('button','nb-it rd-credit-btn','<em aria-hidden="true">🎵</em><span>소리 출처</span><small>곡·소리 크레딧</small>');b.type='button';b.addEventListener('click',()=>openCredits());settingsGrid.insertBefore(b,settingsGrid.querySelector('[data-dev-slot]'));}
 let footCredits=null;
 async function openCredits(focus=null){
  if(footCredits===null)footCredits=await fetchFn(`${base}sounds/CREDITS.md`).then(r=>r.ok?r.text():'').catch(()=>'');
  const blocks=creditBlocks(manifest);
  credits.querySelector('.rd-cbody').innerHTML=`<h3>관악산 FM</h3>${blocks.map(b=>`<section class="rd-cblock" id="rd-credit-${b.id}"><h4>${esc(b.heading)}</h4><pre>${esc(b.text)}</pre>${b.links.length?`<ul>${b.links.map(l=>`<li><a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a></li>`).join('')}</ul>`:''}</section>`).join('')||'<p>목록을 불러오지 못했어요.</p>'}
   ${footCredits?`<h3>발소리·효과음</h3><pre class="rd-foot">${esc(footCredits)}</pre>`:''}
   <h3>실제 방송 듣기</h3><ul>${EXTERNAL_LINKS.map(l=>`<li><a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.name)} ↗</a></li>`).join('')}</ul><p class="rd-fine">방송사 이름은 안내용 글자일 뿐, 방송사와 관계가 없어요. 새 탭에서 열리고 게임 소리와 섞이지 않아요.</p>`;
  if(!credits.open)credits.showModal();
  if(focus)credits.querySelector(`#rd-credit-${focus}`)?.scrollIntoView({block:'start'});
 }
 credits.querySelector('.rd-cx').addEventListener('click',()=>credits.close());

 // ── 소리
 let audio=null;
 const getAudio=()=>audio??=createRadioAudio({context,destination,enabled,base,manifest:()=>manifest,doc,now,onStatus:s=>{audioStatus=s;render();},guideState:()=>({...guide,longWalk:guide.elapsed>=1800&&guide.elapsed%1800<120})});
 fetchFn(`${base}${MANIFEST_FILE}`).then(r=>r.ok?r.json():null).then(m=>{manifest=m;const bad=m?validateManifest(m):['manifest 없음'];if(bad.length)console.warn('관악산 FM manifest 문제',bad);render();}).catch(()=>{manifest=null;});

 function setPower(on){
  if(on){unlock();const a=getAudio();a.setFreq(st.freq,{silent:true});a.setVolume(st.vol);if(!a.setOn(true)){setTimeout(()=>{if(!st.on)return;a.setOn(true);render();},150);} }
  else audio?.setOn(false);
  st.on=on;render();win.dispatchEvent(new CustomEvent('hiking:radio',{detail:{on,freq:st.freq,vol:st.vol}}));
 }
 function setFreq(f,{snap=false}={}){st.freq=snap?snapFreq(f):clampFreq(f);if(st.on)audio?.setFreq(st.freq);save();render();}
 function setVol(v){st.vol=Math.round(Math.max(0,Math.min(1,v))*100)/100;if(st.on)audio?.setVolume(st.vol);save();render();}
 const guard=()=>{if(st.on)return true;const h=$('.rd-hint');h.hidden=false;clearTimeout(guard.t);guard.t=setTimeout(()=>{h.hidden=true;},1800);return false;};

 // ── 그리기
 function trackLine(){
  const s=audioStatus;if(!s?.deck||!manifest)return '';
  const chm=manifest.channels?.[s.deck];if(s.deck==='calm')return trackLabel('calm',chm?.tracks?.[s.trackIndex]);
  return trackLabel(s.deck,s.deck==='nature'?chm?.tracks?.filter(t=>t.layer!=='water')[s.trackIndex]:null);
 }
 function render(){
  soundOn=!!enabled();
  const on=!!st.on&&(audio?.on??false);
  tag.textContent=chipText(on,st.freq);tag.classList.toggle('on',on);tag.setAttribute('aria-label',on?`라디오 ${fmt(st.freq)} — 눌러서 라디오 올리기`:'라디오 꺼짐 — 눌러서 라디오 올리기');
  dev.hidden=!open;body.classList.toggle('rd-open',open);dev.classList.toggle('flipped',back);dev.dataset.on=on?'1':'';
  power.setAttribute('aria-pressed',String(on));power.querySelector('span').textContent=on?'ON':'OFF';
  const m=displayModel({on,freq:st.freq,vol:st.vol,deckState:audioStatus?.deckState,sound:soundOn,trackLine:trackLine()});
  screen.classList.toggle('off',!m);
  $('.rd-freq b').textContent=m?m.freq:'';$('.rd-freq small').textContent=m?'MHz':'';$('.rd-name').textContent=m?.name??'';$('.rd-stxt').textContent=m?.status??'';
  screen.classList.toggle('locked',!!m?.locked);
  [...dev.querySelectorAll('.rd-bars i')].forEach((b,i)=>b.classList.toggle('on',!!m&&i<m.bars));
  const cap=on&&audioStatus?.deck==='guide'&&audioStatus.caption?audioStatus.caption.text:'';caption.hidden=!cap;caption.textContent=cap;
  info.querySelector('small').textContent=m?.track||(on?'—':'');
  dial.setAttribute('aria-valuenow',String(st.freq));dial.setAttribute('aria-valuetext',`${fmt(st.freq)} MHz`);
  $('.rd-needle').style.left=`${(st.freq-FREQ_MIN)/(FREQ_MAX-FREQ_MIN)*100}%`;
  knob.style.setProperty('--turn',`${-135+270*st.vol}deg`);knob.setAttribute('aria-valuenow',String(Math.round(st.vol*100)));
  for(const b of dev.querySelectorAll('.rd-tune button,.rd-vol button'))b.classList.toggle('dim',!on);
  for(const b of dev.querySelectorAll('[data-go]'))b.classList.toggle('now',on&&Math.abs(Number(b.dataset.go)-st.freq)<.05);
 }

 // ── 조작
 tag.addEventListener('click',()=>{open=!open;back=false;render();});
 $('.rd-down').addEventListener('click',()=>{open=false;render();});
 power.addEventListener('click',()=>setPower(!st.on));
 for(const f of dev.querySelectorAll('.rd-flip'))f.addEventListener('click',()=>{back=!back;render();});
 $('.rd-credits-open').addEventListener('click',()=>openCredits());
 info.addEventListener('click',()=>openCredits(audioStatus?.deck??'calm'));
 // 단추: 0.1씩(길게 누르면 반복), 채널 바로 가기, 볼륨 ±0.1
 for(const b of dev.querySelectorAll('[data-step]')){
  let rep=0;const stepOnce=()=>{if(guard())setFreq(st.freq+Number(b.dataset.step)*FREQ_STEP);};
  b.addEventListener('pointerdown',e=>{e.preventDefault();stepOnce();clearInterval(rep);rep=setTimeout(()=>{rep=setInterval(stepOnce,90);},420);});
  for(const ev of ['pointerup','pointerleave','pointercancel'])b.addEventListener(ev,()=>{clearTimeout(rep);clearInterval(rep);});
  b.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();stepOnce();}});
 }
 for(const b of dev.querySelectorAll('[data-go]'))b.addEventListener('click',()=>{if(guard())setFreq(Number(b.dataset.go));});
 for(const b of dev.querySelectorAll('[data-vol]'))b.addEventListener('click',()=>{if(guard())setVol(st.vol+Number(b.dataset.vol)*.1);});
 // 다이얼 끌기: 가로로 끈 거리만큼(전체 폭 = 전 범위), 놓으면 방송 ±0.1 안이면 붙음
 function drag(el,onMove,onEnd=()=>{}){
  let start=null;
  el.addEventListener('pointerdown',e=>{if(!guard())return;start={x:e.clientX,y:e.clientY};el.setPointerCapture?.(e.pointerId);e.preventDefault();onMove(e,start,true);});
  el.addEventListener('pointermove',e=>{if(start)onMove(e,start,false);});
  const end=e=>{if(!start)return;start=null;try{el.releasePointerCapture?.(e.pointerId);}catch{}onEnd();};
  el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
 }
 let dialFrom=0;
 drag(dial,(e,s,first)=>{const r=dial.getBoundingClientRect();if(first)dialFrom=st.freq;const f=dialFrom+(e.clientX-s.x)/Math.max(1,r.width)*(FREQ_MAX-FREQ_MIN);setFreq(f);},()=>setFreq(st.freq,{snap:true}));
 dial.addEventListener('keydown',e=>{if(!guard())return;const d=e.key==='ArrowLeft'||e.key==='ArrowDown'?-1:e.key==='ArrowRight'||e.key==='ArrowUp'?1:0;if(d){e.preventDefault();e.stopPropagation();setFreq(st.freq+d*FREQ_STEP);}});
 // 볼륨 노브: 위·오른쪽으로 끌면 커짐(150px = 전 범위)
 let volFrom=0;
 drag(knob,(e,s,first)=>{if(first)volFrom=st.vol;setVol(volFrom+((e.clientX-s.x)-(e.clientY-s.y))/150);});
 knob.addEventListener('keydown',e=>{if(!guard())return;const d=e.key==='ArrowLeft'||e.key==='ArrowDown'?-1:e.key==='ArrowRight'||e.key==='ArrowUp'?1:0;if(d){e.preventDefault();e.stopPropagation();setVol(st.vol+d*.05);}});
 // 라디오 위에서 누른 키·끌기가 걷기·시점에 먹히지 않게
 for(const ev of ['keydown','keyup','pointerdown','wheel'])dev.addEventListener(ev,e=>e.stopPropagation());

 // ── 게임 값 읽기(95.5 멘트 고르기, 소리 꺼짐)
 win.addEventListener('hiking:sound',()=>setTimeout(()=>{audio?.syncSound();render();},0));
 win.addEventListener('hiking:environment',e=>{const d=e.detail??{};guide.kind=d.kind??guide.kind;guide.level=d.level??null;const el=d.sunElevation;if(Number.isFinite(el))guide.phase=el<-6?'night':el<8?'dusk':'day';if(Number.isFinite(d.windSpeed))guide.windSpeed=d.windSpeed;});
 win.addEventListener('hiking:season',e=>{guide.season=e.detail?.season??guide.season;});
 win.addEventListener('hiking:state',e=>{const d=e.detail;if(!d)return;if(Number.isFinite(d.courseLength)&&Number.isFinite(d.courseDistance))guide.remaining=d.courseLength-d.courseDistance;if(Number.isFinite(d.elapsed))guide.elapsed=d.elapsed;});
 render();
 return {open:()=>{open=true;render();},close:()=>{open=false;render();},setPower,setFreq,setVol,flip:v=>{back=v??!back;render();},openCredits,
  get state(){return {...st,open,back,audio:audioStatus,manifest:!!manifest,sound:soundOn};},get audio(){return audio;}};
}
