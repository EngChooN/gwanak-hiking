import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {armWristTarget,armSide} from '../src/hiker-arms.js';
test('좌우 어깨와 손은 같은 쪽이며 서기 손목은 어깨 아래로 내려간다',()=>{
 for(const side of ['Left','Right']){
  const sign=armSide(side),shoulder=new Vector3(sign*.18,1.42,0),wrist=armWristTarget(shoulder,side);
  assert.ok(wrist.x*sign>.18);assert.ok(Math.abs(shoulder.y-wrist.y-.47)<1e-10);
  assert.ok(wrist.distanceTo(shoulder)<.50);
 }
});
test('걷기 손목은 반대 발의 앞뒤 이동을 따르고 달릴 때 진폭이 증가한다',()=>{
 for(const side of ['Left','Right'])for(const offset of [-.2,.2]){
  const shoulder=new Vector3(armSide(side)*.18,1.42,.02),hipZ=.05;
  const stand=armWristTarget(shoulder,side),walk=armWristTarget(shoulder,side,{moving:true,oppositeFootZ:hipZ+offset,hipZ});
  assert.equal(Math.sign(walk.z-stand.z),Math.sign(offset));assert.ok(walk.distanceTo(shoulder)<.5);
  const run=armWristTarget(shoulder,side,{moving:true,oppositeFootZ:hipZ+offset,hipZ,running:true});
  assert.ok(Math.abs(run.z-stand.z)>Math.abs(walk.z-stand.z));
 }
});
