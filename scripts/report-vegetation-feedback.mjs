import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const before=JSON.parse(readFileSync('artifacts/scenery-forest-color-before.json')).find(x=>x.id==='ridge');
const after=JSON.parse(readFileSync('artifacts/scenery-forest-color-after.json')).find(x=>x.id==='ridge');
assert.equal(before.s,after.s);assert.equal(before.view,after.view);assert.equal(before.quality,after.quality);
assert.equal(after.errors.length,0);assert.equal(after.rendering.shaderErrors.length,0);assert.equal(after.metrics.landscape.errors.length,0);
const tests=readFileSync('artifacts/vegetation-feedback-tests.log','utf8');assert.match(tests,/fail 0/);
assert.match(readFileSync('artifacts/vegetation-feedback-build.log','utf8'),/built in/);
const figures=['before','after'].map(label=>{
 const stem=`artifacts/scenery-forest-color-${label}-ridge`;
 execFileSync('sips',['-s','format','jpeg','-s','formatOptions','80',stem+'.png','--out',stem+'-report.jpg'],{stdio:'ignore'});
 return `<figure><figcaption>${label==='before'?'수정 전':'수정 후'}</figcaption><img alt="능선 ${label==='before'?'수정 전':'수정 후'}" src="data:image/jpeg;base64,${readFileSync(stem+'-report.jpg').toString('base64')}"></figure>`;
}).join('');
writeFileSync('artifacts/능선-풀크기-수목색-수정비교.html',`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>능선 풀 크기·수목 색 수정</title><style>body{background:#edf0e9;color:#26352b;font:16px/1.75 system-ui;max-width:1440px;margin:24px auto;padding:20px}figure{margin:28px 0;background:white;padding:16px;border-radius:12px}img{width:100%;height:auto}figcaption{font-weight:bold}h1{font-size:28px}</style><h1>능선 풀 크기·수목 색 수정</h1><p>산풍경 · 2026-11-03</p><p>대표 의견: 풀이 지나치게 크고 나무 색이 모두 비슷하다.</p><ul><li>추가 입체 풀의 최대 높이를 약 1.25m에서 0.33m로 줄였다. 잎 폭과 수평 펼침은 기존의 55%로 줄이고 1.6배 높이 변형을 없앴다. 이전 길가 풀·관목도 최대 약 24cm·38cm로 낮추고 잎 폭을 줄였다. 낙엽은 유지했다.</li><li>기존 숲과 추가 숲 모두에 좌표 기반 개체별 색을 전달한다. 활엽수는 녹색·올리브·황록·황갈색, 소나무는 녹색 계열을 사용한다. 완만한 공간 변화를 섞고 모든 LOD에서 같은 개체 색을 사용한다. 총 개체 수·좌표·수종 비율은 보존했다.</li><li>추가 색상은 시각 보정값이다. 관악산의 실제 수종별 단풍 시기·색 분포를 확인한 결과는 아니다.</li></ul><p>1440×900·높음·1인칭·이동거리 ${after.s.toFixed(1)}m·일시정지로 동일 시점 비교. 준비 후 14초 대기, 10초 렌더 집계: 수정 전 ${before.performance.fps.toFixed(2)}fps → 수정 후 ${after.performance.fps.toFixed(2)}fps. 페이지·셰이더·자산 오류 0건. 테스트 ${tests.match(/tests (\d+)/)?.[1]}개 및 빌드 통과.</p>${figures}<p>원본: scenery-forest-color-{before,after}-ridge.png 및 동명 JSON. 이번 캡처는 능선 고정 시점만 측정했으며 다른 시점 성능을 대신하지 않는다.</p></html>`);
console.log(JSON.stringify({beforeFps:before.performance.fps,afterFps:after.performance.fps,errors:after.errors,shaderErrors:after.rendering.shaderErrors,assetErrors:after.metrics.landscape.errors,tests:tests.match(/tests (\d+)/)?.[1]}));
