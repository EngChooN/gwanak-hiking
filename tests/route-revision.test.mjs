import test from 'node:test';
import assert from 'node:assert/strict';
import {routeRevision} from '../src/route-revision.js';
import {initialState,restore} from '../src/movement.js';

test('지형·체크포인트·정상 고도 변경 시 저장 호환성을 갱신한다',()=>{
  const points=[{x:0,y:100,z:0,width:2},{x:10,y:110,z:5,width:2}];
  const cp=[{id:'plaza-1',s:5,reference:[37,127],verified:false,temporary:true}];
  const revision=routeRevision(points,cp,632);
  assert.equal(routeRevision(structuredClone(points),structuredClone(cp),632),revision);
  for(const key of ['x','y','z','width']){
    const changed=structuredClone(points);changed[1][key]+=1;
    assert.notEqual(routeRevision(changed,cp,632),revision);
  }
  assert.notEqual(routeRevision(points,[{...cp[0],s:6}],632),revision);
  assert.notEqual(routeRevision(points,[{...cp[0],verified:true,temporary:false}],632),revision);
  assert.notEqual(routeRevision(points,cp,629),revision);
});

test('같은 경로 ID라도 지형 버전이 다르거나 없는 저장값은 초기화한다',()=>{
  const saved={...initialState(),s:123,elapsed:50,checkpoints:['plaza-1']};
  assert.equal(restore(JSON.stringify(saved)).s,123);
  for(const revision of [undefined,'old-terrain']){
    assert.deepEqual(restore(JSON.stringify({...saved,routeRevision:revision})),initialState());
  }
  assert.deepEqual(restore(JSON.stringify({...saved,routeId:'old-route'})),initialState());
});
