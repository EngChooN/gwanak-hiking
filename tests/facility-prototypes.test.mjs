import test from 'node:test';
import assert from 'node:assert/strict';
import {FACILITY_KINDS,createFacilityPrototype,facilityContact} from '../src/facility-prototypes.js';

test('계단 접지면은 렌더링 상면과 일치하고 경계 밖은 비어 있다',()=>{
 const g=createFacilityPrototype('stairs',{count:3});const c=g.userData.contacts;
 assert.equal(facilityContact(c,0,0).y,.18);
 assert.equal(facilityContact(c,0,.3).y,.36);
 assert.equal(facilityContact(c,2,.3),null);
 assert.equal(facilityContact(c,0,.9),null);
 assert.equal(facilityContact(c,0,.5).material,'deck_stairs');
});
test('기본 검토 모델은 1600삼각형·5재질 이하이고 출처가 추정이다',()=>{
 for(const kind of FACILITY_KINDS)for(const simple of [false,true]){
  const g=createFacilityPrototype(kind,{simple});let triangles=0;
  g.traverse(o=>{if(o.isMesh){triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;assert.equal(o.castShadow,false);}});
  assert.ok(triangles<=1600,`${kind}: ${triangles}`);assert.ok(g.children.length<=5);
  assert.equal(g.userData.status,'추정');assert.equal(g.userData.coordinates,null);
 }
});
