// 상호작용 내용 자료. 문구·위치 근거는 docs/상호작용-자료.md(산리서치)이고, 모든 글은 직접 쓴 설명이다(외부 문장 복사 없음).
// 안내판 글은 현장 안내판 문구가 아니다. 화면에 "직접 정리한 설명이며 현장 안내판 글이 아닙니다"를 항상 붙인다.
export const NOT_SIGN_NOTICE='직접 정리한 설명이며 현장 안내판 글이 아닙니다';
export const STONE_NOTICE='게임 속 돌이에요. 실제 산에서는 돌을 옮기지 않아요';
export const CARD_NOTICE='온라인 체험 기록 · 실제 등산 기록이 아닙니다';
// 칩 3종: ok 확인됨 / lore 전해지는 이야기 / est 추정
export const CHIP_LABEL=Object.freeze({ok:'확인됨',lore:'전해지는 이야기',est:'추정'});

// ① 스탬프 6곳. 글자·번호는 수첩 시안(門·瀑·亭·塔·庵·臺)과 같고 km·고도는 자료 §① 표다(정상석 해발은 표기 값 629m).
export const STAMPS=Object.freeze([
 {id:'stamp-1',n:1,glyph:'門',name:'일주문',note:'출발',km:0,elev:99,tilt:-5},
 {id:'stamp-2',n:2,glyph:'瀑',name:'인공폭포',note:'호수공원 옆',km:1.34,elev:144,tilt:4},
 {id:'stamp-3',n:3,glyph:'亭',name:'팔각정',note:'계곡 쉼터',km:2.42,elev:218,tilt:-3},
 {id:'stamp-4',n:4,glyph:'塔',name:'돌탑 공터',note:'돌탑 모임',km:3.8,elev:415,tilt:5},
 {id:'stamp-5',n:5,glyph:'庵',name:'연주암 갈림길',note:'큰 삼거리',km:4.5,elev:581,tilt:-6},
 {id:'stamp-6',n:6,glyph:'臺',name:'연주대 정상석',note:'정상',km:4.99,elev:629,tilt:3},
]);

