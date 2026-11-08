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
// 쌍안경 랜드마크 설명(2026-11-06 대표 요청: 수치 말고 그곳이 어떤 곳인지). line = 초점 칸 한 줄 요약, body = 설명 쪽 문단.
// 위키백과·나무위키·공식 안내 등 공개 자료를 확인해 우리 말로 새로 쓴 글이다(원문 복사 아님).
export const LANDMARK_ABOUT=Object.freeze({
 'lm-63':{line:'여의도의 금빛 유리 빌딩',body:['1985년 여의도에 문을 연 건물로, 당시 아시아에서 가장 높은 빌딩이었어요. 지상 60층과 지하 3층을 더해 63이라는 이름이 붙었어요.','금빛 반사 유리 외벽으로 이름났고, 꼭대기 층 전망대에서 한강과 서울 시내를 내려다볼 수 있어요.']},
 'lm-hangang-1':{line:'한강 첫 도로 다리 쪽',body:['한강대교는 1917년에 처음 놓인 한강 최초의 도로 다리예요(기차 다리인 한강철교는 1900년). 가운데 노들섬을 지나 용산과 노량진을 잇습니다.','한국전쟁 때 끊어졌다가 다시 놓였고, 지금도 아치 모양 철골이 이어지는 모습으로 알려져 있어요.']},
 'lm-hangang-2':{line:'지하철이 가운데로 달리는 다리 쪽',body:['동작대교는 1984년에 개통한 다리로, 가운데로 지하철 4호선이 달리고 양옆으로 차가 다니는 도로·철도 겸용 다리예요.','북쪽 용산구 이촌동과 남쪽 동작구·서초구 반포동 사이를 잇고, 해 질 녘 노을 구경으로도 알려져 있어요.']},
 'lm-yeouido':{line:'한강 위 섬 · 국회와 증권가',body:['여의도는 한강 가운데 있는 섬(하중도)이에요. 국회의사당, 증권 회사가 모인 금융가, 방송국이 모여 있어 "한국의 맨해튼"이라고도 불러요.','1916년 우리나라 첫 비행장이 생긴 곳이고, 봄에는 윤중로 벚꽃길로 유명해요.']},
 'lm-namsan':{line:'서울 한가운데 남산 위 탑',body:['남산 꼭대기에 선 방송 송신탑으로, 1975년에 완공되고 1980년부터 사람들이 올라갈 수 있게 됐어요. 지금은 서울을 대표하는 전망대예요.','남산은 조선 시대 한양의 남쪽을 지키던 산이라 기슭에 한양도성 성곽이 남아 있어요. 밤에는 탑에 불이 켜져 멀리서도 잘 보여요.']},
 'lm-bugak':{line:'경복궁·청와대 뒤의 산',body:['북악산은 경복궁과 청와대 바로 뒤에 솟은 산으로, 조선이 한양을 세울 때 도읍의 뒷산(주산)으로 삼았어요. 능선을 따라 한양도성 성곽이 이어져요.','1968년 1·21 사태 뒤 출입이 막혔다가 2007년 성곽길 일부, 2020년 북쪽 면, 2022년 남쪽 면이 열렸고 2026년에 모든 구간이 개방됐어요.']},
 'lm-bukhan':{line:'서울 북쪽의 큰 바위산 · 국립공원',body:['북한산은 서울 북쪽을 둘러싼 큰 화강암 산이에요. 백운대·인수봉·만경대 세 봉우리가 뿔처럼 솟아 예전에는 "삼각산"이라고 불렀어요.','1983년 국립공원이 되었고, 도시 한가운데 있는 국립공원이라 해마다 많은 사람이 찾아요. 맑은 날에만 하얀 바위 봉우리가 또렷이 보여요.']},
 'lm-dobong':{line:'뾰족한 화강암 봉우리들',body:['도봉산은 북한산 동북쪽에 이어진 산으로, 자운봉·만장봉·선인봉 같은 뾰족한 화강암 봉우리가 줄지어 서 있어요.','북한산과 함께 북한산국립공원에 속하고, 선인봉은 암벽 등반으로 이름난 곳이에요.']},
 'lm-lotte':{line:'우리나라에서 가장 높은 건물',body:['롯데월드타워는 2017년에 문을 연 123층, 555m 건물로 우리나라에서 가장 높아요. 송파구 잠실, 석촌호수 옆에 있어요.','꼭대기 쪽 117~123층에는 "서울스카이" 전망대가 있어요. 붓처럼 위로 갈수록 가늘어지는 모양이에요.']},
 'lm-cheonggye':{line:'관악산 동쪽 이웃 산',body:['청계산은 서울 서초구와 과천·성남·의왕에 걸친 산으로, 관악산과 과천을 사이에 두고 마주 보는 이웃 산이에요.','가장 높은 봉우리는 망경대이고, 사람들이 많이 오르는 매봉까지는 길이 순해서 서울 사람들이 즐겨 찾아요.']},
 'lm-gwanggyo':{line:'수원을 지키는 산',body:['광교산은 수원과 용인에 걸친 산으로, 예부터 수원을 지키는 산(진산)으로 여겨 왔어요. 가장 높은 봉우리는 시루봉이에요.','고려 태조 왕건이 이 산에서 빛을 보았다는 이야기에서 "광교(光敎)"라는 이름이 나왔다고 전해요.']},
 'lm-namhan':{line:'남한산성이 있는 산',body:['남한산에는 조선 시대 산성인 남한산성이 있어요. 1636년 병자호란 때 인조가 이곳으로 피해 40여 일 동안 버틴 곳이에요.','남한산성은 2014년 유네스코 세계유산이 되었어요.']},
 'lm-suri':{line:'군포·안양·안산의 산',body:['수리산은 군포·안양·안산·시흥에 걸친 산으로, 가장 높은 봉우리는 태을봉이에요.','바위 능선이 이어지는 슬기봉·관모봉 등이 있고, 경기도립공원으로 지정되어 있어요.']},
 'lm-gyeyang':{line:'인천 내륙에서 가장 높은 산',body:['계양산은 인천 계양구에 있는 395m 산으로, 강화도 같은 섬을 빼면 인천에서 가장 높은 산이에요.','정상에서는 서해와 인천 시내, 김포공항 쪽이 한눈에 보여요. 맑은 날에만 이 거리에서 보여요.']},
 'lm-songdo':{line:'바다를 메워 세운 신도시',body:['송도국제도시는 인천 앞바다 갯벌을 메워 만든 땅 위에 세운 신도시예요. 2003년 인천경제자유구역으로 지정되었어요.','바닷가에 고층 빌딩이 모여 있고, 도시 한가운데 바닷물을 끌어들인 센트럴파크가 있어요. 이 거리에서는 방향만 알려 드려요.']},
 'lm-incheon-bridge':{line:'송도와 영종도를 잇는 긴 다리',body:['인천대교는 2009년에 개통한 다리로, 송도국제도시와 인천공항이 있는 영종도를 바다 위로 이어요. 길이가 약 21km로 개통 때 우리나라에서 가장 긴 다리였어요.','가운데 높은 탑 두 개에서 케이블을 늘어뜨려 다리를 붙잡는 사장교예요. 이 거리에서는 방향만 알려 드려요.']},
 'lm-airport':{line:'바다를 메워 지은 공항',body:['인천국제공항은 2001년에 문을 연 우리나라 대표 공항이에요. 영종도와 용유도 사이 갯벌을 메워 지었어요.','세계 공항 서비스 평가에서 여러 해 1위를 했던 곳이에요. 이 거리에서는 방향만 알려 드려요.']},
});
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

