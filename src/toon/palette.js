// 카툰 모드 아트 디렉션 수치(기획서 §2.7)와 시간대 보간. three를 import하지 않아 node --test로 바로 검사한다.
// env는 src/environment.js의 environment.update(dt) 결과(elevation·night·gray·windSpeed·stars·city 등)를 그대로 받는다.
export const TOON={
 gradient:[.35,.7,1.0],                       // 3단 gradientMap(NearestFilter)
 terrainGradient:[.6,.82,1.0],                // 지형 전용(부드러운 사면 명암)
 terrainContactAO:{direct:.25,indirect:.35},    // 나무 밑 접지 그늘을 땅에 남기는 비율(실사 1)
 // 점광원·스폿 합 상한(albedo 배수, light-cap.js의 점근값). 해·달은 제외. 밤 노출 2.4배를 곱해도 밝은 단이 1.0을 넘지 않게.
 localLightCap:.45,
 // strength: 시간대별 외곽선 세기. 참고 사진(「야생의 숨결」 낮)에는 배경 외곽선이 없어 낮은 0(기준값 §2-6). 노을·밤은 5단계에서 정한다.
 outline:{day:'#3b2f2a',night:'#1d2a44',strength:{day:0,sunset:1,night:1},width:[1,1,1.5],fadeNear:60,fadeFar:900,depthEdge:.012,normalEdge:.42},
 bloom:{
  day:{threshold:.85,strength:.35,radius:.45},
  sunset:{threshold:.8,strength:.35,radius:.5},
  night:{threshold:.55,strength:.9,radius:.6},
 },
 grade:{
  // 낮: 「야생의 숨결」의 옅고 맑은 색(채도는 거의 그대로, 밝은 곳에 청록 기운 약간).
  day:{saturation:.95,tint:'#8fc4c8',tintAmount:.05,contrast:1.0,lift:.01,shadowGain:0},
  // 노을 그늘 틴트는 청남(하늘 위 #2c4d79 쪽): 어두운 하늘 꼭대기·실루엣이 회보라로 뜨지 않게.
  sunset:{saturation:1.1,amber:'#ffb36b',violet:'#3b4f8c',tintAmount:.1,contrast:1.06,lift:0,shadowGain:.4},
  night:{saturation:.9,tint:'#16224a',tintAmount:.18,contrast:1.0,lift:.015,shadowGain:0},
  shadow:'#5f8fb0',shadowAmount:.35,dayShadowAmount:.18,
 },
 sky:{
  // 낮 하늘: 기준값 §1-1(화면 위 #a2c8d3, 지평선 #c3dcd4, 구름은 하늘보다 조금 밝은 청회색). 천정은 가장 진한 사진값(04_06 #80acd3) 쪽.
  // mid·pink를 비우면 zenith·horizon 사이 값으로 채운다(4단 그라데이션을 낮·밤에도 같은 식으로 쓴다).
  day:{zenith:'#7aaed6',horizon:'#c3dcd4',cloud:'#eef4f1',cloudShade:'#b5d0d0'},
  // 노을: 「너의 이름은」 카타와레도키 4단(기준값 §1-2, 08_01·08_10): 청남 → 보라 → 분홍 → 살구·크림. 구름은 분홍 보라, 해 쪽 가장자리는 빛을 받아 밝다.
  sunset:{zenith:'#2c4d79',mid:'#7d66ab',pink:'#d19caf',horizon:'#fadfca',cloud:'#b48ea5',cloudShade:'#9f7e9b',cloudLit:'#ca9eab'},
  // 밤: 청록기 도는 남색(§1-3, 09_01·10_04). 지평선은 #6b768f, 도심 쪽은 라벤더 빛무리 #b6b1ce(10_04)에 도심 불빛 크림(#ede7c9)을 25% 섞은 값. 밤구름 #3a5676(달빛 받은 쪽 #4c6d94).
  night:{zenith:'#172432',horizon:'#4f5b74',city:'#c4bfcd',cloud:'#3a5676',cloudShade:'#273e58',cloudLit:'#4c6d94'},
  // 그라데이션 높이(시선 방향 y): 분홍 띠·보라 띠·천정. 08_01 화면 비율(보라 40%·분홍 53%·지평선 70%)을 각도로 옮긴 값.
  bands:[.08,.18,.3],
  starIntensity:1.6,                           // 밝은 별만 블룸 문턱(.55)을 살짝 넘는다(하늘 전체가 번지지 않게)
  // 별: 둥근 점(픽셀 크기 고정). 칸 수·켜질 확률. 은하수 띠 안에서는 더 촘촘하다. 기준 별 밀도 맑은 밤 10만 px당 약 23개(09_01).
  stars:{cells:120,share:.012,bright:.035,smallPx:1.,brightPx:1.8,milkyBoost:4,small:.3,big:.6},
  // 은하수: 북서 지평선(방위 300°, 5°)에서 북동 하늘(30°, 55°)로 오르는 띠(09_01·09_06 느낌). 폭은 라디안.
  milky:{from:[300,5],to:[30,55],width:.11,color:'#5d6d94',dust:'#141c2c',strength:.5},
  // 도심 빛무리 방향(정상에서 서울 도심 쪽 방위)과 세기. input: 화면에서 night.city가 나오도록 넣는 값(색보정 보상). 더 밝히면 블룸 문턱을 넘어 지평선에 빛 덩어리가 생긴다.
  cityGlow:{bearing:345,strength:1,height:.16,input:'#cdc2c2'},
  // 노을·밤 구름 덮임(낮은 날씨 cloud를 따른다). 밤은 별·은하수가 보이도록 성기게.
  cover:{sunset:.72,night:.3},
 },
 // 밤: 「너의 이름은」처럼 숲·산이 하늘보다 어두운 실루엣(§1-3 숲 #13252f).
 //  nightExposure: 실사 밤 노출 배수(2.4)에 곱한다. 노출을 1 근처로 둬 하늘·불빛이 팔레트 값 그대로 보이고 블룸 문턱도 그대로다.
 //  nightLight: 달빛·반구광·연무색에 곱하는 배수(땅만 어둡게).
 nightExposure:.42,nightLight:.5,sunsetLight:.3,
 // 노을 원경 안개(§1-2 #65545e 보라 회색): 먼 산이 초록으로 남지 않게 노을 가중치만큼 연무색을 바꾸고 짙게.
 sunsetHaze:{color:'#65545e',density:3e-4},
 // 도심(밤): 참고 사진(09_03·10_04·10_06)대로 크림 흰색(#ede7c9) 위주, 화면 실측 주황 약 35%. 창·불빛 점·도로 가로등 모두 creamShare만큼 크림, 나머지만 주황(window·dot[0]).
 //  주황은 크림보다 어둡게 보여 비율이 적게 잡히므로 creamShare를 .48로 두고 orangeGain으로 밝힌다.
 //  creamInput: 밤 색보정(남색 틴트)에 푸르게 눌리는 만큼 노랗게 넣은 크림. 화면에서 cream(#ede7c9) 근처가 나온다. dotGain을 1 근처로 둬 블룸에 흰색으로 날아가지 않게.
 // 건물 벽 #3d444c(§1-3). 점은 dotDensity(벽 m²당)·건물당 dotMax·전체 dotTotal 상한, 크기 dotPx(px).
 // 낮: 정상 원경의 도심은 원경 안개(§1-1 #7291aa)에 묻힌다. dayHaze 쪽으로 dayHazeAmount만큼 누르고(먼 쪽은 더), 건물마다 명도 차는 dayVar만 남긴다.
 city:{pastel:['#c9c3d6','#e6d8c8'],night:'#3d444c',window:'#ffa64d',cream:'#ede7c9',creamInput:'#f0e5bc',creamShare:.48,windowIntensity:.9,litMin:.35,litMax:.6,fogScale:7000,floor:3.2,column:3.6,
  dot:['#ff9a3c'],dotGain:1.12,orangeGain:1.16,dotPx:2.2,dotDensity:.0025,dotMax:4000,dotTotal:200000,lampGain:1.2,roadLightGain:.45,
  dayHaze:'#88a7bf',dayHazeAmount:.9,dayVar:.03},
 // 공원 가로등 기둥(night-lighting.js, 실사 #1c1e21 금속). 카툰에서는 검은 막대로 뜨지 않게 숲 그늘 톤의 짙은 청록 회색.
 lampPole:'#8d9a93',
 // grass/needle은 원래 색 명도를 버리고 물결색(연두↔청록)을 그대로 칠한다(길가 풀·솔잎이 짙은 갈색으로 뜨던 문제).
 foliage:{waveA:'#a8d06a',waveB:'#6f9f4a',grassWave:.55,leafWave:.22,top:1.12,bottom:.68,grassFlat:{strength:1,brightness:1},needleFlat:{strength:.88,brightness:.62},sunsetDim:.4,nightDim:.6},
 // 바위: rockSlope(1-법선y, 약 44°)를 넘거나 rockHeight 위 암반 얼룩이면 회색 화강암. summitHeight 위는 거의 전부 암반.
 // 산 표면(3단계): 완만한 사면은 풀밭(가까이 #97c36a → 멀리 밝고 푸른 #a1c58f)과 숲 덩어리, 급한 사면은 회백색 암벽(가로 층),
 // 먼 산은 원경 안개색으로 녹인다(haze, 낮만). 숲·암반 경계는 값 잡음 덩어리(사인 띠 무늬를 쓰지 않는다).
 terrain:{meadow:'#a3d27a',meadowFar:'#a6c993',forest:'#4f8434',highForest:'#6a9a4a',rock:'#a5afae',rockDark:'#56685f',soil:'#b08a5e',ridgeHeight:520,forestHeight:430,rockSlope:.28,rockHeight:[500,600],summitHeight:[600,625],
  forestScale:70,rockScale:45,haze:'#8eaec4',hazeDensity:2.2e-4},
 // 카툰 전용 자연물 재질색(src/toon/nature.js). 화면 결과가 기준값 §1-1(잎 #61973b·그늘 #3f7124·줄기 #6c7738·침엽수 #526554·풀 #97c36a·바위 #a9a892/#54665e)에 맞도록 고른 값.
 nature:{leaf:'#6fae44',leafShade:'#4f8a30',trunk:'#626d36',pine:'#5c7a62',pineShade:'#4a6455',pineTrunk:'#8a5b42',sapling:'#668760',saplingShade:'#4c6a52',
  bush:'#76ab4e',bushShade:'#4c7c36',grassBase:'#6a9e58',grassTip:'#86bc68',grassBand:'#aed690',flowerA:'#f7e45c',flowerB:'#e6e2d2',flowerShare:.12,clumpDark:.68,bandAmount:.5,rim:.3,
  rock:'#a0aaab',rockDark:'#56685f',rockBlot:.8,moss:'#93b85c',mossDark:'#5f8b3e',mossLevel:.9,rockShadeTint:[.8,1.0,1.02],rockShadeDirect:.22},
 // 바위 GLB(rock_*, boulder_*, mountainside): 갈색 단색 대신 화강암 회색. 원래 명도 차이는 ±15%까지만 남긴다.
 rock:{granite:'#a0a4a6',spread:.15},
 // 텍스처를 쓰던 바닥(광장 블록·아스팔트): 텍스처 평균색(틴트는 warmth만큼, 명도 gain배·min~max) + 3단으로 끊은 약한 무늬(가까이만).
 pattern:{amount:.85,dark:.8,light:1.15,darkTone:.8,lightTone:1.12,fadeNear:12,fadeFar:50,warmth:.35,gain:2.2,minLuma:.12,maxLuma:.36},
 trail:{soil:'#a48c70',rock:'#9c958a',paved:'#bdb6aa',stairs:'#a39a8c',deck_stairs:'#a0764a',ridge:'#a9aeab'},
 water:'#3e8878',                              // 한강 등 먼 물(MeshToon, 조명을 받는다). 기준값 §1-1 물
 // 계곡·연못 물(src/toon/water.js, 조명 없는 재질이라 시간대 색을 직접 쓴다). 기준값 §1-1~1-3 물 행.
 //  낮: 짙은 청록 #3e8878·얕은 물 #8bc6af(04_14). 노을: 하늘을 비추는 분홍 은빛 #dcc8c4(08_02). 밤: #394746(09_13).
 stream:{
  day:{deep:'#3e8878',shallow:'#8bc6af',foam:'#e6f3ee',streak:'#6fae9e',sparkle:1},
  sunset:{deep:'#a4889c',shallow:'#dcc8c4',foam:'#fff0ea',streak:'#f3dcd6',sparkle:.8},
  night:{deep:'#26393a',shallow:'#394746',foam:'#7f9399',streak:'#4b5f62',sparkle:.15},
  opacity:.9,bed:'#9fa08f',
 },
 // 숲 빛줄기(light-fx.js, 실사와 공용) 세기 배수. 단색 수관 위에서는 실사 세기가 반투명 띠로 두드러져 낮춘다.
 lightShafts:.4,
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
  // 낮 그늘 청록 틴트는 약하게(잎 그늘이 짙은 청록으로 뜨지 않게, 기준 잎 그늘 #3f7124).
  shadow:mixRgb(hexToRgb(g.shadow),shadowBase,.5),shadowAmount:(g.shadowAmount+(g.dayShadowAmount-g.shadowAmount)*w.day)*lerp(1,.6,w.night),
 };
}

