// 감성·화사한 분위기 설정. 낮·노을·밤·흐림의 빛과 색 보정 값을 이 파일 한 곳에서 조정한다.
// 방향: 사실감은 유지하되 칙칙하지 않게. 근거: docs/식생밀도-분위기-참고-2026-11-04.md §2~3 (수치는 제안값이며 화면을 보며 맞춘다).
// 순수 데이터만 둔다(렌더 코드 없음).

// 기준 화면: 같은 지점(코스 30%)에서 ?time=&weather= 로 찍는다. 11월 4일 서울 일몰은 약 17:20.
export const REFERENCE_LOOKS=Object.freeze([
 {id:'day',label:'낮 (11:00)',time:'11:00',weather:'clear'},
 {id:'golden',label:'노을 (16:55)',time:'16:55',weather:'clear'},
 {id:'night',label:'밤 (20:30)',time:'20:30',weather:'clear'},
 {id:'overcast',label:'흐림 (11:00)',time:'11:00',weather:'overcast'}
]);

// 하늘·햇빛 키 프레임(태양 고도 e°). 낮은 따뜻한 햇빛+푸른 하늘, 노을은 금빛·분홍, 밤은 푸른 남색(완전 검정 금지).
export const SKY_KEYS=Object.freeze([
 {e:-18,zenith:'#142149',horizon:'#2a3a6c',haze:'#222f5a',sunColor:'#9bb0e8',sun:0,amb:.1},
 {e:-8,zenith:'#1f2f66',horizon:'#6a5486',haze:'#443f74',sunColor:'#e7a0a0',sun:0,amb:.14},
 {e:-3,zenith:'#37508f',horizon:'#f5a083',haze:'#c98a96',sunColor:'#ffa86a',sun:.05,amb:.25},
 {e:1,zenith:'#4a5fa0',horizon:'#ffb066',haze:'#c6b0aa',sunColor:'#ffc88e',sun:.3,amb:.52},
 {e:6,zenith:'#5a8fd0',horizon:'#ffd9ac',haze:'#c4c0c4',sunColor:'#ffe2bc',sun:.66,amb:.78},
 {e:14,zenith:'#4a8fd6',horizon:'#dcecf9',haze:'#b4d2ee',sunColor:'#ffeac8',sun:.9,amb:.9},
 {e:25,zenith:'#3F8FDE',horizon:'#C9E4F8',haze:'#A6CBEA',sunColor:'#FFEBCB',sun:1,amb:1}
]);

// 밤: 푸른 달빛 방향광과 주변광. 이전 값은 방향광 .14, 주변광 .12(+.06), 노출 1.9배였다.
// moonFloor/phaseFloor: 실제 달이 지평선 아래거나 초승달이어도 게임 속 밤은 푸른 달빛이 있도록 하한을 둔다. moonElevation은 달이 낮을 때 빛이 오는 가상 높이(°).
export const NIGHT={moonFloor:.7,phaseFloor:.7,moonElevation:38,moonLight:.34,moonColor:[.56,.68,1],ambientBase:.22,ambientMoon:.08,exposure:2.4,basicLevelFloor:.17,basicTint:[.62,.8,1.16]};

// 낮 보정(2차 개선: 더 화사하고 맑게 — 노출 1.06→1.18, 채도 1.14→1.26, 그늘 남색 .18→.14, 맑은 하늘색·연무색을 더 푸르고 밝게): 노출·채도를 소폭 올리고 그늘은 남색 쪽으로. 낮(고도 높음)일수록 크게, 밤·흐림에서는 약하게 적용한다.
export const DAY_GRADE={exposure:1.18,saturation:1.26,shadowTint:[.93,.98,1.08],shadowTintAmount:.14,highlightWarm:[1.05,1.0,.93]};
// 3차 개선: 하늘·햇빛만 노을빛이고 숲·바위·도심은 제 색이 남도록 채도 1.28→1.08, 따뜻함 [1.08,1,.88]→[1.04,1,.95], 햇빛색(e=1·6, #ffb45e→#ffc88e·#ffd69a→#ffe2bc)과 연무색(fog, #eaa088→#c6b0aa·#e2c4b4→#c4c0c4)의 주황을 옅게 했다. 하늘 지평선색(horizon)은 그대로다.
// 노을 보정: 금빛 하이라이트와 분홍 그늘. 2차 개선에서 화면 전체가 너무 주황이라는 지적에 따라 따뜻함 [1.18,1,.8]→[1.08,1,.88]로 낮추고 대신 노출 1.26→1.32로 밝혔다.
export const GOLDEN_GRADE={exposure:1.32,saturation:1.08,shadowTint:[1.05,.93,1.1],shadowTintAmount:.24,highlightWarm:[1.04,1,.95]};
// 밤 보정: 채도는 유지하고 그늘을 푸르게.
export const NIGHT_GRADE={exposure:1,saturation:1.1,shadowTint:[.88,.97,1.18],shadowTintAmount:.3,highlightWarm:[1.06,1,.92]};

// 블룸(빛 번짐). 화질 낮음에서는 끈다. 균형은 해상도를 더 줄여 비용을 아낀다.
export const BLOOM={
 strength:{day:.3,golden:.4,night:.5},radius:.55,threshold:.82,
 scale:{high:.5,balanced:.35}, // 블룸 패스 해상도 비율(화면 대비)
 minQuality:1,
 // 블룸 입력 밝기 상한과 문턱의 부드러운 폭. 가로등 점광원 바로 옆 면(전구·갓 밑)은 밝기가 수천 배로 튀어서,
 // 시점이 바뀌어 그 면이 보이는 순간 블룸이 화면 전체로 번쩍였다. 상한을 두면 밝은 점은 남고 번쩍임만 사라진다.
 cap:1.6,knee:.25
};

// 공기 원근감: 멀수록 푸르고 옅게. veil은 하늘색 덧칠 세기, scale(m)은 작을수록 가까운 능선부터 옅어진다. 이전 값은 .32 / 7000.
export const AERIAL={veil:.46,scale:5200,color:[.42,.62,.95],golden:[1,.74,.62]};

// 흐림·비: 칙칙한 회색 대신 부드러운 확산광. keep은 하늘 채도를 남기는 비율, dim은 어두워지는 정도.
export const SOFT_WEATHER={grayKeep:.72,dim:.93,sunMul:{overcast:.38,rain:.28,snow:.35,fog:.16},ambientMul:{overcast:1.2,rain:1.12,snow:1.12,fog:1.1},exposureBoost:1.12};
