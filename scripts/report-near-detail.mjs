import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from '../assets/realistic/tools/node_modules/sharp/lib/index.js';
const audit=JSON.parse(readFileSync('artifacts/landscape-verification.json'));
const before=JSON.parse(readFileSync('artifacts/landscape-defect-before/verification.json'));
assert.equal(audit.revision,'landscape-defect-fix-v1','결함 수정 최종 캡처 필요');
assert.equal(audit.status,'통과');assert.equal(audit.captures.length,5);
let latest=0;
for(const [path,hash] of Object.entries(audit.inputHashes)){
 assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),hash,`캡처 후 변경: ${path}`);
 latest=Math.max(latest,statSync(path).mtimeMs);
}
for(const file of ['artifacts/landscape-tests.log','artifacts/landscape-build.log'])assert.ok(statSync(file).mtimeMs>latest,`최신 코드 검증 로그 필요: ${file}`);
const tests=readFileSync('artifacts/landscape-tests.log','utf8');
assert.match(tests,/fail\s+0/);const passed=Number(tests.match(/pass\s+(\d+)/)?.[1]);assert.ok(passed>=31);
assert.match(readFileSync('artifacts/landscape-build.log','utf8'),/정적 배포 복사 완료/);
const picture=async path=>'data:image/jpeg;base64,'+(await sharp(path).resize({width:1050}).jpeg({quality:78}).toBuffer()).toString('base64');
let sections='';
for(const b of audit.captures){
 const a=before.captures.find(c=>c.id===b.id);
 assert.ok(Math.abs(a.snapshot.s-b.snapshot.s)<.1,'전후 위치 오차 10cm 초과');assert.equal(a.bearing,b.bearing);assert.equal(a.snapshot.view,b.snapshot.view);
 sections+=`<section><h2>${b.label}</h2><p>위치 ${b.snapshot.s.toFixed(3)}m · 전후 위치 오차 ${Math.abs(a.snapshot.s-b.snapshot.s).toFixed(3)}m · ${b.metrics.fps.toFixed(2)}fps</p><div class="pair"><figure><figcaption>수정 전 · 기존 결함 캡처</figcaption><img src="${await picture(`artifacts/landscape-defect-before/landscape-${b.id}.png`)}"></figure><figure><figcaption>수정 후 · 최신 코드</figcaption><img src="${await picture(`artifacts/landscape-${b.id}.png`)}"></figure></div></section>`;
}
const rows=audit.captures.map(c=>{const a=before.captures.find(a=>a.id===c.id);return `<tr><td>${c.label}</td><td>${a.metrics.fps.toFixed(2)}</td><td>${c.metrics.fps.toFixed(2)}</td><td>${(c.metrics.fps-a.metrics.fps).toFixed(2)}</td><td>${c.metrics.quality}</td><td>${c.metrics.drawCalls}</td><td>${c.metrics.triangles.toLocaleString()}</td></tr>`;}).join('');
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>관악산 풍경 화면 결함 보완</title><style>body{max-width:1500px;margin:36px auto;padding:0 24px;background:#eef1e9;color:#17372d;font:16px/1.7 system-ui}section{padding:24px;background:white;border-radius:14px;margin:24px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}img{width:100%}td,th{padding:8px;text-align:left}table{width:100%;border-collapse:collapse}td{border-top:1px solid #ddd}@media(max-width:800px){.pair{grid-template-columns:1fr}}</style><h1>관악산 풍경 화면 결함 보완 · 전후 비교</h1><p>산풍경 · ${new Date().toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} · 로컬 검증</p><section><h2>원인과 수정</h2><p>상자·철망: KHR_mesh_quantization의 정규화 정수 position/normal에 세계 변환을 직접 적용해 정수 범위를 넘겼다. Float32로 복원한 뒤 변환한다. 재현 회귀 테스트를 추가했다.</p><p>검은 나무: 소나무 twig JPG의 검은 여백에 원본 alphaMode가 없었다. 잎 카드에만 명암 기반 컷아웃을 적용하고, 어두운 PBR 조명이 영구히 구워지던 unlit 사진판은 diffuse 색으로 재생성했다. 가지·잎의 검은 여백을 제거하고, 바늘잎 축소 시 검은 매트로 합쳐지지 않도록 잎에만 선형 RGB 하한 (.08, .16, .04)을 적용했다. 이는 현장 색 측정값이 아닌 시각 보정이다.</p><p>회색 사면: 고도만으로 암반이 넓게 덮이던 가중치를 공간 패턴·경사와 조합해 노두·흙·풀·낙엽 모자이크로 변경했다. 버리던 soil 가중치와 실제 PBR 색을 복구했다. 새 텍스처나 삼각형·인스턴스는 추가하지 않았다. 식생 입체 모델의 사진판 전환을 일반 나무 12m·관목/보완 식생 10m, 저밀도 사진판 전환을 최대 60m로 앞당겨 알파 오버드로 비용을 제한했다. 거리 판정은 기존 청크 중심 기준이다. 일반 식생 가시 범위는 1,400m에서 950m로 줄였다.</p><h2>검증과 성능</h2><p>테스트 ${passed}개·빌드·5시점 자동검사 통과. 셰이더·브라우저 오류 0, 지면/발 접지 자동검사 통과. 최종 5장 전체를 육안 검토했으며 깨진 상자·검은 식생 덩어리는 보이지 않았다.</p><table><tr><th>시점</th><th>이전 fps</th><th>현재 fps</th><th>차이</th><th>품질</th><th>draw calls</th><th>삼각형</th></tr>${rows}</table><p>${audit.environment} 로딩 후 20초 안정화, 앱의 이동 평균 fps. 기존 수치는 21:07까지 촬영된 이전 실행이다. 최종 측정에서 정상 북·동은 기존보다 약 3.73fps, 3인칭은 약 5.90fps 낮다. 30fps 자동 기준은 모두 통과했지만 요청한 fps 완전 유지는 충족했다고 주장하지 않는다. 이전 실행은 개발 서버, 이번 최종 실행은 고정된 로컬 빌드이며 시스템 부하·동시 등산객 변경을 통제한 엄밀한 성능 비교는 아니다. 4개 정지 시점과 보행 3인칭을 함께 제시한다.</p></section>${sections}<section><h2>범위와 한계</h2><p>등산객·보행 코드는 이번 수정 대상에서 제외했다. 산디자인의 동시 접지 작업 때문에 사람 표현은 전후가 다를 수 있다. push·배포·삭제 없음. 기존 CC0 자산을 재사용했으며 현장 암종·수종·실제 개체 위치는 미검증이다. 모바일 실기기 fps를 보장하는 측정은 아니다.</p><p>수정 전 화면 5장과 JSON은 artifacts/landscape-defect-before/에 보존했다. 최신 수치는 landscape-verification.json, 테스트·빌드는 landscape-tests.log·landscape-build.log로 확인할 수 있다.</p></section></html>`;
assert.ok(Buffer.byteLength(html)<5e6);writeFileSync('artifacts/관악산-실사화면-전후비교.html',html);
console.log('전후 비교 보고서 생성 완료',passed,'tests',audit.captures.map(c=>[c.id,c.metrics.fps]));
