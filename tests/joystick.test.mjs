import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STICK,stickDirection,stickFollow,clampStickBase} from '../src/joystick.js';
const R=STICK.radius,at=(deg,r=.8)=>{const a=deg*Math.PI/180;return [Math.sin(a)*R*r,-Math.cos(a)*R*r];};
const dir=(deg,r,prev)=>{const d=stickDirection(...at(deg,r),prev);return d&&[d.forward,d.side];};
test('데드존 안은 정지, 한 번 움직이면 더 작은 값까지 유지',()=>{
 assert.equal(dir(0,.15),null);assert.deepEqual(dir(0,.25),[1,0]);
 assert.equal(dir(0,.17),null);assert.deepEqual(stickDirection(...at(0,.17),'1,0')&&[1,0],[1,0]);assert.equal(stickDirection(...at(0,.1),'1,0'),null);
});
test('직진 보정: 앞·뒤·옆 ±28° 안은 한 방향만',()=>{
 for(const a of [-27,-15,0,15,27])assert.deepEqual(dir(a),[1,0],`${a}°`);
 for(const a of [153,180,-153])assert.deepEqual(dir(a),[-1,0],`${a}°`);
 assert.deepEqual(dir(90),[0,1]);assert.deepEqual(dir(-90),[0,-1]);assert.deepEqual(dir(70),[0,1]);
});
test('사선은 8방향으로 정해진다',()=>{
 assert.deepEqual(dir(45),[1,1]);assert.deepEqual(dir(-45),[1,-1]);assert.deepEqual(dir(135),[-1,1]);assert.deepEqual(dir(-135),[-1,-1]);
});
test('경계에서는 지금 방향을 8° 더 붙잡는다(깜박임 방지)',()=>{
 assert.deepEqual(dir(32),[1,1]);assert.deepEqual(dir(32,.8,'1,0'),[1,0]);assert.deepEqual(dir(40,.8,'1,0'),[1,1]);
});
test('손가락이 반지름을 넘으면 기준점이 따라온다',()=>{
 const f=stickFollow(100,300,100,100);assert.equal(f.cy,100+R);assert.ok(Math.hypot(f.dx,f.dy)<=R+1e-9);
 const g=stickFollow(100,300,110,290);assert.equal(g.cx,100);assert.equal(g.cy,300);
});
test('기준점은 화면 안쪽으로 눌러 고정',()=>{
 const b=clampStickBase(5,5,390,844);assert.equal(b.x,R+STICK.margin);assert.equal(b.y,R+STICK.margin);
});
test('입력 연결: 왼쪽 절반 터치는 조이스틱, 마우스·기구 사용 중은 둘러보기',()=>{
 const src=readFileSync(new URL('../src/input.js',import.meta.url),'utf8');
 assert.match(src,/e\.pointerType==='mouse'\|\|e\.clientX>=window\.innerWidth\/2\|\|mode\(\)!=='none'/);
 const html=readFileSync(new URL('../hiking/index.html',import.meta.url),'utf8');
 for(const id of ['binoculars','phone','view','headlamp','face-forward','stamps','stretch','map-toggle','sound-toggle','hud-hide','help-toggle','auto','sit','tea','run'])assert.ok(html.includes(`id="${id}"`),id);
});
