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
 {e:1,zenith:'#4a5fa0',horizon:'#ffb066',haze:'#eaa088',sunColor:'#ffb45e',sun:.3,amb:.52},
 {e:6,zenith:'#5584c6',horizon:'#ffd19a',haze:'#dcb8a6',sunColor:'#ffcf8a',sun:.66,amb:.74},
 {e:14,zenith:'#4f88cb',horizon:'#d6e6f4',haze:'#acc8e6',sunColor:'#ffe6bf',sun:.9,amb:.86},
 {e:25,zenith:'#4A86C8',horizon:'#BAD6EE',haze:'#9DBEDF',sunColor:'#FFE9C8',sun:1,amb:1}
]);

// 밤: 푸른 달빛 방향광과 주변광. 이전 값은 방향광 .14, 주변광 .12(+.06), 노출 1.9배였다.
// moonFloor/phaseFloor: 실제 달이 지평선 아래거나 초승달이어도 게임 속 밤은 푸른 달빛이 있도록 하한을 둔다. moonElevation은 달이 낮을 때 빛이 오는 가상 높이(°).
export const NIGHT={moonFloor:.7,phaseFloor:.7,moonElevation:38,moonLight:.34,moonColor:[.56,.68,1],ambientBase:.22,ambientMoon:.08,exposure:2.4,basicLevelFloor:.17,basicTint:[.62,.8,1.16]};

// 낮 보정: 노출·채도를 소폭 올리고 그늘은 남색 쪽으로. 낮(고도 높음)일수록 크게, 밤·흐림에서는 약하게 적용한다.
export const DAY_GRADE={exposure:1.06,saturation:1.14,shadowTint:[.9,.97,1.1],shadowTintAmount:.18,highlightWarm:[1.04,1.0,.94]};
// 노을 보정: 금빛 하이라이트와 분홍 그늘.
export const GOLDEN_GRADE={exposure:1.26,saturation:1.26,shadowTint:[1.08,.9,1.1],shadowTintAmount:.3,highlightWarm:[1.18,1,.8]};
// 밤 보정: 채도는 유지하고 그늘을 푸르게.
export const NIGHT_GRADE={exposure:1,saturation:1.1,shadowTint:[.88,.97,1.18],shadowTintAmount:.3,highlightWarm:[1.06,1,.92]};

// 블룸(빛 번짐). 화질 낮음에서는 끈다. 균형은 해상도를 더 줄여 비용을 아낀다.
export const BLOOM={
 strength:{day:.22,golden:.42,night:.5},radius:.55,threshold:.82,
 scale:{high:.5,balanced:.35}, // 블룸 패스 해상도 비율(화면 대비)
 minQuality:1
};

// 공기 원근감: 멀수록 푸르고 옅게. veil은 하늘색 덧칠 세기, scale(m)은 작을수록 가까운 능선부터 옅어진다. 이전 값은 .32 / 7000.
export const AERIAL={veil:.46,scale:5200,color:[.42,.62,.95],golden:[1,.74,.62]};

// 흐림·비: 칙칙한 회색 대신 부드러운 확산광. keep은 하늘 채도를 남기는 비율, dim은 어두워지는 정도.
export const SOFT_WEATHER={grayKeep:.72,dim:.93,sunMul:{overcast:.38,rain:.28,snow:.35,fog:.16},ambientMul:{overcast:1.2,rain:1.12,snow:1.12,fog:1.1},exposureBoost:1.12};
