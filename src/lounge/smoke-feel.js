// 담배 맛 숫자(기획서 v2 A1·A2·A6): 누른 시간 → 모금 맛, 담배 종류 → 연기 양, 연기 양 → 뭉게 수·크기·머무는 시간.
// three 없이 계산만 한다(테스트에서 바로 부른다). 모양은 smoke.js가 등산 「헥헥 입김」 뭉게(trail-props puff)로 그린다.

// 누른 시간(초) 경계: 짧게 탭 / 꿀모금 시작 / 진한 모금 시작 / 기침
export const DRAW=Object.freeze({tap:.25,sweet:.6,deep:2.2,cough:3});
// 담배 종류(꺼낼 때 고름). smoke = 연기 양 배수. 시가는 굵고(thick) 갈색이다.
export const CIG_KINDS=Object.freeze({
 mild:{label:'순한 맛',icon:'🍃',smoke:.8,thick:1,paper:'#f6f2e8',filter:'#f1eee6',burn:1},
 strong:{label:'독한 맛',icon:'🔥',smoke:1.3,thick:1,paper:'#f6f2e8',filter:'#c9843f',burn:1.1},
 menthol:{label:'멘솔',icon:'❄️',smoke:1,thick:1,paper:'#f6f2e8',filter:'#bfe6d6',burn:1},
 cigar:{label:'시가',icon:'🟤',smoke:2,thick:1.75,paper:'#7a4a2a',filter:'#c9a24a',burn:.55},
});
export const DEFAULT_KIND='mild';
export const cigKind=k=>k in CIG_KINDS?k:DEFAULT_KIND;
// 모금 맛별 연기 양·내뿜는 시간(초)
export const QUALITY=Object.freeze({
 light:{smoke:.6,exhale:1.9},
 sweet:{smoke:1,exhale:2.6},
 deep:{smoke:1.2,exhale:3},
 cough:{smoke:.25,exhale:1.5},
});

// 누른 시간 → 'light'|'sweet'|'deep'|'cough'
export function drawQuality(sec){return sec<DRAW.sweet?'light':sec<DRAW.deep?'sweet':sec<=DRAW.cough?'deep':'cough';}
// 들이마신 정도 0~1(3초에 가득)
export const drawLevel=sec=>Math.min(1,Math.max(0,sec/DRAW.cough));
// 이번 연기 양 0~2 = 모금 맛 × 담배 종류
export function smokeAmount(quality,kind){const q=QUALITY[quality]?.smoke??QUALITY.light.smoke;return Math.round(Math.min(2,Math.max(0,q*CIG_KINDS[cigKind(kind)].smoke))*100)/100;}
// 한 번 내뿜을 때 뭉게 수. cap(동시에 떠 있을 수 있는 수, 휴대폰은 LIMITS로 낮다)의 60%를 넘지 않는다.
export function exhalePuffs(amount,cap){return Math.max(2,Math.min(Math.round(cap*.6),Math.round(4+8*amount)));}
// 뭉게 하나의 다 자란 반지름(m). r = 0~1 난수. 양 1이면 지름 0.15~0.35m(예전 입김의 3~5배).
export function puffRadius(amount,r){const k=.7+.3*Math.min(amount,1.6);return Math.min(.22,(.075+.1*r)*k);}
// 뭉게가 머무는 시간(초). 꿀모금(양 0.8 이상)이면 5~8초.
export function puffLife(amount,r){return 3+2*Math.min(1,amount/.8)+3*r*Math.min(1,amount);}
// 옥상 바람(m/s, x·z). 옥상(rooftop.wind)이 따로 주면 그걸 쓴다.
export const ROOF_WIND=Object.freeze({x:.16,z:-.07});
