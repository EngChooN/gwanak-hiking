// 즐길거리 규칙(2026-11-06, 기획-2026-11-06-자동걷기-즐길거리.md): 초콜릿·벤치 쉬기·들르기 버튼·기구 버튼.
// 화면·three.js 없이 쓰는 순수 함수만 둔다(tests/trail-rules.test.mjs). 수치는 interaction-data.js TRAIL_RULES 한곳에서 읽는다.
import {TRAIL_RULES as R} from './interaction-data.js';

// ── 초콜릿: 처음 5개, 먹으면 30초 동안 이동속도 +20%(겹치지 않음). 개수는 이어하기 저장(state.chocolates)에 남는다.
export const CHOCO_MAX=R.chocolates;
export const chocoCount=state=>Number.isInteger(state?.chocolates)?Math.max(0,Math.min(CHOCO_MAX,state.chocolates)):CHOCO_MAX;
export const chocoLeft=state=>Number.isFinite(state?.chocoLeft)?Math.max(0,state.chocoLeft):0;
// 먹을 수 있나: 남은 개수가 있고, 효과가 끝났고, 다른 즐길거리 동작 중이 아니다.
export function canEatChocolate(state,{busy=false}={}){return !busy&&chocoCount(state)>0&&chocoLeft(state)<=0;}
export function eatChocolate(state,opts){if(!canEatChocolate(state,opts))return false;state.chocolates=chocoCount(state)-1;state.chocoLeft=R.chocoSeconds;return true;}
export function tickChocolate(state,dt){if(chocoLeft(state)>0&&dt>0)state.chocoLeft=Math.max(0,state.chocoLeft-dt);return chocoLeft(state);}
// 이동속도 배율. 계단은 한 칸 한 걸음 리듬을 지키려고 그대로 둔다.
export const chocoSpeed=(state,{stairs=false}={})=>chocoLeft(state)>0&&!stairs?R.chocoSpeed:1;
// "⚡ 빨라짐 0:28" (남은 초 올림)
export function formatBoost(sec){const s=Math.max(0,Math.ceil(sec));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;}
export const restoreChocolates=v=>Number.isFinite(v)?Math.max(0,Math.min(CHOCO_MAX,Math.floor(v))):CHOCO_MAX;

// ── 벤치: 앉아 쉬면 땅에 앉을 때(초당 15)보다 1.5배 빨리 찬다.
export const SIT_RECOVER=15,BENCH_RECOVER_MULT=1.5;
export const benchRecoverRate=()=>SIT_RECOVER*BENCH_RECOVER_MULT;

// ── 들르기 버튼: 자동걷기 중에만, 제안 뒤 4초 동안. 그 사이 자동걷기를 끄거나 다른 동작이 시작되면 숨긴다.
export function offerVisible(offer,{now,auto,busy=false}){return !!offer&&auto&&!busy&&now<offer.until;}

// ── 오브젝트 옆 버튼(직접 걸을 때 6m 안). 산스장은 기구마다, 나머지는 하나.
export const TRAIL_BUTTONS=Object.freeze({
 gym:[{act:'gym-lift',ic:'🏋',label:'역기',sub:'연타 10번'},{act:'gym-hang',ic:'🙃',label:'거꾸리',sub:'3초 매달리기'},{act:'gym-twist',ic:'🌀',label:'허리돌리기',sub:'빙글빙글'},{act:'gym-bar',ic:'🤸',label:'철봉',sub:'매달리기'}],
 bench:[{act:'bench-sit',ic:'🪑',label:'벤치에 앉기',sub:'스테미너 1.5배'}],
 airgun:[{act:'airgun',ic:'💨',label:'신발 털기',sub:'에어건'}],
 cat:[{act:'pet-cat',ic:'🐱',label:'쓰다듬기',sub:'산고양이'}],
});
// 즐길거리 줄에 띄울 것 하나를 고른다(우선순위: 쥐 발끝 당기기 → 역기 연타 → 벤치 일어나기 → 들르기 → 옆 버튼).
// view = {act:{name,state,reps,of}|null, near:{id,kind}|null, offer:{…}|null, auto, busy, exhaust:{phase,release}|null(⑥ src/exhaustion.js)}
export function trailBarView({act=null,near=null,offer=null,auto=false,busy=false,now=0,exhaust=null}={}){
 if(exhaust?.release)return {mode:'cramp'};
 if(exhaust&&exhaust.phase&&exhaust.phase!=='none')return {mode:'none'};
 if(act?.name==='gym-lift'&&act.state!=='out'&&!act.done)return {mode:'lift',reps:act.reps??0,of:act.of??10};
 if(act?.name==='bench-sit'&&act.state!=='out')return {mode:'stand-up'};
 if(busy||act)return {mode:'none'};
 if(offerVisible(offer,{now,auto}))return {mode:'offer',offer};
 if(!auto&&near&&TRAIL_BUTTONS[near.kind])return {mode:'near',id:near.id,kind:near.kind,buttons:TRAIL_BUTTONS[near.kind]};
 return {mode:'none'};
}
