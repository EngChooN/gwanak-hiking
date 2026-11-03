import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene,Group,Mesh,BoxGeometry,MeshBasicMaterial,PerspectiveCamera,LOD} from 'three';
import {freezeStatic,natureLodDistance,applyNatureQuality} from '../src/static-scene.js';

test('정적 배치의 월드 좌표를 유지하고 반복 행렬 합성을 막는다',()=>{
 const scene=new Scene(),root=new Group(),mesh=new Mesh(new BoxGeometry(),new MeshBasicMaterial());
 scene.add(root);root.position.set(100,20,30);mesh.position.set(2,3,4);root.add(mesh);
 freezeStatic(root);const expected=mesh.matrixWorld.clone();
 assert.equal(expected.elements[12],102);assert.equal(expected.elements[13],23);
 let local=0,world=0,visits=0;mesh.updateMatrix=()=>{local++;};mesh.matrixWorld.multiplyMatrices=()=>{world++;};
 const update=mesh.updateMatrixWorld;mesh.updateMatrixWorld=function(force){visits++;return update.call(this,force);};
 for(let i=0;i<5;i++)scene.updateMatrixWorld(true);
 assert.equal(local,0);assert.equal(world,0);assert.equal(visits,0);assert.deepEqual(mesh.matrixWorld.elements,expected.elements);
 mesh.geometry.dispose();mesh.material.dispose();
});
test('재배치 후 다시 고정하면 변경된 부모 좌표를 반영한다',()=>{
 const root=new Group(),child=new Group();root.add(child);child.position.x=3;freezeStatic(root);
 root.position.x=10;freezeStatic(root);assert.equal(child.matrixWorld.elements[12],13);
});
test('화질을 낮추면 LOD가 일찍 바뀌고 사진판 계약 거리는 유지한다',()=>{
 for(const kind of ['tree','rock','understory'])for(const index of [1,2]){
  const info={kind,index};const high=natureLodDistance(240,info,2),balanced=natureLodDistance(240,info,1),low=natureLodDistance(240,info,0);
  assert.ok(low<balanced&&balanced<high);
 }
 assert.equal(natureLodDistance(120,{representation:'crossboard',index:3},0),120);
 assert.equal(natureLodDistance(400,{representation:'impostor',index:4},1),400);
 const lod=new LOD();for(let i=0;i<3;i++){
  const holder=new Group(),mesh=new Mesh(new BoxGeometry(),new MeshBasicMaterial());mesh.castShadow=true;holder.add(mesh);
  holder.userData.lodSource={distance:[0,90,240][i],kind:'rock'};lod.addLevel(holder,[0,90,240][i]);
 }
 const camera=new PerspectiveCamera();camera.position.z=40;camera.updateMatrixWorld();
 applyNatureQuality(lod,2);lod.update(camera);assert.equal(lod.getCurrentLevel(),1);
 applyNatureQuality(lod,1);lod.update(camera);assert.equal(lod.getCurrentLevel(),2);
 assert.deepEqual(lod.levels.map(l=>l.distance),[0,12,32]);
 for(const l of lod.levels){assert.equal(l.object.children[0].castShadow,false);l.object.children[0].geometry.dispose();l.object.children[0].material.dispose();}
});
