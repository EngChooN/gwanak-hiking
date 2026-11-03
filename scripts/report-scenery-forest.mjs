import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const before=JSON.parse(readFileSync('artifacts/scenery-forest-before.json')),after=JSON.parse(readFileSync('artifacts/scenery-forest-after.json'));
assert.equal(after.length,6);assert.equal(before.length,6);
const labels={entrance:'입구',valley:'계곡 숲길',ridge:'능선',summit:'정상',third:'3인칭 보행','third-low':'3인칭 보행 · 낮음'};
for(const row of after){
 const old=before.find(x=>x.id===row.id);assert.equal(row.s,old.s);assert.equal(row.quality,old.quality);assert.equal(row.view,old.view);
 assert.equal(row.errors.length,0);assert.equal(row.rendering.shaderErrors.length,0);assert.equal(row.metrics.landscape.errors.length,0);
 assert.ok(row.ground.every((p,i)=>p.error<=Math.max(.3,old.ground[i].error+1e-6)),'기존 노면 진단보다 악화');
 assert.ok(row.metrics.footContact.every(p=>p.error<=.3));
 row.target=row.id==='third-low'?55:row.id==='third'?40:45;
 row.pass=row.performance.fps>=row.target;
}
const embed=p=>'data:image/jpeg;base64,'+readFileSync(p).toString('base64');
let pictures='';
for(const row of after.slice(0,4)){
 let imgs='';
 for(const label of ['before','after']){
  const stem=`artifacts/scenery-forest-${label}-${row.id}`;
  execFileSync('sips',['-s','format','jpeg','-s','formatOptions','65','-Z','720',stem+'.png','--out',stem+'-report.jpg'],{stdio:'ignore'});
  imgs+=`<figure><figcaption>${label==='before'?'수정 전':'최종'}</figcaption><img src="${embed(stem+'-report.jpg')}" alt="${labels[row.id]} ${label}"></figure>`;
 }
 pictures+=`<section><h2>${labels[row.id]}</h2><div class="pair">${imgs}</div></section>`;
}
const scenery=after.find(x=>x.id==='summit').metrics.landscape.scenery;
const rows=after.map(row=>`<tr><td>${labels[row.id]}</td><td>${before.find(x=>x.id===row.id).performance.fps.toFixed(2)}</td><td>${row.performance.fps.toFixed(2)}</td><td>${row.target}</td><td>${row.pass?'통과':'미달'}</td></tr>`).join('');
const tests=readFileSync('artifacts/scenery-forest-tests.log','utf8'),build=readFileSync('artifacts/scenery-forest-build.log','utf8');
assert.match(tests,/fail 0/);assert.match(build,/built in/);
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><title>관악산 숲·풀·암릉 전후 비교</title><style>body{font:16px/1.7 system-ui;color:#22352b;background:#eef2ed;margin:24px auto;max-width:1480px;padding:20px}h1{font-size:30px}section{background:white;padding:20px;margin:24px 0;border-radius:14px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}img{width:100%;border-radius:8px}figcaption{font-weight:700}table{border-collapse:collapse;width:100%;background:white}td,th{text-align:left;padding:10px;border-bottom:1px solid #cdd8ce}code{font-size:14px}@media(max-width:800px){.pair{grid-template-columns:1fr}}</style><h1>관악산 숲·입체 풀·암릉 보강</h1><p>산풍경 · 2026-11-03 · 이 Mac의 headless Chrome / 1440×900 / DPR 1. 높음 고정 4시점과 보행 3인칭, 낮음 보행 3인칭을 각각 준비 후 10초간 실제 렌더 프레임으로 측정했다. 최종 성능 목표 ${after.every(x=>x.pass)?'모두 통과':'일부 미달'}.</p><section><h2>구현과 한계</h2><p>등산로 30m 안 교목을 보충하고, 30~180m 사면은 기존 CC0 수관 사진판으로 채웠다. 추가 교목·사진판 ${scenery.trees.toLocaleString()}개, 추가 노두 ${scenery.outcrops}개. 기존 숲 134,888개와 별도다. 풀·고사리형 잎은 총 ${scenery.grassInstances.toLocaleString()} 인스턴스 중 카메라 주변만 그린다. 표시 반경은 낮음/균형/높음 20/30/40m, 밀도는 22/50/100%. GPU가 풀 끝을 바람에 흔든다. 기존 관목을 유지하며 하층을 보충했다.</p><p>흙·낙엽·풀·화강암 PBR 및 노멀맵을 유지하고 이끼 패치를 혼합했다. 능선·정상 노두는 길과 시설을 피한다. 경로·노면·등산객·보행·서울 파일은 수정하지 않았다.</p><p>임상도와 수종별 비율은 미확보. 활엽 60%/소나무 40%는 기존 임시 시각값이며, 스캔 모델을 한국 참나무류로 동정하지 않았다. 추가 바위의 위치·크기도 현장 실측이 아니다. 하늘·서울은 다른 담당 범위다. 실제 관악산을 아는 사람의 확인은 후속 검증으로 남는다.</p></section><h2>성능</h2><table><tr><th>조건</th><th>전 fps</th><th>후 fps</th><th>목표 fps</th><th>판정</th></tr>${rows}</table><p>고정 위치·시선·화질을 동일하게 맞췄다. 3인칭은 W 보행 중 측정했다. 장비·브라우저·부하가 달라지면 수치도 달라진다. 정상 암반 모델 교체 후에는 해당 암반의 180m 표시 범위 안에 있는 정상만 재측정했다. 다른 측정 지점은 이 범위 밖이다. 셰이더·페이지·자산 오류 0건, 발 접지 오차 0.3m 이내. 계곡의 노면 교차 진단은 최대 0.44m로 수정 전과 같으며 이번 숲 작업에서 수정하지 않았다. 테스트 ${tests.match(/tests (\d+)/)?.[1]}개·빌드 통과. 빌드에는 기존 큰 청크 안내가 있다.</p>${pictures}<section><h2>증거·이용조건</h2><p>원본 PNG: <code>artifacts/scenery-forest-{before,after}-{entrance,valley,ridge,summit}.png</code>. 수치: <code>scenery-forest-{before,after}.json</code>. 테스트·빌드 로그: <code>scenery-forest-{tests,build}.log</code>. 새 풀 형상·바람은 직접 작성했고 외부 자산 다운로드는 없다. 기존 Poly Haven CC0 tree_small_02, pine_tree_01, rock_face_02, rock_face_01를 재사용했다. <code>data/자료-출처-이용조건-기록표.md</code>에 출처를 추가했다. 참고 사진은 앱에 넣지 않았다. push·배포·삭제 없음.</p></section></html>`;
writeFileSync('artifacts/관악산-숲풀암릉-전후비교.html',html);
writeFileSync('artifacts/scenery-forest-validation.json',JSON.stringify({date:new Date().toISOString(),pass:after.every(x=>x.pass),runs:after.map(x=>({id:x.id,fps:x.performance.fps,target:x.target,pass:x.pass})),tests:Number(tests.match(/tests (\d+)/)?.[1]),shaderErrors:0},null,2));
console.log(after.map(x=>({id:x.id,fps:x.performance.fps,target:x.target,pass:x.pass})));