// ⑦ 자동걷기 즐길거리(2026-11-06 대표 승인, 기획-2026-11-06-자동걷기-즐길거리.md). 모두 게임 속 배치라 est(실제 위치 아님).
// m = GPX 수평거리(코스 시작부터, 위 STREAM_SPOTS와 같은 기준). side +1 = 오르는 방향 오른쪽(계곡 물줄기 반대쪽).
// anchor 'gate' = 일주문 기준 좌표(x 좌우, z 광장 쪽 +). search = 이 범위에서 가장 평평한 자리를 고른다(산스장 흙 원판 반지름 3.4m).
export const TRAIL_PROPS=Object.freeze([
 {id:'gym',kind:'gym',m:2392,side:1,search:{from:2320,to:2480,step:8,offsets:[6.2,7.2,8.4]},est:true,note:'계곡 쉼터(팔각정) 근처 평지 · 게임 속 배치'},
 {id:'bench-1540',kind:'bench',m:1540,side:1,est:true,note:'계곡 물가 쉼터'},
 {id:'bench-1710',kind:'bench',m:1710,side:1,search:{from:1690,to:1730,step:2},est:true,note:'계곡 물가 쉼터'},
 {id:'bench-2156',kind:'bench',m:2156,side:1,est:true,note:'계곡 물가 쉼터'},
 {id:'bench-kkal-before',kind:'bench',m:3640,sides:[1,-1],search:{from:3600,to:3666,step:3},est:true,note:'깔딱고개 나무계단 앞'},
 {id:'bench-kkal-after',kind:'bench',m:4425,sides:[1,-1],search:{from:4405,to:4530,step:3},est:true,note:'깔딱고개 계단을 다 오른 뒤(연주암 갈림길 근처 평지)'},
 // 빈 구간 벤치(2026-11-07, 산디자인 분포안 §3·산리서치 GPX 지점 근처). 모두 게임 속 배치
 {id:'bench-640',kind:'bench',m:640,side:1,search:{from:600,to:700,step:4},est:true,note:'평탄한 길가 쉼 자리 · 게임 속 배치'},
 {id:'bench-2600',kind:'bench',m:2600,sides:[1,-1],search:{from:2570,to:2640,step:3},est:true,note:'야영장 입구 · 게임 속 배치'},
 {id:'bench-3224',kind:'bench',m:3224,sides:[1,-1],search:{from:3190,to:3290,step:3},est:true,note:'오르막 숲 바위 쉼 자리 · 게임 속 배치'},
 // 4,106m(GPX '작은 공터', 고도가 앞뒤와 맞지 않음)는 나무계단 한가운데라 길 방향 경사가 1m에 0.33m다. 벤치 다리 높이 차가 0.4m(받침돌 0.38m)라
 // 2026-11-07 산풍경이 나무계단 중간 평탄참(3,870~3,885m, 다리 높이 차 0.1m)으로 옮겼다. 3,880→4,312m(깔딱고개 중간 벤치) 사이는 동물 구역 z09가 채운다.
 {id:'bench-3875',kind:'bench',m:3875,sides:[1,-1],search:{from:3862,to:3890,step:2,offsets:[0,2.4,3.2]},est:true,note:'깔딱고개 나무계단 중간 평탄참 · 게임 속 배치'},
 // 빈 구간 채우기 2차(2026-11-07 산풍경): 남은 400m 넘는 틈(호수공원 740→제1광장 1,070 앞, 계곡 1,710→2,156, 2,600→3,224, 3,224→3,640)에 하나씩.
 // 자리는 search 범위에서 평평하고 물줄기·다른 시설에서 떨어진 곳을 고르고, 실제 지형에서 숲·바위·계단과 겹침을 따로 쟀다(scripts/probe-trail-prop-sites.mjs).
 {id:'bench-880',kind:'bench',m:850,sides:[1,-1],search:{from:790,to:910,step:4},est:true,note:'나들이숲 테이블벤치(GPX 783m) 지나 길가 · 게임 속 배치'},
 {id:'bench-1863',kind:'bench',m:1863,side:1,search:{from:1830,to:1900,step:3},est:true,note:'계곡 평상(GPX 1,863m) 근처 물가 쉼터 · 게임 속 배치'},
 {id:'bench-2830',kind:'bench',m:2830,sides:[1,-1],search:{from:2795,to:2875,step:3},est:true,note:'나무다리(GPX 2,829m) 지나 숲길 쉼 자리 · 게임 속 배치'},
 {id:'bench-3440',kind:'bench',m:3440,sides:[1,-1],search:{from:3400,to:3490,step:3},est:true,note:'오르막 숲길 바위 쉼 자리 · 게임 속 배치'},
 {id:'airgun',kind:'airgun',anchor:'gate',local:[-5,9.8],localYaw:Math.PI/2,est:true,note:'일주문 안쪽 광장 왼편 · 실제 먼지털이기가 있는지 확인 전(산리서치)'},
]);
// ⑧ 동물 출현 구역(2026-11-07). 고정 자리(예전 CAT_SPOTS·interactionProps.spawns) 대신 구역 안 무작위 자리에 나타나 돌아다닌다.
// 구역 표는 산리서치 docs/동물출현-즐길거리분포-자료.md §1-2, 행동 수치는 산디자인 docs/동물배회-토끼-분포-디자인.md §2. 모두 게임 속 출현(est).
// from·to = GPX 수평거리(m, 위 TRAIL_PROPS m과 같은 기준). w = 종류별 출현 가중(높음 3·보통 2·낮음 1·없음 0).
// maxOffset = 길 가장자리에서 떨어질 수 있는 폭의 상한(계단처럼 숲이 좁은 곳). anchor 'gate' 구역은 일주문 기준 상자(box = [x0,x1,z0,z1]).
// 자리·종류는 src/animal-zones.js가 구역 id + 5분 시간 칸으로 정하는 결정적 난수로 뽑는다(같은 방 사람이 같은 동물을 본다, 서버 동기화 없음).
export const ANIMAL_ZONES=Object.freeze([
 {id:'z00-plaza',anchor:'gate',box:[-4.5,4.5,10,16],w:{magpie:3,cat:3},count:2,note:'입구 광장(예전 광장 고양이·까치 자리 둘레)'},
 {id:'z01-gate',from:0,to:250,w:{squirrel:1,magpie:3,cat:3},note:'일주문·폭포쉼터·육각정'},
 {id:'z02-park',from:250,to:900,w:{hare:2,squirrel:2,magpie:2,cat:1},note:'평탄한 길·나들이숲 풀밭 가장자리'},
 {id:'z03-lake',from:900,to:1350,w:{hare:1,squirrel:2,magpie:1,cat:2},note:'갈림길·호수공원·인공폭포'},
 {id:'z04-valley-low',from:1350,to:2100,w:{hare:1,squirrel:3},maxOffset:{hare:3},note:'계곡 평상·벤치·나무다리'},
 {id:'z05-valley-mid',from:2100,to:2550,w:{hare:1,squirrel:3,cat:2},note:'정자·팔각정 쉼터'},
 {id:'z06-camp',from:2550,to:2850,w:{hare:2,squirrel:2,magpie:1,cat:1},note:'야영장 입구 풀밭·정돈 숲'},
 {id:'z07-climb-forest',from:2850,to:3550,w:{hare:2,squirrel:3},note:'계곡 위 오르막 숲·조망터'},
 {id:'z08-stone',from:3550,to:4050,w:{hare:1,squirrel:3,magpie:1},note:'무명폭포·돌탑 공터'},
 {id:'z09-stairs',from:4050,to:4400,w:{hare:1,squirrel:2},maxOffset:{squirrel:5,hare:3},note:'깔딱고개 나무계단(양옆 숲이 좁음)'},
 {id:'z10-ridge',from:4400,to:4800,w:{hare:2,squirrel:2,magpie:3,cat:2},note:'연주암 갈림길 능선·매점 둘레'},
 {id:'z11-summit',from:4800,to:5200,w:{squirrel:1,magpie:2},note:'연주대 아래 바위(노출 바위라 토끼 없음)'},
]);
// 동물별 배회 방식(산디자인 §2 표의 제안 시작값). 거리 m·속도 m/s·시간 초. 확률은 '한 번 옮기고 멈춘 뒤' 뽑는다.
// offset = 길 가장자리에서 떨어진 폭(화면 확인 뒤 줄임: 시안 값 다람쥐 4~14·토끼 2~10·까치 0~8·고양이 2~6m는 풀·숲에 묻혀 거의 안 보였다), roam = 처음 나타난 자리에서 길 방향으로 돌아다니는 반경, cross = 등산로를 가로지를 확률.
export const ANIMAL_STYLE=Object.freeze({
 squirrel:{offset:[1.5,8],roam:8,speed:[2.8,3.6],step:[1.5,4],pause:[1.5,4],cross:.06,climb:.15,climbTime:2.5,hidden:[6,10],look:3},
 hare:{offset:[.8,5],roam:10,speed:[2.2,2.2],step:[2,5],hops:[4,7],hopTime:.35,graze:[4,9],look:[2,3],cross:.1,alert:8,flee:3,fleeSpeed:5,fleeTime:3.5,alertTime:1.2,gone:40,returnStill:20,returnTo:5},
 magpie:{offset:[0,6],roam:12,speed:[.9,.9],step:[2,5],pause:[2,5],cross:.05,fly:.25,flyCross:.2,flyStep:[6,15],flyTime:3,flyArc:[2,4]},
 cat:{offset:[1,5],roam:8,speed:[.5,.5],step:[3,8],pause:[8,25],cross:.04,crossPause:[0,3]},
});
// 시간대·계절 가중(est). 시간대: 새벽 5~8시 · 낮 8~17시(한낮 11~15시) · 해질녘 17~20시 · 밤 그 밖.
export const ANIMAL_TIME=Object.freeze({
 squirrel:{dawn:.6,day:1,noon:1,dusk:.6,night:.1},
 hare:{dawn:2,day:.4,noon:.4,dusk:2,night:.8},
 magpie:{dawn:.8,day:1,noon:1,dusk:.8,night:.1},
 cat:{dawn:1.5,day:1,noon:.5,dusk:1.5,night:1},
});
export const ANIMAL_SEASON=Object.freeze({squirrel:{spring:1,summer:1,autumn:1.4,winter:.1}});
// 즐길거리 규칙(단위: m·초). dropIn = 들르기 버튼을 띄우는 거리, offer = 버튼을 띄우는 시간, reoffer = 이만큼 멀어져야 다시 띄움.
export const TRAIL_RULES=Object.freeze({dropIn:6,offer:4,reoffer:12,benchSit:2,benchCat:.3,animalRadius:45,animalLeave:60,animalSlot:300,propLoad:260,propUnload:340,
 squirrelLook:3,squirrelHatAfter:5,magpieFlee:4,magpieRide:20,catPunch:3,walkSpeed:1.3,chocolates:5,chocoSeconds:30,chocoSpeed:1.2});
