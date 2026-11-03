// 입구 광장 최종 검증 HTML 생성(이미지는 축소 JPEG로 내장). 사용: node scripts/report-entrance-verification.mjs
import {chromium} from '@playwright/test';import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const A='artifacts/loading-lighting/after/',P='artifacts/plaza-fix/';
const ready=JSON.parse(readFileSync(A+'loading-ready.json','utf8')),states=JSON.parse(readFileSync(A+'loading-states.json','utf8')),all=JSON.parse(readFileSync(A+'results.json','utf8'));
const fps=Object.fromEntries(all.map(r=>[r.id,r.fps?.toFixed(1)]));
const shots=[
 ['load-progress',A+'loading-progress.png'],['load-ready',A+'loading-mobile-ready.png'],['load-mobile',A+'loading-mobile-progress.png'],['load-error',A+'loading-error.png'],['load-done',A+'loading-done-0s.png'],
 ['first',A+'entrance-first.png'],['third',A+'entrance-third.png'],['clear',A+'clear-15.png'],['overcast',A+'overcast-15.png'],['rain',A+'rain-15.png'],['dusk',A+'sunset-1710.png'],['night',A+'sunset-18.png'],
 ['b-plaza',P+'before/plaza-third.png'],['m-plaza',P+'after/plaza-third.png'],['a-plaza',A+'overcast-1614.png'],['b-close',P+'before/plaza-stand-close.png'],['m-close',P+'after/plaza-stand-close.png'],['b-0s',P+'before/plaza-third-0s.png'],
].filter(([,f])=>existsSync(f));
const b=await chromium.launch({channel:'chrome',headless:true});const pg=await b.newPage();const img={};
for(const [k,f] of shots)img[k]=await pg.evaluate(async url=>{const i=new Image();i.src=url;await i.decode();const w=Math.min(960,i.width),c=document.createElement('canvas');c.width=w;c.height=Math.round(i.height*w/i.width);c.getContext('2d').drawImage(i,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.8);},'data:image/png;base64,'+readFileSync(f).toString('base64'));
await b.close();
const fig=(k,t)=>`<figure><img src="${img[k]}" alt="${t}"><figcaption>${t}</figcaption></figure>`;
const pair=(a,m,z,t)=>`<div class="trio">${fig(a,'이전: '+t[0])}${fig(m,'산풍경 수정 후: '+t[1])}${fig(z,'이번 보정 후: '+t[2])}</div>`;
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>입구 광장 검증 — 로딩 화면·조명 보정</title><style>
body{margin:0;background:#0f1e1a;color:#eef0e6;font:15px/1.6 -apple-system,'Apple SD Gothic Neo',sans-serif}main{max-width:1180px;margin:0 auto;padding:28px 20px 60px}h1{font-size:26px;margin:0 0 4px}h2{margin:36px 0 10px;font-size:20px;border-bottom:1px solid #ffffff2a;padding-bottom:6px}h3{font-size:15px;color:#e9c46a;margin:20px 0 6px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px}.trio{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}figure{margin:0;background:#16302a;border-radius:10px;overflow:hidden}img{display:block;width:100%;height:auto}figcaption{padding:7px 10px;font-size:12.5px;color:#cfd8c9}
table{border-collapse:collapse;width:100%;font-size:14px}td,th{border:1px solid #ffffff22;padding:6px 10px;text-align:left}th{background:#16302a}.ok{color:#8fd48a}.warn{color:#f4d67c}.est{color:#9fb0a0}.m{max-width:260px}code{background:#ffffff14;padding:1px 5px;border-radius:4px}
</style><main><h1>입구 앞 광장 최종 검증</h1><p class="est">2026-11-03 · 이 맥 headless Chrome 1440×900(모바일 항목은 390×844) · 실측은 <b>실측</b>, 설계 값은 <b>추정</b>으로 구분했습니다.</p>
<h2>1. 로딩 화면</h2><div class="grid">${fig('load-progress','진행 중 53% — “숲·바위 준비 중” (실제 이벤트 값)')}${fig('load-ready','준비 완료 + ‘출발하기’ 버튼 (모바일 390×844, 수동 시작)')}${fig('load-mobile','모바일 진행 중 (가로 넘침 없음)')}${fig('load-error','30초 동안 진행 신호가 없을 때: 안내 문구 + 다시 시도')}${fig('load-done','걷힌 직후 첫 화면 (1인칭, 걸은 시간 00:00)')}</div>
<table><tr><th>항목</th><th>값</th><th>구분</th></tr>
<tr><td>로딩에 걸린 시간</td><td>${(ready.loadMs/1000).toFixed(1)}초 (7회 캡처 34.0~35.5초)</td><td>실측</td></tr>
<tr><td>진행률 단조 증가·가짜 막대 없음</td><td>${ready.monotonic?'통과':'실패'} — 지형→숲·바위→시설→등산객→날씨·환경→첫 프레임 안정, 마지막에 100%</td><td>실측</td></tr>
<tr><td>걷힌 직후 덜 그려진 곳</td><td>반경 ${ready.readiness.radius}m 지형 표본 ${ready.readiness.terrainSamples}개 중 누락 ${ready.readiness.terrainMissing.length}개, 가까운 숲 ${ready.readiness.nearLod?'준비됨':'미준비'}, 광장 시설 ${ready.readiness.facilities?'준비됨':'미준비'}, 등산객 ${ready.readiness.hikers?'준비됨':'미준비'}, 안정 프레임 ${ready.readiness.stableFrames}연속(시간 초과 ${ready.readiness.stableTimeout?'예':'아니오'})</td><td>실측(앱 준비 조건). 화면 판정은 위 캡처를 눈으로 본 것</td></tr>
<tr><td>걷힌 직후 걸은 시간·위치</td><td>${ready.elapsed}초, zone=${ready.readiness.zone}</td><td>실측</td></tr>
<tr><td>콘솔 오류</td><td>${ready.errors.length}건 (이전 404 1건은 favicon, 산개발이 해소)</td><td>실측</td></tr>
<tr><td>수동 시작: 버튼 누르기 전</td><td>started=${states.startedBeforeClick}, 걸은 시간 ${states.elapsedBeforeClick}초 → 탭 후 started=${states.afterClick.started}, 화면 ${states.afterClick.fading==='removed'?'제거':'페이드(.leaving)'} → 제거 ${states.removed}</td><td>실측(모바일 터치)</td></tr>
<tr><td>30초 정체</td><td>마지막 진행 신호 후 30초: “${states.failure.message}” + [${states.failure.button}]. 에러 신호(<code>stage:'error'</code>)는 즉시 같은 버튼과 실패 문구</td><td>실측(자산 요청 차단으로 재현)</td></tr></table>
<h2>2. <code>?start=entrance</code> 첫 화면</h2><div class="grid">${fig('first','1인칭')}${fig('third','3인칭')}</div>
<p>왼쪽 위 카드는 일주문(화면 가운데 위)과 겹치지 않고, ‘출발 전 · 광장’ 안내는 아래 가운데에 둬 문을 가리지 않습니다. 첫 화면에 일주문과 현판 전체가 보입니다.</p>
<h2>3. 시각·날씨 (3인칭, 출발 광장)</h2><div class="grid">${fig('clear','15시 맑음 (이전과 같은 값 — 노출 1.575 동일)')}${fig('overcast','15시 흐림')}${fig('rain','15시 비')}${fig('dusk','17:10 노을 (해 고도 낮음)')}${fig('night','18시 — 11월은 일몰 후 박명이라 어둡다')}</div>
<h2>4. 대표 캡처 문제 1~5 전후 (16:14 흐림, 3인칭)</h2>
${pair('b-plaza','m-plaza','a-plaza',['푸르스름·어두움','바닥 무늬 추가, 아직 남색','중성 회색, 밝아짐'])}
<table><tr><th>#</th><th>문제</th><th>결과</th></tr>
<tr><td>1</td><td>광장 바닥이 푸르스름한 판</td><td class="ok">산풍경: 블록 무늬·줄눈. 이번: 바닥 평균 RGB (46,56,68)→(77,73,68), 채도 0.32→0.11, 파랑−빨강 +22→−8. 그늘 쪽 (24,48,67)→(59,60,62)</td></tr>
<tr><td>2</td><td>바닥 위 어두운 지형 조각</td><td class="ok">산풍경이 포장·평탄화를 문에서 42m로 확대. 이번 화면에서 떠 있는 조각 없음(눈으로 확인)</td></tr>
<tr><td>3</td><td>숲이 뭉개진 덤불·차갑고 어두움</td><td class="ok">가까운 나무 9그루 추가(산풍경) + 조명 보정으로 밝기 상승(숲 평균 밝기 57→69). 숲 잎 채도는 여전히 높은 편 — 후속 제안</td></tr>
<tr><td>4</td><td>다리·스틱 벌어짐</td><td class="ok">산풍경이 발 간격 40→23cm. 아래 비교(이전/수정 후)</td></tr>
<tr><td>5</td><td>빈 화면·로딩 표시 없음·404</td><td class="ok">1번 항목의 로딩 화면, favicon 404 해소(콘솔 오류 0건)</td></tr></table>
<div class="trio">${fig('b-close','문제 4 이전')}${fig('m-close','문제 4 수정 후')}</div>
<h2>5. fps (이 맥 headless Chrome 1440×900, 균형 화질, 서 있기 6초 평균)</h2>
<table><tr><th>시점</th><th>fps</th><th>기준</th><th>판정</th></tr>
<tr><td>1인칭 (광장, 맑음)</td><td>${fps['entrance-first']}</td><td>45 이상</td><td class="ok">통과</td></tr><tr><td>3인칭 (광장, 맑음)</td><td>${fps['entrance-third']}</td><td>40 이상</td><td class="ok">통과</td></tr>
<tr><td>3인칭 흐림 15시</td><td>${fps['overcast-15']}</td><td>40 이상</td><td class="ok">통과</td></tr><tr><td>3인칭 비 15시</td><td>${fps['rain-15']}</td><td>40 이상</td><td class="ok">통과</td></tr><tr><td>3인칭 18시</td><td>${fps['sunset-18']}</td><td>40 이상</td><td class="ok">통과</td></tr></table>
<p class="est">headless Chrome은 60Hz 상한이라 60은 “상한에 닿음”입니다. “산 안 4시점” fps는 이번 변경(조명 계수·DOM 화면)이 렌더 부하를 늘리지 않아 재측정하지 않았으며, 산개발의 이전 측정(59.8~60)을 그대로 인용합니다 — 추정입니다. 걷는 중 fps는 이번에 재지 않았습니다.</p>
<h2>6. 확인하지 못한 것</h2><ul><li>실제 모바일 기기(저사양)에서의 로딩 시간·화면.</li><li>실제 흐린 날 관악산 사진과의 색 대조 — 이번 보정은 “중성 회색에 가깝게”라는 지시를 수치(채도·파랑−빨강)로 맞춘 것이며 사진 비교는 없습니다.</li><li>숲 잎 채도(재질)는 손대지 않았습니다.</li><li>로딩 약 35초는 그대로입니다(화면으로 기다림을 덜었을 뿐 단축은 아님).</li></ul></main></html>`;
writeFileSync('artifacts/입구광장-검증.html',html);console.log('written',Math.round(html.length/1024)+'KB');
