// 카툰 모드 아트 디렉션 수치(기획서 §2.7)와 시간대 보간. three를 import하지 않아 node --test로 바로 검사한다.
// env는 src/environment.js의 environment.update(dt) 결과(elevation·night·gray·windSpeed·stars·city 등)를 그대로 받는다.
export const TOON={
 gradient:[.35,.7,1.0],                       // 3단 gradientMap(NearestFilter)
 // 점광원·스폿 합 상한(albedo 배수, light-cap.js의 점근값). 해·달은 제외. 밤 노출 2.4배를 곱해도 밝은 단이 1.0을 넘지 않게.
 localLightCap:.45,
 outline:{day:'#3b2f2a',night:'#1d2a44',width:[1,1,1.5],fadeNear:60,fadeFar:900,depthEdge:.012,normalEdge:.42},
 bloom:{
  day:{threshold:.85,strength:.35,radius:.45},
  sunset:{threshold:.7,strength:.6,radius:.55},
  night:{threshold:.55,strength:.9,radius:.6},
 },
 grade:{
  day:{saturation:1.15,tint:'#4fa8e8',tintAmount:.06,contrast:1.04,lift:0,shadowGain:0},
  sunset:{saturation:1.12,amber:'#ffb36b',violet:'#8a6bbf',tintAmount:.2,contrast:1.06,lift:.025,shadowGain:1.1},
  night:{saturation:.9,tint:'#16224a',tintAmount:.18,contrast:1.0,lift:.015,shadowGain:0},
  shadow:'#5f8fb0',shadowAmount:.35,
 },
 sky:{
  day:{zenith:'#3f8fdc',horizon:'#a9dcf5',cloud:'#ffffff',cloudShade:'#b9cde6'},
  sunset:{zenith:'#4a4f9a',horizon:'#ffb36b',cloud:'#ffd2a8',cloudShade:'#8a6bbf'},
  night:{zenith:'#070d26',horizon:'#16224a',cloud:'#2a3560',cloudShade:'#141c3a'},
  starIntensity:3.2,                           // HDR 값(블룸 threshold .55보다 충분히 크게)
 },
 city:{pastel:['#c9c3d6','#e6d8c8'],night:'#2b3152',window:'#ffd27a',windowIntensity:1.15,litMin:.35,litMax:.6,fogScale:7000,floor:3.2,column:3.6},
 // grass/needle은 원래 색 명도를 버리고 물결색(연두↔청록)을 그대로 칠한다(길가 풀·솔잎이 짙은 갈색으로 뜨던 문제).
 foliage:{waveA:'#a8d86a',waveB:'#3fa89a',grassWave:.55,leafWave:.22,top:1.12,bottom:.68,grassFlat:{strength:1,brightness:1},needleFlat:{strength:.88,brightness:.62}},
 // 바위: rockSlope(1-법선y, 약 44°)를 넘거나 rockHeight 위 암반 얼룩이면 회색 화강암. summitHeight 위는 거의 전부 암반.
 terrain:{meadow:'#8fbf5a',forest:'#4f8a3c',highForest:'#6c9b4a',rock:'#9da2a5',soil:'#b08a5e',ridgeHeight:520,forestHeight:430,rockSlope:.28,rockHeight:[500,600],summitHeight:[600,625]},
 // 바위 GLB(rock_*, boulder_*, mountainside): 갈색 단색 대신 화강암 회색. 원래 명도 차이는 ±15%까지만 남긴다.
 rock:{granite:'#a0a4a6',spread:.15},
 // 텍스처를 쓰던 바닥(광장 블록·아스팔트): 텍스처 평균색(틴트는 warmth만큼, 명도 gain배·min~max) + 3단으로 끊은 약한 무늬(가까이만).
 pattern:{amount:.85,dark:.8,light:1.15,darkTone:.8,lightTone:1.12,fadeNear:12,fadeFar:50,warmth:.35,gain:2.2,minLuma:.12,maxLuma:.36},
 trail:{soil:'#a48c70',rock:'#9c958a',paved:'#bdb6aa',stairs:'#a39a8c',deck_stairs:'#a0764a',ridge:'#b5b3ad'},
 water:'#5fb4d6',
};
export const TRAIL_KINDS=Object.keys(TOON.trail);

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
export const lerp=(a,b,t)=>a+(b-a)*t;

// '#rrggbb' → sRGB [0..1] 배열. 셰이더에 넣을 때는 three Color가 선형으로 바꾼다.
export function hexToRgb(hex){
 const n=parseInt(String(hex).replace('#',''),16);
 return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];
}
export function rgbToHex([r,g,b]){
 return '#'+[r,g,b].map(v=>Math.round(clamp(v)*255).toString(16).padStart(2,'0')).join('');
}
export const mixRgb=(a,b,t)=>a.map((v,i)=>lerp(v,b[i],t));

