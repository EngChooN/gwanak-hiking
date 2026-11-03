// 구간별 식생 밀도. 산리서치 docs/식생밀도-분위기-참고-2026-11-04.md의 구현 목표값(⚠️ 제안, 측정값 아님)을 따른다.
// 구간 경계는 표고(m)로 나누고 100m 안팎에서 선형으로 잇는다. 임상도(15093362)를 받으면 이 표를 교체한다.
export const FOREST_ZONES={
 status:'구현 목표값 · 후기·사진·논문 초록 근거 · 임상도 확보 전',
 // 입구·계곡(~200m) → 중턱 숲(200~430m) → 능선·암릉(520m~) → 정상부(600m~).
 ridgeStart:430,ridgeFull:520,summitStart:600,summitFull:625,
 targets:{
  valley:{canopy:[.85,.95],spacing:[4,6],understory:[.4,.6],floor:.7,broadleaf:.8},
  mid:{canopy:[.8,.9],spacing:[5,7],understory:[.3,.5],floor:.65,broadleaf:.75},
  ridge:{canopy:[.25,.45],spacing:[8,15],understory:[.1,.2],floor:.3,broadleaf:.25},
  summit:{canopy:[.1,.25],spacing:[10,30],understory:[.1,.1],floor:.2,broadleaf:.1},
 },
};
const clamp01=v=>Math.max(0,Math.min(1,v));
const smooth=(a,b,v)=>{const t=clamp01((v-a)/(b-a));return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
// 0=숲(계곡·중턱), 1=능선·암릉. 정상부는 summit 가중치로 따로 준다.
export function ridgeWeight(y){return Number.isFinite(y)?smooth(FOREST_ZONES.ridgeStart,FOREST_ZONES.ridgeFull,y):0;}
export function summitWeight(y){return Number.isFinite(y)?smooth(FOREST_ZONES.summitStart,FOREST_ZONES.summitFull,y):0;}
export function zoneName(y){
 if(summitWeight(y)>.5)return 'summit';if(ridgeWeight(y)>.5)return 'ridge';return Number.isFinite(y)&&y>=200?'mid':'valley';
}
// 숲 기준 1에 대한 상대 밀도. 길가 교목·덤불·풀 배치 확률에 곱한다.
export function treeDensity(y){return mix(mix(1,.3,ridgeWeight(y)),.12,summitWeight(y));}
export function shrubDensity(y){return mix(mix(1,.25,ridgeWeight(y)),.12,summitWeight(y));}
// 능선 풀은 지금 밀도를 유지한다(바위 노출은 지형 재질이 맡는다). 590m 위 정상부만 이전처럼 18%.
export function grassDensity(y){return Number.isFinite(y)?mix(1,.184,smooth(585,595,y)):1;}
// 활엽(참나무류 대용) 비율. 숲 구간은 신갈나무 우점(소나무 20~30%), 능선은 바위 가장자리 소나무 우점.
export function broadleafRatio(y){
 if(!Number.isFinite(y))return FOREST_ZONES.targets.mid.broadleaf;
 const forest=mix(FOREST_ZONES.targets.valley.broadleaf,FOREST_ZONES.targets.mid.broadleaf,smooth(150,300,y));
 return mix(mix(forest,FOREST_ZONES.targets.ridge.broadleaf,ridgeWeight(y)),FOREST_ZONES.targets.summit.broadleaf,summitWeight(y));
}
