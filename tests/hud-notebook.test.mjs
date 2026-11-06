import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SHEETS,timeOfDay,stampFor,stampView,contextView,checkpointTicks,formatRemainKm,qualityModeFromText} from '../src/hud-notebook.js';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');

test('해 높이로 낮·노을·밤을 고른다',()=>{
 assert.equal(timeOfDay(30),'day');assert.equal(timeOfDay(8),'day');assert.equal(timeOfDay(3),'dusk');assert.equal(timeOfDay(-4),'dusk');assert.equal(timeOfDay(-10),'night');assert.equal(timeOfDay(NaN),'day');
});
test('도장 우선순위: 기구 > 행동 > 앉음 > 상호작용 > 자동 걷기 > 걷기',()=>{
 const rows=[{key:'F',label:'안내판 읽기',sub:'관악산 안내도',state:'ready'}];
 assert.equal(stampView({rows,gadget:'phone',pose:'sit',auto:true}).mode,'hidden');
 assert.equal(stampView({rows,action:{step:'물 마시는 중…',progress:2},pose:'sit'}).mode,'busy');
 assert.equal(stampView({rows,action:{step:'x',progress:2}}).progress,1);
 assert.equal(stampView({rows,pose:'sit'}).mode,'stand-up');
 const it=stampView({rows,auto:true});assert.equal(it.mode,'interact');assert.equal(it.label,'읽기');assert.equal(it.key,'F');
 assert.equal(stampView({auto:true}).mode,'stop');assert.equal(stampView().mode,'walk');
});
test('상호작용 줄 → 도장 모양, 잠김은 남은 초',()=>{
 assert.deepEqual(stampFor({label:'스탬프 찍기 · 돌탑 공터'}),{ic:'㊞',label:'찍기',sub:'돌탑 공터',cls:''});
 assert.equal(stampFor({label:'안내판 읽기',state:'done'}).label,'다시 읽기');
 const lock=stampFor({label:'약수 마시기',state:'lock',reason:'12초 뒤 다시'});assert.equal(lock.label,'12초');assert.equal(lock.cls,'lock');
 assert.equal(stampFor({label:'알 수 없는 행동'}).ic,'☝');
});
test('상황 꼬리표: 읽기는 대상 이름이 제목, 나머지 줄은 choice-2·3',()=>{
 const v=contextView([{key:'F',label:'안내판 읽기',sub:'관악산 안내도'},{key:'2',label:'돌 올리기',sub:'s'},{key:'3',label:'사진',state:'lock',reason:'잠김'}]);
 assert.equal(v.head,'관악산 안내도');assert.equal(v.sub,'안내판');
 assert.deepEqual(v.alts.map(a=>[a.cmd,a.sub]),[['choice-2','s'],['choice-3','잠김']]);
 assert.equal(contextView([]),null);
});
test('진행 눈금·남은 거리·화질 글자',()=>{
 const t=checkpointTicks([{id:'a',s:0},{id:'b',s:150},{id:'c',s:9999}],100,100);
 assert.deepEqual(t.map(x=>x.at),[0,.5,1]);
 assert.equal(formatRemainKm(1234),'1.2 km');assert.equal(formatRemainKm(-5),'0.0 km');
 assert.equal(qualityModeFromText('화질 높음'),'high');assert.equal(qualityModeFromText('화질 자동 · 균형'),'auto');assert.equal(qualityModeFromText('균형'),'balanced');
 assert.deepEqual([...SHEETS],['backpack','rest','settings','jump']);
});
test('지킬 조건: 일시정지 없음·조이스틱·구간 이동은 설정 개발용·기능 버튼 id 유지',()=>{
 const html=read('index.html');
 assert.ok(!/id="pause|일시정지/.test(html),'일시정지 버튼 없음');
 for(const id of ['auto','run','binoculars','phone','sit','tea','view','headlamp','face-forward','stretch','map-toggle','stamps','sound-toggle','hud-hide','help-toggle','quality','joystick','look-zone','start-entrance','start-demo'])assert.match(html,new RegExp(`id="${id}"`),id);
 assert.match(html,/id="nb-sheet-settings"[^]*class="nb-dev-slot"/,'설정 탭에 개발용 칸');
 assert.match(read('src/section-jump.js'),/nb-dev-slot/);
 assert.match(html,/<path id="map-path"\/><path id="map-walked"\/>/,'지도: 남은 길 점선 위에 걸은 길');
 assert.match(read('src/main.js'),/'걷는 중':'서 있음'/,'멈춰 서 있으면 서 있음');
});
