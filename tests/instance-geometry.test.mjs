import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {instanceGeometry} from '../assets/realistic/instance-geometry.js';

test('정수 압축 식생 좌표를 실수로 복원해 행렬 변환 시 철망 형태를 방지한다', () => {
  const source = new THREE.BufferGeometry();
  source.setAttribute('position', new THREE.BufferAttribute(new Int16Array([16384,32767,-16384]),3,true));
  source.setAttribute('normal', new THREE.BufferAttribute(new Int8Array([0,127,0]),3,true));
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(2,5,3),new THREE.Quaternion(),new THREE.Vector3(12,12,12));
  const expected = new THREE.Vector3().fromBufferAttribute(source.attributes.position,0).applyMatrix4(matrix);
  const converted = instanceGeometry(source,matrix);
  assert.ok(converted.attributes.position.array instanceof Float32Array);
  assert.ok(new THREE.Vector3().fromBufferAttribute(converted.attributes.position,0).distanceTo(expected)<1e-5);
  assert.equal(source.attributes.position.getY(0),1);
  assert.ok(Math.abs(converted.attributes.normal.getY(0)-1)<1e-6);
});
