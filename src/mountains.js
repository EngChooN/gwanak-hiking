// 산 목록(산 고르기 화면). 산이 늘면 이 배열에 하나씩 더한다. three를 쓰지 않는다(node --test로 검사).
// 사양: docs/UI-산고르기-자유설정-사양.md §1-4 {id,name,altitudeM,course,distanceKm,etaMin,stamps,difficulty,art}
// ready:false인 산은 흑백 카드에 '준비 중' 버튼만 둔다. art는 카드 그림의 능선 모양(0~1, 왼쪽→오른쪽 높이)과 정상 위치다.
import {COURSE_LENGTH} from './movement.js';
import {STAMPS} from './interaction-data.js';
export const MOUNTAINS=Object.freeze([
 Object.freeze({id:'gwanak',name:'관악산',altitudeM:632,course:'관악산공원 입구 → 연주대 정상',
  distanceKm:Math.round(COURSE_LENGTH/100)/10,etaMin:150,stamps:STAMPS.length,difficulty:'보통',ready:true,
  art:Object.freeze({ridge:[.18,.3,.42,.38,.55,.72,.86,.7,.5,.36],peak:.6})}),
]);
export const mountainById=id=>MOUNTAINS.find(m=>m.id===id)??null;
export const DEFAULT_MOUNTAIN='gwanak';
// 예상 시간 글자: 150 → '2시간 30분'
export function formatEta(min){
 const h=Math.floor(min/60),m=Math.round(min%60);
 return h?`${h}시간${m?` ${m}분`:''}`:`${m}분`;
}
