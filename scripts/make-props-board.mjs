// 산스장·초콜릿·벤치·동물·먼지털이기 시안 보드(그림을 품은 HTML 한 파일). capture-props-concepts.mjs와 jpg 변환 다음에: node scripts/make-props-board.mjs
import {readFileSync,writeFileSync} from 'node:fs';
const dir='artifacts/props-concepts',img=n=>`data:image/jpeg;base64,${readFileSync(`${dir}/jpg/${n}.jpg`).toString('base64')}`;
const G=[
 {n:'①',name:'산스장',where:'계곡 쉼터 근처 평지 한 곳(게임 속 배치입니다. 관악산 실제 산스장 위치는 아직 확인하지 못했습니다)',
  shots:['gym','gym-lift','gym-hang'],
  what:'철봉·허리돌리기 돌림판·거꾸리·시멘트 역기·타이어를 둡니다. 페인트가 벗겨진 초록·노랑 철기구에 녹 얼룩이 있고, 타이어 위 라디오에서 뽕짝이 흘러나옵니다.',
  play:['<b>시멘트 역기</b>: "들어 올리기" 버튼을 연타하면 득근 게이지가 찹니다. 10번 채우면 수첩에 "산스장 득근" 도장을 찍습니다.','<b>거꾸리</b>: 3초 동안 거꾸로 매달립니다. 모자가 떨어졌다가 일어날 때 다시 씁니다.','<b>허리돌리기</b>: 빙글빙글 돌다가 내리면 2초 동안 비틀거리며 걷습니다.','<b>철봉</b>: 매달리기만 됩니다. 다리가 짧아서 발이 땅에 닿지 않고 버둥거립니다.'],
  lol:'팔이 짧아서 역기를 머리로 드는 모습, 거꾸리에서 "원래 머리가 몸 절반인데…"라는 말풍선, 라디오 뽕짝.'},
 {n:'②',name:'초콜릿',where:'배낭 옆주머니(소지품)',shots:['choco-item','choco'],
  what:'처음에 5개를 들고 출발합니다. HUD 수첩의 간식 칸에 🍫 남은 개수가 보입니다.',
  play:['"🍫 먹기" 버튼을 누르면 30초 동안 이동속도가 20% 오릅니다. 효과가 겹치지 않고, 남은 시간이 칩에 표시됩니다.','먹는 동안 뒤에 바람 줄이 생기고, 발밑에 흙먼지가 일어납니다. 입가에 초콜릿이 묻습니다.','다 먹으면 칩이 "🍫 0/5"가 됩니다. 더 얻는 방법(정상 매점 등)은 이번에는 넣지 않습니다.'],
  lol:'근처 다람쥐가 침을 흘리며 쳐다봅니다. 동물에게 주는 기능은 넣지 않습니다(실제 산에서 야생동물 먹이 주기 금지).'},
 {n:'③',name:'벤치',where:'계곡 평상·벤치 자리(자료 기준 1,540m·1,710m·2,156m)와 깔딱고개 전후 쉼터',shots:['bench'],
  what:'나무 판 의자와 초록 철다리 벤치입니다. 지금 있는 "앉기"는 길 위에 바로 앉습니다. 벤치 근처에서 앉으면 벤치에 앉습니다.',
  play:['배낭을 옆에 내려놓고 다리를 달랑달랑 흔듭니다.','앉아 있는 동안 스테미너가 땅에 앉을 때보다 빨리 찹니다.','가끔 고양이가 옆자리에 와서 앉습니다.'],
  lol:'앉으면 동동이 입에서 작은 영혼이 빠져나와 "후우…" 하고 쉬다가, 일어나면 쏙 돌아옵니다.'},
 {n:'④',name:'동물',where:'다람쥐: 숲길 바위·나무 밑동. 고양이: 입구 광장·쉼터·벤치. 까치: 나뭇가지와 하늘',shots:['animals','animals-pet'],
  what:'다람쥐, 치즈색 산고양이, 까치를 넣습니다. 까치는 머리 위를 날아다니고 가지에 앉습니다.',
  play:['<b>고양이</b>: "쓰다듬기"를 누르면 배를 보이며 골골거립니다(하트). 3초 뒤 냥펀치를 날리고 도망갑니다.','<b>다람쥐</b>: 가까이 가면 도토리를 들고 쳐다봅니다. 가만히 서 있으면 모자 위로 올라와 잠깐 앉아 있습니다.','<b>까치</b>: 가까이 가면 날아오릅니다. 가끔 배낭 위에 내려앉아 같이 갑니다.'],
  lol:'모자 위를 점령한 다람쥐("여기 내 자리"), "…무거워", 쓰다듬다가 맞는 냥펀치.'},
 {n:'⑤',name:'등산화 먼지털이기(에어건)',where:'입구 광장 일주문 옆(하산하면서 / 출발하면서 들르는 자리)',shots:['airgun'],
  what:'등산로 입구에 흔히 있는 에어건 먼지털이기입니다. 회색 철기둥에 파란 안내판을 붙이고, 노란 꼬불 호스와 발판 철망을 둡니다. 관악산공원 입구에 실제로 있는지는 아직 확인하지 못했습니다.',
  play:['"💨 신발 털기"를 누르면 흙먼지가 펑 터지고 신발이 반짝입니다.','등산 수첩의 "깨끗한 신발" 칸에 표시합니다.'],
  lol:'바람이 너무 세서 모자가 날아갑니다. "내 모자!!" 하고 2초 뒤 모자가 머리 위로 툭 떨어져 다시 씌워집니다.'},
 {n:'⑥',name:'무리해서 뛰면 — 헥헥·다리에 쥐',where:'어디서나(뛰기 버튼으로 스테미너를 0까지 쓰면)',shots:['pant','cramp'],
  what:'지금은 스테미너가 0이 되면 조용히 못 뛰게만 됩니다. 이 순간을 몸 개그로 보여 줍니다. 오르막에서 바닥까지 뛰면 가끔 종아리에 쥐가 납니다.',
  play:['<b>헥헥</b>: 스테미너가 0이 되면 1.5초 동안 멈춰 무릎을 짚고 헥헥거립니다. 입김이 퐁퐁 나오고 땀방울이 튑니다. 그 뒤로는 30까지 찰 때까지 터벅터벅 걷습니다.','<b>다리에 쥐</b>: 오르막에서 0이 되면 25% 확률로 쥐가 납니다. 넘어져 종아리를 잡고 3초 동안 뒹굴고, 모자가 떨어집니다. "🦶 발끝 당기기"를 누르면 1초 만에 풀립니다.','자동걷기는 뛰지 않으므로 생기지 않습니다. 쥐는 한 번 나면 2분 동안 다시 나지 않습니다.'],
  lol:'"헥… 헥… 다리가… 내 말을… 안 들어…", "으아아 쥐났다!! 종아리!!" 말풍선과 "찌릿" 번개.'},
];
const card=g=>`<section class="card"><h2>${g.n} ${g.name}</h2><p class="where">📍 ${g.where}</p>
<div class="shots s${g.shots.length}">${g.shots.map(s=>`<img src="${img(s)}" alt="${s}">`).join('')}</div>
<p>${g.what}</p><h3>상호작용</h3><ul>${g.play.map(p=>`<li>${p}</li>`).join('')}</ul><p class="lol"><b>웃음 포인트</b> ${g.lol}</p></section>`;
const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>자동걷기 심심함 보완 시안 — 산스장·초콜릿·벤치·동물·먼지털이기</title>
<style>body{margin:0;background:#efe6d2;color:#3a2d22;font-family:system-ui,'Apple SD Gothic Neo',sans-serif;line-height:1.55}
header{padding:22px 26px 6px}h1{margin:0;font-size:24px}header p{margin:6px 0 0;color:#6b5a48}
.card{margin:16px 20px;padding:16px 20px;border-radius:16px;background:#fbf4e4;border:2px solid #3a2d22;box-shadow:4px 4px 0 #3a2d22}
h2{margin:0 0 4px;font-size:21px}h3{margin:12px 0 4px;font-size:16px}.where{margin:0 0 10px;color:#6b5a48;font-size:14px}
.shots{display:grid;gap:8px}.shots.s1{grid-template-columns:1fr}.shots.s2{grid-template-columns:1fr 1fr}.shots.s3{grid-template-columns:1fr 1fr 1fr}
.shots img{width:100%;border-radius:10px;border:1.5px solid #3a2d22}ul{margin:0;padding-left:20px}.lol{margin:10px 0 0;padding:8px 12px;border-radius:10px;background:#ffe9a8}
.common{margin:16px 20px 30px;padding:14px 20px;border-radius:14px;background:#e3eef0;border:2px dashed #3a5a66}</style></head><body>
<header><h1>자동걷기 심심함 보완 — 시안 5종</h1><p>2026-11-06 산기획 · 게임과 같은 카툰 렌더러로 그린 시안입니다. 말풍선·버튼은 모습을 보여 주려고 얹은 것이며, 크기와 위치는 구현할 때 등산 수첩 HUD에 맞춥니다.</p></header>
${G.map(card).join('')}
<section class="common"><h3>공통 규칙(제안)</h3><ul>
<li><b>자동걷기 중에도 됩니다.</b> 오브젝트나 동물 근처를 지나면 화면 아래에 "🪑 앉았다 가기", "🐱 쓰다듬기" 같은 버튼이 4초 동안 뜹니다. 누르면 들렀다가 자동걷기를 이어 갑니다. 안 누르면 그냥 지나갑니다.</li>
<li>모든 동작은 HUD 버튼으로 됩니다(휴대폰 기준). 단축키만 있는 동작은 만들지 않습니다.</li>
<li>휴대폰 메모리를 지키려고 동물·기구는 가까운 청크에만 만듭니다(동물은 화면에 최대 3마리).</li>
<li>야생동물에게 먹이를 주는 동작은 넣지 않습니다.</li></ul></section>
</body></html>`;
writeFileSync(`${dir}/board.html`,html);console.log('ok',html.length);
