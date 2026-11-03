import test from 'node:test';
import assert from 'node:assert/strict';
import {BufferGeometry,Float32BufferAttribute} from 'three';
import {maskCoveredBaseGeometry} from '../src/terrain-base-mask.js';
test('준비된 세밀 지형 안의 상시 삼각형만 제거하고 청크 해제 때 복원한다',()=>{
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute([1,10,1,30,20,1,1,12,30,90,30,90],3));g.setIndex([0,2,1,1,2,3]);
 assert.equal(maskCoveredBaseGeometry(g,new Map([['0,0',true]])),1);assert.deepEqual([...g.index.array],[1,2,3]);
 assert.equal(maskCoveredBaseGeometry(g,new Map()),2);assert.deepEqual([...g.index.array],[0,2,1,1,2,3]);
});
