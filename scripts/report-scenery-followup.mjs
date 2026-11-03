import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const read=p=>JSON.parse(readFileSync(p)),before=read('artifacts/scenery-final-after.json'),after=read('artifacts/scenery-final-review.json');
assert.equal(after.length,8);
for(const row of after){
 const old=before.find(x=>x.id===row.id);assert.equal(row.s,old.s);assert.equal(row.bearing,old.bearing);assert.equal(row.view,old.view);
 assert.equal(row.errors.length,0);assert.equal(row.rendering.shaderErrors.length,0);
 if(['entrance','valley','ridge','summit'].includes(row.id))assert.ok(row.fps>=45,row.id+' 45fps');
 if(row.id==='third')assert.ok(row.fps>=40,'3인칭 40fps');
}
assert.match(readFileSync('artifacts/scenery-followup-tests.log','utf8'),/fail 0/);
assert.match(readFileSync('artifacts/scenery-followup-build.log','utf8'),/built in/);
function image(label,id){const stem=`artifacts/scenery-final-${label}-${id}`;
 execFileSync('sips',['-s','format','jpeg','-s','formatOptions','62','-Z','1080',stem+'.png','--out',stem+'-report.jpg'],{stdio:'ignore'});
 return 'data:image/jpeg;base64,'+readFileSync(stem+'-report.jpg').toString('base64');
}
const panels=after.map(row=>`<section><h2>${row.name} · ${row.fps.toFixed(2)}fps</h2><div class="pair"><figure><figcaption>수정 전</figcaption><img src="${image('after',row.id)}"></figure><figure><figcaption>수정 후</figcaption><img src="${image('review',row.id)}"></figure></div></section>`).join('');
const table=after.map(r=>`<tr><td>${r.name}</td><td>${r.fps.toFixed(2)}</td><td>${r.errors.length+r.rendering.shaderErrors.length}</td></tr>`).join('');
writeFileSync('artifacts/경치-후속수정-7시점-비교.html',`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>경치 후속 수정 · 7시점과 3인칭</title><style>body{font:16px/1.7 system-ui;background:#e9e8df;color:#28352c;max-width:1440px;margin:auto;padding:24px}section{background:white;border-radius:12px;padding:20px;margin:24px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}figure{margin:0}img{width:100%}td,th{text-align:left;padding:8px 24px 8px 0;border-bottom:1px solid #ddd}@media(max-width:800px){.pair{grid-template-columns:1fr}}</style><h1>경치 후속 수정 · 7시점과 3인칭</h1><p>산풍경 · 2026-11-03</p><section><h2>수정 내용</h2><ul><li>정상 북측 85m 내 장식 바위는 크기를 18%로 낮췄다. DSM 지형은 유지했다.</li><li>흰 구체는 기상레이더 관측소 레이돔이다. 북쪽 전망을 비우도록 정상 기준 서쪽 18m·남쪽 52m로 옮겼다. 현장 좌표가 아닌 검수용 추정 배치이며 연주대 응진전과 별도 시설이다.</li><li>풀은 황록·갈색의 저채도 색으로 조정했다. 숲 바닥에 기존 낙엽 PBR과 이끼 패치를 더했다.</li><li>포장길은 기존 돌 PBR의 골재·노멀, 미세 색 변화와 양쪽 낙엽 퇴적·불규칙 경계를 적용했다.</li></ul><p>시설 정체 확인: <a href="https://radar.kma.go.kr/book.pdf">기상청 기상레이더센터 안내</a>. 외부 사진이나 새 자산은 사용하지 않았다. 실제 시설 좌표·치수와 11월 현장 색은 실측 전이다.</p></section><section><h2>검증</h2><p>이 Mac의 headless Chrome · 1440×900, DPR 1 · 높음 고정 · 준비 후 9초 안정화, 10초 프레임 집계. 3인칭은 걷기 시작 2초 뒤 집계했다. 전후 동일 경로 거리·방위·시점이며 3인칭은 동일 입력 시나리오다.</p><table><tr><th>시점</th><th>fps</th><th>페이지·셰이더 오류</th></tr>${table}</table><p>높음 4시점 45fps 이상, 3인칭 40fps 이상. npm test 123/123·npm run build 통과. 빌드의 기존 청크 크기 경고는 남아 있다. 등산객·걷기 소스 수정과 push·배포·삭제 없음.</p></section>${panels}</html>`);
writeFileSync('artifacts/scenery-followup-validation.json',JSON.stringify({date:new Date().toISOString(),tests:{pass:123,fail:0},build:true,runs:after.map(r=>({id:r.id,fps:r.fps,errors:r.errors,shaderErrors:r.rendering.shaderErrors})),baseline:'scenery-final-after',final:'scenery-final-review'},null,2));
console.log(after.map(r=>({id:r.id,fps:r.fps}))); 
