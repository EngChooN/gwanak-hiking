import test from 'node:test';
import assert from 'node:assert/strict';
import {movementHeading,headingDelta,followHeading} from '../src/hiker-facing.js';
import {initialState,advance,positionAt} from '../src/movement.js';
const flat={height:()=>0,canMove:()=>true};
test('앞·뒤·좌·우·네 대각선 실제 이동을 몸의 -Z 전방과 일치시킨다',()=>{
 for(const forward of [-1,0,1])for(const side of [-1,0,1]){
  if(!forward&&!side)continue;
  const s=initialState(),a=positionAt(s.s,s.lateral,flat);advance(s,{forward,side},.1,()=>{},flat);const b=positionAt(s.s,s.lateral,flat);
  const h=movementHeading(a,b,0),d=Math.hypot(b[0]-a[0],b[2]-a[2]);
  assert.ok(Math.abs(-Math.sin(h)-(b[0]-a[0])/d)<1e-8);
  assert.ok(Math.abs(-Math.cos(h)-(b[2]-a[2])/d)<1e-8);
 }
});
test('0.2초 안에 98% 회전·30/60/120Hz 동일·최단각·반전 연속',()=>{
 for(const hz of [30,60,120]){
  let h=0;for(let n=0;n<hz*.2;n++){const prev=h;h=followHeading(h,Math.PI,1/hz);assert.ok(h>=prev&&h<Math.PI);}
  assert.ok(Math.abs(headingDelta(h,Math.PI))<Math.PI*.02);
 }
 const h=followHeading(Math.PI-.02,-Math.PI+.02,.016);assert.ok(h>Math.PI-.02&&h<Math.PI+.02);
 assert.equal(followHeading(1,2,0),1);assert.equal(movementHeading([0,0,0],[0,3,0],1.7),1.7);
});
test('충돌 시 방향 입력을 무시하고 실제 정지 방향을 유지한다',()=>{
 const s=initialState();s.lateral=4;const a=positionAt(s.s,s.lateral,flat);
 assert.equal(advance(s,{side:1},.1,()=>{},{...flat,canMove:()=>false}),0);
 assert.equal(movementHeading(a,positionAt(s.s,s.lateral,flat),.7),.7);
});
