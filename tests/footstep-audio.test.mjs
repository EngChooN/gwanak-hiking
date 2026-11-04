import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FootstepSelector,SOUND_BANKS,footstepMaterial} from '../src/footstep-audio.js';
import {route,sample,MATERIALS,STAIR_CADENCE} from '../src/route.js';
import {initialState,advance} from '../src/movement.js';
const rng=()=>{let s=4501;return()=>((s=Math.imul(s,1664525)+1013904223>>>0)/2**32);};
test('돌 6·통나무 7: 112단×1000회 직전 두 변형 제외·사용률 균형',()=>{
 for(const material of ['stairs','deck_stairs']){const selector=new FootstepSelector(rng()),counts=Array(SOUND_BANKS[material].length).fill(0),recent=[];
 for(let step=1;step<=112000;step++){const r=selector.next(material,step);assert.ok(!recent.includes(r.file));recent.push(r.file);if(recent.length>2)recent.shift();counts[r.variant-1]++;}
 for(const count of counts)assert.ok(Math.abs(count/112000-1/counts.length)<=.05);assert.ok(counts.every(c=>c>0));
 }
});
test('모든 재질 대응·즉시 변경·피치/음량 범위·좌우 팬 교대',()=>{
 assert.deepEqual(Object.keys(SOUND_BANKS).sort(),[...new Set(Object.keys(MATERIALS).map(footstepMaterial))].sort());const s=new FootstepSelector(rng());let prev=null;
 for(let step=1;step<=2000;step++){const material=Object.keys(SOUND_BANKS)[Math.floor((step-1)/17)%6],r=s.next(material,step);assert.ok(SOUND_BANKS[material].includes(r.file));assert.ok(r.rate>=.96&&r.rate<=1.04);assert.ok(r.variationDb>=-1.5&&r.variationDb<=1.5);assert.equal(r.pan,step%2?-.08:.08);assert.notEqual(r.file,prev);prev=r.file;}
});
test('앱 음원 35개는 design 원본과 바이트가 동일하며 계단은 정확히 13개',()=>{
 const files=Object.values(SOUND_BANKS).flat();assert.equal(files.length,35);assert.equal(SOUND_BANKS.stairs.length+SOUND_BANKS.deck_stairs.length,13);
 for(const file of files)assert.deepEqual(readFileSync(new URL('../public/sounds/'+file,import.meta.url)),readFileSync(new URL('../design/sounds/'+file,import.meta.url)));
});
test('실제 계단 걸음 이벤트: 단마다 한 번·1/1.44초·정지하면 발생하지 않음',()=>{
 const s=initialState(),seg=route.segments.find(p=>p.material==='stairs'&&p.length>10),events=[];s.s=seg.start+.1;
 // 17초 끝 경계의 24번째 걸음이 부동소수 누적으로 빠지지 않도록 17.1초를 걷는다.
 for(let i=0;i<171;i++)advance(s,{forward:1},.1,e=>events.push(e));assert.equal(events.length,24);assert.ok(events.every(e=>e.material==='stairs'));
 for(let i=1;i<events.length;i++)assert.ok(Math.abs(events[i].elapsed-events[i-1].elapsed-1/(STAIR_CADENCE*1.2))<1e-8);
 for(let i=0;i<20;i++)advance(s,{},.1,e=>events.push(e));assert.equal(events.length,24);
});
test('재질 경계에 닿은 걸음은 이전 프레임 재질이 아닌 접지 위치 재질',()=>{
 const boundary=route.segments.findIndex((s,i)=>i>0&&s.material!==route.segments[i-1].material);const next=route.segments[boundary],s=initialState(),events=[];s.s=next.start-.001;s.stepPhase=.99;
 advance(s,{forward:1},.1,e=>events.push(e));assert.equal(events.length,1);assert.ok(events[0].s>=next.start);assert.equal(events[0].material,sample(events[0].s).material);assert.equal(events[0].material,next.material);
});
