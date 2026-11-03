import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,Frustum,Matrix4,PerspectiveCamera,Vector3} from 'three';
import {createChunkCuller} from '../src/chunk-culling.js';

test('부모 평면 마스크를 물려받아도 자식 절두체 판정이 Three.js와 같다',()=>{
 const camera=new PerspectiveCamera(65,1.6,.1,300),culler=createChunkCuller();
 let checked=0,skippedPlanes=0;
 for(const yaw of [0,.4,1.3]){
  camera.rotation.y=yaw;culler.update(camera);
  const reference=new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  for(let x=-100;x<=100;x+=20)for(let z=-160;z<=40;z+=20){
   const parent=new Box3(new Vector3(x,-10,z),new Vector3(x+20,10,z+20)),mask=culler.planeMask(parent);
   assert.equal(mask>=0,reference.intersectsBox(parent));
   for(let dx=0;dx<20;dx+=5)for(let dz=0;dz<20;dz+=5){
    const child=new Box3(new Vector3(x+dx,-2,z+dz),new Vector3(x+dx+4,2,z+dz+4));
    const visible=mask>=0&&culler.visible(child,camera,Infinity,mask);
    assert.equal(visible,reference.intersectsBox(child));checked++;
    if(mask>=0&&mask!==63)skippedPlanes++;
   }
  }
 }
 assert.ok(checked>5000);assert.ok(skippedPlanes>0);
});

test('평면 마스크가 0이어도 거리 제한과 빈 상자는 제외한다',()=>{
 const camera=new PerspectiveCamera(),culler=createChunkCuller();culler.update(camera);
 const box=new Box3(new Vector3(-1,-1,-20),new Vector3(1,1,-18));
 assert.equal(culler.visible(box,camera,5,0),false);
 assert.equal(culler.visible(new Box3(),camera,Infinity,0),false);
 assert.equal(culler.planeMask(new Box3()),-1);
});
