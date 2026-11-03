import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion} from 'three';
import {legTargets,pelvisDrop,poleRotation} from '../src/hiker-ik.js';

test('경사·계단·바위 목표와 모든 몸 방향에서 무릎은 전방으로 굽는다',()=>{
 for(const heading of [0,.7,Math.PI,4.8]){
  const forward=new Vector3(-Math.sin(heading),0,-Math.cos(heading));
  for(const height of [-.9,-.65,-.3,.1])for(const step of [-.3,0,.35]){
   const hip=new Vector3(12,4,-8),target=hip.clone().addScaledVector(forward,step);target.y+=height;
   const {knee,foot}=legTargets(hip,target,.43,.41,forward);
   assert.ok(Math.abs(knee.distanceTo(hip)-.43)<1e-8);
   assert.ok(Math.abs(knee.distanceTo(foot)-.41)<1e-8);
   const axis=foot.clone().sub(hip).normalize();
   const bend=knee.clone().sub(hip);bend.addScaledVector(axis,-bend.dot(axis));
   assert.ok(bend.dot(forward)>=-1e-8);
  }
 }
});

test('영거리·과도한 목표·전방과 평행한 목표에도 유한한 두 관절 해',()=>{
 const hip=new Vector3(),forward=new Vector3(0,0,-1);
 for(const target of [new Vector3(),new Vector3(0,-100,0),new Vector3(0,0,-2)]){
  const {knee,foot}=legTargets(hip,target,.43,.41,forward);
  assert.ok([...knee,...foot].every(Number.isFinite));
  assert.ok(foot.distanceTo(hip)<.84);
  assert.ok(Math.abs(knee.distanceTo(foot)-.41)<1e-8);
 }
});

test('골반 보정은 수평 거리까지 고려하고 높은 발 목표를 더 멀어지게 하지 않는다',()=>{
 const hip=new Vector3(0,1,0),target=new Vector3(.4,0,0),reach=.8;
 const drop=pelvisDrop(hip,target,reach);
 assert.ok(Math.abs(hip.clone().add(new Vector3(0,-drop,0)).distanceTo(target)-reach)<1e-8);
 assert.equal(pelvisDrop(hip,new Vector3(0,2,0),reach),0);
 assert.equal(pelvisDrop(hip,new Vector3(2,0,0),reach),0);
});

test('회전한 루트·경사로에서도 실제 스틱 팁은 월드 지면 목표와 일치한다',()=>{
 for(const heading of [0,.7,Math.PI,4.8])for(const slope of [-.3,0,.4]){
  const parent=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),heading);
  const grip=new Vector3(12,4,-8),tip=new Vector3(12.3,3+slope,-8.2);
  const q=poleRotation(parent,grip,tip);
  const measured=new Vector3(0,-grip.distanceTo(tip),0).applyQuaternion(q).applyQuaternion(parent).add(grip);
  assert.ok(measured.distanceTo(tip)<1e-10);
 }
});
