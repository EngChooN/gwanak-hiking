// 밤 조명 설정과 순수 계산(렌더 없음). 수치는 설계 제안값이며 화면을 보며 조정한다.
// 실제 관악산: 입구~호수공원~제1광장 갈림(약 0~1.1km)은 공원등·보안등 구간, 그 위 산길은 조명이 거의 없다(헤드랜턴 필수).
export const PARK_LAMP_SPACING=27;        // 공원등 간격(m). 설계 25~30m.
export const PARK_LAMP_LATERAL=1.75;      // 길 폭 2.2m의 한쪽 가장자리 바깥(1.1m)에서 0.65m 더.
export const PARK_LAMP_FROM_S=6;          // 일주문 안쪽 첫 등
export const PARK_END_S=1075;             // 제1광장 갈림(체크포인트 '제1광장'의 s). 이 위는 가로등이 없다.
export const LAMP_HEIGHT=4;               // 공원등 기둥 높이(m)
export const REAL_LIGHT_COUNT=4;          // 실제 점광원(그림자 없음)은 가까운 4개만. 나머지는 발광 재질+바닥 데칼.
// 일주문 앞 광장 등: 일주문 기준 좌표(gx 좌우, gz 광장 쪽 +). boost>1이면 더 밝고 웅덩이가 넓다.
export const PLAZA_LAMPS=Object.freeze([
 {gx:-5.2,gz:4,boost:1.3},{gx:5.2,gz:4,boost:1.3},{gx:-5.2,gz:15,boost:1.1},{gx:5.2,gz:24,boost:1.1},{gx:-5.2,gz:33,boost:1}
]);
// 연주암·정상 시설 보안등(작은 등 1~2개). metres는 참고 거리(route.points.referenceMetres), 정상은 코스 끝에서 거꾸로.
export const FACILITY_LAMPS=Object.freeze([{id:'yeonjuam',metres:4545,side:4.5,height:3.2},{id:'summit',fromEnd:6,side:3.2,height:3.2}]);
// 실제 헤드랜턴은 거리 제곱 감쇠보다 완만하게(decay 1.1) 해서 가까운 바닥이 하얗게 타지 않고 15m 앞까지 보이게 한다.
export const HEADLAMP=Object.freeze({reach:15,distance:24,decay:1.1,angle:.45,penumbra:.9,intensity:14,color:0xfff2dc});
// 자동 점등은 해가 진 뒤. 공원등은 해질 무렵(고도 +2°부터 서서히), 헤드랜턴은 어두워진 뒤(−3°).
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
export const lampAmount=elevation=>smooth(2,-4,elevation);
export const headlampDark=elevation=>smooth(-1,-5,elevation);
export const isParkSection=(zone,s)=>zone==='plaza'||s<=PARK_END_S;
// 헤드랜턴 자동 점등: 밤이고 산길 구간일 때. 수동(L키) 값이 있으면 그것이 우선.
export function headlampOn({dark,zone,s,override=null,parkEnd=PARK_END_S}){
 if(override!==null&&override!==undefined)return !!override;
 return dark>=.5&&zone==='route'&&s>parkEnd;
}
export function lampStations(fromS=PARK_LAMP_FROM_S,toS=PARK_END_S,spacing=PARK_LAMP_SPACING){
 const out=[];for(let s=fromS;s<=toS+1e-9;s+=spacing)out.push(s);return out;
}
export function nearestLamps(lamps,x,z,count=REAL_LIGHT_COUNT){
 return lamps.map((l,i)=>({i,d:(l.x-x)**2+(l.z-z)**2})).sort((a,b)=>a.d-b.d).slice(0,count).map(v=>v.i);
}
// 이마 램프 장착 위치(머리 중심 기준 위·앞 m). 복장 4종의 모자·두건과 겹치지 않도록 모자 종류별로 다르게 둔다.
export const HEADLAMP_MOUNT=Object.freeze({none:{up:.10,forward:.105},bandana:{up:.125,forward:.10},cap:{up:.165,forward:.105},panama:{up:.215,forward:.10}});
export const mountFor=kind=>HEADLAMP_MOUNT[kind]??HEADLAMP_MOUNT.none;

// ── 다인원(멀티플레이·NPC) 규칙. 실제 광원은 내 헤드랜턴 1개 + 가로등 풀 4개로 고정하고, 다른 사람은 광원 없이 그림만 그린다.
export const OTHERS={cap:32,decalRange:45,glowRange:110,bodyCap:100,bodyRange:160};
// 가까운 순으로 상한(cap)까지만 그린다. 가까우면(decalRange) 앞길 빛 웅덩이+글로우, 중간(glowRange)은 글로우만, 그보다 멀면 그리지 않는다.
export function selectOthers(others,x,z,{cap=OTHERS.cap,decalRange=OTHERS.decalRange,glowRange=OTHERS.glowRange}={}){
 const rows=[];
 others.forEach((o,i)=>{if(!o||o.lamp===false)return;const d=Math.hypot(o.x-x,o.z-z);if(d<=glowRange)rows.push({i,d});});
 rows.sort((a,b)=>a.d-b.d||a.i-b.i);
 const kept=rows.slice(0,cap);
 return {decal:kept.filter(r=>r.d<=decalRange).map(r=>r.i),glow:kept.map(r=>r.i),dropped:rows.length-kept.length};
}
// 부하 시험용 가짜 등산객 수. ?crowd=50 처럼 지정하며 0~300으로 제한한다.
export function crowdFromSearch(search){
 const v=Number(new URLSearchParams(search).get('crowd'));return Number.isFinite(v)&&v>0?Math.min(300,Math.floor(v)):0;
}