// ② 안내판 본문. 사이트 contentId → 쪽 목록. body는 문단 배열.
const lore=text=>({kind:'lore',text}),ok=text=>({kind:'ok',text}),est=text=>({kind:'est',text});
export const PAGES=Object.freeze({
 '연주대':{title:'연주대',body:['연주대는 관악산 정상 북쪽 꼭대기 절벽 위에 있는 연주암 소속 전각입니다. 신라 의상대사가 수행하던 자리에 세웠다고 전해지고, 조선 초에 다시 지었다고 합니다.','‘연주(戀主)’라는 이름은 고려가 무너진 뒤 옛 신하들이 이곳에서 개성 쪽을 바라보며 임금을 그리워했다는 이야기에서 왔다고 전해집니다. 경기도 기념물 제20호입니다.'],chips:[ok('경기도 기념물 제20호'),lore('창건과 이름의 유래')],source:'출처 · 위키백과 연주대 문서(CC BY-SA 4.0), 서울시 미디어허브 2023 — 사실만 직접 정리'},
 '연주암':{title:'연주암',body:['연주암은 관악산 정상부에 있는 절로, 행정구역은 경기도 과천시입니다. 신라 의상대사가 ‘관악사’라는 이름으로 지었다고 전해지고, 양녕·효령대군이 머물면서 지금 이름이 됐다고 합니다.','대웅전 앞에는 고려시대 탑으로 추정되는 삼층석탑이 서 있고, 경기도 유형문화재 제104호입니다.'],chips:[ok('삼층석탑 경기도 유형문화재 제104호'),lore('창건과 개명 이야기')],source:'출처 · 위키백과 연주암·삼층석탑 문서(CC BY-SA 4.0) — 사실만 직접 정리'},
 '응진전':{title:'응진전',body:['연주대 절벽 위에 올라앉은 작은 기와집이 응진전입니다. 석가모니를 모시고, 제자 열여섯 분(16나한)을 함께 모신 전각입니다.','기도처로 알려져 입시철에 찾는 사람이 많다고 합니다.'],chips:[ok('서울시 시민기자 글 1건'),est('찾는 사람이 많다는 이야기')],source:'출처 · 서울시 미디어허브 2023(시민기자 글) — 사실만 직접 정리'},
 '말바위':{title:'말바위',body:['응진전 뒤쪽에 말 등처럼 생긴 말바위가 있습니다. 올라타면 아들을 낳는다는 이야기가 전해집니다.'],chips:[lore('말바위 전설')],source:'출처 · 서울시 미디어허브 2023(시민기자 글) — 사실만 직접 정리'},
 '정상석':{title:'정상석 · 629m',body:['정상석에는 ‘629m’라고 적혀 있습니다. 포털·지도에는 632m로 나오는데, 두 값이 다른 이유는 확인되지 않았습니다.','관악산의 실제 가장 높은 바위는 기상레이더 돔 북쪽의 바위로 알려져 있으며, 출입이 막혀 있어 연주대 너럭바위에 정상석을 세웠다고 합니다.'],chips:[ok('정상석 표기 629m'),est('최고점 바위의 이름·위치')],source:'출처 · 서울시 미디어허브 2023(시민기자 글 1건, 공식 측량 자료 아님) — 사실만 직접 정리'},
 '계곡':{title:'관악산 계곡',body:['관악산은 중생대 쥐라기에 생긴 화강암으로 이루어진 산입니다. 이 길은 관악산공원 입구에서 계곡을 따라 오르고, 계곡 곁에 평상과 쉼터, 나무다리가 이어집니다.','물이 얇게 흐르는 넓은 바위 위에서는 물소리가 가장 잘 들립니다.'],chips:[ok('화강암 지질'),est('물이 얇게 흐르는 바위(갈수기엔 다를 수 있음)')],source:'출처 · 위키백과 관악산 문서(CC BY-SA 4.0), 산림청 100대명산 GPX 지점 — 사실만 직접 정리'},
 '바위:모자봉':{title:'모자봉 쪽 길',body:['이 길 옆으로 모자봉 쪽 길이 갈립니다.'],chips:[ok('이정표에 적힌 이름만')],source:'출처 · 산림청 100대명산 GPX 이정표(2022 기록) — 모양·유래는 확인 전'},
 '바위:학바위 능선':{title:'학바위 능선',body:['왼쪽은 학바위 능선으로 이어집니다.'],chips:[ok('이정표에 적힌 이름만')],source:'출처 · 산림청 100대명산 GPX 이정표(2022 기록) — 모양·유래는 확인 전'},
 '바위:소머리바위':{title:'소머리바위 방향',body:['이 갈림길에서 소머리바위 쪽으로 길이 갈립니다.'],chips:[ok('이정표에 적힌 이름만')],source:'출처 · 산림청 100대명산 GPX 이정표(2022 기록) — 모양·유래는 확인 전'},
});
// 해설 안내판 id → 보여 줄 쪽(contentId). 정상 안내판은 정상석+연주대 두 쪽.
export const BOARD_PAGES=Object.freeze({'board-valley':['계곡'],'board-yeonjuam':['연주암'],'board-eungjinjeon':['응진전','말바위'],'board-summit':['정상석','연주대']});
export const GPX_SOURCE='이정표 지명 · 산림청 100대명산 GPX(2022 기록, 현재와 다를 수 있음)';

