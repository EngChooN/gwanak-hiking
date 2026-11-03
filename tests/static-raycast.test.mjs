import test from 'node:test';
import assert from 'node:assert/strict';
import {DoubleSide,Mesh,MeshBasicMaterial,Raycaster,Vector3} from 'three';
import {gridMesh,ribbon,densifyRoute} from '../assets/realistic/load-landscape.js';
import {indexStaticRaycast} from '../src/static-raycast.js';
import {stairTerrainClearance} from '../assets/realistic/terrain-clearance.js';

function sameHits(expected,actual){
  assert.equal(actual.length,expected.length);
  // 같은 모서리를 맞힌 삼각형의 정렬 순서는 공간 분할에 따라 달라질 수 있다.
  const order=(a,b)=>a.faceIndex-b.faceIndex;
  for(const [i,a]of actual.sort(order).entries()){
    const b=expected.sort(order)[i];
    assert.equal(a.faceIndex,b.faceIndex);assert.deepEqual(a.face,b.face);
    assert.ok(a.point.distanceTo(b.point)<1e-7);assert.ok(Math.abs(a.distance-b.distance)<1e-7);
    if(a.uv)assert.ok(a.uv.distanceTo(b.uv)<1e-7);
  }
}

test('정적 광선 색인은 변환·칸 경계·사선·near/far에서 원래 삼각형 검사를 보존한다',()=>{
  const material=new MeshBasicMaterial({side:DoubleSide});
  const mesh=gridMesh(-32,-32,64,2,(x,z)=>Math.sin(x/8)*3+Math.cos(z/8),material,1);
  const baseline=new Mesh(mesh.geometry,material);
  mesh.position.set(10,4,-7);mesh.rotation.y=.37;mesh.scale.set(1.3,.8,1.1);mesh.updateMatrixWorld(true);
  baseline.matrixWorld.copy(mesh.matrixWorld);indexStaticRaycast(mesh);
  for(const x of [-32,-24,-8,0,7.999,8,24,32,40])for(const z of [-32,-8,0,8,32])
    for(const far of [4,100])for(const side of [0,.4]){
      const origin=new Vector3(x,30,z).applyMatrix4(mesh.matrixWorld);
      const direction=new Vector3(side,-1,.2).transformDirection(mesh.matrixWorld);
      const ray=new Raycaster(origin,direction,1,far),actual=ray.intersectObject(mesh);
      sameHits(ray.intersectObject(baseline),actual);assert.ok(actual.every(h=>h.object===mesh));
    }
  mesh.geometry.dispose();material.dispose();
});

test('계단 지형 여유 적용 후 디딤판·수직 단면 충돌을 보존한다',()=>{
  const material=new MeshBasicMaterial({side:DoubleSide});
  const route=densifyRoute([{x:0,y:10,z:0,s:0,width:2,nx:0,nz:1,material:'deck_stairs'},
    {x:20,y:14,z:0,s:20,width:2,nx:0,nz:1,material:'deck_stairs'}]);
  const path=ribbon(route,material,1),terrain=gridMesh(-32,-32,64,2,()=>15,material,1);
  stairTerrainClearance(route)(terrain.geometry);path.add(terrain);path.updateMatrixWorld(true);
  const rays=[];
  for(let x=0;x<=20;x+=.25){
    rays.push(new Raycaster(new Vector3(x,25,0),new Vector3(0,-1,0),0,30));
    rays.push(new Raycaster(new Vector3(-1,10+x/5,0),new Vector3(1,0,0),0,30));
  }
  const expected=rays.map(ray=>ray.intersectObject(path));
  path.traverse(mesh=>{if(mesh.isMesh)indexStaticRaycast(mesh);});
  rays.forEach((ray,i)=>sameHits(expected[i],ray.intersectObject(path)));
  path.traverse(mesh=>mesh.geometry?.dispose());material.dispose();
});

test('64m 청크의 짧은 수직 광선은 전체 꼭짓점 검사보다 90% 이상 적게 조회한다',()=>{
  const material=new MeshBasicMaterial({side:DoubleSide});
  const mesh=gridMesh(0,0,64,2,()=>0,material,1);
  const ray=new Raycaster(new Vector3(29.3,3,29.7),new Vector3(0,-1,0),0,5);
  const original=Mesh.prototype.getVertexPosition;let calls=0;
  Mesh.prototype.getVertexPosition=function(...args){calls++;return original.apply(this,args);};
  try{
    const expected=ray.intersectObject(mesh),before=calls;calls=0;
    indexStaticRaycast(mesh);const actual=ray.intersectObject(mesh);
    sameHits(expected,actual);assert.ok(calls<before*.1,`${calls} / ${before}`);
  }finally{Mesh.prototype.getVertexPosition=original;mesh.geometry.dispose();material.dispose();}
});
