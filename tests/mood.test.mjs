import test from 'node:test';
import assert from 'node:assert/strict';
import {moodBlend} from '../src/mood-grade.js';
import {composeEnvironment,sunPosition,moonPosition,resolveUtcMs,skyKeyframe} from '../src/daytime.js';
import {weatherLook} from '../src/weather.js';
import {REFERENCE_LOOKS,BLOOM,NIGHT,DAY_GRADE} from '../src/mood-config.js';
const at=(time,look)=>{const t=resolveUtcMs({time,nowMs:Date.UTC(2026,10,4,3,0)}).utcMs;return composeEnvironment({sun:sunPosition(t),moon:moonPosition(t),weather:look});};
test('낮은 노출·채도가 오르되(2차 개선: 화사하게, 노출 <1.25·채도 <1.35) 그늘은 푸르다',()=>{
 const m=moodBlend(34,0);assert.ok(m.exposure>1&&m.exposure<1.25&&m.saturation>1&&m.saturation<1.35);assert.ok(m.shadowTint[2]>m.shadowTint[0]);
});
test('노을은 금빛(따뜻한 하이라이트)과 더 높은 블룸이되 낮보다 채도는 낮다(3차 개선: 숲·도심이 주황으로 물들지 않게)',()=>{
 const g=moodBlend(4,0),d=moodBlend(34,0);assert.ok(g.warm[0]>g.warm[2]&&g.saturation<d.saturation&&g.saturation>1&&g.warm[0]<1.1&&g.bloom>d.bloom);
});
test('밤은 푸른 그늘, 블룸 최대',()=>{
 const n=moodBlend(-30,1);assert.ok(n.shadowTint[2]>n.shadowTint[0]&&n.bloom===BLOOM.strength.night);
});
test('고도에 따라 연속적으로 변한다',()=>{
 let prev=moodBlend(-20,1).bloom;for(let e=-10;e<=40;e+=5){const night=Math.max(0,Math.min(1,(-2-e)/10));const b=moodBlend(e,night).bloom;assert.ok(Math.abs(b-prev)<.2);prev=b;}
});
test('밤 푸른 달빛: 방향광이 푸른색이고 완전 깜깜하지 않다',()=>{
 const n=at('20:30');assert.ok(n.light.color[2]>n.light.color[0]);assert.ok(n.light.intensity>.1&&n.ambient>=NIGHT.ambientBase);
 assert.ok(skyKeyframe(-18).horizon[2]>.3,'밤 하늘도 푸른 남색');
});
test('낮 햇빛은 약간 따뜻하다',()=>{const k=skyKeyframe(34);assert.ok(k.sunColor[0]>k.sunColor[2]);assert.ok(k.sunColor[0]-k.sunColor[2]<.3);});
test('흐림은 칙칙한 회색이 아니라 하늘색 기운이 남는 확산광',()=>{
 const o=at('11:00',weatherLook({kind:'overcast'})),c=at('11:00',weatherLook({kind:'clear'}));
 assert.ok(o.exposureMul>1.15&&o.ambient>=c.ambient);assert.ok(o.horizon[2]>o.horizon[0],'약간 푸른 기운');
});
test('기준 화면 4종이 설정 한 곳에 있다',()=>{assert.deepEqual(REFERENCE_LOOKS.map(l=>l.id),['day','golden','night','overcast']);assert.ok(DAY_GRADE.exposure>1);});
