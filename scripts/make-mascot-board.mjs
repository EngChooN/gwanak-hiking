// 귀여운 캐릭터 시안 보드(그림을 품은 HTML 한 파일). capture-mascot-concepts.mjs 다음에: node scripts/make-mascot-board.mjs
import {readFileSync,writeFileSync} from 'node:fs';
const dir='artifacts/mascot-concepts',img=n=>`data:image/jpeg;base64,${readFileSync(`${dir}/jpg/${n}.jpg`).toString('base64')}`;
const C=[
 {n:'1',name:'꼬마 등산객 「동동이」',size:'키 1.0m · 2.1등신',mood:'동물의 숲처럼 포근한 꼬마 등산객',
  body:'머리가 몸의 절반입니다. 목이 없고 손은 벙어리장갑처럼 둥급니다. 짧은 다리로 통통 걷습니다.',
  why:'지금 등산객의 차림(주황 바람막이·청록 배낭·등산화)을 그대로 귀엽게 줄였습니다. 벙거지·빨간 목도리·돗자리를 얹은 큰 배낭으로 "주말 관악산 등산객"이 바로 읽힙니다.',
  walk:'한 걸음에 한 번씩 통통 튀고, 배낭과 모자가 조금 늦게 따라 흔들립니다.',
  pal:['#f08a3c','#2fa39a','#3b4a7a','#c9b07a','#d9473e'],
  plus:'사람이라 쌍안경·휴대폰·앉기·차 마시기를 지금 뼈대 그대로 옮길 수 있습니다. 옷 갈아입히기도 이어 갈 수 있어 바꾸는 비용이 가장 적습니다.',minus:'흔한 치비 사람이라 개성은 가장 약합니다.'},
 {n:'2',name:'콩알 대원 「콩이」',size:'키 1.45m(모자 포함) · 머리=몸',mood:'PEAK·폴가이즈식 젤리빈 탐험대',
  body:'머리와 몸이 한 덩어리인 콩알입니다. 팔다리는 국수처럼 가늘고 길며, 눈은 작은 점눈입니다.',
  why:'레인저 모자, 빨간 네커치프, 크로스백을 단 스카우트 대원입니다. 여럿이 함께 오르는 멀티에서 색만 바꾸면 각자를 구별할 수 있고, 우스꽝스러운 동작이 잘 어울립니다.',
  walk:'몸을 좌우로 ±8° 뒤뚱이고, 내디딜 때마다 몸이 찌그러집니다. 국수 팔은 한 박자 늦게 흐느적거립니다.',
  pal:['#ffe2c2','#ffcf4a','#4f6d3a','#e5484d','#8a5a3b'],
  plus:'요즘 협동 게임에서 가장 잘 먹히는 형태입니다. 만들기도 단순해서 동작을 과장하기 좋습니다.',minus:'관악산다움은 모자·소품에만 기댑니다. 1인 감성 산책에는 조금 가볍게 느껴질 수 있습니다.'},
 {n:'3',name:'해태 꼬마 「해치」',size:'키 0.9m · 2등신, 가로로 넓은 몸',mood:'관악산 전설에서 나온 마스코트',
  body:'얼굴이 가로로 넓고 몸은 통통합니다. 팔다리는 짧고 굵으며, 단청 주홍색 곱슬 갈기를 둘렀습니다.',
  why:'조선 때 관악산의 화기(火氣)를 막으려고 광화문에 해태를 세웠다는 이야기를 바탕으로 했습니다. 이마에는 금빛 외뿔이 있고, 목에는 청록 목걸이와 금방울을 달았습니다. 몸 옆에는 물결무늬를 넣었습니다.',
  walk:'크게 뒤뚱이며 걷습니다. 방울이 진자처럼 흔들리고 구름 모양 꼬리가 살랑입니다.',
  pal:['#f3e3c3','#e0533a','#f2b33d','#2f8f83','#fff4e2'],
  plus:'이야기가 있는 관악산만의 캐릭터라 굿즈·로딩 화면·안내원으로 넓혀 쓰기 좋습니다.',minus:'네 발 짐승을 두 발로 세운 형태라 쌍안경·휴대폰을 쥐는 손을 새로 설계해야 합니다.'},
 {n:'4',name:'다람쥐 산꾼 「도토리」',size:'키 0.65m(꼬리 포함) · 가장 작음',mood:'A Short Hike처럼 작고 날쌘 동물 등산객',
  body:'머리가 크고 볼이 볼록합니다. 몸에는 등줄무늬가 있고, 키만 한 S자 꼬리를 달았습니다.',
  why:'관악산 등산로에서 자주 만나는 다람쥐입니다. 도토리 배낭을 메고, 잎이 달린 나뭇가지 지팡이와 파란 두건을 둘렀습니다.',
  walk:'두 발을 모아 깡총깡총 뛰고, 꼬리가 뒤따라 출렁입니다. 서 있으면 귀를 쫑긋하고 고개를 갸웃합니다.',
  pal:['#c9773a','#f6e3c4','#5a3a22','#a8692f','#3c8dbc'],
  plus:'가장 작아서 1인칭과 3인칭을 오갈 때 풍경이 거대하게 느껴집니다. 숲·바위 크기감이 극적으로 살아납니다.',minus:'눈높이가 0.5m라 카메라 높이와 길 막힘(풀·바위) 판정을 다시 맞춰야 합니다.'},
 {n:'5',name:'바위 돌돌이 「바우」',size:'키 1.65m · 가장 크고 묵직함',mood:'토토로·코다마처럼 느긋한 산의 정령',
  body:'몸 하나가 곧 얼굴입니다. 커다란 몸 아래쪽에 작은 점눈과 ω 입이 있고, 팔다리는 몽당 돌기입니다.',
  why:'따뜻한 황토빛 관악산 화강암에 이끼 모자를 씌웠습니다. 머리에는 소나무 싹과 진달래 한 송이가 자랍니다. 등에는 몸에 비해 너무 작은 주황 배낭을 멨습니다.',
  walk:'느릿느릿 쿵쿵 걷습니다. 디딜 때 몸이 눌리고, 머리 위 소나무 싹이 젤리처럼 흔들립니다.',
  pal:['#d9c7a8','#6fa04a','#4f7a52','#ef7fb0','#f08a3c'],
  plus:'"산 자체가 걸어간다"는 느낌으로 가장 독특합니다. 느린 동작이 힐링 분위기와 맞습니다.',minus:'색이 지형 바위와 가까워 멀리서는 묻힐 수 있습니다(디자인 자문 의견). 그래서 일반 회색 바위보다 따뜻한 색으로 띄웠습니다.'},
 {n:'+',name:'덤: 레이더 로봇 「돔돌이」',size:'키 1.25m',mood:'정상 기상레이더 돔을 머리에 쓴 꼬마 로봇',
  body:'지오데식 돔 머리 앞에 화면 얼굴이 있고, 몸은 매끈한 흰색에 주황 띠를 둘렀습니다.',
  why:'관악산 정상에만 있는 기상레이더 돔을 캐릭터로 만들었습니다. 바람개비 안테나가 돌아가 날씨 시스템과 엮기 좋습니다.',
  walk:'통통 걸으며 안테나가 빙글빙글 돕니다. 눈은 화면 속 빛으로 깜빡입니다.',
  pal:['#f4f4ef','#ff7a3d','#1d2a44','#8ff0ff','#b9bec6'],
  plus:'다른 시안이 모두 말랑한데 혼자 단단한 재질이라 확실히 다릅니다. 밤 장면에서 눈이 빛납니다.',minus:'자연 속 등산 분위기와는 거리가 있어 동행 캐릭터(펫)로 더 어울립니다.'},
];
const card=(c,i)=>`<section class="card"><header><span class="no">${c.n}</span><div><h2>${c.name}</h2><p class="meta">${c.size} · ${c.mood}</p></div>
<div class="pal">${c.pal.map(h=>`<i style="background:${h}" title="${h}"></i>`).join('')}</div></header>
<div class="shots">${['three','front','side-walk','back'].map((v,k)=>`<figure><img src="${img(`c${i}-${v}`)}"><figcaption>${['3/4','정면','걷는 옆모습','뒷모습'][k]}</figcaption></figure>`).join('')}</div>
<dl><dt>체형</dt><dd>${c.body}</dd><dt>관악산다움</dt><dd>${c.why}</dd><dt>걷기</dt><dd>${c.walk}</dd><dt class="good">좋은 점</dt><dd>${c.plus}</dd><dt class="bad">걸리는 점</dt><dd>${c.minus}</dd></dl></section>`;
const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>관악산 귀여운 캐릭터 시안</title>
<style>body{margin:0;background:#eef3ef;color:#1f2a2c;font:15px/1.6 system-ui,'Apple SD Gothic Neo',sans-serif}main{max-width:1180px;margin:0 auto;padding:28px 20px 60px}
h1{margin:0 0 4px;font-size:26px}.lead{margin:0 0 18px;color:#4a5a5c}.hero{width:100%;border-radius:14px;display:block;box-shadow:0 4px 18px rgba(0,0,0,.12)}.cap{font-size:13px;color:#5a6a6c;margin:6px 0 26px}
.card{background:#fff;border-radius:16px;padding:18px 20px;margin:0 0 22px;box-shadow:0 2px 10px rgba(0,0,0,.06)}header{display:flex;gap:14px;align-items:center}
.no{flex:none;width:42px;height:42px;border-radius:50%;background:#2f8f83;color:#fff;font:700 20px/42px system-ui;text-align:center}h2{margin:0;font-size:20px}.meta{margin:0;color:#5a6a6c;font-size:14px}
.pal{margin-left:auto;display:flex;gap:4px}.pal i{width:22px;height:22px;border-radius:6px;border:1px solid rgba(0,0,0,.15)}
.shots{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0}figure{margin:0}figure img{width:100%;border-radius:10px;display:block}figcaption{text-align:center;font-size:12px;color:#6a7a7c}
dl{display:grid;grid-template-columns:96px 1fr;gap:4px 12px;margin:0}dt{font-weight:700;color:#2f6f66}dt.good{color:#2f7a3a}dt.bad{color:#b4502e}dd{margin:0}
.note{background:#fff8e6;border-radius:12px;padding:14px 18px;font-size:14px}@media(max-width:760px){.shots{grid-template-columns:repeat(2,1fr)}dl{grid-template-columns:1fr}}</style></head>
<body><main><h1>관악산 귀여운 캐릭터 시안 5종 + 덤 1종</h1>
<p class="lead">게임 카툰 모드와 같은 화면 처리(툰 3단 음영·외곽선·색보정)로 직접 만든 3D 시안입니다. 크기, 체형, 느낌을 모두 다르게 했습니다. 맨 왼쪽은 지금 등산객(1.7m)으로, 크기 비교용입니다.</p>
<img class="hero" src="${img('lineup')}"><p class="cap">왼쪽부터 지금 등산객 1.7m · ① 동동이 1.0m · ② 콩이 1.45m · ③ 해치 0.9m · ④ 도토리 0.65m · ⑤ 바우 1.65m · 덤 돔돌이 1.25m</p>
${C.map(card).join('')}
<div class="note"><b>참고한 흐름</b>: PEAK(2025, 협동 등산)의 단순한 몸과 흐느적대는 동작, A Short Hike의 작은 동물 등산객, 동물의 숲의 2등신 비율을 참고했습니다. 공통 규칙은 디자인 자문을 받아 정했습니다. 눈은 얼굴 높이의 35~50%에 크게 두고, 목은 없애고, 입은 눈 간격보다 작게, 볼터치를 넣고, 얼굴 부품에는 외곽선을 긋지 않습니다.<br>
<b>지금 단계</b>: 모양과 분위기를 고르기 위한 시안이라 뼈대 없이 부위를 돌려 걷습니다. 한 안을 고르시면 지금 등산객처럼 뼈대에 입혀 걷기·뛰기·앉기·쌍안경·휴대폰을 모두 잇겠습니다.</div>
</main></body></html>`;
writeFileSync(`${dir}/board.html`,html);console.log('board',(html.length/1e6).toFixed(2),'MB');
