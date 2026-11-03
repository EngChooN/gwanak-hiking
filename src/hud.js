// 앉기·차 마시기·달리기 버튼, 스테미너 막대, 시각·날씨 아이콘. main.js와는 window 이벤트로만 만난다.
//  - 읽기: 'hiking:state'(자세·스테미너), 'hiking:environment'(시각·날씨)
//  - 쓰기: 앉기·차 마시기는 버튼 클릭(main.js가 #sit·#tea 클릭을 command로 연결), 달리기는 Shift 키 이벤트를 흉내 낸다.
import {ATTRIBUTION} from './weather.js';
export const RUN_RECOVER_AT=30;
export const LEVEL_LABEL={light:'약',medium:'보통',heavy:'강'};
export function staminaView({stamina=100,runExhausted=false}={}){
 const value=Math.max(0,Math.min(100,Number.isFinite(stamina)?stamina:100));
 const level=runExhausted||value<=0?'empty':value>=99.5?'full':value<RUN_RECOVER_AT?'low':'normal';
 return {percent:Math.round(value),width:value,level,text:level==='empty'?`${Math.round(value)} · 회복 중(${RUN_RECOVER_AT}부터 달리기)`:String(Math.round(value))};
}
export function buttonView({pose='stand',paused=false,teaReady}={}){
 const seated=pose==='sit'||pose==='tea';
 // 앉는 동작(0.8초)이 끝나기 전에는 main.js가 차 명령을 받지 않으므로 버튼도 잠근다.
 return {sitLabel:seated?'일어나기':'앉기',sitPressed:seated,teaHidden:!seated,teaDisabled:pose==='tea'||(pose==='sit'&&teaReady===false),teaLabel:pose==='tea'?'마시는 중':'차 마시기'};
}
export function environmentView({kind='clear',level=null,icon='☀',weatherLabel='맑음',timeLabel='',source='fallback',manualTime=false}={}){
 const lv=level&&['rain','snow','fog'].includes(kind)?`(${LEVEL_LABEL[level]})`:'';
 const note=source==='manual'?' · 수동':source==='fallback'?' · 기본':'';
 return {icon,text:`${weatherLabel}${lv}`,time:timeLabel,title:`서울 ${manualTime?'지정 ':''}${timeLabel} · ${weatherLabel}${lv}${note}`};
}
const $=id=>document.getElementById(id);
let installed=false;
export function installEnvironmentHud(){
 if(installed||typeof document==='undefined')return;installed=true;
 const sit=$('sit'),tea=$('tea'),run=$('run'),bar=$('stamina-fill'),box=$('stamina'),value=$('stamina-value'),chip=$('env-chip'),credit=$('weather-credit');
 if(credit){credit.href=ATTRIBUTION.href;credit.textContent=ATTRIBUTION.text;}
 window.addEventListener('hiking:state',e=>{
  const s=e.detail||{},b=buttonView(s),st=staminaView(s);
  if(sit){sit.querySelector('span').textContent=b.sitLabel;sit.setAttribute('aria-pressed',String(b.sitPressed));sit.classList.toggle('active',b.sitPressed);}
  if(tea){tea.hidden=b.teaHidden;tea.disabled=b.teaDisabled;tea.querySelector('span').textContent=b.teaLabel;}
  if(box){box.dataset.level=st.level;box.setAttribute('aria-valuenow',String(st.percent));}
  if(bar)bar.style.width=`${st.width}%`;
  if(value)value.textContent=st.text;
  if(run){run.disabled=st.level==='empty';run.classList.toggle('active',!!s.running);}
 });
 window.addEventListener('hiking:environment',e=>{
  const v=environmentView(e.detail||{});if(!chip)return;
  chip.querySelector('i').textContent=v.icon;chip.querySelector('b').textContent=v.time;chip.querySelector('span').textContent=v.text;chip.title=v.title;
 });
 // 모바일 달리기: 누르고 있는 동안 Shift를 누른 것으로 취급한다(input.js가 키 집합을 읽는다).
 if(run){
  let held=false;const send=type=>document.body.dispatchEvent(new KeyboardEvent(type,{code:'ShiftLeft',key:'Shift',bubbles:true}));
  const down=e=>{if(held||run.disabled)return;held=true;run.setPointerCapture?.(e.pointerId);run.classList.add('held');send('keydown');};
  const up=()=>{if(!held)return;held=false;run.classList.remove('held');send('keyup');};
  run.addEventListener('pointerdown',down);for(const n of ['pointerup','pointercancel','lostpointercapture'])run.addEventListener(n,up);
  window.addEventListener('blur',up);document.addEventListener('visibilitychange',up);
  run.addEventListener('contextmenu',e=>e.preventDefault());
 }
}