// ③ 정상에서 보이는 랜드마크 17곳(자료 §③ 표). 위경도는 대표 좌표(건물·봉우리 꼭대기가 아님). topAlt = 꼭대기 해발(m).
// maxKm = 이 거리 안이면 "맑은 날 보임". far = 가시거리 기준 밖(인천 쪽)이라 방향만. blocked = 시선 가림 미확인(추정).
export const LANDMARKS=Object.freeze([
 {id:'lm-63',name:'63빌딩',lat:37.51972,lon:126.94,topAlt:259,height:'지상 249m · 안테나 274m',maxKm:25,note:'높이는 위키백과 값'},
 {id:'lm-hangang-1',name:'한강 (한강대교 쪽)',lat:37.5159,lon:126.9578,topAlt:5,height:'',maxKm:25,note:'한강은 방위 약 356°~12° 띠로 보여요'},
 {id:'lm-hangang-2',name:'한강 (동작대교 쪽)',lat:37.5112,lon:126.9822,topAlt:5,height:'',maxKm:25,note:'한강은 방위 약 356°~12° 띠로 보여요'},
 {id:'lm-yeouido',name:'여의도',lat:37.52389,lon:126.92667,topAlt:15,height:'',maxKm:25,note:'대표점 좌표예요'},
 {id:'lm-namsan',name:'N서울타워(남산)',lat:37.551216,lon:126.988276,topAlt:479.7,height:'타워 236.7m · 해발 479.7m',maxKm:25,note:'영문·국문 위키 값이 일부 달라요'},
 {id:'lm-bugak',name:'북악산',lat:37.60611,lon:126.98333,topAlt:342,height:'약 342m',maxKm:25},
 {id:'lm-bukhan',name:'북한산',lat:37.6608,lon:126.9933,topAlt:836.5,height:'백운대 836.5m',maxKm:30,clearest:true,note:'대표점이 백운대 위치가 아닐 수 있어요'},
 {id:'lm-dobong',name:'도봉산',lat:37.69854,lon:127.01497,topAlt:739.5,height:'자운봉 739.5m',maxKm:30,clearest:true},
 {id:'lm-lotte',name:'롯데월드타워',lat:37.5125,lon:127.10278,topAlt:580,height:'555.65m',maxKm:25,note:'지반 해발은 확인하지 못해 높이는 추정이에요'},
 {id:'lm-cheonggye',name:'청계산',lat:37.41556,lon:127.04139,topAlt:620,height:'약 620m (자료마다 618~620m)',maxKm:25,blocked:true},
 {id:'lm-gwanggyo',name:'광교산',lat:37.34472,lon:127.03389,topAlt:582,height:'582m',maxKm:25,blocked:true},
 {id:'lm-namhan',name:'남한산',lat:37.47111,lon:127.18222,topAlt:522,height:'',maxKm:25,blocked:true,note:'높이는 원문을 확인하지 못해 적지 않았어요'},
 {id:'lm-suri',name:'수리산',lat:37.36667,lon:126.86667,topAlt:488,height:'488m',maxKm:25,blocked:true},
 {id:'lm-gyeyang',name:'계양산 (인천)',lat:37.553,lon:126.715,topAlt:395,height:'395m',maxKm:30,clearest:true},
 {id:'lm-songdo',name:'송도국제도시 (인천)',lat:37.38391,lon:126.64386,topAlt:10,height:'',maxKm:30,far:true},
 {id:'lm-incheon-bridge',name:'인천대교 (인천)',lat:37.41387,lon:126.5665,topAlt:30,height:'',maxKm:30,far:true},
 {id:'lm-airport',name:'인천국제공항 (인천)',lat:37.46333,lon:126.44,topAlt:10,height:'',maxKm:30,far:true},
]);
export const LANDMARK_OBSERVER=Object.freeze({lat:37.445184,lon:126.964135,alt:654.5});
// 이름표는 정상 부근에서만(지형이 가리는 곳에서 거짓 이름표를 보이지 않게). 해발 m.
export const LANDMARK_MIN_ELEVATION=560;
// 날씨 → 가시거리(km). 맑은 날 20~25km가 상한이라는 기존 판단을 따른다(추정).
export const WEATHER_VISIBILITY_KM=Object.freeze({clear:25,clouds:20,overcast:12,rain:8,snow:5,fog:1.5});

// ④ 산길 행동. 효과 수치·시간은 설계 제안값이다(게임 감각으로 조정).
export const ACTIONS=Object.freeze({
 drink:{label:'약수 한 모금',sub:'게임 속 회복',total:3.4,stamina:15,cooldown:20,sound:['splash','gulp','gulp','breath'],steps:['물을 뜨는 중…','마시는 중…','후']},
 dip:{label:'손 담그기',sub:'차가운 물에 손을',total:3.2,stamina:5,cooldown:20,sound:['splash','drop'],steps:['손을 담그는 중…','물방울이 떨어져요']},
 cairn:{label:'돌 올리기',sub:STONE_NOTICE,total:2.8,stamina:0,cooldown:4,sound:['scrape','clack','clack','breath'],steps:['돌을 집는 중…','올리는 중…']},
 stretch:{label:'스트레칭',sub:'숨 고르기',total:4,stamina:10,cooldown:30,sound:['inh','exh','wind'],steps:['들이마시고…','내쉬어요']},
});
// 계곡 접근 지점(자료 §④: 평상·벤치 1,540·1,710, 평상 2,156). 물가까지 내려갈 수 있는지는 현장 확인 전(추정). m = GPX 수평거리.
export const STREAM_SPOTS=Object.freeze([{id:'stream-1540',m:1540},{id:'stream-1710',m:1710},{id:'stream-2156',m:2156}]);

// 알약 반경(m). 마커 15, 표시 4(정상석·스탬프 6), 6.5 밖에서 사라짐.
export const RULES=Object.freeze({marker:15,show:4,showStamp:6,hide:6.5,cone:70*Math.PI/180,runSpeed:2.2,recheck:1.5});
