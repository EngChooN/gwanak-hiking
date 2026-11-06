// ⑥ 무리해서 뛰면 — 헥헥·다리에 쥐(2026-11-06 대표 승인, docs/기획-2026-11-06-자동걷기-즐길거리.md §⑥).
// movement.js는 뛰다가 스테미너가 0이 되면 runExhausted를 켜고 30까지 찰 때까지 못 뛰게만 한다. 여기서는 그 순간을 몸 개그 상태로 바꾼다.
// 순수 함수만 둔다(화면·소리는 src/trail-world.js와 src/toon/hiker-acts.js). 단위 테스트: tests/exhaustion.test.mjs
//  phase 'none' → (0이 됨) → 'pant' 1.5초(무릎 짚고 헥헥, 이동 입력 막음) → 'none'
//                         → 'cramp' 3초(뒹굴기, 이동 입력 막음, 발끝 당기기 버튼이면 누른 뒤 1초) → 'none'
//  trudge: 스테미너가 30이 될 때까지(runExhausted) 고개 숙이고 터벅터벅(속도는 그대로).
export const EXHAUST=Object.freeze({pantSeconds:1.5,crampSeconds:3,crampReleaseSeconds:1,crampChance:.25,crampSlope:.1,crampCooldown:120,eyeDrop:.3,eyeDropSeconds:.8});
export const createExhaustion=()=>({phase:'none',left:0,trudge:false,crampAt:-Infinity,released:false,eye:0});
// 스테미너가 0이 된 순간 한 번 부른다. uphill = 그 걸음의 오르막 경사(높이/수평), now = 초, auto = 자동걷기 중인지.
// 돌려주는 값: 'cramp' | 'pant' | null(자동걷기·이미 쥐가 난 중)
export function onRunExhausted(ex,{uphill=0,now=0,random=Math.random(),auto=false}={}){
 if(auto||ex.phase==='cramp')return null;
 const cramp=uphill>=EXHAUST.crampSlope&&now-ex.crampAt>=EXHAUST.crampCooldown&&random<EXHAUST.crampChance;
 if(cramp)Object.assign(ex,{phase:'cramp',left:EXHAUST.crampSeconds,crampAt:now,released:false});
 else Object.assign(ex,{phase:'pant',left:EXHAUST.pantSeconds});
 ex.trudge=true;return ex.phase;
}
// 🦶 발끝 당기기: 누르면 1초 뒤에 풀린다(남은 시간이 1초보다 짧으면 그대로).
export function releaseCramp(ex){if(ex.phase!=='cramp'||ex.released)return false;ex.released=true;ex.left=Math.min(ex.left,EXHAUST.crampReleaseSeconds);return true;}
// 한 프레임. 끝난 상태 이름('pant'|'cramp')을 돌려준다(없으면 null).
export function stepExhaustion(ex,dt,{runExhausted=false}={}){
 let ended=null;
 if(ex.phase!=='none'){ex.left=Math.max(0,ex.left-dt);if(ex.left<=0){ended=ex.phase;ex.phase='none';ex.released=false;}}
 ex.trudge=ex.phase==='none'&&!!runExhausted;
 // 1인칭 시야: 쥐가 난 동안만 천천히 0.3m 낮춘다(흔들지 않음, AGENTS.md §3)
 const goal=ex.phase==='cramp'?EXHAUST.eyeDrop:0,rate=EXHAUST.eyeDrop/EXHAUST.eyeDropSeconds*dt;
 ex.eye=ex.eye<goal?Math.min(goal,ex.eye+rate):Math.max(goal,ex.eye-rate);
 return ended;
}
export const blocksMove=ex=>ex.phase==='pant'||ex.phase==='cramp';
// HUD 표시: 쥐가 나면 "쥐 0:02"(남은 초 올림)
export const crampLabel=ex=>ex.phase==='cramp'?`쥐 0:${String(Math.ceil(ex.left)).padStart(2,'0')}`:null;
