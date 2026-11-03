// 로딩 단계 신호. main.js가 실제 await 지점마다 단계 비율을 알리고, UI(산디자인)는 'hiking:loading' 이벤트만 읽는다.
// 규약: docs/이동-휴식-통합규약.md §로딩. 시간이 지나면 저절로 차는 값은 없다.
export const LOADING_EVENT='hiking:loading', START_EVENT='hiking:start';
export const LOADING_STAGES=Object.freeze([
 {id:'terrain',label:'지형',weight:.3},
 {id:'nature',label:'숲·바위',weight:.3},
 {id:'facilities',label:'시설',weight:.08},
 {id:'hikers',label:'등산객',weight:.1},
 {id:'environment',label:'날씨·환경',weight:.14},
 {id:'stabilizing',label:'첫 프레임 안정',weight:.08},
]);
const clamp01=v=>Math.max(0,Math.min(1,Number.isFinite(v)?v:0));
// emit(detail)은 이벤트 발송 함수. now()는 경과 시간 측정용(테스트에서 주입).
export function createLoadingTracker({emit=()=>{},now=()=>performance.now(),stages=LOADING_STAGES}={}){
 const started=now(),fractions=Object.fromEntries(stages.map(s=>[s.id,0]));let phase='loading',error=null,readyAt=null,startedAt=null,lastProgress=0,detail=null,sent=null;
 const total=stages.reduce((a,s)=>a+s.weight,0);
 const progress=()=>stages.reduce((a,s)=>a+s.weight*fractions[s.id],0)/total;
 function send(extra){
  const current=stages.find(s=>fractions[s.id]<1);
  lastProgress=Math.max(lastProgress,phase==='loading'?Math.min(progress(),.999):progress());
  const base=phase==='loading'?{stage:current?.id??'stabilizing',label:`${current?.label??'첫 프레임 안정'} 준비 중`}:phase==='ready'?{stage:'ready',label:'준비 완료'}:phase==='started'?{stage:'started',label:'출발'}:{stage:'error',label:'불러오지 못했습니다'};
  detail={...base,progress:phase==='error'?lastProgress:phase==='loading'?lastProgress:1,stages:{...fractions},elapsedMs:Math.round(now()-started),...extra};
  // 같은 단계에서 0.5%p 미만 변화는 묶어 보낸다(숲 항목 수천 개가 이벤트 폭주를 만들지 않게).
  if(phase!=='loading'||!sent||sent.stage!==detail.stage||detail.progress-sent.progress>=.005){sent=detail;emit(detail);}return detail;
 }
 return {
  // 단계 안의 실제 비율(0~1). 줄어드는 값은 무시한다.
  set(id,fraction,extra){if(phase!=='loading'||!(id in fractions))return detail;fractions[id]=Math.max(fractions[id],clamp01(fraction));return send(extra);},
  done(id,extra){return this.set(id,1,extra);},
  ready(extra){if(phase!=='loading')return detail;for(const s of stages)fractions[s.id]=1;phase='ready';readyAt=now();return send({loadMs:Math.round(readyAt-started),...extra});},
  start(){if(phase!=='ready')return null;phase='started';startedAt=now();return send({loadMs:Math.round(readyAt-started)});},
  fail(e,extra){if(phase==='error'||phase==='started')return detail;phase='error';error=String(e?.message??e);const failedStage=stages.find(s=>fractions[s.id]<1)?.id??null;return send({error,failedStage,...extra});},
  get phase(){return phase;},
  snapshot(){return {phase,progress:lastProgress,stages:{...fractions},error,loadMs:readyAt===null?null:Math.round(readyAt-started),startedMs:startedAt===null?null:Math.round(startedAt-started),last:detail};},
 };
}
// 연속 안정 프레임 판정: 컴파일 중이 아니고 프레임 간격이 limitMs 이하인 프레임이 count번 이어져야 한다.
export function createStabilityCounter({count=12,limitMs=100}={}){
 let stable=0;
 return {sample(frameMs,busy){stable=!busy&&Number.isFinite(frameMs)&&frameMs<=limitMs?stable+1:0;return stable>=count;},get fraction(){return Math.min(1,stable/count);},get stable(){return stable;},count};
}