// 시간대 가중치: 낮·노을·밤 세 값의 합이 1. 밤은 environment의 night(태양 -2°~-12°)를 그대로 쓰고,
// 노을은 태양 고도 16° 아래부터 차오르고(6°에서 최대), 해가 진 뒤에는 밤이 넘겨받는다. 해가 지는 동안 낮이 되살아나지 않는다.
export function phaseWeights(env={}){
 const el=Number.isFinite(env.elevation)?env.elevation:30;
 const night=clamp(Number.isFinite(env.night)?env.night:smooth(-2,-12,el));
 const high=smooth(6,16,el);
 const day=clamp(high*(1-night)),sunset=clamp((1-high)*(1-night));
 return {day,sunset,night};
}
const blend3=(w,d,s,n)=>d*w.day+s*w.sunset+n*w.night;
const blendRgb3=(w,d,s,n)=>[0,1,2].map(i=>blend3(w,d[i],s[i],n[i]));

export function bloomFor(env){
 const w=phaseWeights(env),{day,sunset,night}=TOON.bloom;
 return {threshold:blend3(w,day.threshold,sunset.threshold,night.threshold),strength:blend3(w,day.strength,sunset.strength,night.strength),radius:blend3(w,day.radius,sunset.radius,night.radius)};
}

// 색보정: 낮 청량(하늘색 살짝), 노을은 밝은 곳 앰버·어두운 곳 보라, 밤 네이비. 그림자 영역은 청록 틴트.
// 날씨가 흐리면(gray) 채도를 내리고 틴트를 줄인다.
export function gradeFor(env={}){
 const w=phaseWeights(env),g=TOON.grade,gray=clamp(env.gray??0);
 const sky=hexToRgb(g.day.tint),amber=hexToRgb(g.sunset.amber),violet=hexToRgb(g.sunset.violet),navy=hexToRgb(g.night.tint);
 const highlight=blendRgb3(w,sky,amber,navy),shadowBase=blendRgb3(w,hexToRgb(g.shadow),violet,navy);
 const saturation=blend3(w,g.day.saturation,g.sunset.saturation,g.night.saturation)*lerp(1,.8,gray);
 return {
  saturation,
  contrast:blend3(w,g.day.contrast,g.sunset.contrast,g.night.contrast),
  lift:blend3(w,g.day.lift,g.sunset.lift,g.night.lift),
  // 어두운 곳 밝기 배수(노을 역광 숲이 검붉은 덩어리로 묻히지 않게). 형태 대비는 유지하고 바닥만 올린다.
  shadowGain:blend3(w,g.day.shadowGain,g.sunset.shadowGain,g.night.shadowGain),
  highlight,highlightAmount:blend3(w,g.day.tintAmount,g.sunset.tintAmount,g.night.tintAmount)*lerp(1,.5,gray),
  shadow:mixRgb(hexToRgb(g.shadow),shadowBase,.5),shadowAmount:g.shadowAmount*lerp(1,.6,w.night),
 };
}

export function outlineFor(env){
 const w=phaseWeights(env);
 // 노을까지는 갈색, 밤으로 갈수록 남색.
 return {color:mixRgb(hexToRgb(TOON.outline.day),hexToRgb(TOON.outline.night),w.night),fadeNear:TOON.outline.fadeNear,fadeFar:TOON.outline.fadeFar};
}
// 거리 d(m)에서의 외곽선 세기. 원경으로 갈수록 0.
export function outlineFade(d,{fadeNear=TOON.outline.fadeNear,fadeFar=TOON.outline.fadeFar}={}){
 return 1-smooth(fadeNear,fadeFar,d);
}
export function outlineWidth(quality=1){return TOON.outline.width[clamp(Math.round(quality),0,2)];}

export function skyFor(env={}){
 const w=phaseWeights(env),s=TOON.sky,gray=clamp(env.gray??0);
 const pick=key=>blendRgb3(w,hexToRgb(s.day[key]),hexToRgb(s.sunset[key]),hexToRgb(s.night[key]));
 const toGray=c=>{const l=c[0]*.2126+c[1]*.7152+c[2]*.0722;return mixRgb(c,[l,l,l],gray*.75);};
 return {
  zenith:toGray(pick('zenith')),horizon:toGray(pick('horizon')),cloud:toGray(pick('cloud')),cloudShade:toGray(pick('cloudShade')),
  // 별은 밤 가중치 × 날씨(env.stars가 있으면 그것). 블룸을 받도록 HDR 세기를 곱한다.
  stars:clamp(env.stars??w.night*(1-gray))*s.starIntensity,
  cloudCover:clamp(.35+.55*(env.cloud??0)),
  weights:w,
 };
}

// 건물 seed(0~1)별 켜진 창 비율 35~60%. 밤 가중치를 곱해 해질녘엔 덜 켜진다.
export function windowLitShare(seed,night=1){
 const t=((Math.sin(seed*91.7+3.1)*43758.5453)%1+1)%1;
 return lerp(TOON.city.litMin,TOON.city.litMax,t)*clamp(night);
}

export function foliageWave(env={}){
 const wind=clamp((env.windSpeed??3)/12,0,1);
 return {speed:lerp(.8,2.2,wind),strength:lerp(.7,1,wind)};
}
