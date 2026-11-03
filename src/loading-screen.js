// 전체 화면 로딩 화면. 진행률은 main.js가 보내는 'hiking:loading' 이벤트 값만 쓴다(시간으로 차오르는 값 없음).
// 준비 완료 뒤: 복장 선택 카드가 뜨면 그 카드가 출발 신호이므로 그대로 걷고, 아니면 수동 시작일 때만 '출발하기' 버튼을 보인다.
import {LOADING_EVENT,START_EVENT,LOADING_STAGES} from './loading.js';
export const TIPS=Object.freeze([
 '일주문에서 연주대까지 약 5km, 고도는 약 100m에서 650m까지 오릅니다.',
 '입구에서 호수공원 갈림길까지는 걸어서 약 10분입니다.',
 '갈림길에서 왼쪽이 호수공원과 계곡길, 오른쪽은 삼성산 방향입니다.',
 '계곡길에서는 걷는 내내 물소리를 들을 수 있습니다.',
 '깔딱고개 쪽은 나무 계단이 길고 오르막이 가파릅니다.',
 '서울대 방면 왕복은 쉬는 시간까지 보통 2시간 30분~3시간 걸립니다.',
 '능선과 정상은 바람이 세니 얇은 겉옷은 챙기세요.',
 '입구 옆 관악산 으뜸공원은 2024년 8월 23일 문을 열었습니다.',
 '조작: W/S 걷기 · A/D 비켜 가기 · 드래그로 둘러보기 · Shift 달리기 · V 시점 바꾸기',
]);
export const TIP_MS=5000,STALL_MS=30000;
// 순수 함수: 이벤트 detail → 화면 값. 테스트에서 쓴다.
export function describeLoading(detail){
 if(!detail)return {phase:'loading',percent:0,label:'준비 중'};
 const stage=detail.stage;
 if(stage==='error')return {phase:'error',percent:Math.floor((detail.progress??0)*100),label:'불러오지 못했습니다',error:detail.error??''};
 if(stage==='ready'||stage==='started')return {phase:stage,percent:100,label:'준비 완료'};
 const percent=Math.min(99,Math.floor((detail.progress??0)*100));
 const index=Math.max(0,LOADING_STAGES.findIndex(s=>s.id===stage));
 return {phase:'loading',percent,label:detail.label??'준비 중',step:index+1,steps:LOADING_STAGES.length,stage};
}
export function mountLoadingScreen(root=document.getElementById('loading-screen')){
 if(!root)return null;
 const $=s=>root.querySelector(s),bar=$('.ls-fill'),pct=$('.ls-percent'),label=$('.ls-label'),tip=$('.ls-tip'),steps=$('.ls-steps'),action=$('.ls-action'),msg=$('.ls-message'),track=$('.ls-track');
 steps.innerHTML=LOADING_STAGES.map(s=>`<li data-stage="${s.id}">${s.label}</li>`).join('');
 let tipIndex=Math.floor(Date.now()/1000)%TIPS.length,lastSignal=performance.now(),phase='loading',hidden=false;
 const showTip=()=>{tip.classList.add('swap');setTimeout(()=>{tip.textContent=TIPS[tipIndex%TIPS.length];tip.classList.remove('swap');tipIndex++;},260);};
 tip.textContent=TIPS[tipIndex++%TIPS.length];
 const tipTimer=setInterval(showTip,TIP_MS);
 function render(detail){
  const v=describeLoading(detail);phase=v.phase;lastSignal=performance.now();
  root.dataset.phase=v.phase;bar.style.transform=`scaleX(${v.percent/100})`;pct.textContent=`${v.percent}%`;label.textContent=v.label;
  track.setAttribute('aria-valuenow',v.percent);track.setAttribute('aria-valuetext',`${v.label} ${v.percent}%`);
  const stages=detail?.stages??{};
  steps.querySelectorAll('li').forEach(li=>{const f=stages[li.dataset.stage]??0;li.dataset.state=f>=1?'done':li.dataset.stage===v.stage?'active':'wait';});
  if(v.phase==='error'){msg.textContent=`산길을 불러오지 못했습니다. ${v.error?`(${v.error}) `:''}네트워크를 확인하고 다시 시도해 주세요.`;action.textContent='다시 시도';action.dataset.mode='retry';action.hidden=false;}
  else if(v.phase==='ready'){
   // 복장 선택 카드가 같은 순간에 뜨면 카드가 출발 신호 — 로딩 화면은 카드 뒤로 걷힌다.
   requestAnimationFrame(()=>{if(document.getElementById('outfit-picker')||window.hiking?.started)dismiss();else if(!autoStart()){msg.textContent='산길이 준비되었습니다. 아래 버튼을 누르면 일주문 앞 광장에서 출발합니다.';action.textContent='출발하기';action.dataset.mode='start';action.hidden=false;action.focus({preventScroll:true});}else dismiss();});
  }else if(v.phase==='started')dismiss();
 }
 // 수동 시작 모드(?startMode=manual 또는 data-start-mode)가 아니면 자동 시작 — main.js가 곧 'started'를 보낸다.
 const autoStart=()=>!(document.documentElement.dataset.startMode==='manual'||new URLSearchParams(location.search).get('startMode')==='manual');
 function dismiss(){if(hidden)return;hidden=true;clearInterval(tipTimer);clearInterval(watch);root.classList.add('leaving');root.setAttribute('aria-hidden','true');setTimeout(()=>root.remove(),900);}
 // 30초는 '마지막 진행 신호 이후' 기준(전체 로딩은 이 맥에서 35초 안팎이라 처음부터 재면 정상 로딩도 실패로 보인다).
 const watch=setInterval(()=>{if(phase==='loading'&&performance.now()-lastSignal>STALL_MS){phase='stalled';root.dataset.phase='stalled';msg.textContent='평소보다 오래 걸리고 있습니다. 조금 더 기다리거나 다시 시도해 주세요.';action.textContent='다시 시도';action.dataset.mode='retry';action.hidden=false;}},1000);
 action.addEventListener('click',()=>{if(action.dataset.mode==='retry')location.reload();else if(action.dataset.mode==='start'){action.disabled=true;window.dispatchEvent(new CustomEvent(START_EVENT));}});
 window.addEventListener(LOADING_EVENT,e=>{if(phase==='stalled'&&e.detail?.stage!=='error')root.dataset.phase='loading',action.hidden=true,msg.textContent='';if(phase==='stalled'||phase==='loading'||e.detail?.stage==='error'||e.detail?.stage==='ready'||e.detail?.stage==='started')render(e.detail);});
 window.addEventListener('hiking:started',dismiss);
 render(window.hiking?.loading?.()?.last??null);
 return {render,dismiss,root};
}
if(typeof document!=='undefined')mountLoadingScreen();
