// 허브 첫 화면: 카드 목록·링크·가벼움.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EXPERIENCES,experienceHref} from '../src/hub/experiences.js';
import {cardHTML,hubTime,ART} from '../src/hub/hub.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('카드는 등산·흡연장 2개, id가 겹치지 않는다',()=>{
 assert.deepEqual(EXPERIENCES.map(e=>e.id),['hiking','smoking']);
 assert.equal(new Set(EXPERIENCES.map(e=>e.id)).size,EXPERIENCES.length);
 for(const e of EXPERIENCES){assert.ok(e.title&&e.place&&e.desc);assert.ok(ART[e.art],e.id);}
});
test('링크는 BASE_PATH 기준 /hiking/·/smoking/',()=>{
 const [h,s]=EXPERIENCES;
 assert.equal(experienceHref(h,'/'),'/hiking/');assert.equal(experienceHref(s,'/'),'/smoking/');
 assert.equal(experienceHref(h,'/gwanak-hiking/'),'/gwanak-hiking/hiking/');
 assert.equal(experienceHref(s,'/gwanak-hiking'),'/gwanak-hiking/smoking/');
});
test('카드 HTML에 링크·제목이 있고 기록은 있을 때만 도장이 붙는다',()=>{
 const [h]=EXPERIENCES;
 const plain=cardHTML(h,'/',null);
 assert.match(plain,/href="\/hiking\/"/);assert.match(plain,/온라인 등산/);assert.doesNotMatch(plain,/hub-stamp/);
 const store={getItem:()=>JSON.stringify({gwanak:{first:'2026-11-06',count:2,bestSec:7000,last:'2026-11-07'}})};
 assert.match(cardHTML(h,'/',store),/hub-stamp">완등 2회/);
});
test('시간대는 해 높이로 낮·노을·밤',()=>{
 assert.equal(hubTime(30),'day');assert.equal(hubTime(3),'dusk');assert.equal(hubTime(-10),'night');assert.equal(hubTime(NaN),'day');
});
test('허브는 three.js를 불러오지 않는다',()=>{
 for(const f of ['src/hub/hub.js','src/hub/experiences.js','src/hub/main.js','src/summit-records.js','src/daytime.js','src/mood-config.js'])
  assert.doesNotMatch(read(f),/from\s+['"]three|import\(['"]three/,f);
});
test('버튼(들어가기)은 44px 이상',()=>{
 assert.match(read('src/hub/hub.css'),/\.hub-go\{[^}]*min-height:44px/);
});
