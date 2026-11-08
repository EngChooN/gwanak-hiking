// 메타버스 통합(2026-11-08): 다중 페이지 구성과 옛 등산 주소 넘기기.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {legacyHikingTarget,HIKING_PARAMS} from '../src/hub/legacy-redirect.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('옛 주소 ?multi=&server=는 쿼리 그대로 /hiking/로 간다',()=>{
 assert.equal(legacyHikingTarget('?multi=방&server=wss%3A%2F%2Fa.example','', '/'),'/hiking/?multi=방&server=wss%3A%2F%2Fa.example');
 assert.equal(legacyHikingTarget('?start=summit&time=12:00','#x','/gwanak-hiking/'),'/gwanak-hiking/hiking/?start=summit&time=12:00#x');
 assert.equal(legacyHikingTarget('?dev','', '/gwanak-hiking'),'/gwanak-hiking/hiking/?dev');
});
test('기획 지정 등산 옵션 8개는 모두 넘긴다',()=>{
 for(const k of ['multi','server','start','season','time','weather','pick','dev']){
  assert.ok(HIKING_PARAMS.includes(k));assert.ok(legacyHikingTarget(`?${k}=1`,'','/'),k);
 }
});
test('쿼리가 없거나 등산과 상관없는 쿼리면 허브를 보여 준다',()=>{
 assert.equal(legacyHikingTarget('','','/'),null);
 assert.equal(legacyHikingTarget('?utm_source=x','','/'),null);
});
test('세 페이지가 있고 각자 자기 진입 스크립트를 쓴다',()=>{
 assert.match(read('index.html'),/src="\/src\/hub\/main\.js"/);
 assert.match(read('index.html'),/href="\.\/hiking\/"/);assert.match(read('index.html'),/href="\.\/smoking\/"/);
 assert.match(read('hiking/index.html'),/src="\/src\/main\.js"/);
 assert.match(read('smoking/index.html'),/src="\/src\/lounge\/main\.js"/);
});
test('vite 빌드 입력에 세 페이지가 모두 있다',async()=>{
 const {PAGES}=await import('../vite.config.js');
 assert.deepEqual(Object.values(PAGES).sort(),['hiking/index.html','index.html','smoking/index.html']);
 for(const p of Object.values(PAGES))assert.ok(existsSync(new URL('../'+p,import.meta.url)),p);
});
test('흡연장은 등산과 같은 에셋 경로(BASE_URL 기준 assets/toon)로 동동이 뼈대를 받는다',()=>{
 assert.match(read('src/lounge/main.js'),/\$\{import\.meta\.env\.BASE_URL\}assets\/toon\/models\/hiker\/HikerRig\.glb/);
 assert.ok(existsSync(new URL('../assets/toon/models/hiker/HikerRig.glb',import.meta.url)));
});