export function outlineFor(env){
 const w=phaseWeights(env);
 // 노을까지는 갈색, 밤으로 갈수록 남색.
 const k=TOON.outline.strength;
 return {color:mixRgb(hexToRgb(TOON.outline.day),hexToRgb(TOON.outline.night),w.night),strength:blend3(w,k.day,k.sunset,k.night),fadeNear:TOON.outline.fadeNear,fadeFar:TOON.outline.fadeFar};
}
// 거리 d(m)에서의 외곽선 세기. 원경으로 갈수록 0.
export function outlineFade(d,{fadeNear=TOON.outline.fadeNear,fadeFar=TOON.outline.fadeFar}={}){
 return 1-smooth(fadeNear,fadeFar,d);
}
export function outlineWidth(quality=1){return TOON.outline.width[clamp(Math.round(quality),0,2)];}

export function skyFor(env={}){
 const w=phaseWeights(env),s=TOON.sky,gray=clamp(env.gray??0);
 // mid·pink가 없는 시간대는 지평선→천정 사이 값(분홍 .3, 보라 .65 지점).
 const stop=(p,key)=>p[key]?hexToRgb(p[key]):key==='mid'?mixRgb(hexToRgb(p.horizon),hexToRgb(p.zenith),.65):key==='pink'?mixRgb(hexToRgb(p.horizon),hexToRgb(p.zenith),.3):
  key==='cloudLit'?hexToRgb(p.cloud):key==='city'?hexToRgb(p.horizon):null;
 // 밤 도심 빛무리는 밤 색보정(남색 틴트·채도)에 푸르고 어둡게 눌린다. 화면에서 night.city가 나오도록 cityGlow.input(더 따뜻하고 밝은 값)을 넣는다.
 const nightStop=key=>key==='city'?hexToRgb(s.cityGlow.input):stop(s.night,key)??hexToRgb(s.night[key]);
 const pick=key=>blendRgb3(w,stop(s.day,key)??hexToRgb(s.day[key]),stop(s.sunset,key)??hexToRgb(s.sunset[key]),nightStop(key));
 const toGray=c=>{const l=c[0]*.2126+c[1]*.7152+c[2]*.0722;return mixRgb(c,[l,l,l],gray*.75);};
 const cover=clamp(.35+.55*(env.cloud??0));
 return {
  zenith:toGray(pick('zenith')),mid:toGray(pick('mid')),pink:toGray(pick('pink')),horizon:toGray(pick('horizon')),city:toGray(pick('city')),
  cloud:toGray(pick('cloud')),cloudShade:toGray(pick('cloudShade')),cloudLit:toGray(pick('cloudLit')),
  // 별은 밤 가중치 × 날씨(env.stars가 있으면 그것). 블룸을 받도록 HDR 세기를 곱한다. 노을 끝 무렵 하늘 위쪽에 드문 별(08_01).
  stars:clamp(Math.max(env.stars??w.night*(1-gray),w.sunset*.12*(1-gray)))*s.starIntensity,
  milky:clamp(w.night*(1-gray)*(1-clamp((env.moon?.illumination??0)*(env.moon?.visible??0))*.5))*s.milky.strength,
  cityGlow:w.night*s.cityGlow.strength*(1-gray*.5),
  // 노을·밤은 고정 덮임을 기본으로 하되 흐리면 날씨 쪽으로 늘린다.
  cloudCover:clamp(blend3(w,cover,Math.max(s.cover.sunset,cover),Math.max(s.cover.night,cover))),
  weights:w,
 };
}
// 방위(도, 북=0 동=90)·고도(도) → 월드 방향 [x,y,z]. 북은 -z, 동은 +x(main.js projectDir와 같다).
export function bearingDir(bearing,elevation=0){
 const b=bearing*Math.PI/180,e=elevation*Math.PI/180;
 return [Math.sin(b)*Math.cos(e),Math.sin(e),-Math.cos(b)*Math.cos(e)];
}
// 시간대 노출 배수(카툰 밤은 실사보다 어둡게).
export function exposureFor(env={}){
 return lerp(1,TOON.nightExposure,phaseWeights(env).night);
}
export function lightScaleFor(env={}){
 const w=phaseWeights(env);
 // 노을은 역광 실루엣 쪽으로 조금(08_01·08_02 숲·바위는 하늘보다 어둡다), 밤은 크게.
 return w.day+w.sunset*TOON.sunsetLight+w.night*TOON.nightLight;
}

// 계곡 물 색(sRGB 배열): 시간대 가중치로 섞고 흐리면 회색 쪽으로. 반짝임은 직사광이 없으면 줄인다.
export function waterFor(env={}){
 const w=phaseWeights(env),s=TOON.stream,gray=clamp(env.gray??0);
 const toGray=c=>{const l=c[0]*.2126+c[1]*.7152+c[2]*.0722;return mixRgb(c,[l,l,l],gray*.5);};
 const pick=key=>toGray(blendRgb3(w,hexToRgb(s.day[key]),hexToRgb(s.sunset[key]),hexToRgb(s.night[key])));
 return {deep:pick('deep'),shallow:pick('shallow'),foam:pick('foam'),streak:pick('streak'),
  sparkle:blend3(w,s.day.sparkle,s.sunset.sparkle,s.night.sparkle)*(1-gray*.8),opacity:s.opacity,bedRgb:hexToRgb(s.bed),weights:w};
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
